// src/lib/vars.ts
// (TS ambient type is optional if you already declared it elsewhere)
declare const __GRAPH_VARS__: Record<string, string | number | boolean> | undefined;

type Vars = Record<string, string | number | boolean>;

let fsCache: Vars = {};
let fsMtime = 0;

/** Server-only loader that re-reads .graph/vars.json when it changes. */
function loadVarsFromFS(): Vars {
  // Don't attempt FS on the client or Edge runtime
  if (typeof window !== "undefined") return {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path");
    const fp = path.resolve(".graph/vars.json");
    const stat = fs.statSync(fp);
    if (stat.mtimeMs !== fsMtime) {
      fsMtime = stat.mtimeMs;
      fsCache = JSON.parse(fs.readFileSync(fp, "utf8"));
    }
    return fsCache;
  } catch {
    return fsCache;
  }
}

/** Unified vars getter:
 *  - Prod: use injected DefinePlugin object
 *  - Dev server: live-reload from FS
 *  - Client: try injected (DefinePlugin) or window.__GRAPH_VARS__ if you set it
 */
function getAllVars(): Vars {
  // Prefer compile-time injected vars when available (esp. in prod)
  if (typeof __GRAPH_VARS__ !== "undefined" && process.env.NODE_ENV === "production") {
    return __GRAPH_VARS__ as Vars;
  }

  // On the server in dev, read from the file (hot without restart)
  if (typeof window === "undefined") {
    return loadVarsFromFS();
  }

  // On the client, we can only use injected globals (optional)
  return ((globalThis as any).__GRAPH_VARS__ ??
    (typeof __GRAPH_VARS__ !== "undefined" ? (__GRAPH_VARS__ as Vars) : {})) as Vars;
}

export function getVar<T = string | number | boolean>(key: string, fallback?: T): T {
  const vars = getAllVars();
  const v = vars[key];
  return (v === undefined ? fallback : v) as T;
}

export function resolvePlaceholders(s: string) {
  const vars = getAllVars();
  return s.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}
