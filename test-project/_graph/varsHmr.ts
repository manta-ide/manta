import { useEffect, useState } from 'react';

export type Vars = Record<string, any>;

// Internal state management
let currentVars: Vars = {};
let parentBridgeEnabled = false;
let pollTimer: number | null = null;
let lastSerializedVars = JSON.stringify(currentVars);
const listeners = new Set<(vars: Vars) => void>();

// Helper functions
function ensureGoogleFontLoaded(family: string | undefined) {
  if (!family) return;
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

function sanitizeCssVarName(key: string) {
  return key.replace(/\./g, "-");
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

  const processValue = (key: string, value: any, prefix: string = '--') => {
    if (value === undefined || value === null) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const rawName = `${prefix}${key}`;
      const aliasName = `${prefix}${sanitizeCssVarName(key)}`;
      set(rawName, value.toString());
      if (aliasName !== rawName) set(aliasName, value.toString());
      return;
    }

    if (key.includes('font') && typeof value === 'object' && !Array.isArray(value) && (value as any).family) {
      const family = value.family as string;
      const rawName = `${prefix}font-family`;
      const aliasName = `${prefix}${sanitizeCssVarName('font-family')}`;
      set(rawName, family);
      if (aliasName !== rawName) set(aliasName, family);
      ensureGoogleFontLoaded(family);
      return;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        processValue(nestedKey, nestedValue, prefix);
      });
      return;
    }
  };

  Object.entries(vars).forEach(([key, value]) => {
    processValue(key, value);
  });
}

async function fetchInitialVars(): Promise<Vars> {
  try {
    const res = await fetch('/iframe/_graph/vars.json', { cache: 'no-store' });
    if (res.ok) {
      const vars = await res.json();
      return vars;
    }
  } catch (e) {
    console.warn('[varsHmr] Failed to fetch vars.json:', e);
  }
  return {};
}

export async function publishVarsUpdate(updates: Vars): Promise<void> {
  try {
    const res = await fetch('/api/vars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'manta:vars:update', updates }, '*');
      } catch (bridgeError) {
        console.error('[varsHmr] Parent bridge fallback also failed:', bridgeError);
      }
    }
  }
}

function enableParentVarBridge() {
  if (typeof window === 'undefined') return;
  parentBridgeEnabled = true;
  if (pollTimer) clearTimeout(pollTimer as any);

  const signalReady = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'manta:child:ready', source: 'child' }, '*');
    }
  };

  signalReady();
  const readyInterval = setInterval(signalReady, 1000);

  const handler = (ev: MessageEvent) => {
    const data: any = ev?.data || {};
    if (!data) return;

    if (data.type === 'manta:parent:ready') {
      clearInterval(readyInterval);
      return;
    }

    if (data.type !== 'manta:vars' && data.type !== 'manta:vars:update') return;

    const updates = data.updates || {};
    if (updates && typeof updates === 'object') {
      const nextVars = { ...currentVars, ...updates };
      const ser = JSON.stringify(nextVars);

      if (ser === lastSerializedVars) return;

      currentVars = nextVars;
      lastSerializedVars = ser;
      applyCssVarsFrom(currentVars);

      if (data.source === 'child') {
        publishVarsUpdate(updates).catch(console.warn);
      }

      for (const l of Array.from(listeners)) {
        try { l(currentVars); } catch {}
      }
    }
  };
  window.addEventListener('message', handler);
}

function startPolling() {
  // @ts-ignore
  const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
  if (!isDev) return;

  const tick = async () => {
    if (parentBridgeEnabled) return;

    try {
      const res = await fetch('/iframe/_graph/vars.json', { cache: 'no-store' });
      if (!res.ok) return;

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
    } catch (error) {
      console.warn('[varsHmr] Error polling for updates:', error);
    }

    if (!parentBridgeEnabled) {
      pollTimer = (setTimeout(tick, 1000) as unknown) as number;
    }
  };
  pollTimer = (setTimeout(tick, 1000) as unknown) as number;
}

// Main hook - this is what users will use
export function useVars(): [Vars, (updates: Vars) => void] {
  const [vars, setVars] = useState(currentVars);

  useEffect(() => {
    // Initialize once
    if (listeners.size === 0) {
      enableParentVarBridge();
      fetchInitialVars().then((initialVars) => {
        const next = initialVars || {};
        const ser = JSON.stringify(next);
        if (ser !== lastSerializedVars) {
          currentVars = next;
          lastSerializedVars = ser;
          applyCssVarsFrom(currentVars);
          for (const l of Array.from(listeners)) {
            try { l(currentVars); } catch {}
          }
        }
      });
      startPolling();
    }

    // Add listener
    const listener = (newVars: Vars) => setVars(newVars);
    listeners.add(listener);

    // Cleanup
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const updateVars = (updates: Vars) => {
    const nextVars = { ...currentVars, ...updates };
    const ser = JSON.stringify(nextVars);

    if (ser === lastSerializedVars) return;

    currentVars = nextVars;
    lastSerializedVars = ser;
    applyCssVarsFrom(currentVars);

    publishVarsUpdate(updates).catch(console.warn);

    for (const l of Array.from(listeners)) {
      try { l(currentVars); } catch {}
    }
  };

  return [vars, updateVars];
}
