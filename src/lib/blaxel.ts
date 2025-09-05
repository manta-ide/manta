import { SandboxInstance } from "@blaxel/core";
import {
  SandboxService as GenericSandboxService,
  SandboxProvider,
  SandboxHandle,
  SandboxFs,
  SandboxProcessManager,
} from './sandbox-service';

// Blaxel configuration
export const BLAXEL_CONFIG = {
  defaultImage: "blaxel/prod-vite:latest",
  defaultMemory: 6144,
  defaultPorts: [{ target: 5173, protocol: "HTTP" as const }],
  sandboxTTL: "24h", // Sandbox time-to-live
  previewPort: 5173, // Default port for preview URLs
};

export class BlaxelService {
  /**
   * Generate a valid sandbox name (lowercase alphanumeric + hyphens only)
   */
  static generateSandboxName(userId: string): string {
    // Convert userId to lowercase and replace invalid characters with hyphens
    const cleanUserId = userId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `user-${cleanUserId}`;
  }

  /**
   * Generate a valid preview name for a user's sandbox
   */
  static generatePreviewName(userId: string): string {
    const cleanUserId = userId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `preview-${cleanUserId}`;
  }

  /**
   * Create or get a preview URL for a sandbox
   */
  static async createOrGetPreviewUrl(sandbox: SandboxInstance, userId: string): Promise<string | null> {
    const previewName = this.generatePreviewName(userId);
    
    try {
      console.log(`[BlaxelService] Creating/getting preview URL: ${previewName}`);
      
      // Create public preview URL using createIfNotExists
      const preview = await sandbox.previews.createIfNotExists({
        metadata: {
          name: previewName
        },
        spec: {
          port: BLAXEL_CONFIG.previewPort,
          public: true,
          responseHeaders: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Blaxel-Workspace, X-Blaxel-Preview-Token, X-Blaxel-Authorization",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Expose-Headers": "Content-Length, X-Request-Id",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin"
          }
        }
      });

      const previewUrl = preview.spec?.url;
      console.log(`[BlaxelService] ✅ Preview URL ready: ${previewUrl}`);
      
      return previewUrl || null;
    } catch (error) {
      console.error(`[BlaxelService] ❌ Failed to create preview URL for ${previewName}:`, error);
      return null;
    }
  }

  /**
   * Create a new sandbox for a user
   */
  static async createUserSandbox(userId: string, userEmail: string): Promise<SandboxInstance> {
    const sandboxName = this.generateSandboxName(userId);
    
    try {
      const sandbox = await SandboxInstance.create({
        name: sandboxName,
        image: BLAXEL_CONFIG.defaultImage,
        memory: BLAXEL_CONFIG.defaultMemory,
        ports: BLAXEL_CONFIG.defaultPorts,
        ttl: BLAXEL_CONFIG.sandboxTTL,
      });

      // Wait for sandbox to be ready
      await sandbox.wait();
      
      console.log(`Created sandbox for user ${userEmail}: ${sandboxName}`);
      
      // Create preview URL for the new sandbox
      await this.createOrGetPreviewUrl(sandbox, userId);
      
      return sandbox;
    } catch (error) {
      console.error(`Failed to create sandbox for user ${userEmail}:`, error);
      throw new Error(`Failed to create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get existing sandbox for a user
   */
  static async getUserSandbox(userId: string): Promise<SandboxInstance | null> {
    const sandboxName = this.generateSandboxName(userId);
    
    try {
      const sandbox = await SandboxInstance.get(sandboxName);
      return sandbox;
    } catch (error) {
      console.log(`Sandbox not found for user ${userId}: ${sandboxName}`);
      return null;
    }
  }

  /**
   * Get or create sandbox for a user (main method)
   */
  static async getOrCreateUserSandbox(userId: string, userEmail: string): Promise<SandboxInstance> {
    const sandboxName = this.generateSandboxName(userId);
    
    console.log(`[BlaxelService] Starting getOrCreateUserSandbox for user: ${userEmail} (ID: ${userId})`);
    console.log(`[BlaxelService] Original userId: ${userId}`);
    console.log(`[BlaxelService] Generated sandbox name: ${sandboxName}`);
    console.log(`[BlaxelService] Configuration:`, {
      image: BLAXEL_CONFIG.defaultImage,
      memory: BLAXEL_CONFIG.defaultMemory,
      ports: BLAXEL_CONFIG.defaultPorts,
      ttl: BLAXEL_CONFIG.sandboxTTL,
    });
    
    try {
      console.log(`[BlaxelService] Attempting to create or get existing sandbox...`);
      
      // Try to get existing sandbox first
      const existingSandbox = await SandboxInstance.createIfNotExists({
        name: sandboxName,
        image: BLAXEL_CONFIG.defaultImage,
        memory: BLAXEL_CONFIG.defaultMemory,
        ports: BLAXEL_CONFIG.defaultPorts,
        ttl: BLAXEL_CONFIG.sandboxTTL,
      });

      console.log(`[BlaxelService] Sandbox instance created/retrieved, waiting for ready state...`);
      
      await existingSandbox.wait();
      
      console.log(`[BlaxelService] ✅ Successfully got/created sandbox for user ${userEmail}: ${sandboxName}`);
      console.log(`[BlaxelService] Sandbox status: ready`);
      
      // Ensure preview URL exists for this sandbox
      console.log(`[BlaxelService] Checking/creating preview URL...`);
      await this.createOrGetPreviewUrl(existingSandbox, userId);
      
      return existingSandbox;
    } catch (error) {
      console.error(`[BlaxelService] ❌ Failed to get or create sandbox for user ${userEmail}:`, error);
      console.error(`[BlaxelService] Error details:`, {
        userId,
        userEmail,
        sandboxName,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      
      throw new Error(`Failed to get or create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get sandbox URL for a user
   */
  static getSandboxUrl(userId: string): string {
    const sandboxName = this.generateSandboxName(userId);
    // This would be the URL where the sandbox is accessible
    // You might need to adjust this based on your Blaxel workspace configuration
    return `https://run.blaxel.ai/${process.env.BLAXEL_WORKSPACE_ID}/sandboxes/${sandboxName}`;
  }

  /**
   * Get MCP server URL for a sandbox
   */
  static getMCPServerUrl(userId: string): string {
    const sandboxName = this.generateSandboxName(userId);
    return `wss://run.blaxel.ai/${process.env.BLAXEL_WORKSPACE_ID}/sandboxes/${sandboxName}`;
  }

  /**
   * Get the preview URL for a user's sandbox
   */
  static async getUserPreviewUrl(userId: string): Promise<string | null> {
    try {
      const sandbox = await this.getUserSandbox(userId);
      if (!sandbox) {
        console.log(`[BlaxelService] No sandbox found for user ${userId}, cannot get preview URL`);
        return null;
      }

      const previewName = this.generatePreviewName(userId);
      
      // Try to get existing preview
      try {
        const previews = await sandbox.previews.list();
        const existingPreview = previews.find(p => p.metadata?.name === previewName);
        
        if (existingPreview && existingPreview.spec?.url) {
          console.log(`[BlaxelService] Found existing preview URL: ${existingPreview.spec.url}`);
          return existingPreview.spec.url;
        }
      } catch (error) {
        console.log(`[BlaxelService] Could not list previews, will create new one:`, error);
      }

      // Create new preview if none exists
      return await this.createOrGetPreviewUrl(sandbox, userId);
    } catch (error) {
      console.error(`[BlaxelService] ❌ Failed to get preview URL for user ${userId}:`, error);
      return null;
    }
  }
}

// Blaxel-backed provider implementation for the generic SandboxService
class BlaxelSandboxFs implements SandboxFs {
  constructor(private inst: SandboxInstance) {}
  async write(filePath: string, content: string): Promise<void> {
    await this.inst.fs.write(filePath, content);
  }
  async writeTree(files: { path: string; content: string }[], dest: string): Promise<void> {
    await this.inst.fs.writeTree(files, dest);
  }
}

class BlaxelSandboxProcess implements SandboxProcessManager {
  constructor(private inst: SandboxInstance) {}
  async exec(params: { name: string; command: string; waitForPorts?: number[] }): Promise<void> {
    await this.inst.process.exec(params);
  }
  async wait(name: string, opts: { maxWait: number; interval: number }): Promise<void> {
    await this.inst.process.wait(name, opts);
  }
}

class BlaxelHandle implements SandboxHandle {
  fs: SandboxFs;
  process: SandboxProcessManager;
  constructor(inst: SandboxInstance) {
    this.fs = new BlaxelSandboxFs(inst);
    this.process = new BlaxelSandboxProcess(inst);
  }
}

export class BlaxelSandboxProvider implements SandboxProvider {
  generateSandboxId(userId: string): string {
    return BlaxelService.generateSandboxName(userId);
  }
  getAppRoot(): string {
    return '/blaxel/app';
  }
  async getOrCreateUserSandbox(userId: string, userEmail: string): Promise<SandboxHandle> {
    const inst = await BlaxelService.getOrCreateUserSandbox(userId, userEmail);
    return new BlaxelHandle(inst);
  }
  async getUserSandbox(userId: string): Promise<SandboxHandle | null> {
    const inst = await BlaxelService.getUserSandbox(userId);
    return inst ? new BlaxelHandle(inst) : null;
  }
  async getUserPreviewUrl(userId: string): Promise<string | null> {
    return BlaxelService.getUserPreviewUrl(userId);
  }
  getSandboxUrl(userId: string): string {
    return BlaxelService.getSandboxUrl(userId);
  }
  getMCPServerUrl(userId: string): string {
    return BlaxelService.getMCPServerUrl(userId);
  }
}

// Helper to register Blaxel as the active sandbox provider
export function registerBlaxelProvider() {
  GenericSandboxService.setProvider(new BlaxelSandboxProvider());
}
