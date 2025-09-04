import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type Vars = Record<string, any>;

let supabase: SupabaseClient | null = null;
let currentVars: Vars = {};

function getVarRaw(vars: Vars, key: string): string | undefined {
  const root = (vars["root-styles"] as Record<string, any>) || {};
  return (root[key] as string) ?? (vars[key] as string) ?? undefined;
}

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
  // Always apply if a var value is present; otherwise remove it
  set("--background-color", getVarRaw(vars, "background-color"));
  set("--text-color", getVarRaw(vars, "text-color"));
  set("--accent-color", getVarRaw(vars, "accent-color"));
  set("--muted-color", getVarRaw(vars, "muted-color"));
  set("--border-color", getVarRaw(vars, "border-color"));
  set("--font-family", getVarRaw(vars, "font-family"));
  set("--base-font-size", getVarRaw(vars, "base-font-size"));
  set("--max-content-width", getVarRaw(vars, "max-content-width"));
  set("--section-padding-y", getVarRaw(vars, "section-padding-y"));
  set("--section-padding-x", getVarRaw(vars, "section-padding-x"));
  set("--border-radius-global", getVarRaw(vars, "border-radius-global"));

  // Load font if a dedicated font property exists (no flags)
  const fontObj = (vars["root-font"] || vars["font"]) as any;
  if (fontObj && typeof fontObj === 'object') {
    const family = fontObj.family as string | undefined;
    // If a font property is present, it governs the CSS var
    if (family) root.style.setProperty('--font-family', family);
    ensureGoogleFontLoaded(family);
  }
}

function resolveEnv(name: string): string | undefined {
  // Vite exposes import.meta.env; fall back to process.env if available
  // @ts-ignore
  return (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env[name])
    // @ts-ignore
    || (typeof process !== "undefined" ? (process.env as any)[name] : undefined);
}

function getRoomId(): string {
  // Prefer explicit VITE_SANDBOX_ID if present; otherwise use VITE_USER_ID
  const sandboxId = resolveEnv("VITE_SANDBOX_ID");
  const userId = resolveEnv("VITE_USER_ID");
  return sandboxId || userId || "public";
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
  // Expect a helper endpoint within the sandbox that proxies to Next backend for current vars
  // If not provided, fall back to empty object; UI will use defaults
  try {
    const res = await fetch("/iframe/api/vars", { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      return (data?.vars as Vars) || {};
    }
  } catch {}
  return {};
}

export function subscribeVars(onUpdate: (vars: Vars) => void) {
  const client = getSupabase();
  const sandboxRoomId = getRoomId();
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
      }
    })
    // Also handle 'property_update' with { nodeId, propertyId, value }
    .on("broadcast", { event: "property_update" }, (payload) => {
      const data = (payload as any)?.payload || {};
      if (data?.propertyId !== undefined) {
        currentVars = { ...currentVars, [data.propertyId]: data.value };
        applyCssVarsFrom(currentVars);
        onUpdate(currentVars);
      }
    })
    // On graph reload, refetch the full vars snapshot
    .on("broadcast", { event: "graph_reload" }, async () => {
      const next = await fetchInitialVars();
      currentVars = { ...next };
      applyCssVarsFrom(currentVars);
      onUpdate(currentVars);
    })
    .subscribe();

  // Subscribe to sandbox room first
  subscribeRoom(`graph-broadcast-${sandboxRoomId}`);
  // If different, also subscribe to user room (client broadcasts may use user room)
  if (userRoomId && userRoomId !== sandboxRoomId) {
    subscribeRoom(`graph-broadcast-${userRoomId}`);
  }

  // Also optionally listen for Postgres changes to graph_properties if configured
  // Not strictly required if backend broadcasts updates.
}

export function getInitialVars(): Vars {
  return currentVars;
}
