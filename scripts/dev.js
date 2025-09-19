#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

function run(cmd, args, cwd) {
  const child = spawn(cmd, args, { stdio: 'inherit', cwd, shell: true });
  child.on('close', (code) => process.exit(code ?? 0));
  child.on('error', (err) => { console.error(err); process.exit(1); });
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`\nManta dev helper\n\nUsage:\n  manta            Run Next.js IDE and test project (dev)\n  manta help       Show this help\n`);
  process.exit(0);
}

// Default: run both dev servers (IDE + test project)
run('npm', ['run', 'dev'], packageRoot);
