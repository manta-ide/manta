#!/usr/bin/env node
import { spawn } from 'child_process';

const child = spawn('next', ['dev', '--turbopack'], {
  stdio: 'inherit',
  shell: true,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
