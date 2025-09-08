import {Provider, RunOptions} from './provider.js';
import {spawnCommand, which} from './spawn.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    // Log resolved codex path for debugging on Windows
    try {
      const resolved = await which(this.bin);
      // eslint-disable-next-line no-console
      console.error(`[manta-cli] codex resolved: ${resolved ?? 'not found in PATH'}`);
    } catch {}
    let args = opts.args;
    if (args.length === 1) {
      const firstLower = String(args[0]).toLowerCase();
      const known = new Set(['exec', 'login', 'help', '--help', '-h']);
      if (!known.has(firstLower)) args = ['exec','--full-auto', '--skip-git-repo-check', ...args];
    }

    // Determine model based on job kind
    const jobKind = (opts.jobKind || '').toLowerCase();
    const model_reasoning_effort = jobKind === 'build-nodes' ? 'medium' : 'low';
    // eslint-disable-next-line no-console
    console.error(`[manta-cli] jobKind=${jobKind}, model_reasoning_effort=${model_reasoning_effort}`);

    // Remove any pre-existing model config to avoid duplicates
    const cleanedArgs: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--config' && typeof args[i + 1] === 'string' && /(^|\b)model_reasoning_effort\s*=/.test(String(args[i + 1]))) {
        i++; // skip value as well
        continue;
      }
      cleanedArgs.push(a);
    }
    args = cleanedArgs;

    // Inject model config just before the prompt if possible; otherwise append
    const promptIndex = args.findIndex((a) => typeof a === 'string' && !a.startsWith('-'));
    const modelCfg = ['--config', `model_reasoning_effort="${model_reasoning_effort}"`];
    if (promptIndex > -1) {
      args = [...args.slice(0, promptIndex), ...modelCfg, ...args.slice(promptIndex)];
    } else {
      args = [...args, ...modelCfg];
    }

    const mcpFlags: string[] = [];
    try {
      const base = 'mcp_servers.manta';
      const quote = (s: string) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const tomlArray = (arr: string[]) => `[${arr.map((x) => quote(x)).join(', ')}]`;
      // Ensure MCP gets a base URL even if user didn't set one.
      const defaultBase = process.env.MANTA_API_URL || process.env.BACKEND_URL || 'http://localhost:3000';
      const envMap: Record<string, string> = { MANTA_API_URL: defaultBase };
      // Select MCP toolset based on job kind (graph-editor vs read-only)
      envMap.MANTA_MCP_TOOLSET = jobKind === 'graph-editor' ? 'graph-editor' : 'read-only';
      if (process.env.MANTA_API_KEY) envMap.MANTA_API_KEY = process.env.MANTA_API_KEY as string;
      // eslint-disable-next-line no-console
      console.error(`[manta-cli] MCP env plan: MANTA_API_URL=${envMap.MANTA_API_URL}, MANTA_MCP_TOOLSET=${envMap.MANTA_MCP_TOOLSET}, MANTA_API_KEY=${envMap.MANTA_API_KEY ? '[set]' : '[unset]'}`);
      const tomlMap = (obj: Record<string, string>) => `{ ${Object.entries(obj).map(([k, v]) => `${k} = ${quote(v)}`).join(', ')} }`;
      // Prefer bundled MCP in the CLI package, then local bin, then global
      const cwd = opts.cwd || process.cwd();
      const here = path.dirname(fileURLToPath(import.meta.url));
      const bundledMcp = [
        // when running from built CLI: packages/manta/dist/providers/codex.js -> ../../../manta-mcp/dist/index.js
        path.resolve(here, '../../../manta-mcp/dist/index.js'),
        // alternative monorepo layout guard
        path.resolve(here, '../../../../packages/manta-mcp/dist/index.js'),
      ].find((p) => fs.existsSync(p));

      if (bundledMcp) {
        // eslint-disable-next-line no-console
        console.error(`[manta-cli] Using bundled MCP: ${bundledMcp}`);
        mcpFlags.push('--config', `${base}.command=${quote(process.execPath)}`);
        mcpFlags.push('--config', `${base}.args=${tomlArray([bundledMcp])}`);
        if (Object.keys(envMap).length > 0) {
          if (process.platform === 'win32') {
            for (const [k, v] of Object.entries(envMap)) {
              mcpFlags.push('--config', `${base}.env.${k}=${quote(v)}`);
            }
          } else {
            mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
          }
        }
      } else {
        // Then prefer local project binary if installed
        const localBin = path.resolve(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'manta-mcp.cmd' : 'manta-mcp');
        if (fs.existsSync(localBin)) {
          // eslint-disable-next-line no-console
          console.error(`[manta-cli] Using local MCP bin: ${localBin}`);
          mcpFlags.push('--config', `${base}.command=${quote(localBin)}`);
          if (Object.keys(envMap).length > 0) {
            if (process.platform === 'win32') {
              for (const [k, v] of Object.entries(envMap)) {
                mcpFlags.push('--config', `${base}.env.${k}=${quote(v)}`);
              }
            } else {
              mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
            }
          }
        } else {
          // Finally, fall back to global if available
          const mantaBin = await which('manta-mcp');
          if (mantaBin) {
            // eslint-disable-next-line no-console
            console.error(`[manta-cli] Using global MCP: manta-mcp`);
            mcpFlags.push('--config', `${base}.command=${quote('manta-mcp')}`);
            if (Object.keys(envMap).length > 0) {
              if (process.platform === 'win32') {
                for (const [k, v] of Object.entries(envMap)) {
                  mcpFlags.push('--config', `${base}.env.${k}=${quote(v)}`);
                }
              } else {
                mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
              }
            }
          } else {
            throw new Error('No MCP server found. Build the bundled MCP: npm --prefix packages/manta-mcp run build (or npm run build:cli)');
          }
        }
      }
    } catch {}

    const cfg = readConfig();
    const env = { ...process.env, ...(opts.env ?? {}) } as NodeJS.ProcessEnv;
    if (!env.MANTA_API_URL) env.MANTA_API_URL = env.BACKEND_URL || 'http://localhost:3000';
    if ((cfg as any).mantaApiUrl && !env.MANTA_API_URL) env.MANTA_API_URL = (cfg as any).mantaApiUrl;
    if ((cfg as any).mantaApiKey && !env.MANTA_API_KEY) env.MANTA_API_KEY = (cfg as any).mantaApiKey;
    try {
      const localBin = path.resolve(opts.cwd || process.cwd(), 'node_modules', '.bin');
      if (fs.existsSync(localBin)) {
        const sep = process.platform === 'win32' ? ';' : ':';
        const pathVar = env.PATH || process.env.PATH || '';
        if (!pathVar.split(sep).includes(localBin)) env.PATH = `${localBin}${sep}${pathVar}`;
      }
    } catch {}

    const finalArgs = [...mcpFlags, ...args];
    // eslint-disable-next-line no-console
    console.error(`[manta-cli] MCP flags: ${mcpFlags.join(' ')}`);
    // eslint-disable-next-line no-console
    console.error(`[manta-cli] Spawning codex with jobKind=${jobKind}, model_reasoning_effort=${model_reasoning_effort}`);
    console.error(`[manta-cli] codex args: ${finalArgs.join(' ')}`);
    return await spawnCommand(this.bin, finalArgs, {
      env,
      cwd: opts.cwd,
      interactive: opts.interactive ?? true,
      // use default shell behavior (shell=true on Windows)
    });
  }
}
