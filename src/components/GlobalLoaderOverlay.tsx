'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/lib/store';

export default function GlobalLoaderOverlay() {
  const { graphLoading, supabaseConnected, iframeReady, resetting } = useProjectStore();
  const [mounted, setMounted] = useState(false);

  // Mark as mounted after hydration to prevent hydration mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  const localMode = useMemo(() => {
    if (!mounted) return false; // Default to false during SSR/hydration

    try {
      if (typeof window !== 'undefined') {
        const { hostname, port } = window.location;
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && (port === '' || port === '3000')) return true;
      }
      // Fallback to compile-time flag if present
      return typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
    } catch {
      return false;
    }
  }, [mounted]);

  const show = useMemo(() => {
    // Always show when resetting
    if (resetting) return true;
    // Show while graph is loading
    if (graphLoading) return true;
    // In local mode, only wait for iframe to be ready
    if (localMode) {
      return !iframeReady;
    }
    // Hosted mode: require DB and iframe
    return !supabaseConnected || !iframeReady;
  }, [resetting, graphLoading, supabaseConnected, iframeReady, localMode]);

  // Prevent body scroll when overlay visible
  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [show]);

  if (!show) return null;

  const message = resetting
    ? 'Resetting project…'
    : !mounted
      ? 'Loading…' // Generic message during hydration
      : localMode
        ? (!iframeReady ? 'Starting preview…' : 'Loading project…')
        : (!supabaseConnected ? 'Connecting to database…' : 'Starting development environment…');

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-900/90 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 text-zinc-200">
        <div className="w-10 h-10 rounded-full border-2 border-zinc-600 border-t-white animate-spin" />
        <div className="text-sm font-medium">{message}</div>
      </div>
    </div>
  );
}
