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
  console.log('[varsHmr] Fetching initial vars from API...');
  try {
    // Try the new API endpoint first
    const apiRes = await fetch('/api/vars', { cache: 'no-store' });
    console.log('[varsHmr] API fetch response:', apiRes.status);

    if (apiRes.ok) {
      const vars = await apiRes.json();
      console.log('[varsHmr] Initial vars loaded from API:', Object.keys(vars));
      return vars;
    } else {
      console.warn('[varsHmr] API fetch failed, falling back to direct XML parsing');
    }
  } catch (e) {
    console.warn('[varsHmr] API fetch failed, falling back to direct XML parsing:', e);
  }

  // Fallback to direct XML parsing if API fails
  try {
    const res = await fetch(`http://localhost:3001/iframe/_graph/graph.xml`, { cache: 'no-store' });
    console.log('[varsHmr] Fallback fetch response:', res.status);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xmlText = await res.text();
    console.log('[varsHmr] Fallback XML fetched, length:', xmlText.length);

    // Simple XML parsing to extract variables
    const vars = extractVarsFromXml(xmlText);
    console.log('[varsHmr] Initial vars extracted from XML:', Object.keys(vars));

    if (vars && typeof vars === 'object') {
      return vars;
    }
  } catch (e) {
    console.warn('[varsHmr] Failed to load _graph/graph.xml, falling back to empty vars:', e);
  }
  return {};
}

// Simple XML parsing to extract variables from graph.xml
function extractVarsFromXml(xmlText: string): Vars {
  const vars: Vars = {};

  try {
    // Parse XML using DOMParser
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Check for parser errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('XML parsing error: ' + parserError.textContent);
    }

    // Extract all properties from all nodes
    const props = xmlDoc.querySelectorAll('prop');

    props.forEach(prop => {
      const propName = prop.getAttribute('name');
      const propType = prop.getAttribute('type');

      if (!propName) return;

      const key = propName.toLowerCase().replace(/\s+/g, '-');
      const value = parsePropValue(prop, propType);

      if (value !== undefined) {
        vars[key] = value;
      }
    });

  } catch (e) {
    console.warn('Failed to parse XML for variables:', e);
  }

  return vars;
}

function parsePropValue(prop: Element, type: string | null): any {
  // Handle simple properties with direct text content
  const textContent = prop.textContent?.trim();
  if (textContent && !prop.querySelector('field, value, item')) {
    return parseValue(textContent, type);
  }

  // Handle object properties with fields
  if (type === 'object') {
    const obj: any = {};
    const fields = prop.querySelectorAll('field');
    fields.forEach(field => {
      const fieldName = field.getAttribute('name');
      const fieldType = field.getAttribute('type');
      const fieldValue = parseFieldValue(field, fieldType);
      if (fieldName && fieldValue !== undefined) {
        obj[fieldName] = fieldValue;
      }
    });
    return obj;
  }

  // Handle object-list properties
  if (type === 'object-list') {
    const items = prop.querySelectorAll('item');
    return Array.from(items).map(item => {
      const itemObj: any = {};
      const fields = item.querySelectorAll('field');
      fields.forEach(field => {
        const fieldName = field.getAttribute('name');
        const fieldType = field.getAttribute('type');
        const fieldValue = parseFieldValue(field, fieldType);
        if (fieldName && fieldValue !== undefined) {
          itemObj[fieldName] = fieldValue;
        }
      });
      return itemObj;
    });
  }

  // Handle select fields within object properties
  const valueElement = prop.querySelector('value');
  if (valueElement) {
    return parseValue(valueElement.textContent?.trim() || '', type);
  }

  return undefined;
}

function parseFieldValue(field: Element, type: string | null): any {
  // Handle select fields
  if (type === 'select') {
    const valueElement = field.querySelector('value');
    if (valueElement) {
      return parseValue(valueElement.textContent?.trim() || '', type);
    }
  }

  // Handle simple field values
  const textContent = field.textContent?.trim();
  if (textContent) {
    return parseValue(textContent, type);
  }

  return undefined;
}

function parseValue(value: string, type: string | null): any {
  if (!value) return value;

  // Handle boolean values
  if (type === 'boolean') {
    return value.toLowerCase() === 'true';
  }

  // Handle number values
  if (type === 'number') {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }

  // Try to parse as JSON for complex values
  try {
    return JSON.parse(value);
  } catch {
    // Return as string if not JSON
    return value;
  }
}


