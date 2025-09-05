import {spawn} from 'node:child_process';

export async function spawnCommand(
  bin: string,
  args: string[],
  opts?: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    interactive?: boolean;
  },
): Promise<number> {
  const interactive = opts?.interactive ?? true;
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts?.cwd ?? process.cwd(),
      env: {...process.env, ...opts?.env},
      stdio: interactive ? 'inherit' : 'pipe',
    });

    if (!interactive && child.stdout) child.stdout.pipe(process.stdout);
    if (!interactive && child.stderr) child.stderr.pipe(process.stderr);

    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => {
      if (signal) {
        // Normalize signal exit into non-zero code
        resolve(128);
      } else {
        resolve(code ?? 0);
      }
    });
  });
}

export async function which(bin: string): Promise<string | null> {
  const {spawn} = await import('node:child_process');
  return await new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', [bin]);
    let out = '';
    child.stdout?.on('data', (d) => (out += String(d)));
    child.on('close', (code) => {
      if (code === 0) resolve(out.split(/\r?\n/)[0] ?? bin);
      else resolve(null);
    });
  });
}

