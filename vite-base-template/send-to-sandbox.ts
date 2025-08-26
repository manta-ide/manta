import fs from "fs";
import path from "path";
import { SandboxInstance } from "@blaxel/core";

const sandbox = await SandboxInstance.get("vite-test1");

function collect(dir: string, base = dir) {
  const out: { path: string; content: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...collect(full, base));
    else out.push({ path: path.relative(base, full), content: fs.readFileSync(full, "utf8") });
  }
  return out;
}

const files = [
  // keep src/ and public/ structure
  ...collect("./src").map(f => ({ ...f, path: path.join("src", f.path) })),
 // ...collect("./public").map(f => ({ ...f, path: path.join("public", f.path) })),
  ...collect("./_graph").map(f => ({ ...f, path: path.join("_graph", f.path) })),

  // add root config files
  { path: "package.json", content: fs.readFileSync("package.json", "utf8") },
  { path: "package-lock.json", content: fs.readFileSync("package-lock.json", "utf8") }, // if exists
  { path: "tsconfig.json", content: fs.readFileSync("tsconfig.json", "utf8") }, // if exists
  { path: "vite.config.ts", content: fs.readFileSync("vite.config.ts", "utf8") }, // if exists
  { path: "postcss.config.mjs", content: fs.readFileSync("postcss.config.mjs", "utf8") }, // if exists
  { path: "eslint.config.mjs", content: fs.readFileSync("eslint.config.mjs", "utf8") }, // if exists
  { path: "tsconfig.node.json", content: fs.readFileSync("tsconfig.node.json", "utf8") }, // if exists
];

await sandbox.fs.writeTree(files, "/blaxel/app");

console.log("✅ Synced to sandbox");
