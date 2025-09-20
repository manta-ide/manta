#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, cpSync, mkdirSync, writeFileSync } from 'fs';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

async function downloadAndExtractTemplate() {
  const cwd = process.cwd();
  const repoSpec = 'manta-ide/manta-template';
  const ref = 'main';
  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '').trim();
  const subdir = '';

  const zipUrl = `https://codeload.github.com/${repoSpec}/zip/refs/heads/${encodeURIComponent(ref)}`;
  console.log(`[manta] downloading ${repoSpec}@${ref}`);

  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const resp = await fetch(zipUrl, { headers });
  if (!resp.ok) {
    console.error(`Failed to download ZIP: ${resp.status} ${resp.statusText}`);
    process.exit(1);
  }
  const ab = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  // Detect top-level folder prefix (e.g., repo-ref/)
  let rootPrefix = '';
  zip.forEach((relPath) => {
    const parts = relPath.split('/');
    if (parts.length > 1 && !rootPrefix) rootPrefix = parts[0] + '/';
  });

  const isUnderSubdir = (p) => {
    const rel = rootPrefix && p.startsWith(rootPrefix) ? p.slice(rootPrefix.length) : p;
    if (!subdir) return rel && !rel.endsWith('/');
    const norm = rel.replace(/^\/+/, '');
    return norm.startsWith(subdir + '/') && !norm.endsWith('/');
  };
  const toCwdRel = (p) => {
    const rel = rootPrefix && p.startsWith(rootPrefix) ? p.slice(rootPrefix.length) : p;
    return subdir ? rel.replace(new RegExp('^' + subdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '') : rel;
  };

  // Write entries
  const entries = Object.values(zip.files);
  let written = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    if (!isUnderSubdir(entry.name)) continue;
    const rel = toCwdRel(entry.name);
    if (!rel) continue;
    const abs = join(cwd, rel);
    const dir = dirname(abs);
    mkdirSync(dir, { recursive: true });
    if (existsSync(abs)) {
      console.log(`[skip] ${rel} (exists)`);
      continue;
    }
    const content = await entry.async('nodebuffer');
    writeFileSync(abs, content);
    written++;
  }
  console.log(`[manta] wrote ${written} files to ${cwd}`);

  // Post-install: npm install and build at project root (best-effort)
  await runIfExists(cwd, 'npm', ['i']);
  await runIfExists(cwd, 'npm', ['run', 'build']);

  // Post-install for child template if present
  const childDir = join(cwd, 'vite-base-template');
  if (existsSync(join(childDir, 'package.json'))) {
    await runIfExists(childDir, 'npm', ['i']);
    await runIfExists(childDir, 'npm', ['run', 'build']);
  }
}

async function runIfExists(cwd, cmd, args) {
  try {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      cwd,
    });
    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Command failed with code ${code}`));
      });
      child.on('error', reject);
    });
  } catch (error) {
    console.log(`[skip] ${cmd} ${args.join(' ')} (failed or not found)`);
  }
}

const args = process.argv.slice(2);
const command = args[0];

if (command === 'i' || command === 'install') {
  // Download and install template from GitHub
  console.log('Installing Manta template from manta-ide/manta-template...');
  try {
    await downloadAndExtractTemplate();
    console.log('Template installed successfully!');
    console.log('Run "manta run" to start Manta IDE.');
  } catch (error) {
    console.error('Error installing template:', error.message);
    process.exit(1);
  }
} else if (command === 'run') {
  // Run Manta IDE from package root but target the current directory
  const currentDir = process.cwd();
  console.log(`Running Manta IDE targeting: ${currentDir}`);

  // Set environment variables to indicate we're in user project mode
  const env = { ...process.env, MANTA_MODE: 'user-project', MANTA_PROJECT_DIR: currentDir };

  const child = spawn('npm', ['run', 'dev:ide'], {
    stdio: 'inherit',
    cwd: packageRoot,
    env,
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`
Manta IDE CLI

Usage:
  manta i          Download and install template from manta-ide/manta-template
  manta run        Run Manta IDE targeting current directory
  manta help       Show this help

For development:
  manta            Run just the IDE (default)
`);
} else {
  // Default: run IDE from package root
  // When running npm run dev from project root, target test-project
  // When running manta from other directories, target current directory
  const currentDir = process.cwd();
  let targetDir = currentDir;

  // If we're in the project root (running npm run dev), target test-project
  if (currentDir === packageRoot) {
    targetDir = join(packageRoot, 'test-project');
    console.log(`Running Manta IDE targeting test project: ${targetDir}`);
  } else {
    console.log(`Running Manta IDE targeting: ${targetDir}`);
  }

  // Set environment variables to indicate we're in user project mode
  const env = { ...process.env, MANTA_MODE: 'user-project', MANTA_PROJECT_DIR: targetDir };

  const child = spawn('npm', ['run', 'dev:ide'], {
    stdio: 'inherit',
    cwd: packageRoot,
    env,
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}
