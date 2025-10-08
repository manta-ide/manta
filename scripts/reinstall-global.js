#!/usr/bin/env node
import { execa } from "execa";
import { join } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import { rm } from "fs/promises";

const packageRoot = join(process.cwd());

async function run(cmd, args, opts = {}) {
  // Use execa for robust cross-platform process execution
  await execa(cmd, args, { stdio: "inherit", ...opts });
}

async function runCapture(cmd, args, opts = {}) {
  // Use execa to capture stderr for error handling while still showing stdout/stderr
  return await execa(cmd, args, { stdio: ["inherit", "inherit", "pipe"], ...opts });
}

async function main() {
  try {
    console.log("🚀 Starting global reinstall process...");

    // Step 1: Uninstall globally installed manta-ide
    console.log("📦 Uninstalling globally installed manta-ide...");
    try {
      await runCapture("npm", ["uninstall", "-g", "manta-ide"]);
      console.log("✅ Successfully uninstalled global manta-ide");
    } catch (error) {
      const errorText = error.stderr || error.message || String(error);
      if (errorText.includes("ENOTEMPTY")) {
        console.log("⚠️  npm uninstall failed due to ENOTEMPTY, attempting manual cleanup...");
        try {
          // Get npm global prefix
          const { stdout: npmPrefix } = await execa("npm", ["config", "get", "prefix"]);
          const globalMantaPath = join(npmPrefix.trim(), "lib", "node_modules", "manta-ide");

          if (existsSync(globalMantaPath)) {
            await rm(globalMantaPath, { recursive: true, force: true });
            console.log("✅ Manually removed leftover manta-ide directory");
          } else {
            console.log("ℹ️  Global manta-ide directory not found");
          }
        } catch (cleanupError) {
          console.warn("⚠️  Failed to manually clean up:", cleanupError.message);
        }
      } else {
        console.log("ℹ️  Global manta-ide was not installed or already uninstalled");
      }
    }

    // Step 2: Build the project
    console.log("🔨 Building project...");
    await run("npm", ["run", "build"]);
    console.log("✅ Build completed successfully");

    // Step 3: Pack the project
    console.log("📦 Creating package...");
    const packResult = await run("npm", ["pack"]);
    console.log("✅ Package created successfully");

    // Step 4: Find the packed file
    const files = readdirSync(packageRoot);
    const packedFiles = files.filter(file => file.startsWith("manta-ide-") && file.endsWith(".tgz"));
    if (packedFiles.length === 0) {
      throw new Error("No packed file found");
    }
    // Choose the most recently modified tgz to avoid picking an old one
    const packedFile = packedFiles
      .map(name => ({ name, mtimeMs: statSync(join(packageRoot, name)).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].name;
    console.log(`📦 Found packed file: ${packedFile}`);

    // Step 5: Install the packed file globally
    console.log(`📦 Installing ${packedFile} globally...`);
    await run("npm", ["install", "-g", packedFile]);
    console.log("✅ Successfully installed globally");

    // Step 6: Clean up the packed file
    console.log("🧹 Cleaning up packed file...");
    // Use Node's fs to remove the packed file (cross-platform)
    await rm(packedFile, { force: true });
    console.log("✅ Cleanup completed");

    console.log("🎉 Global reinstall process completed successfully!");
    console.log("You can now use 'manta' command globally");

  } catch (error) {
    console.error("❌ Error during global reinstall:", error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
