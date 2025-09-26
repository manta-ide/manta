#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, cpSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { createServer } from "net";
import JSZip from "jszip";

// Check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Find an available port starting from the given port
async function findAvailablePort(startPort) {
  let port = startPort;
  while (true) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
    // Prevent infinite loop by limiting to a reasonable range
    if (port > startPort + 100) {
      throw new Error(`Could not find an available port starting from ${startPort}`);
    }
  }
}

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

    console.log(`Starting Manta IDE (prod) targeting: ${targetDir}`);

    // Set environment variables
    process.env.NODE_ENV = "production";

    // Find an available port starting from PORT env var or 3001
    const startPort = parseInt(process.env.PORT || "3001", 10);
    const availablePort = await findAvailablePort(startPort);
    process.env.PORT = availablePort.toString();

    // Change to standalone directory
    process.chdir(serverCwd);

    // Actually start the server instead of just printing instructions
    console.log(`Starting production server on port ${process.env.PORT}...`);
    try {
      const child = spawn('node', [serverJs], {
        stdio: 'inherit',
        cwd: serverCwd,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: process.env.PORT,
          MANTA_MODE: "user-project",
          MANTA_PROJECT_DIR: targetDir,
        }
      });

      // Handle process termination
      process.on('SIGINT', () => {
        console.log('\nShutting down Manta IDE...');
        child.kill('SIGINT');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\nShutting down Manta IDE...');
        child.kill('SIGTERM');
        process.exit(0);
      });

      await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) {
            console.log('Manta IDE stopped successfully.');
            resolve();
          } else {
            console.error(`Manta IDE exited with code ${code}`);
            reject(new Error(`Server exited with code ${code}`));
          }
        });
        child.on('error', reject);
      });
    } catch (error) {
      console.error('Failed to start Manta IDE:', error.message);
      process.exit(1);
    }
    return;
  }


  if (command === "dev:ide:turbo") {
    // Direct Next.js dev with turbopack and environment variables
    const devProjectDir = process.env.MANTA_DEV_PROJECT_DIR || targetDir;
    console.log(`Setting up Manta IDE (dev:ide:turbo) targeting: ${devProjectDir}`);

    // Set environment variables
    process.env.MANTA_MODE = "user-project";
    process.env.MANTA_PROJECT_DIR = devProjectDir;
    process.env.NODE_ENV = "development";

    // Change to package root directory
    process.chdir(packageRoot);

    console.log(`Environment set up. Run 'npx next dev --turbopack' to start development server with turbopack.`);
    return;
  }

  if (["help", "--help", "-h"].includes(command)) {
    console.log(`
Manta IDE CLI

Usage:
  manta            Start prebuilt Manta IDE (default)
  manta i          Download and install template from manta-ide/manta-template
  manta run        Start Manta IDE targeting current directory
  manta dev        Run dev server (only in local repo with src/)
  manta help       Show this help

NPM Scripts (in package.json):
  npm run dev              Run Next.js dev server directly
  npm run dev:ide:turbo    Run Next.js dev server with turbopack
`);
    return;
  }

  // Default: behave like 'run'
  if (!existsSync(serverJs)) {
    console.error("[manta] No standalone build found for fallback run.");
    process.exit(1);
  }

  console.log(`Starting Manta IDE (prod) targeting: ${targetDir}`);

  // Set environment variables
  process.env.NODE_ENV = "production";

  // Find an available port starting from PORT env var or 3001
  const startPort = parseInt(process.env.PORT || "3001", 10);
  const availablePort = await findAvailablePort(startPort);
  process.env.PORT = availablePort.toString();

  // Change to standalone directory
  process.chdir(serverCwd);

  // Actually start the server instead of just printing instructions
  console.log(`Starting production server on port ${process.env.PORT}...`);
  try {
    const child = spawn('node', [serverJs], {
      stdio: 'inherit',
      cwd: serverCwd,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: process.env.PORT,
        MANTA_MODE: "user-project",
        MANTA_PROJECT_DIR: targetDir,
      }
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\nShutting down Manta IDE...');
      child.kill('SIGINT');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\nShutting down Manta IDE...');
      child.kill('SIGTERM');
      process.exit(0);
    });

    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          console.log('Manta IDE stopped successfully.');
          resolve();
        } else {
          console.error(`Manta IDE exited with code ${code}`);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  } catch (error) {
    console.error('Failed to start Manta IDE:', error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});