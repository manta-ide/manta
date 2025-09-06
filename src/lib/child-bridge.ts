export function postVarsUpdate(updates: Record<string, any>) {
  try {
    if (typeof window === 'undefined') return;
    const child: Window | null = (window as any).__mantaChildWindow || null;
    const origin: string = (window as any).__mantaChildOrigin || '*';
    if (child && typeof child.postMessage === 'function') {
      child.postMessage({ type: 'manta:vars', updates }, origin || '*');
    }
  } catch {}
}

