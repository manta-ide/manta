// sync-sandbox.mjs
import fs from "fs";
import path from "path";
import { SandboxInstance } from "@blaxel/core";

function collect(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...collect(full, base));
    } else {
      out.push({ path: path.relative(base, full), content: fs.readFileSync(full, "utf8") });
    }
  }
  return out;
}

const sandboxName = process.argv[2] ?? "vite-test1";    // allow overriding from CLI
const destRoot = "/blaxel/app";                         // change if you want another target root

const sandbox = await SandboxInstance.get(sandboxName);

const files = [
  // folders
  ...collect("./src").map(f => ({ ...f, path: path.join("src", f.path) })),
  ...collect("./_graph").map(f => ({ ...f, path: path.join("_graph", f.path) })),
  // root config files (only if present)
  ..."package.json package-lock.json tsconfig.json vite.config.ts postcss.config.mjs eslint.config.mjs tsconfig.node.json"
    .split(" ")
    .flatMap(p => (fs.existsSync(p) ? [{ path: p, content: fs.readFileSync(p, "utf8") }] : [])),
];

await sandbox.fs.writeTree(files, destRoot);
console.log(`✅ Synced ${files.length} files to ${sandboxName} at ${destRoot}`);
