#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, cpSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0];

if (command === 'i' || command === 'install') {
  // Install template to current directory
  const templateDir = join(packageRoot, 'test-project');
  const currentDir = process.cwd();

  console.log('Installing Manta template...');
  try {
    cpSync(templateDir, currentDir, { recursive: true });
    console.log('Template installed successfully!');
    console.log('Run "manta run" to start Manta IDE.');
  } catch (error) {
    console.error('Error installing template:', error.message);
    process.exit(1);
  }
} else if (command === 'run') {
  // Run both IDE and app
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    cwd: packageRoot,
    shell: true,
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`
Manta IDE CLI

Usage:
  manta i          Install template to current directory
  manta run        Run Manta IDE (both IDE and app)
  manta help       Show this help

For development:
  manta            Run just the IDE (default)
`);
} else {
  // Default: run just the IDE
  const child = spawn('npm', ['run', 'dev:ide'], {
    stdio: 'inherit',
    cwd: packageRoot,
    shell: true,
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}
