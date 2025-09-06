export type Vars = Record<string, any>;

let currentVars: Vars = {};
let parentBridgeEnabled = false;
let pollTimer: number | null = null;
let lastSerializedVars = JSON.stringify(currentVars);
const listeners = new Set<(vars: Vars) => void>();

function ensureGoogleFontLoaded(family: string | undefined) {
  if (!family) return;
  // Skip if a stack is provided (contains comma) — assume already available
  if (/,/.test(family)) return;
  const familyParam = encodeURIComponent(family).replace(/%20/g, "+");
  const weights = ['100','200','300','400','500','600','700','800','900'];
  const pairs = weights.map((w) => `0,${w}`).concat(weights.map((w) => `1,${w}`)).join(';');
  const axis = `ital,wght@${pairs}`;
  const href = `https://fonts.googleapis.com/css2?family=${familyParam}:${axis}&display=swap`;
  const id = "dynamic-google-font-link";
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function applyCssVarsFrom(vars: Vars) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  
  const set = (name: string, value: string | undefined) => {
    if (value === undefined || value === null || value === "") {
      root.style.removeProperty(name);
    } else {
      root.style.setProperty(name, value);
    }
  };

  // Recursively process variables and apply CSS custom properties
  const processValue = (key: string, value: any, prefix: string = '--') => {
    if (value === undefined || value === null) {
      return;
    }

    // Handle simple CSS values (strings, numbers, booleans)
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      set(`${prefix}${key}`, value.toString());
      return;
    }

    // Handle font objects specially - extract family and load Google font
    if (key.includes('font') && typeof value === 'object' && !Array.isArray(value) && value.family) {
      const family = value.family as string;
      set(`${prefix}font-family`, family);
      ensureGoogleFontLoaded(family);
      return;
    }

    // Handle nested objects - flatten them directly without parent key prefix
    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        processValue(nestedKey, nestedValue, prefix);
      });
      return;
    }

    // Skip arrays and other complex structures as they're not CSS values
  };

  // Process all top-level variables
  Object.entries(vars).forEach(([key, value]) => {
    processValue(key, value);
  });
}

async function fetchInitialVars(): Promise<Vars> {
  // Prefer local graph vars for initial load
  try {
    const res = await fetch(`/_graph/vars.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && typeof json === 'object') {
      return json as Vars;
    }
  } catch (e) {
    console.warn('Failed to load /_graph/vars.json, falling back to empty vars:', e);
  }
  return {};
}

// Debounced persist of vars.json via vite dev-server middleware
let persistTimer: any = null;
async function persistVarsJsonDebounced(nextVars: Vars, delay = 200) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      await fetch(`/__graph/vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextVars),
        cache: 'no-store',
      });
    } catch (e) {
      console.warn('Failed to persist vars.json:', e);
    }
  }, delay);
}

export function subscribeVars(onUpdate: (vars: Vars) => void) {
  listeners.add(onUpdate);
  // Emit initial vars (async fetch) only when no parent bridge yet.
  fetchInitialVars().then((vars) => {
    if (parentBridgeEnabled) return; // Parent will drive initial state
    currentVars = vars || {};
    lastSerializedVars = JSON.stringify(currentVars);
    applyCssVarsFrom(currentVars);
    // Notify all listeners
    for (const l of Array.from(listeners)) {
      try { l(currentVars); } catch {}
    }
  });

  // Fallback: lightweight polling of vars.json in dev to reflect changes
  // even if the message bridge isn't active.
  // @ts-ignore
  const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV;
  if (isDev) {
    const tick = async () => {
      if (parentBridgeEnabled) return; // Stop polling once parent bridge is active
      try {
        const res = await fetch('/_graph/vars.json', { cache: 'no-store' });
        if (res.ok) {
          const next = await res.json();
          const ser = JSON.stringify(next || {});
          if (ser !== lastSerializedVars) {
            lastSerializedVars = ser;
            currentVars = next || {};
            applyCssVarsFrom(currentVars);
            for (const l of Array.from(listeners)) {
              try { l(currentVars); } catch {}
            }
          }
        }
      } catch {}
      // schedule next only if not bridged
      if (!parentBridgeEnabled) {
        pollTimer = (setTimeout(tick, 300) as unknown) as number;
      }
    };
    pollTimer = (setTimeout(tick, 300) as unknown) as number;
  }
}

export function getInitialVars(): Vars {
  return currentVars;
}

// Receive runtime CSS var updates from parent (e.g., Next app) via postMessage
export function enableParentVarBridge() {
  if (typeof window === 'undefined') return;
  parentBridgeEnabled = true;
  if (pollTimer) {
    clearTimeout(pollTimer as any);
    pollTimer = null;
  }
  const handler = (ev: MessageEvent) => {
    const data: any = ev?.data || {};
    if (!data || (data.type !== 'manta:vars' && data.type !== 'manta:vars:update')) return;
    try { console.debug('[varsHmr] received vars update from parent:', data); } catch {}
    const updates = data.updates || {};
    if (updates && typeof updates === 'object') {
      // Merge then dedupe by comparing serialized payloads
      const nextVars = { ...currentVars, ...updates };
      const ser = JSON.stringify(nextVars);
      if (ser === lastSerializedVars) return; // ignore no-op updates
      currentVars = nextVars;
      lastSerializedVars = ser;
      applyCssVarsFrom(currentVars);
      try { console.debug('[varsHmr] applied vars, keys:', Object.keys(updates)); } catch {}
      // Persist to vars.json in background (debounced)
      persistVarsJsonDebounced(currentVars);
      // Notify subscribers so React state updates immediately
      for (const l of Array.from(listeners)) {
        try { l(currentVars); } catch {}
      }
    }
  };
  window.addEventListener('message', handler);
}
