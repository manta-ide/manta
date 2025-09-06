import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export interface UserSandboxInfo {
  sandboxId: string;
  sandboxUrl: string;
  previewUrl: string | null;
  mcpServerUrl: string;
  createdAt: Date;
  status: 'standby' | 'active' | 'stopped';
}

// Abstractions for a generic sandbox provider
export interface SandboxProcessManager {
  exec(params: { name: string; command: string; waitForPorts?: number[] }): Promise<void>;
  wait(name: string, opts: { maxWait: number; interval: number }): Promise<void>;
}

export interface SandboxFsLsResult {
  files: any[];
  subdirectories: any[];
}

export interface SandboxFs {
  write(filePath: string, content: string): Promise<void>;
  writeTree(files: { path: string; content: string }[], dest: string): Promise<void>;
  ls(dir: string): Promise<SandboxFsLsResult>;
  read(filePath: string): Promise<string>;
}

export interface SandboxHandle {
  fs: SandboxFs;
  process: SandboxProcessManager;
}

export interface SandboxProvider {
  getOrCreateUserSandbox(userId: string, userEmail: string): Promise<SandboxHandle>;
  getUserSandbox(userId: string): Promise<SandboxHandle | null>;
  getUserPreviewUrl(userId: string): Promise<string | null>;
  getSandboxUrl(userId: string): string;
  getMCPServerUrl(userId: string): string;
  generateSandboxId?(userId: string): string; // Optional helper
  getAppRoot(): string; // Root path inside sandbox where project lives
}

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';

export class SandboxService {
  private static pool: Pool | null = LOCAL_MODE
    ? null
    : new Pool({
        ssl: true,
        connectionString: process.env.DATABASE_URL,
      });

  private static provider: SandboxProvider | null = null;

  // Cache for sandbox info to avoid frequent API calls
  private static sandboxInfoCache = new Map<string, { data: UserSandboxInfo | null; timestamp: number }>();
  private static CACHE_DURATION = 30000; // 30 seconds

  static setProvider(provider: SandboxProvider) {
    this.provider = provider;
  }

  static getProvider(): SandboxProvider {
    if (!this.provider) throw new Error('SandboxService provider not configured');
    return this.provider;
  }

  /**
   * Initialize sandbox for a user (called on first login or signup)
   */
  static async initializeUserSandbox(userId: string, userEmail: string): Promise<UserSandboxInfo> {
    const provider = this.getProvider();
    try {
      // Check if user already has a sandbox
      const existingInfo = await this.getUserSandboxInfo(userId);
      if (existingInfo) {
        // Verify sandbox still exists and return info
        try {
          const sandbox = await provider.getUserSandbox(userId);
          if (sandbox) {
            return existingInfo;
          }
        } catch (error) {
          console.log(`Existing sandbox not found, creating new one for user ${userId}`);
        }
      }

      // Create new sandbox
      await provider.getOrCreateUserSandbox(userId, userEmail);
      const sandboxId = provider.generateSandboxId
        ? provider.generateSandboxId(userId)
        : `user-${userId}`;

      // Get preview URL for the sandbox
      const previewUrl = await provider.getUserPreviewUrl(userId);

      // Update user record with sandbox information
      await this.updateUserSandboxInfo(userId, sandboxId);

      return {
        sandboxId,
        sandboxUrl: provider.getSandboxUrl(userId),
        previewUrl,
        mcpServerUrl: provider.getMCPServerUrl(userId),
        createdAt: new Date(),
        status: 'active',
      };
    } catch (error) {
      console.error(`Failed to initialize sandbox for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get sandbox information for a user
   */
  static async getUserSandboxInfo(userId: string): Promise<UserSandboxInfo | null> {
    const provider = this.getProvider();
    // Check cache first
    const cached = this.sandboxInfoCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    if (LOCAL_MODE || !this.pool) {
      // Return a lightweight stub in local mode without touching DB
      try {
        const previewUrl = await provider.getUserPreviewUrl(userId);
        const sandboxInfo: UserSandboxInfo = {
          sandboxId: provider.generateSandboxId ? provider.generateSandboxId(userId) : `local-${userId}`,
          sandboxUrl: provider.getSandboxUrl(userId),
          previewUrl,
          mcpServerUrl: provider.getMCPServerUrl(userId),
          createdAt: new Date(),
          status: 'active',
        };
        this.sandboxInfoCache.set(userId, { data: sandboxInfo, timestamp: Date.now() });
        return sandboxInfo;
      } catch (e) {
        // On error deriving preview, just cache null
        this.sandboxInfoCache.set(userId, { data: null, timestamp: Date.now() });
        return null;
      }
    }

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query('SELECT sandbox_id FROM "user" WHERE id = $1', [userId]);

        if (result.rows.length === 0 || !result.rows[0].sandbox_id) {
          // Cache null result
          this.sandboxInfoCache.set(userId, { data: null, timestamp: Date.now() });
          return null;
        }

        const row = result.rows[0];

        // Get preview URL for existing sandbox
        const previewUrl = await provider.getUserPreviewUrl(userId);

        const sandboxInfo: UserSandboxInfo = {
          sandboxId: row.sandbox_id,
          sandboxUrl: provider.getSandboxUrl(userId),
          previewUrl,
          mcpServerUrl: provider.getMCPServerUrl(userId),
          createdAt: new Date(), // We don't store creation time yet
          status: 'standby', // Could be enhanced to check actual status
        };

        // Cache the result
        this.sandboxInfoCache.set(userId, { data: sandboxInfo, timestamp: Date.now() });

        return sandboxInfo;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Failed to get sandbox info for user ${userId}:`, error);
      // Cache null result even on error to avoid repeated failures
      this.sandboxInfoCache.set(userId, { data: null, timestamp: Date.now() });
      return null;
    }
  }

