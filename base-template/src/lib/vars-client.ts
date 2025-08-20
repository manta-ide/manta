"use client";
import { useCallback, useEffect, useState } from "react";

type Vars = Record<string, string | number | boolean>;

// Prefer build-time injected vars if present (Webpack DefinePlugin or window shim)
declare const __GRAPH_VARS__: Vars | undefined;
const injected: Vars | undefined =
  (typeof __GRAPH_VARS__ !== "undefined" ? __GRAPH_VARS__ : (globalThis as any).__GRAPH_VARS__) as Vars | undefined;

let cache: Vars | null = injected ?? null;
let inflight: Promise<Vars> | null = null;

// NOTE: no leading slash so Next basePath (e.g. /iframe) still works
async function fetchVars(): Promise<Vars> {
  const res = await fetch("api/graph-vars", { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

async function ensureVars(): Promise<Vars> {
  if (cache) return cache;
  if (!inflight) inflight = fetchVars().then(v => (cache = v));
  return inflight;
}

/** Hook that returns exactly: getVar(key, fallback?) */
export function useGetVar() {
  const [vars, setVars] = useState<Vars>(cache ?? {});

  useEffect(() => {
    let mounted = true;
    ensureVars().then(v => { if (mounted) setVars({ ...v }); });
    return () => { mounted = false; };
  }, []);

  // Overloads for good typing (no String(...) needed)
  function getter<T extends string | number | boolean>(key: string, fallback: T): T;
  function getter(key: string): string | number | boolean | undefined;
  function getter<T extends string | number | boolean>(key: string, fallback?: T) {
    const v = (vars as any)[key];
    return (v === undefined ? fallback : v) as T | undefined;
  }

  return useCallback(getter, [vars]);
}
