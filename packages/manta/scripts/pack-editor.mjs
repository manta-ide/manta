#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cliDist = path.resolve(__dirname, '..', 'dist');
const editorSrcStandalone = path.join(repoRoot, '.next', 'standalone');
const editorSrcStatic = path.join(repoRoot, '.next', 'static');
const editorSrcPublic = path.join(repoRoot, 'public');
const editorOutRoot = path.join(cliDist, 'editor');
const editorOutStandalone = path.join(editorOutRoot, 'standalone');
const editorOutStatic = path.join(editorOutRoot, 'static');
const editorOutPublic = path.join(editorOutRoot, 'public');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
  return true;
}

if (!fs.existsSync(path.join(editorSrcStandalone, 'server.js'))) {
  console.error('[pack-editor] Standalone server not found. Build the editor first:');
  console.error('  npm run build  # at repo root (Next.js)');
  process.exit(1);
}

fs.mkdirSync(editorOutRoot, { recursive: true });
copyDir(editorSrcStandalone, editorOutStandalone);
copyDir(editorSrcStatic, editorOutStatic);
copyDir(editorSrcPublic, editorOutPublic);

console.log('[pack-editor] Copied editor to', editorOutRoot);

