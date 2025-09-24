#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, cpSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "fs";
import JSZip from "jszip";

// Load .env file if it exists
function loadEnvFile() {
  const envPath = join(packageRoot, '.env');
  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, 'utf8');
      const envVars = {};
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            // Remove quotes if present
            const cleanValue = value.replace(/^["']|["']$/g, '');
            envVars[key.trim()] = cleanValue;
          }
        }
      });
      // Set the environment variables
      Object.assign(process.env, envVars);
      console.log('Loaded environment variables from .env file');
    } catch (error) {
      console.warn('Failed to load .env file:', error.message);
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

// Helper function to get the correct binary path for cross-platform compatibility
function getBinPath(binName) {
  const basePath = join(packageRoot, "node_modules", ".bin", binName);
  return process.platform === "win32" ? `${basePath}.cmd` : basePath;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} -> ${code}`))));
    child.on("error", reject);
  });
}

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

async function main() {
  // Load environment variables from .env file
  loadEnvFile();

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
    return;
  }

  const targetDir = process.cwd();

  const env = {
    ...process.env,
    MANTA_MODE: "user-project",
    MANTA_PROJECT_DIR: targetDir,
  };

  const serverJs  = join(packageRoot, ".next", "standalone", "server.js");
  const serverCwd = join(packageRoot, ".next", "standalone");

  if (command === "run" || command === "run:prod") {
    if (!existsSync(serverJs)) {
      console.error("[manta] No standalone build found.");
      console.error("[manta] Reinstall the package or build before packing: `npm run build` (which creates .next/standalone).");
      process.exit(1);
    }

    // sanity: static must be mirrored into standalone/.next/static
    const staticCss   = join(serverCwd, ".next", "static", "css");
    const staticChunks= join(serverCwd, ".next", "static", "chunks");
    try {
      const cssOk    = existsSync(staticCss)    && readdirSync(staticCss).length > 0;
      const chunksOk = existsSync(staticChunks) && readdirSync(staticChunks).length > 0;
      if (!cssOk || !chunksOk) {
        console.warn("[manta] Warning: .next/standalone/.next/static looks incomplete – CSS/JS may 404.");
      }
    } catch {}

    console.log(`Running Manta IDE (prod) targeting: ${targetDir}`);
    await run("node", [serverJs], {
      cwd: serverCwd,                              // <-- MUST be standalone dir
      env: { ...env, NODE_ENV: "production", PORT: process.env.PORT || "3001" },
    });
    return;
  }

  if (command === "dev") {
    // Dev only for repo clones that include src/app
    // Check for environment variable specifying absolute project directory
    const devProjectDir = process.env.MANTA_DEV_PROJECT_DIR || targetDir;
    console.log(`Running Manta IDE (dev) targeting: ${devProjectDir}`);
    // Run Next from the PACKAGE ROOT (not the user project)
    const nextBin = getBinPath("next");
    await run(nextBin, ["dev"], {
      cwd: packageRoot,
      env: { ...env, MANTA_MODE: "user-project", MANTA_PROJECT_DIR: devProjectDir, NODE_ENV: "development" },
    });
    return;
  }

  if (command === "dev:ide") {
    // Direct Next.js dev with environment variables
    const devProjectDir = process.env.MANTA_DEV_PROJECT_DIR || targetDir;
    console.log(`Running Manta IDE (dev:ide) targeting: ${devProjectDir}`);
    const nextBin = getBinPath("next");
    await run(nextBin, ["dev"], {
      cwd: packageRoot,
      env: { ...env, MANTA_MODE: "user-project", MANTA_PROJECT_DIR: devProjectDir, NODE_ENV: "development" },
    });
    return;
  }

  if (command === "dev:ide:turbo") {
    // Direct Next.js dev with turbopack and environment variables
    const devProjectDir = process.env.MANTA_DEV_PROJECT_DIR || targetDir;
    console.log(`Running Manta IDE (dev:ide:turbo) targeting: ${devProjectDir}`);
    const nextBin = getBinPath("next");
    await run(nextBin, ["dev", "--turbopack"], {
      cwd: packageRoot,
      env: { ...env, MANTA_MODE: "user-project", MANTA_PROJECT_DIR: devProjectDir, NODE_ENV: "development" },
    });
    return;
  }

  if (["help", "--help", "-h"].includes(command)) {
    console.log(`
Manta IDE CLI

Usage:
  manta            Run prebuilt Manta IDE (default)
  manta i          Download and install template from manta-ide/manta-template
  manta run        Run Manta IDE targeting current directory
  manta dev        Run dev server (only in local repo with src/)
  manta help       Show this help

NPM Scripts (in package.json):
  npm run dev              Run dev server via scripts/dev.js
  npm run dev:ide          Run Next.js dev directly (respects .env)
  npm run dev:ide:turbo    Run Next.js dev with turbopack (respects .env)
`);
    return;
  }

  // Default: behave like 'run'
  if (!existsSync(serverJs)) {
    console.error("[manta] No standalone build found for fallback run.");
    process.exit(1);
  }
  await run("node", [serverJs], {
    cwd: serverCwd,
    env: { ...env, NODE_ENV: "production", PORT: process.env.PORT || "3001" },
  });
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});