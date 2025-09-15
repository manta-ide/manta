import fs from 'fs';
import path from 'path';
import {
  SandboxProvider,
  SandboxHandle,
  SandboxFs,
  SandboxProcessManager,
  SandboxService as GenericSandboxService,
} from './sandbox-service';
import { getDevProjectDir } from './project-config';

const PREVIEW_URL = `http://localhost:${process.env.MANTA_CHILD_PORT || '3001'}`;
const APP_ROOT = '/';
// Project directory resolution
function getProjectDir(): string {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (require('fs').existsSync(devProjectDir)) {
      return path.resolve(devProjectDir);
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  return process.cwd();
}

const BASE_DIR = getProjectDir();

class LocalFs implements SandboxFs {
  private toDiskPath(p: string): string {
    const rel = p.replace(/^\//, '');
    return path.join(BASE_DIR, rel);
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
