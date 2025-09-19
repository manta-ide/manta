#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

function run(cmd, args, cwd, env) {
  const child = spawn(cmd, args, { stdio: 'inherit', cwd, shell: true, env });
  child.on('close', (code) => process.exit(code ?? 0));
  child.on('error', (err) => { console.error(err); process.exit(1); });
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`\nManta dev helper\n\nUsage:\n  manta [folder]   Run Next.js dev targeting [folder] (DEV_PROJECT_DIR)\n  manta help       Show this help\n\nNotes:\n  - If no folder is provided, the app uses DEV_PROJECT_DIR if set, otherwise 'test-project'.\n`);
  process.exit(0);
}

// Default: run Next.js dev; optional project dir argument to target a folder
const projectDirArg = command && !command.startsWith('-') ? command : undefined;
const env = { ...process.env };
if (projectDirArg) env.DEV_PROJECT_DIR = projectDirArg;
run('npx', ['next', 'dev', '--turbopack'], packageRoot, env);
