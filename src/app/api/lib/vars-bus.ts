import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

type Listener = (updates: Record<string, any>) => void;

const listeners = new Set<Listener>();

export function subscribeVars(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishVarsUpdate(updates: Record<string, any>) {
  for (const l of Array.from(listeners)) {
    try { l(updates); } catch {}
  }
}

export function loadVarsSnapshot(projectDir?: string): Record<string, any> {
  try {
    const base = projectDir || process.env.MANTA_PROJECT_DIR || process.cwd();
    const varsPath = path.join(base, '_graph', 'vars.json');
    if (!existsSync(varsPath)) return {};
    return JSON.parse(readFileSync(varsPath, 'utf8')) || {};
  } catch { return {}; }
}

