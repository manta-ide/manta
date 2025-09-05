import fs from 'fs';
import path from 'path';
import {
  SandboxProvider,
  SandboxHandle,
  SandboxFs,
  SandboxProcessManager,
  SandboxService as GenericSandboxService,
} from './sandbox-service';

const PREVIEW_URL = 'http://localhost:3001';
const APP_ROOT = '/vite-base-template';
const BASE_DIR = path.join(process.cwd(), 'vite-base-template');

class LocalFs implements SandboxFs {
  private toDiskPath(p: string): string {
    const rel = p.replace(/^\//, '');
    // Ensure paths under vite-base-template
    const cleaned = rel.startsWith('vite-base-template') ? rel.slice('vite-base-template'.length) : rel;
    return path.join(BASE_DIR, cleaned.replace(/^\//, ''));
  }

  async write(filePath: string, content: string): Promise<void> {
    const abs = this.toDiskPath(filePath);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, content, 'utf8');
  }

  async writeTree(files: { path: string; content: string }[], dest: string): Promise<void> {
    for (const f of files) {
      const joined = path.posix.join(dest, f.path.replace(/^\//, ''));
      await this.write(joined, f.content);
    }
  }

  async ls(dir: string): Promise<{ files: any[]; subdirectories: any[] }> {
    const abs = this.toDiskPath(dir);
    const files: any[] = [];
    const subdirectories: any[] = [];
    try {
      const entries = fs.readdirSync(abs, {withFileTypes: true});
      for (const e of entries) {
        if (e.isDirectory()) {
          subdirectories.push({ name: e.name, path: path.posix.join(dir === '/' ? '' : dir, e.name) });
        } else if (e.isFile()) {
          files.push({ name: e.name, path: path.posix.join(dir === '/' ? '' : dir, e.name) });
        }
      }
    } catch {
      // if missing, return empty
    }
    return { files, subdirectories };
  }

  async read(filePath: string): Promise<string> {
    const abs = this.toDiskPath(filePath);
    return fs.readFileSync(abs, 'utf8');
  }
}

class LocalProcess implements SandboxProcessManager {
  async exec(_params: { name: string; command: string; waitForPorts?: number[] }): Promise<void> {
    // No-op in local provider; user runs processes manually.
    return;
  }
  async wait(_name: string, _opts: { maxWait: number; interval: number }): Promise<void> {
    // No-op; return immediately
    return;
  }
}

class LocalHandle implements SandboxHandle {
  fs: SandboxFs;
  process: SandboxProcessManager;
  constructor() {
    this.fs = new LocalFs();
    this.process = new LocalProcess();
  }
}

export class LocalSandboxProvider implements SandboxProvider {
  generateSandboxId(userId: string): string {
    return `local-${userId}`;
  }
  getAppRoot(): string {
    return APP_ROOT;
  }
  async getOrCreateUserSandbox(_userId: string, _userEmail: string): Promise<SandboxHandle> {
    return new LocalHandle();
  }
  async getUserSandbox(_userId: string): Promise<SandboxHandle | null> {
    return new LocalHandle();
  }
  async getUserPreviewUrl(_userId: string): Promise<string | null> {
    return PREVIEW_URL;
  }
  getSandboxUrl(_userId: string): string {
    return PREVIEW_URL;
  }
  getMCPServerUrl(_userId: string): string {
    return 'ws://localhost:3001';
  }
}

export function registerLocalProvider() {
  GenericSandboxService.setProvider(new LocalSandboxProvider());
}

