import { spawn as _spawn } from 'node:child_process';

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
  },
): Promise<number> {
  const interactive = opts?.interactive ?? true;
  const useShell = opts?.forceShell ?? (process.platform === 'win32');

  return await new Promise<number>((resolve, reject) => {
    const child = _spawn(bin, args, {
      cwd: opts?.cwd ?? process.cwd(),
      env: sanitizeEnv(opts?.env),
      stdio: interactive ? 'inherit' : 'pipe',
      shell: useShell,
      windowsHide: false,
    });

    if (!interactive && child.stdout) child.stdout.pipe(process.stdout);
    if (!interactive && child.stderr) child.stderr.pipe(process.stderr);

    child.on('error', reject);
    child.on('close', (code, signal) => resolve(signal ? 128 : (code ?? 0)));
  });
}

export async function which(bin: string): Promise<string | null> {
  const { spawn } = await import('node:child_process');
  const who = process.platform === 'win32' ? 'where.exe' : 'which';
  return await new Promise((resolve) => {
    const child = spawn(who, [bin], { shell: process.platform === 'win32' });
   let out = '';
    let err = '';
    child.stdout?.on('data', (d) => (out += String(d)));
    child.stderr?.on('data', (d) => (err += String(d)));
    child.on('close', (code) => {
      if (code === 0) {
        // Take the first non-empty line
        const first = out.split(/\r?\n/).map(s => s.trim()).find(Boolean);
        resolve(first ?? bin);
      } else {
        resolve(null);
      }
    });
  });
}