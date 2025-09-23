import { useEffect, useState } from 'react';

export type Vars = Record<string, any>;

function ensureGoogleFontLoaded(family: string | undefined) {
  if (!family) return;
  if (/,/.test(family)) return;
  const familyParam = encodeURIComponent(family).replace(/%20/g, '+');
  const weights = ['100','200','300','400','500','600','700','800','900'];
  const pairs = weights.map((w) => `0,${w}`).concat(weights.map((w) => `1,${w}`)).join(';');
  const axis = `ital,wght@${pairs}`;
  const href = `https://fonts.googleapis.com/css2?family=${familyParam}:${axis}&display=swap`;
  const id = 'dynamic-google-font-link';
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function sanitizeCssVarName(key: string) {
  return key.replace(/\./g, '-');
}

function applyCssVarsFrom(vars: Vars) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const set = (name: string, value: string | undefined) => {
    if (value === undefined || value === null || value === '') {
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

async function loadVars(): Promise<Vars> {
  try {
    const res = await fetch('/api/public/vars', { cache: 'no-store' });
    if (res.ok) return (await res.json()) as Vars;
  } catch (e) {
    console.warn('[vars] Failed to load vars.json:', e);
  }
  return {};
}

export function useVars(): [Vars, (updates: Vars) => void] {
  const [vars, setVars] = useState<Vars>({});

  useEffect(() => {
    loadVars().then((v) => {
      setVars(v);
      applyCssVarsFrom(v);
    });
  }, []);

  const updateVars = (updates: Vars) => {
    const next = { ...vars, ...updates };
    setVars(next);
    applyCssVarsFrom(next);
    // Intentionally no server write; vars.json is written by the IDE
  };

  return [vars, updateVars];
}
