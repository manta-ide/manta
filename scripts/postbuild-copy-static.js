#!/usr/bin/env node
import { mkdirSync, cpSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const root = process.cwd();
const src = join(root, ".next", "static");
const dst = join(root, ".next", "standalone", ".next", "static");

if (!existsSync(src)) {
  console.warn("[manta] .next/static not found — did the build run?");
  process.exit(0);
}

mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });

const css = join(dst, "css");
const chunks = join(dst, "chunks");
console.log(
  "[manta] mirrored static into standalone:",
  existsSync(css) ? `${readdirSync(css).length} css` : "no css",
  "|",
  existsSync(chunks) ? `${readdirSync(chunks).length} chunks` : "no chunks"
);

// Copy public assets to standalone build
const publicSrc = join(root, "public");
const publicDst = join(root, ".next", "standalone", "public");

if (existsSync(publicSrc)) {
  mkdirSync(publicDst, { recursive: true });
  cpSync(publicSrc, publicDst, { recursive: true });
  console.log("[manta] copied public assets to standalone");
} else {
  console.warn("[manta] public directory not found");
}