export function subscribeVars(onUpdate: (vars: Vars) => void) {
  listeners.add(onUpdate);
  // Emit initial vars (async fetch) only when no parent bridge yet.
  fetchInitialVars().then((vars) => {
    const next = vars || {};
    const ser = JSON.stringify(next);
    if (ser === lastSerializedVars) return; // no change
    // Apply baseline vars from file even if parent bridge is enabled;
    // parent updates will overwrite if different.
    currentVars = next;
    lastSerializedVars = ser;
    applyCssVarsFrom(currentVars);
    for (const l of Array.from(listeners)) {
      try { l(currentVars); } catch {}
    }
  });

  // Fallback: lightweight polling of graph.xml in dev to reflect changes
  // even if the message bridge isn't active.
  // @ts-ignore
  const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.DEV;
  if (isDev) {
    console.log('[varsHmr] Starting polling mechanism for graph.xml updates');
    const tick = async () => {
      if (parentBridgeEnabled) {
        console.log('[varsHmr] Stopping polling - parent bridge is active');
        return; // Stop polling once parent bridge is active
      }

      try {
        console.log('[varsHmr] Polling for variable updates...');

        // Try API endpoint first
        let next: Vars = {};
        let fetchedFromApi = false;

        try {
          const apiRes = await fetch('/api/vars', { cache: 'no-store' });
          if (apiRes.ok) {
            next = await apiRes.json();
            fetchedFromApi = true;
            console.log('[varsHmr] Fetched vars from API');
          }
        } catch (apiError) {
          console.warn('[varsHmr] API fetch failed, trying fallback XML:', apiError);
        }

        // Fallback to direct XML if API fails
        if (!fetchedFromApi) {
          const res = await fetch('http://localhost:3001/iframe/_graph/graph.xml', { cache: 'no-store' });
          if (res.ok) {
            const xmlText = await res.text();
            console.log('[varsHmr] Fallback XML fetched, length:', xmlText.length);
            next = extractVarsFromXml(xmlText);
          } else {
            console.warn('[varsHmr] Failed to fetch graph.xml:', res.status);
            return; // Skip this polling cycle
          }
        }

        const ser = JSON.stringify(next || {});

        if (ser !== lastSerializedVars) {
          console.log('[varsHmr] Variables changed, updating...');
          lastSerializedVars = ser;
          currentVars = next || {};
          applyCssVarsFrom(currentVars);

          console.log('[varsHmr] Notifying subscribers from polling');
          for (const l of Array.from(listeners)) {
            try { l(currentVars); } catch {}
          }
        } else {
          console.log('[varsHmr] No changes in variables');
        }
      } catch (error) {
        console.warn('[varsHmr] Error polling for updates:', error);
      }

      // schedule next only if not bridged
      if (!parentBridgeEnabled) {
        pollTimer = (setTimeout(tick, 1000) as unknown) as number; // Increased to 1s to reduce noise
      }
    };
    pollTimer = (setTimeout(tick, 1000) as unknown) as number;
  }
}

export function getInitialVars(): Vars {
  return currentVars;
}

// Function to publish variable updates from child to parent/server
export async function publishVarsUpdate(updates: Vars): Promise<void> {
  try {
    const res = await fetch('/api/vars', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    console.log('[varsHmr] Successfully published variable updates to server');
  } catch (error) {
    console.warn('[varsHmr] Failed to publish variable updates:', error);
    // Fallback to parent bridge if available
    if (typeof window !== 'undefined' && window.parent !== window) {
      try {
        window.parent.postMessage({
          type: 'manta:vars:update',
          updates: updates
        }, '*');
        console.log('[varsHmr] Published updates via parent bridge fallback');
      } catch (bridgeError) {
        console.error('[varsHmr] Parent bridge fallback also failed:', bridgeError);
      }
    }
  }
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
    console.log('[varsHmr] Received message:', data.type, data);

    if (!data || (data.type !== 'manta:vars' && data.type !== 'manta:vars:update')) {
      console.log('[varsHmr] Ignoring message - wrong type:', data.type);
      return;
    }

    console.log('[varsHmr] Processing vars update from parent:', data);
    const updates = data.updates || {};

    if (updates && typeof updates === 'object') {
      console.log('[varsHmr] Merging updates:', Object.keys(updates));

      // Merge then dedupe by comparing serialized payloads
      const nextVars = { ...currentVars, ...updates };
      const ser = JSON.stringify(nextVars);

      if (ser === lastSerializedVars) {
        console.log('[varsHmr] No changes detected, skipping update');
        return; // ignore no-op updates
      }

      currentVars = nextVars;
      lastSerializedVars = ser;

      console.log('[varsHmr] Applying CSS variables and notifying subscribers');
      applyCssVarsFrom(currentVars);

      // Publish updates back to server if this came from a child app
      if (data.source === 'child') {
        publishVarsUpdate(updates).catch(error => {
          console.warn('[varsHmr] Failed to publish child updates to server:', error);
        });
      }

      // Notify subscribers so React state updates immediately
      for (const l of Array.from(listeners)) {
        try {
          console.log('[varsHmr] Notifying subscriber');
          l(currentVars);
        } catch (error) {
          console.error('[varsHmr] Error notifying subscriber:', error);
        }
      }

      console.log('[varsHmr] Update complete');
    } else {
      console.warn('[varsHmr] Invalid updates format:', updates);
    }
  };
  window.addEventListener('message', handler);
}
