'use client';

import { useEffect, useMemo } from 'react';
import { useProjectStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';

export default function GlobalLoaderOverlay() {
  const { graphLoading, supabaseConnected, iframeReady, resetting } = useProjectStore();
  const { user } = useAuth();
  const localMode = useMemo(() => {
    try {
      if (user?.id === 'local') return true;
      if (typeof window !== 'undefined') {
        const { hostname, port } = window.location;
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && (port === '' || port === '3000')) return true;
      }
      // Fallback to compile-time flag if present
      return typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
    } catch {
      return false;
    }
  }, [user?.id]);

  const show = useMemo(() => {
    // Always show when resetting
    if (resetting) return true;
    // Show while graph is loading
    if (graphLoading) return true;
    // In local mode, only wait for iframe to be ready
    if (localMode) {
      return !iframeReady;
    }
    // If user is authenticated
    if (user) {
      // In local mode (or local stub user), only wait for iframe
      if (localMode || user.id === 'local') return !iframeReady;
      // Hosted mode: require DB and iframe
      return !supabaseConnected || !iframeReady;
    }
    // If not authenticated, only wait for iframe (editor preview)
    return !iframeReady;
  }, [resetting, graphLoading, supabaseConnected, iframeReady, user, localMode]);

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
    : localMode || user?.id === 'local'
      ? (!iframeReady ? 'Starting preview…' : 'Loading project…')
      : user
        ? (!supabaseConnected ? 'Connecting to database…' : 'Starting development environment…')
        : 'Starting preview…';

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
