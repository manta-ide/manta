import {Provider, RunOptions} from './provider.js';
import {spawnCommand, which} from './spawn.js';
import path from 'node:path';
import fs from 'node:fs';
import {readConfig} from '../config/store.js';

export class CodexProvider implements Provider {
  readonly name = 'codex';
  readonly bin = 'codex';

  async ensureAvailable(): Promise<void> {
    const pathFound = await which(this.bin);
    if (!pathFound) throw new Error('codex CLI not found in PATH. Install Codex and ensure `codex` is available.');
  }

  async run(opts: RunOptions): Promise<number> {
    await this.ensureAvailable();
    let args = opts.args;
    if (args.length === 1) {
      const firstLower = String(args[0]).toLowerCase();
      const known = new Set(['exec', 'login', 'help', '--help', '-h']);
      if (!known.has(firstLower)) args = ['exec','--full-auto', '--skip-git-repo-check', ...args];
    }

    const mcpFlags: string[] = [];
    try {
      const base = 'mcp_servers.manta';
      const quote = (s: string) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const tomlArray = (arr: string[]) => `[${arr.map((x) => quote(x)).join(', ')}]`;
      // Ensure MCP gets a base URL even if user didn't set one.
      const defaultBase = process.env.MANTA_API_URL || process.env.BACKEND_URL || 'http://localhost:3000';
      const envMap: Record<string, string> = { MANTA_API_URL: defaultBase };
      if (process.env.MANTA_API_KEY) envMap.MANTA_API_KEY = process.env.MANTA_API_KEY as string;
      const tomlMap = (obj: Record<string, string>) => `{ ${Object.entries(obj).map(([k, v]) => `${k} = ${quote(v)}`).join(', ')} }`;
      // Prefer in-repo script first to guarantee compatibility with editor
      const candidates = [
        path.resolve(process.cwd(), 'scripts/mcp/server.ts'),
        path.resolve(process.cwd(), '..', 'scripts/mcp/server.ts'),
      ];
      const serverPath = candidates.find((p) => fs.existsSync(p));
      if (serverPath) {
        mcpFlags.push('--config', `${base}.command=${quote(process.execPath)}`);
        mcpFlags.push('--config', `${base}.args=${tomlArray([serverPath])}`);
        if (Object.keys(envMap).length > 0) mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
      } else {
        // Then prefer local project binary if installed
        const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'manta-mcp.cmd' : 'manta-mcp');
        if (fs.existsSync(localBin)) {
          mcpFlags.push('--config', `${base}.command=${quote(localBin)}`);
          if (Object.keys(envMap).length > 0) mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
        } else {
          // Finally, fall back to global if available
          const mantaBin = await which('manta-mcp');
          if (mantaBin) {
            mcpFlags.push('--config', `${base}.command=${quote('manta-mcp')}`);
            if (Object.keys(envMap).length > 0) mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
          }
        }
      }
    } catch {}

    const cfg = readConfig();
    const env = { ...process.env, ...(opts.env ?? {}) } as NodeJS.ProcessEnv;
    if (!env.MANTA_API_URL) env.MANTA_API_URL = env.BACKEND_URL || 'http://localhost:3000';
    if (cfg.mantaApiUrl && !env.MANTA_API_URL) env.MANTA_API_URL = cfg.mantaApiUrl;
    if (cfg.mantaApiKey && !env.MANTA_API_KEY) env.MANTA_API_KEY = cfg.mantaApiKey;
    try {
      const localBin = path.resolve(process.cwd(), 'node_modules', '.bin');
      if (fs.existsSync(localBin)) {
        const sep = process.platform === 'win32' ? ';' : ':';
        const pathVar = env.PATH || process.env.PATH || '';
        if (!pathVar.split(sep).includes(localBin)) env.PATH = `${localBin}${sep}${pathVar}`;
      }
    } catch {}

    const finalArgs = [...mcpFlags, ...args];
    return await spawnCommand(this.bin, finalArgs, {
      env,
      cwd: opts.cwd,
      interactive: opts.interactive ?? true,
    });
  }
}
