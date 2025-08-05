// AppViewer.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IframeOverlay from './IframeOverlay';
import { LoaderFive } from '@/components/ui/loader';
import { useProjectStore } from '@/lib/store';

interface AppViewerProps {
  isEditMode: boolean;
}

const IFRAME_PATH = '/iframe';

export default function AppViewer({ isEditMode }: AppViewerProps) {
  /* ── state & refs ───────────────────────────────────────────── */
  const [isAppRunning, setIsAppRunning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { refreshTrigger } = useProjectStore();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scrollPositionRef = useRef<{ x: number; y: number } | null>(null);

  /* host element (inside iframe) that will receive the portal */
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  /* ── create / reuse host <div> inside the iframe once it loads ── */
  const handleIframeLoad = useCallback(() => {
    // inside handleIframeLoad
const doc =
iframeRef.current?.contentDocument ??
iframeRef.current?.contentWindow?.document;
if (!doc) return;

// remove previous host if any
doc.getElementById('selection-overlay-root')?.remove();

// pick a container that scrolls with content
const appRoot =
(doc.getElementById('app-root') as HTMLElement) || doc.body;

// ensure positioned ancestor for absolute children
if (getComputedStyle(appRoot).position === 'static') {
appRoot.style.position = 'relative';
}

// (re)-create host that scrolls with content
const host = doc.createElement('div');
host.id = 'selection-overlay-root';
Object.assign(host.style, {
position: 'absolute',  // <- NOT fixed
inset: '0',
zIndex: '9999',
// Let the child overlay layer decide whether to capture events.
pointerEvents: 'auto',
});
appRoot.appendChild(host);

setOverlayHost(host);

  }, []);

  /* ── cleanup overlay host on unmount ───────────────────────── */
  useEffect(() => {
    return () => {
      const host =
        iframeRef.current
          ?.contentDocument?.getElementById('selection-overlay-root');
      host?.remove();
    };
  }, []);

  /* ── liveness probe for the child app ───────────────────────── */
  useEffect(() => {
    const probe = async () => {
      try {
        await fetch(IFRAME_PATH, { method: 'HEAD' });
        setIsAppRunning(true);
      } catch {
        setIsAppRunning(false);
      }
    };
    probe();
    const id = setInterval(probe, 3_000);
    return () => clearInterval(id);
  }, []);

  /* ── refresh iframe when file operations complete ───────────── */
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIsRefreshing(true);

      /* remember where the user was */
      const win = iframeRef.current?.contentWindow;
      if (win) {
        scrollPositionRef.current = { x: win.scrollX, y: win.scrollY };
      }

      /* cache-bust */
      const iframe = iframeRef.current;
      if (iframe) {
        const base = iframe.src.split('?')[0];
        iframe.src = `${base}?refresh=${refreshTrigger}`;
      }
    }
  }, [refreshTrigger]);

  /* ── early fallback while the child isn’t running ───────────── */
  if (!isAppRunning) {
    return (
      <div className="flex flex-col h-full bg-background border-l">
        <div className="flex-1 flex items-center justify-center">
          <LoaderFive text="Waiting for app on :3001…" />
        </div>
      </div>
    );
  }

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full bg-background border-l">
      <div className="flex-1 relative min-h-0">
        <iframe
          ref={iframeRef}
          src={IFRAME_PATH}
          className="w-full h-full border-0"
          title="Demo App"
          onLoad={handleIframeLoad}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />

        {/* All overlay UI is portalled INTO the iframe’s document */}
        {overlayHost &&
          createPortal(
            <IframeOverlay isEditMode={isEditMode} />,
            overlayHost,
          )}
      </div>
    </div>
  );
}
