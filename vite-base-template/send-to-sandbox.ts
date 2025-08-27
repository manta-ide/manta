import fs from "fs";
import path from "path";
import { SandboxInstance } from "@blaxel/core";

const sandbox = await SandboxInstance.get("vite-test1");

function collect(dir: string, base = dir) {
  const out: { path: string; content: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    // Skip excluded directories and files
    if (name === '.env' || name === 'node_modules' || name === 'dist' || name === 'send-to-sandbox.ts') {
      continue;
    }
    
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...collect(full, base));
    else {
      const relativePath = path.relative(base, full);
      // Convert Windows backslashes to forward slashes for sandbox
      const normalizedPath = relativePath.replace(/\\/g, '/');
      out.push({ path: normalizedPath, content: fs.readFileSync(full, "utf8") });
    }
  }
  return out;
}

// Kill any running processes first
console.log("🛑 Killing running processes...");
await sandbox.process.exec({
  name: "kill-processes",
  command: "killall node || true && killall vite || true"
});
await sandbox.process.wait("kill-processes", {
  maxWait: 10000, // 10 seconds
  interval: 1000
});

// Clean the directory first
console.log("🧹 Cleaning directory...");
await sandbox.process.exec({
  name: "clean",
  command: "cd /blaxel/app && find . -mindepth 1 -exec rm -r -- {} +"
});
await sandbox.process.wait("clean", {
  maxWait: 60000, // 1 minute
  interval: 2000
});

const files = [
  // keep src/ and public/ structure
  ...collect("./src", ".").map(f => ({ ...f, path: f.path })),
 // ...collect("./public", ".").map(f => ({ ...f, path: f.path })),
  ...collect("./_graph", ".").map(f => ({ ...f, path: f.path })),
  // collect root files (like index.html, package.json, etc.)
  ...collect(".", ".").map(f => ({ ...f, path: f.path })),
];

await sandbox.fs.writeTree(files, "/blaxel/app");

console.log("✅ Synced to sandbox");

// Install dependencies
console.log("📦 Installing dependencies...");
await sandbox.process.exec({
  name: "install",
  command: "cd /blaxel/app && npm i"
});
await sandbox.process.wait("install", {
  maxWait: 300000, // 5 minutes
  interval: 5000
});

// Build the project
console.log("🔨 Building project...");
await sandbox.process.exec({
  name: "build",
  command: "cd /blaxel/app && npm run build"
});
await sandbox.process.wait("build", {
  maxWait: 300000, // 5 minutes
  interval: 5000
});

// Start dev server
console.log("🚀 Starting dev server...");
await sandbox.process.exec({
  name: "dev-server",
  command: "cd /blaxel/app && npm run dev",
  waitForPorts: [5173] // Vite default port
});

console.log("✅ All commands completed successfully!");
