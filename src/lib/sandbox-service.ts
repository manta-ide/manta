import { SandboxInstance } from "@blaxel/core";
import { BlaxelService } from "./blaxel";
import { auth } from "./auth";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

export interface UserSandboxInfo {
  sandboxId: string;
  sandboxUrl: string;
  previewUrl: string | null;
  mcpServerUrl: string;
  createdAt: Date;
  status: 'standby' | 'active' | 'stopped';
}

export class SandboxService {
  private static pool = new Pool({
    ssl: true,
    connectionString: process.env.DATABASE_URL,
  });

  // Cache for sandbox info to avoid frequent API calls
  private static sandboxInfoCache = new Map<string, { data: UserSandboxInfo | null; timestamp: number }>();
  private static CACHE_DURATION = 30000; // 30 seconds

  /**
   * Initialize sandbox for a user (called on first login or signup)
   */
  static async initializeUserSandbox(userId: string, userEmail: string): Promise<UserSandboxInfo> {
    try {
      // Check if user already has a sandbox
      const existingInfo = await this.getUserSandboxInfo(userId);
      if (existingInfo) {
        // Verify sandbox still exists and return info
        try {
          const sandbox = await BlaxelService.getUserSandbox(userId);
          if (sandbox) {
            return existingInfo;
          }
        } catch (error) {
          console.log(`Existing sandbox not found, creating new one for user ${userId}`);
        }
      }

      // Create new sandbox
      const sandbox = await BlaxelService.getOrCreateUserSandbox(userId, userEmail);
      const sandboxId = `user-${userId}`;
      
      // Get preview URL for the sandbox
      const previewUrl = await BlaxelService.getUserPreviewUrl(userId);
      
      // Update user record with sandbox information
      await this.updateUserSandboxInfo(userId, sandboxId);

      return {
        sandboxId,
        sandboxUrl: BlaxelService.getSandboxUrl(userId),
        previewUrl,
        mcpServerUrl: BlaxelService.getMCPServerUrl(userId),
        createdAt: new Date(),
        status: 'active'
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
    // Check cache first
    const cached = this.sandboxInfoCache.get(userId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT sandbox_id FROM "user" WHERE id = $1',
          [userId]
        );

        if (result.rows.length === 0 || !result.rows[0].sandbox_id) {
          // Cache null result
          this.sandboxInfoCache.set(userId, { data: null, timestamp: Date.now() });
          return null;
        }

        const row = result.rows[0];
        
        // Get preview URL for existing sandbox
        const previewUrl = await BlaxelService.getUserPreviewUrl(userId);
        
        const sandboxInfo = {
          sandboxId: row.sandbox_id,
          sandboxUrl: BlaxelService.getSandboxUrl(userId),
          previewUrl,
          mcpServerUrl: BlaxelService.getMCPServerUrl(userId),
          createdAt: new Date(), // Use current time since we don't store creation time
          status: 'standby' as const // Default status, could be enhanced to check actual status
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
    try {
      const client = await this.pool.connect();
      try {
        await client.query(
          'UPDATE "user" SET sandbox_id = $1 WHERE id = $2',
          [sandboxId, userId]
        );
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
  static async getActiveSandbox(userId: string): Promise<SandboxInstance | null> {
    try {
      return await BlaxelService.getUserSandbox(userId);
    } catch (error) {
      console.error(`Failed to get active sandbox for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Connect to user's MCP server
   */
  static getMCPConnection(userId: string) {
    return {
      url: BlaxelService.getMCPServerUrl(userId),
      // Add any additional connection configuration here
    };
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
          out.push({ path: normalizedPath, content: fs.readFileSync(full, "utf8") });
        } catch (error) {
          console.warn(`[SandboxService] Failed to read file ${full}:`, error);
        }
      }
    }
    return out;
  }

  /**
   * Setup base template project in user's sandbox
   */
  static async setupBaseTemplate(userId: string): Promise<void> {
    console.log(`[SandboxService] Setting up base template for user ${userId}`);
    
    try {
      const sandbox = await BlaxelService.getUserSandbox(userId);
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
          name: "kill-processes",
          command: "killall node || true && killall vite || true"
        });
        await sandbox.process.wait("kill-processes", {
          maxWait: 10000, // 10 seconds
          interval: 1000
        });
      } catch (error) {
        console.log(`[SandboxService] Process cleanup completed (some processes may not have been running)`);
      }

      // Clean the directory first
      console.log(`[SandboxService] Cleaning directory...`);
      try {
        await sandbox.process.exec({
          name: "clean",
          command: "cd /blaxel/app && find . -mindepth 1 -exec rm -r -- {} + || true"
        });
        await sandbox.process.wait("clean", {
          maxWait: 60000, // 1 minute
          interval: 2000
        });
      } catch (error) {
        console.log(`[SandboxService] Directory cleanup completed`);
      }

      // Collect files from base template
      const files = [
        // Collect src/ files
        ...this.collectFiles(path.join(baseTemplatePath, "src"), baseTemplatePath).map(f => ({ ...f, path: f.path })),
        // Collect _graph/ files if they exist
        ...this.collectFiles(path.join(baseTemplatePath, "_graph"), baseTemplatePath).map(f => ({ ...f, path: f.path })),
        // Collect root files (like index.html, package.json, etc.)
        ...this.collectFiles(baseTemplatePath, baseTemplatePath).map(f => ({ ...f, path: f.path })),
      ];

      console.log(`[SandboxService] Syncing ${files.length} files to sandbox`);
      await sandbox.fs.writeTree(files, "/blaxel/app");
      console.log(`[SandboxService] ✅ Files synced to sandbox`);

      // Install dependencies
      console.log(`[SandboxService] Installing dependencies...`);
      await sandbox.process.exec({
        name: "install",
        command: "cd /blaxel/app && npm i"
      });
      await sandbox.process.wait("install", {
        maxWait: 300000, // 5 minutes
        interval: 5000
      });
      console.log(`[SandboxService] ✅ Dependencies installed`);

      // Build the project
      console.log(`[SandboxService] Building project...`);
      try {
        await sandbox.process.exec({
          name: "build",
          command: "cd /blaxel/app && npm run build"
        });
        await sandbox.process.wait("build", {
          maxWait: 300000, // 5 minutes
          interval: 5000
        });
        console.log(`[SandboxService] ✅ Project built successfully`);
      } catch (error) {
        console.warn(`[SandboxService] Build failed, but continuing with dev server:`, error);
      }

      // Start dev server
      console.log(`[SandboxService] Starting dev server...`);
      await sandbox.process.exec({
        name: "dev-server",
        command: "cd /blaxel/app && npm run dev",
        waitForPorts: [5173] // Vite default port (will be proxied through preview URL on port 3000)
      });

      console.log(`[SandboxService] ✅ Base template setup completed for user ${userId}`);

    } catch (error) {
      console.error(`[SandboxService] Failed to setup base template for user ${userId}:`, error);
      throw error;
    }
  }
}
