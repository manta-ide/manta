// Server-only version: uses DefinePlugin vars in prod; reads file in dev without restart
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

function allVars(): Vars {
  if (typeof __GRAPH_VARS__ !== "undefined" && process.env.NODE_ENV === "production") return __GRAPH_VARS__;
  return loadFromFS();
}

// Overloads match client API
export function getVar<T extends string | number | boolean>(key: string, fallback: T): T;
export function getVar(key: string): string | number | boolean | undefined;
export function getVar<T extends string | number | boolean>(key: string, fallback?: T) {
  const v = (allVars() as any)[key];
  return (v === undefined ? fallback : v) as T | undefined;
}
