import { spawnCommand, which } from './spawn.js';
import path from 'node:path';
import fs from 'node:fs';
export class CodexProvider {
    constructor() {
        this.name = 'codex';
        this.bin = 'codex';
    }
    async ensureAvailable() {
        const path = await which(this.bin);
        if (!path) {
            throw new Error('codex CLI not found in PATH. Please install the Codex CLI (https://github.com/openai/codex) and ensure `codex` is on your PATH.');
        }
    }
    async run(opts) {
        await this.ensureAvailable();
        let args = opts.args;
        // If user passes a single prompt string (no subcommand), default to `exec` for non-interactive automation.
        if (args.length === 1) {
            const first = args[0];
            const firstLower = String(first).toLowerCase();
            const known = new Set(['exec', 'login', 'help', '--help', '-h']);
            if (!known.has(firstLower)) {
                args = ['exec', ...args];
            }
        }
        // Inject a built-in MCP server configuration for manta
        const mcpFlags = [];
        try {
            // Try to resolve the server.ts path relative to repo root (one level up from cli-proxy)
            const candidates = [
                path.resolve(process.cwd(), 'scripts/mcp/server.ts'),
                path.resolve(process.cwd(), '..', 'scripts/mcp/server.ts'),
            ];
            const serverPath = candidates.find((p) => fs.existsSync(p));
            if (serverPath) {
                const base = 'mcp_servers.manta';
                const quote = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
                const tomlArray = (arr) => `[${arr.map((x) => quote(x)).join(', ')}]`;
                const envMap = {};
                if (process.env.MANTA_API_URL)
                    envMap.MANTA_API_URL = process.env.MANTA_API_URL;
                if (process.env.MANTA_API_KEY)
                    envMap.MANTA_API_KEY = process.env.MANTA_API_KEY;
                const tomlMap = (obj) => `{ ${Object.entries(obj).map(([k, v]) => `${k} = ${quote(v)}`).join(', ')} }`;
                mcpFlags.push('--config', `${base}.command=${quote(process.execPath)}`);
                mcpFlags.push('--config', `${base}.args=${tomlArray([serverPath])}`);
                if (Object.keys(envMap).length > 0) {
                    mcpFlags.push('--config', `${base}.env=${tomlMap(envMap)}`);
                }
            }
        }
        catch { }
        const finalArgs = [...mcpFlags, ...args];
        return await spawnCommand(this.bin, finalArgs, {
            env: opts.env,
            cwd: opts.cwd,
            interactive: opts.interactive ?? true,
        });
    }
}
//# sourceMappingURL=codex.js.map