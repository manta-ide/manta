import {run} from '@oclif/core';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

async function ensureMantaMcpInstalled() {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  const existsOnPath: boolean = await new Promise((resolve) => {
    const ps = spawn(whichCmd, ['manta-mcp']);
    ps.on('close', (code) => resolve(code === 0));
    ps.on('error', () => resolve(false));
  });
  if (existsOnPath) return;

  try {
    const here = fileURLToPath(import.meta.url);
    const distDir = path.dirname(here);
    const projectRoot = path.resolve(distDir, '..');
    const packageRoot = path.resolve(projectRoot, '..', '..');
    const binName = process.platform === 'win32' ? 'manta-mcp.cmd' : 'manta-mcp';
    const localBinAtManta = path.join(projectRoot, 'node_modules', '.bin', binName);
    const localBinAtRoot = path.join(packageRoot, 'node_modules', '.bin', binName);
    if (fs.existsSync(localBinAtManta) || fs.existsSync(localBinAtRoot)) return;

    // Install from registry into local package dir
    await new Promise<void>((resolve) => {
      const inst = spawn('npm', ['i', 'manta-mcp'], {stdio: 'ignore', cwd: packageRoot});
      inst.on('close', () => resolve());
      inst.on('error', () => resolve());
    });
  } catch {
    // best effort
  }
}

export async function main(argv: string[] = process.argv.slice(2)) {
  await ensureMantaMcpInstalled();
  await run(argv, import.meta.url);
}

export default main;