  /**
   * Update user record with sandbox information
   */
  private static async updateUserSandboxInfo(userId: string, sandboxId: string): Promise<void> {
    if (LOCAL_MODE || !this.pool) return; // No-op in local mode
    try {
      const client = await this.pool.connect();
      try {
        await client.query('UPDATE "user" SET sandbox_id = $1 WHERE id = $2', [sandboxId, userId]);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`Failed to update user sandbox info for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get active sandbox instance for a user
   */
  static async getActiveSandbox(userId: string): Promise<SandboxHandle | null> {
    try {
      return await this.getProvider().getUserSandbox(userId);
    } catch (error) {
      console.error(`Failed to get active sandbox for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Connect to user's MCP server
   */
  static getMCPConnection(userId: string) {
    const provider = this.getProvider();
    return {
      url: provider.getMCPServerUrl(userId),
      // Add any additional connection configuration here
    };
  }

  /**
   * Get the preview URL for a user's sandbox via active provider
   */
  static async getUserPreviewUrl(userId: string): Promise<string | null> {
    return this.getProvider().getUserPreviewUrl(userId);
  }

  static getAppRoot(): string {
    return this.getProvider().getAppRoot();
  }

  /**
   * Collect files from a directory recursively
   */
  private static collectFiles(dir: string, base = dir): { path: string; content: string }[] {
    const out: { path: string; content: string }[] = [];

    if (!fs.existsSync(dir)) {
      console.warn(`[SandboxService] Directory not found: ${dir}`);
      return out;
    }

    for (const name of fs.readdirSync(dir)) {
      // Skip excluded directories and files
      if (name === '.env' || name === 'node_modules' || name === 'dist' || name === 'send-to-sandbox.ts') {
        continue;
      }

      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        out.push(...this.collectFiles(full, base));
      } else {
        const relativePath = path.relative(base, full);
        // Convert Windows backslashes to forward slashes for sandbox
        const normalizedPath = relativePath.replace(/\\/g, '/');
        try {
          out.push({ path: normalizedPath, content: fs.readFileSync(full, 'utf8') });
        } catch (error) {
          console.warn(`[SandboxService] Failed to read file ${full}:`, error);
        }
      }
    }
    return out;
  }

  /**
   * Retry helper with exponential backoff
   */
  private static async retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3, baseMs = 500): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const delay = baseMs * Math.pow(2, i);
        console.warn(`[SandboxService] write attempt ${i + 1} failed, retrying in ${delay}ms...`, err?.message || err);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * Chunk files to keep each request small to avoid socket closures.
   */
  private static chunkFilesByLimit(
    files: { path: string; content: string }[],
    maxFiles = 25,
    maxBytes = 800_000,
  ) {
    const batches: { path: string; content: string }[][] = [];
    let current: { path: string; content: string }[] = [];
    let bytes = 0;
    for (const f of files) {
      const size = Buffer.byteLength(f.content, 'utf8');
      const wouldExceed = current.length >= maxFiles || bytes + size > maxBytes;
      if (current.length > 0 && wouldExceed) {
        batches.push(current);
        current = [];
        bytes = 0;
      }
      // If a single file is huge, put it in its own batch
      if (size > maxBytes) {
        if (current.length > 0) {
          batches.push(current);
          current = [];
          bytes = 0;
        }
        batches.push([f]);
        continue;
      }
      current.push(f);
      bytes += size;
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  /**
   * Robustly write a file tree to the sandbox in chunks with retries.
   */
  private static async writeTreeInChunks(sandbox: SandboxHandle, files: { path: string; content: string }[], dest: string) {
    const batches = this.chunkFilesByLimit(files);
    console.log(`[SandboxService] Writing files in ${batches.length} batches`);
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`[SandboxService] Writing batch ${i + 1}/${batches.length} (${batch.length} files)`);
      try {
        await this.retryWithBackoff(() => sandbox.fs.writeTree(batch, dest), 3, 600);
      } catch (batchErr) {
        console.warn(`[SandboxService] Batch ${i + 1} failed, falling back to per-file writes...`);
        // Fallback: write files one-by-one to isolate failures
        for (const f of batch) {
          try {
            await this.retryWithBackoff(() => sandbox.fs.writeTree([f], dest), 3, 600);
          } catch (fileErr) {
            console.error(`[SandboxService] Failed to write file ${f.path}`, fileErr);
            throw fileErr;
          }
        }
      }
      // Small pacing delay between batches
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  /**
   * Setup base template project in user's sandbox
   */
  static async setupBaseTemplate(userId: string): Promise<void> {
    console.log(`[SandboxService] Setting up base template for user ${userId}`);

    const provider = this.getProvider();
    try {
      const sandbox = await provider.getUserSandbox(userId);
      if (!sandbox) {
        throw new Error(`No sandbox found for user ${userId}`);
      }

      // Get the base template path
      const baseTemplatePath = path.join(process.cwd(), 'vite-base-template');

      console.log(`[SandboxService] Looking for base template at: ${baseTemplatePath}`);

      if (!fs.existsSync(baseTemplatePath)) {
        console.warn(`[SandboxService] Base template not found at ${baseTemplatePath}, skipping setup`);
        return;
      }

      // Kill any running processes first
      console.log(`[SandboxService] Killing running processes...`);
      try {
        await sandbox.process.exec({
          name: 'kill-processes',
          command: 'killall node || true && killall vite || true',
        });
        await sandbox.process.wait('kill-processes', {
          maxWait: 10000, // 10 seconds
          interval: 1000,
        });
      } catch (error) {
        console.log(`[SandboxService] Process cleanup completed (some processes may not have been running)`);
      }

      // Clean the directory first
      console.log(`[SandboxService] Cleaning directory...`);
      try {
        const appRoot = provider.getAppRoot();
        await sandbox.process.exec({
          name: 'clean',
          command: `cd ${appRoot} && find . -mindepth 1 -exec rm -r -- {} + || true`,
        });
        await sandbox.process.wait('clean', {
          maxWait: 60000, // 1 minute
          interval: 2000,
        });
      } catch (error) {
        console.log(`[SandboxService] Directory cleanup completed`);
      }

      // Collect files from base template
      const files = [
        // Collect src/ files
        ...this.collectFiles(path.join(baseTemplatePath, 'src'), baseTemplatePath).map((f) => ({ ...f, path: f.path })),
        // Collect _graph/ files if they exist
        ...this.collectFiles(path.join(baseTemplatePath, '_graph'), baseTemplatePath).map((f) => ({ ...f, path: f.path })),
        // Collect root files (like index.html, package.json, etc.)
        ...this.collectFiles(baseTemplatePath, baseTemplatePath).map((f) => ({ ...f, path: f.path })),
      ];

      console.log(`[SandboxService] Syncing ${files.length} files to sandbox`);
      await this.writeTreeInChunks(sandbox, files, provider.getAppRoot());
      console.log(`[SandboxService] ✅ Files synced to sandbox`);

      // Write environment variables for the Vite app to connect to Supabase and resolve room
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        // Resolve sandboxId for this user (already known via DB update earlier)
        const sandboxInfo = await this.getUserSandboxInfo(userId);
        // Derive remote HMR settings from the preview URL so Vite HMR can connect cross-origin
        let hmrHost = '';
        let hmrProtocol = '';
        let hmrPort = '';
        try {
          const previewUrl = sandboxInfo?.previewUrl || (await provider.getUserPreviewUrl(userId));
          if (previewUrl) {
            const u = new URL(previewUrl);
            hmrHost = u.hostname;
            // Use secure WS when preview is over HTTPS
            hmrProtocol = u.protocol === 'https:' ? 'wss' : 'ws';
            // Only set port if explicitly present on the URL
            hmrPort = u.port || '';
          }
        } catch (e) {
          console.warn(`[SandboxService] Could not derive HMR settings from preview URL:`, e);
        }

        const envLines = [
          supabaseUrl ? `VITE_SUPABASE_URL=${supabaseUrl}` : '',
          supabaseAnon ? `VITE_SUPABASE_ANON_KEY=${supabaseAnon}` : '',
          `VITE_USER_ID=${userId}`,
          sandboxInfo?.sandboxId ? `VITE_SANDBOX_ID=${sandboxInfo.sandboxId}` : '',
          // Remote-capable HMR settings (used by vite.config.ts)
          hmrHost ? `VITE_HMR_HOST=${hmrHost}` : '',
          hmrProtocol ? `VITE_HMR_PROTOCOL=${hmrProtocol}` : '',
          hmrPort ? `VITE_HMR_PORT=${hmrPort}` : '',
        ].filter(Boolean);

        const envContent = envLines.join('\n') + '\n';
        const appRoot = provider.getAppRoot();
        await sandbox.fs.write(`${appRoot}/.env`, envContent);
        console.log(`[SandboxService] ✅ Wrote .env for Vite app`);
      } catch (e) {
        console.warn(`[SandboxService] ⚠️ Failed to write .env for Vite app:`, e);
      }

      // Install dependencies (idempotent: skip if already running)
      console.log(`[SandboxService] Installing dependencies...`);
      try {
        const appRoot = provider.getAppRoot();
        await sandbox.process.exec({
          name: 'install',
          command: `cd ${appRoot} && npm i`,
        });
      } catch (e: any) {
        const msg = (e && e.message) || '';
        if (!msg.includes('already exists and is running')) throw e;
        console.log(`[SandboxService] install already running; proceeding to wait`);
      }
      await sandbox.process.wait('install', {
        maxWait: 300000, // 5 minutes
        interval: 5000,
      });
      console.log(`[SandboxService] ✅ Dependencies installed`);

      // Build the project
      console.log(`[SandboxService] Building project...`);
      try {
        const appRoot = provider.getAppRoot();
        await sandbox.process.exec({
          name: 'build',
          command: `cd ${appRoot} && npm run build`,
        });
        await sandbox.process.wait('build', {
          maxWait: 300000, // 5 minutes
          interval: 5000,
        });
        console.log(`[SandboxService] ✅ Project built successfully`);
      } catch (error) {
        console.warn(`[SandboxService] Build failed, but continuing with dev server:`, error);
      }

      // Start dev server (idempotent: ignore if already running)
      console.log(`[SandboxService] Starting dev server...`);
      try {
        const appRoot = provider.getAppRoot();
        await sandbox.process.exec({
          name: 'dev-server',
          command: `cd ${appRoot} && npm run dev`,
          waitForPorts: [5173],
        });
      } catch (e: any) {
        const msg = (e && e.message) || '';
        if (!msg.includes('already exists and is running')) throw e;
        console.log(`[SandboxService] dev-server already running; continuing`);
      }

      console.log(`[SandboxService] ✅ Base template setup completed for user ${userId}`);

      // Graph will be read from local _graph/graph.json; no remote sync needed
    } catch (error) {
      console.error(`[SandboxService] Failed to setup base template for user ${userId}:`, error);
      throw error;
    }
  }
}
