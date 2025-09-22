#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} -> ${code}`))));
    child.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "run";                 // <-- default to PROD
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
    console.log(`Running Manta IDE (dev) targeting: ${targetDir}`);
    // Run Next from the PACKAGE ROOT (not the user project)
    const nextBin = join(packageRoot, "node_modules", ".bin", "next");
    await run(nextBin, ["dev"], {
      cwd: packageRoot,
      env: { ...env, NODE_ENV: "development" },
    });
    return;
  }

  if (["help", "--help", "-h"].includes(command)) {
    console.log(`
Manta IDE CLI

Usage:
  manta            Run prebuilt Manta IDE (default)
  manta run        Same as above
  manta dev        Run dev server (only in local repo with src/)
  manta help       Show this help
`);
    return;
  }

  // Fallback: behave like 'run'
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