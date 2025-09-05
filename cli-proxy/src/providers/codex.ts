import {Provider, RunOptions} from './provider.js';
import {spawnCommand, which} from './spawn.js';

export class CodexProvider implements Provider {
  readonly name = 'codex';
  readonly bin = 'codex';

  async ensureAvailable(): Promise<void> {
    const path = await which(this.bin);
    if (!path) {
      throw new Error(
        'codex CLI not found in PATH. Please install the Codex CLI (https://github.com/openai/codex) and ensure `codex` is on your PATH.',
      );
    }
  }

  async run(opts: RunOptions): Promise<number> {
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
    return await spawnCommand(this.bin, args, {
      env: opts.env,
      cwd: opts.cwd,
      interactive: opts.interactive ?? true,
    });
  }
}
