import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type Vars = Record<string, any>;

let supabase: SupabaseClient | null = null;
let currentVars: Vars = {};


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

function resolveEnv(name: string): string | undefined {
  // Vite exposes import.meta.env; fall back to process.env if available
  // @ts-ignore
  return (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env[name])
    // @ts-ignore
    || (typeof process !== "undefined" ? (process.env as any)[name] : undefined);
}

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  const url = resolveEnv("VITE_SUPABASE_URL");
  const anon = resolveEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  supabase = createClient(url, anon);
  return supabase;
}

async function fetchInitialVars(): Promise<Vars> {
  // Prefer local graph vars for initial load
  try {
    const base = (typeof window !== 'undefined' && (window.location.pathname === '/iframe' || window.location.pathname.startsWith('/iframe/')))
      ? '/iframe'
      : '';
    const res = await fetch(`${base}/_graph/vars.json`, { cache: 'no-store' });
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
      const base = (typeof window !== 'undefined' && (window.location.pathname === '/iframe' || window.location.pathname.startsWith('/iframe/')))
        ? '/iframe'
        : '';
      await fetch(`${base}/__graph/vars`, {
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
  const client = getSupabase();
  const userRoomId = resolveEnv("VITE_USER_ID");

  // Emit initial vars (async fetch), then listen to broadcasts for updates
  fetchInitialVars().then((vars) => {
    currentVars = vars || {};
    applyCssVarsFrom(currentVars);
    onUpdate(currentVars);
  });

  if (!client) return;

  const subscribeRoom = (room: string) => client
    .channel(room, { config: { broadcast: { self: true, ack: false } } })
    // Next app broadcasts 'property' with { nodeId, property: { id, value } }
    .on("broadcast", { event: "property" }, (payload) => {
      const data = (payload as any)?.payload || {};
      const prop = data.property || {};
      if (prop?.id !== undefined) {
        currentVars = { ...currentVars, [prop.id]: prop.value };
        applyCssVarsFrom(currentVars);
        onUpdate(currentVars);
        // Persist to local vars.json asynchronously
        persistVarsJsonDebounced(currentVars);
      }
    })
    // Also handle 'property_update' with { nodeId, propertyId, value }
    .on("broadcast", { event: "property_update" }, (payload) => {
      const data = (payload as any)?.payload || {};
      if (data?.propertyId !== undefined) {
        currentVars = { ...currentVars, [data.propertyId]: data.value };
        applyCssVarsFrom(currentVars);
        onUpdate(currentVars);
         // Persist to local vars.json asynchronously
         persistVarsJsonDebounced(currentVars);
      }
    })
    // On graph reload, refetch the full vars snapshot
    .on("broadcast", { event: "graph_reload" }, async () => {
      console.log("broadcast 'graph_reload' received, refetching vars");
      const next = await fetchInitialVars();
      currentVars = { ...next };
      console.log("currentVars broadcast", JSON.stringify(currentVars));
      applyCssVarsFrom(currentVars);
      onUpdate(currentVars);
    })
    .subscribe();

  // Subscribe to sandbox room first
  subscribeRoom(`graph-broadcast-${userRoomId}`);
  // If different, also subscribe to user room (client broadcasts may use user room)
  if (userRoomId && userRoomId !== userRoomId) {
    subscribeRoom(`graph-broadcast-${userRoomId}`);
  }

  // Also optionally listen for Postgres changes to graph_properties if configured
  // Not strictly required if backend broadcasts updates.
}

export function getInitialVars(): Vars {
  return currentVars;
}
