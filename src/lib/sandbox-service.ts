import { SandboxInstance } from "@blaxel/core";
import { BlaxelService } from "./blaxel";
import { auth } from "./auth";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Graph, GraphNode } from "./supabase-realtime";
import { Property } from "@/app/api/lib/schemas";

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
   * Retry helper with exponential backoff.
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
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * Chunk files to keep each request small to avoid socket closures.
   */
  private static chunkFilesByLimit(files: { path: string; content: string }[], maxFiles = 25, maxBytes = 800_000) {
    const batches: { path: string; content: string }[][] = [];
    let current: { path: string; content: string }[] = [];
    let bytes = 0;
    for (const f of files) {
      const size = Buffer.byteLength(f.content, 'utf8');
      const wouldExceed = current.length >= maxFiles || (bytes + size) > maxBytes;
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
  private static async writeTreeInChunks(sandbox: SandboxInstance, files: { path: string; content: string }[], dest: string) {
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
      await new Promise(r => setTimeout(r, 150));
    }
  }

  /**
   * Get server-side Supabase client with service role
   */
  private static async getSupabaseServiceClient(): Promise<SupabaseClient> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    return createClient(supabaseUrl, serviceRoleKey);
  }

  /**
   * Clear all graph data for a user from Supabase
   */
  private static async clearUserGraphData(userId: string): Promise<void> {
    try {
      console.log(`[SandboxService] Clearing graph data for user ${userId}`);
      
      // Get server-side Supabase client
      const client = await this.getSupabaseServiceClient();

      // Delete all user's graph data in the correct order (foreign key constraints)
      // 1. Delete properties first
      const { error: propertiesError } = await client
        .from('graph_properties')
        .delete()
        .eq('user_id', userId);

      if (propertiesError) {
        throw new Error(`Failed to delete properties: ${propertiesError.message}`);
      }

      // 2. Delete edges
      const { error: edgesError } = await client
        .from('graph_edges')
        .delete()
        .eq('user_id', userId);

      if (edgesError) {
        throw new Error(`Failed to delete edges: ${edgesError.message}`);
      }

      // 3. Delete nodes last
      const { error: nodesError } = await client
        .from('graph_nodes')
        .delete()
        .eq('user_id', userId);

      if (nodesError) {
        throw new Error(`Failed to delete nodes: ${nodesError.message}`);
      }

      console.log(`[SandboxService] ✅ Cleared all graph data for user ${userId}`);
    } catch (error) {
      console.error(`[SandboxService] Failed to clear graph data for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Load and parse the base template graph
   */
  private static loadBaseTemplateGraph(): Graph {
    const baseTemplatePath = path.join(process.cwd(), 'vite-base-template');
    const graphPath = path.join(baseTemplatePath, '_graph', 'graph.json');
    
    if (!fs.existsSync(graphPath)) {
      throw new Error(`Base template graph not found at ${graphPath}`);
    }

    try {
      const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
      return this.convertTemplateGraphFormat(graphData);
    } catch (error) {
      console.error(`[SandboxService] Failed to parse base template graph:`, error);
      throw error;
    }
  }

  /**
   * Calculate node position based on hierarchy
   */
  private static calculateNodePosition(node: any, allNodes: any[]): { x: number; y: number } {
    // Simple layout: root nodes at top, children spread out below
    if (!node.parentId || node.parentId === 'root') {
      // Root node - center it
      return { x: 400, y: 100 };
    } else {
      // Child node - find siblings and position accordingly
      const siblings = allNodes.filter(n => n.parentId === node.parentId);
      const siblingIndex = siblings.findIndex(n => n.id === node.id);
      const totalSiblings = siblings.length;
      
      // Spread children horizontally below parent
      const baseX = 100;
      const spacing = 300;
      const x = baseX + (siblingIndex * spacing);
      const y = 300; // Fixed Y for first level children
      
      return { x, y };
    }
  }

  /**
   * Convert template graph format to the format expected by our Graph type
   */
  private static convertTemplateGraphFormat(templateGraph: any): Graph {
    const nodes: GraphNode[] = [];
    const edges: { id: string; source: string; target: string }[] = [];

    // Process nodes from template format
    for (const templateNode of templateGraph.nodes || []) {
      // Convert properties from template format to our Property format
      const properties: Property[] = (templateNode.properties || []).map((prop: any) => ({
        id: prop.id,
        title: prop.title,
        type: prop.type,
        value: prop.value,
        options: prop.options,
        maxLength: prop.maxLength
      }));

      // Convert node
      const node: GraphNode = {
        id: templateNode.id,
        title: templateNode.title,
        prompt: templateNode.prompt || '',
        state: templateNode.state || 'unbuilt',
        position: this.calculateNodePosition(templateNode, templateGraph.nodes), // Calculate position based on hierarchy
        built: templateNode.state === 'built',
        properties: properties.length > 0 ? properties : undefined,
        children: (templateNode.children || []).map((child: any) => ({
          id: child.id,
          title: child.title
        }))
      };

      nodes.push(node);

      // Create edges from parentId relationships
      if (templateNode.parentId && templateNode.parentId !== 'root') {
        edges.push({
          id: `${templateNode.parentId}-${templateNode.id}`,
          source: templateNode.parentId,
          target: templateNode.id
        });
      }

      // Create edges from children relationships
      if (templateNode.children && Array.isArray(templateNode.children)) {
        for (const child of templateNode.children) {
          edges.push({
            id: `${templateNode.id}-${child.id}`,
            source: templateNode.id,
            target: child.id
          });
        }
      }
    }

    // Remove duplicate edges (in case both parentId and children create the same edge)
    const uniqueEdges = edges.filter((edge, index, self) => 
      index === self.findIndex(e => e.id === edge.id)
    );

    return {
      nodes,
      edges: uniqueEdges
    };
  }


  /**
   * Sync base template graph to Supabase for a user
   */
  private static async syncTemplateGraphToSupabase(userId: string): Promise<void> {
    try {
      console.log(`[SandboxService] Syncing base template graph to Supabase for user ${userId}`);
      
      // Load the base template graph
      const templateGraph = this.loadBaseTemplateGraph();
      
      // Clear existing graph data first
      await this.clearUserGraphData(userId);
      
      // Get server-side Supabase client
      const client = await this.getSupabaseServiceClient();
      
      // Sync nodes to Supabase
      for (const node of templateGraph.nodes) {
        // Insert node
        const { error: nodeError } = await client
          .from('graph_nodes')
          .upsert({
            id: node.id,
            title: node.title,
            prompt: node.prompt,
            state: node.state,
            position_x: node.position?.x || 0,
            position_y: node.position?.y || 0,
            width: node.width,
            height: node.height,
            built: node.built,
            user_id: userId
          });

        if (nodeError) {
          throw new Error(`Failed to save node ${node.id}: ${nodeError.message}`);
        }

        // Insert properties if they exist
        if (node.properties && node.properties.length > 0) {
          const propertiesData = node.properties.map(prop => ({
            id: prop.id,
            node_id: node.id,
            name: prop.title,
            type: prop.type,
            value: prop.value,
            options: prop.options,
            user_id: userId
          }));

          const { error: propertiesError } = await client
            .from('graph_properties')
            .upsert(propertiesData);

          if (propertiesError) {
            throw new Error(`Failed to save properties for node ${node.id}: ${propertiesError.message}`);
          }
        }
      }
      
      // Save edges if they exist
      if (templateGraph.edges && templateGraph.edges.length > 0) {
        const { error: edgesError } = await client
          .from('graph_edges')
          .upsert(
            templateGraph.edges.map(edge => ({
              id: edge.id,
              source_id: edge.source,
              target_id: edge.target,
              user_id: userId
            }))
          );

        if (edgesError) {
          throw new Error(`Failed to save edges: ${edgesError.message}`);
        }
      }
      
      console.log(`[SandboxService] ✅ Synced ${templateGraph.nodes.length} nodes and ${templateGraph.edges?.length || 0} edges to Supabase`);
    } catch (error) {
      console.error(`[SandboxService] Failed to sync template graph to Supabase for user ${userId}:`, error);
      throw error;
    }
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
      await this.writeTreeInChunks(sandbox, files, "/blaxel/app");
      console.log(`[SandboxService] ✅ Files synced to sandbox`);

      // Write environment variables for the Vite app to connect to Supabase and resolve room
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        // Resolve sandboxId for this user (already known via DB update earlier)
        const sandboxInfo = await this.getUserSandboxInfo(userId);
        const envLines = [
          supabaseUrl ? `VITE_SUPABASE_URL=${supabaseUrl}` : '',
          supabaseAnon ? `VITE_SUPABASE_ANON_KEY=${supabaseAnon}` : '',
          `VITE_USER_ID=${userId}`,
          sandboxInfo?.sandboxId ? `VITE_SANDBOX_ID=${sandboxInfo.sandboxId}` : '',
        ].filter(Boolean);

        const envContent = envLines.join('\n') + '\n';
        await sandbox.fs.write('/blaxel/app/.env', envContent);
        console.log(`[SandboxService] ✅ Wrote .env for Vite app`);
      } catch (e) {
        console.warn(`[SandboxService] ⚠️ Failed to write .env for Vite app:`, e);
      }

      // Install dependencies (idempotent: skip if already running)
      console.log(`[SandboxService] Installing dependencies...`);
      try {
        await sandbox.process.exec({
          name: "install",
          command: "cd /blaxel/app && npm i"
        });
      } catch (e: any) {
        const msg = (e && e.message) || '';
        if (!msg.includes("already exists and is running")) throw e;
        console.log(`[SandboxService] install already running; proceeding to wait`);
      }
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

      // Start dev server (idempotent: ignore if already running)
      console.log(`[SandboxService] Starting dev server...`);
      try {
        await sandbox.process.exec({
          name: "dev-server",
          command: "cd /blaxel/app && npm run dev",
          waitForPorts: [5173]
        });
      } catch (e: any) {
        const msg = (e && e.message) || '';
        if (!msg.includes("already exists and is running")) throw e;
        console.log(`[SandboxService] dev-server already running; continuing`);
      }

      console.log(`[SandboxService] ✅ Base template setup completed for user ${userId}`);

      // Sync base template graph to Supabase
      console.log(`[SandboxService] Syncing base template graph to Supabase...`);
      try {
        await this.syncTemplateGraphToSupabase(userId);
        console.log(`[SandboxService] ✅ Graph sync completed for user ${userId}`);
      } catch (graphError) {
        console.error(`[SandboxService] Graph sync failed for user ${userId}:`, graphError);
        // Don't throw here - the sandbox setup was successful, graph sync is secondary
      }

    } catch (error) {
      console.error(`[SandboxService] Failed to setup base template for user ${userId}:`, error);
      throw error;
    }
  }
}
