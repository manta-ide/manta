import { execa } from 'execa';

function sanitizeEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Start from process.env so required augmented keys are present structurally
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };

  // Coerce non-strings to strings; leave undefined as undefined (unsets var)
  for (const k of Object.keys(merged)) {
    const v = merged[k];
    if (v === undefined) continue;
    if (typeof v !== 'string') (merged as any)[k] = String(v);
  }

  // Ensure NODE_ENV is present to satisfy your augmented typing
  if (!merged.NODE_ENV) {
    (merged as any).NODE_ENV = (process.env.NODE_ENV ?? 'development') as any;
  }

  return merged;
}

export async function spawnCommand(
  bin: string,
  args: string[],
  opts?: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    interactive?: boolean;
    forceShell?: boolean;
    input?: string | Buffer;
  },
): Promise<number> {
  const interactive = opts?.interactive ?? true;
  // Default to no shell for safer cross-platform argument passing
  const useShell = opts?.forceShell ?? false;

  // Pretty-format arguments for logging
  const fmtArg = (a: string) => {
    if (a === undefined || a === null) return '';
    const s = String(a);
    return /[\s\"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
  };

  // Prepare a concise env summary without leaking secrets
  const envForLog = sanitizeEnv(opts?.env);
  const envKeys = Object.keys(envForLog);
  const has = (k: string) => (envForLog[k] ? 'present' : 'unset');
  const hasSecret = (k: string) => (envForLog[k] ? '[set]' : '[unset]');
  const envSummary = [
    `MANTA_API_URL=${envForLog.MANTA_API_URL ?? 'unset'}`,
    `MANTA_MCP_TOOLSET=${envForLog.MANTA_MCP_TOOLSET ?? 'unset'}`,
    `MANTA_API_KEY=${hasSecret('MANTA_API_KEY')}`,
    `PATH=${has('PATH')}`,
  ].join(', ');

  // eslint-disable-next-line no-console
  console.error(`[manta-cli] spawn: ${bin} ${args.map(fmtArg).join(' ')}`);
  // eslint-disable-next-line no-console
  console.error(`[manta-cli] spawn opts: cwd=${opts?.cwd ?? process.cwd()}, shell=${useShell}, interactive=${interactive}`);
  // eslint-disable-next-line no-console
  console.error(`[manta-cli] spawn env: ${envSummary} (total_keys=${envKeys.length})`);

  const isWin32 = process.platform === 'win32';
  const subprocess = execa(bin, args, {
    cwd: opts?.cwd ?? process.cwd(),
    env: sanitizeEnv(opts?.env),
    stdio: interactive ? 'inherit' : 'pipe',
    shell: useShell,
    windowsHide: isWin32 ? false : undefined, // Only set windowsHide on actual Windows
    reject: false,
    preferLocal: true,
    input: opts?.input,
  });

  if (!interactive) {
    subprocess.stdout?.pipe(process.stdout);
    subprocess.stderr?.pipe(process.stderr);
  }

  const result = await subprocess;
  // eslint-disable-next-line no-console
  console.error(`[manta-cli] spawn exit: code=${result.exitCode ?? 0}, signal=${result.signal ?? 'none'}`);
  return result.signal ? 128 : (result.exitCode ?? 0);
}

export async function which(bin: string): Promise<string | null> {
  const isWin32 = process.platform === 'win32';
  const isWSL = process.platform === 'linux' && process.env.WSL_DISTRO_NAME !== undefined;
  const cmd = (isWin32 || isWSL) ? 'where' : 'which';
  const { exitCode, stdout } = await execa(cmd, [bin], {
    reject: false,
    shell: isWSL, // Use shell on WSL to handle PATH properly
    windowsHide: isWin32 // Only use windowsHide on actual Windows
  });
  if (exitCode !== 0) return null;
  const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return first ?? bin;
}
