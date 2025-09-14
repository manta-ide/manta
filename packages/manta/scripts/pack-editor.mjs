#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const cliDist = path.resolve(__dirname, '..', 'dist');
const editorSrcStandalone = path.join(repoRoot, '.next', 'standalone');
const editorSrcNextDir = path.join(repoRoot, '.next');
const editorSrcStatic = path.join(repoRoot, '.next', 'static');
const editorSrcPublic = path.join(repoRoot, 'public');
const editorOutRoot = path.join(cliDist, 'editor');
const editorOutStandalone = path.join(editorOutRoot, 'standalone');
const editorOutNextDir = path.join(editorOutRoot, '.next');
const editorOutStatic = path.join(editorOutRoot, 'static');
const editorOutPublic = path.join(editorOutRoot, 'public');

function copyDir(src, dest, excludeDirs = []) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // Skip excluded directories
    if (excludeDirs.includes(entry.name)) {
      console.log(`[pack-editor] Skipping excluded directory: ${entry.name}`);
      continue;
    }
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, excludeDirs);
    else fs.copyFileSync(s, d);
  }
  return true;
}

fs.mkdirSync(editorOutRoot, { recursive: true });

const standaloneServer = path.join(editorSrcStandalone, 'server.js');
if (fs.existsSync(standaloneServer)) {
  // Preferred: Next.js standalone output
  copyDir(editorSrcStandalone, editorOutStandalone);
  copyDir(editorSrcStatic, editorOutStatic);
  copyDir(editorSrcPublic, editorOutPublic);
  console.log('[pack-editor] Copied Next standalone to', editorOutStandalone);
} else {
  // Fallback for Next 15+ without standalone folder: copy .next and public, add a tiny server wrapper
  if (!fs.existsSync(editorSrcNextDir)) {
    console.error('[pack-editor] .next directory not found. Build the editor first:');
    console.error('  npm run build  # at repo root (Next.js)');
    process.exit(1);
  }
  copyDir(editorSrcNextDir, editorOutNextDir, ['cache']);
  copyDir(editorSrcPublic, editorOutPublic);

  const serverWrapper = `#!/usr/bin/env node\nimport http from 'node:http';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport next from 'next';\n\nconst __filename = fileURLToPath(import.meta.url);\nconst __dirname = path.dirname(__filename);\nconst dir = __dirname; // this folder contains .next + public\nconst port = Number(process.env.PORT) || 3000;\n\nasync function start() {\n  const app = next({ dev: false, dir });\n  const handle = app.getRequestHandler();\n  await app.prepare();\n  const server = http.createServer((req, res) => handle(req, res));\n  server.listen(port, () => {\n    // eslint-disable-next-line no-console\n    console.log('[editor] listening on', port);\n  });\n}\nstart().catch((e) => {\n  // eslint-disable-next-line no-console\n  console.error('[editor] failed to start:', e);\n  process.exit(1);\n});\n`;
  fs.writeFileSync(path.join(editorOutRoot, 'server.mjs'), serverWrapper, 'utf8');
  console.log('[pack-editor] Copied .next + public and added server.mjs to', editorOutRoot);
}

console.log('[pack-editor] Editor packaged at', editorOutRoot);
