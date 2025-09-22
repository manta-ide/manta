#!/usr/bin/env node
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

const packageRoot = join(process.cwd());

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} -> ${code}`))));
    child.on("error", reject);
  });
}

async function main() {
  try {
    console.log("🚀 Starting global reinstall process...");

    // Step 1: Uninstall globally installed manta-ide
    console.log("📦 Uninstalling globally installed manta-ide...");
    try {
      await run("npm", ["uninstall", "-g", "manta-ide"]);
      console.log("✅ Successfully uninstalled global manta-ide");
    } catch (error) {
      console.log("ℹ️  Global manta-ide was not installed or already uninstalled");
    }

    // Step 2: Build the project
    console.log("🔨 Building project...");
    await run("npm", ["run", "build"]);
    console.log("✅ Build completed successfully");

    // Step 3: Pack the project
    console.log("📦 Creating package...");
    const packResult = await run("npm", ["pack"]);
    console.log("✅ Package created successfully");

    // Step 4: Find the packed file (should be manta-ide-0.1.45.tgz)
    const packedFile = "manta-ide-0.1.45.tgz";
    if (!existsSync(packedFile)) {
      throw new Error(`Packed file ${packedFile} not found`);
    }

    // Step 5: Install the packed file globally
    console.log(`📦 Installing ${packedFile} globally...`);
    await run("npm", ["install", "-g", packedFile]);
    console.log("✅ Successfully installed globally");

    // Step 6: Clean up the packed file
    console.log("🧹 Cleaning up packed file...");
    await run("rm", [packedFile]);
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
