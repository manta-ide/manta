// src/lib/vars.ts
import 'server-only';
import { unstable_noStore as noStore } from 'next/cache';

type Vars = Record<string, string | number | boolean>;
declare const __GRAPH_VARS__: Vars | undefined;

let fsCache: Vars = {};
let fsMtime = 0;

function loadFromFS(): Vars {
  // Node runtime only
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  const fp = path.resolve(".graph/vars.json");
  try {
    const stat = fs.statSync(fp);
    if (stat.mtimeMs !== fsMtime) {
      fsMtime = stat.mtimeMs;
      fsCache = JSON.parse(fs.readFileSync(fp, "utf8"));
    }
  } catch { /* ignore */ }
  return fsCache;
}

export function allVars(): Vars {
  noStore();
  if (typeof __GRAPH_VARS__ !== "undefined" && process.env.NODE_ENV === "production") {
    return __GRAPH_VARS__;
  }
  return loadFromFS();
}

// ---- CSS helpers ----
const needsPx = /(?:^|\.)?(?:font-size|line-height|letter-spacing|radius|gap|padding|margin|width|height|top|right|bottom|left)$/i;

export function toCssVarName(key: string) {
  // "portfolio-page.background-color" -> "--portfolio-page-background-color"
  return `--${key.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()}`;
}

export function toCssValue(key: string, v: string | number | boolean) {
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return needsPx.test(key) ? `${v}px` : `${v}`;
  return `${v}`;
}

/** Build a style object: { "--foo": "…", "--bar": "…" } */
export function varsToCssStyle(vars: Vars = allVars()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[toCssVarName(k)] = toCssValue(k, v);
  }
  return out;
}

// ---- Your existing API (server-only) ----
export function getVar<T extends string | number | boolean>(key: string, fallback: T): T;
export function getVar(key: string): string | number | boolean | undefined;
export function getVar<T extends string | number | boolean>(key: string, fallback?: T) {
  const v = (allVars() as any)[key];
  return (v === undefined ? fallback : v) as T | undefined;
}
