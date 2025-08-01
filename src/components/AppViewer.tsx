// AppViewer.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SelectionOverlay, { useSelectionHandlers } from './SelectionOverlay';
import { LoaderFive } from '@/components/ui/loader';

interface AppViewerProps {
  isEditMode: boolean;
}

const IFRAME_PATH = '/iframe';

export default function AppViewer({ isEditMode }: AppViewerProps) {
  /* ── state & refs ───────────────────────────────────────────── */
  const [isAppRunning, setIsAppRunning] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  /* host element (inside iframe) that will receive the portal */
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  /* element that actually captures pointer events for selection */
  const overlayRef = useRef<HTMLDivElement>(null);

  /* selection logic works against the overlayRef (inside iframe) */
  const {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick,
    isSelecting,
  } = useSelectionHandlers(isEditMode, overlayRef);

  /* ── create / reuse host <div> inside the iframe once it loads ── */
  const handleIframeLoad = useCallback(() => {
    const doc =
      iframeRef.current?.contentDocument ??
      iframeRef.current?.contentWindow?.document;
    if (!doc) return;

    // Cleanup previous host if it exists
    const existingHost = doc.getElementById('selection-overlay-root') as any;
    if (existingHost?.__cleanup) {
      existingHost.__cleanup();
    }

    let host = doc.getElementById('selection-overlay-root') as HTMLElement | null;
    if (!host) {
      host = doc.createElement('div');
      host.id = 'selection-overlay-root';
      doc.body.appendChild(host);
    }

    Object.assign(host.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      minHeight: '100vh', // ensure it covers at least the viewport
      zIndex: '9999',
      pointerEvents: 'none', // visual only – overlayRef toggles its own PE
    });

    // Update overlay host size when document content changes
    const updateHostSize = () => {
      if (host) {
        const docHeight = Math.max(
          doc.documentElement.scrollHeight,
          doc.documentElement.offsetHeight,
          doc.body.scrollHeight,
          doc.body.offsetHeight
        );
        host.style.height = `${docHeight}px`;
      }
    };

    // Initial size update
    updateHostSize();

    // Monitor for content changes that might affect document height
    const observer = new MutationObserver(updateHostSize);
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Also update on window resize
    const win = doc.defaultView;
    if (win) {
      win.addEventListener('resize', updateHostSize);
    }

    // Store cleanup function
    (host as any).__cleanup = () => {
      observer.disconnect();
      if (win) {
        win.removeEventListener('resize', updateHostSize);
      }
    };

    setOverlayHost(host);
  }, []);

  /* ── cleanup overlay host on unmount ───────────────────────── */
  useEffect(() => {
    return () => {
      // Cleanup overlay host when component unmounts
      const doc =
        iframeRef.current?.contentDocument ??
        iframeRef.current?.contentWindow?.document;
      if (doc) {
        const existingHost = doc.getElementById('selection-overlay-root') as any;
        if (existingHost?.__cleanup) {
          existingHost.__cleanup();
        }
      }
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
          key={iframeKey}
          src={IFRAME_PATH}
          className="w-full h-full border-0"
          title="Demo App"
          onLoad={handleIframeLoad}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />

        {/* All overlay UI is portalled INTO the iframe’s document */}
        {overlayHost &&
          createPortal(
            <div
              ref={overlayRef}
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: isEditMode ? 'auto' : 'none',
                cursor: isEditMode && isSelecting ? 'crosshair' : 'default',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleClick}
            >
              <SelectionOverlay isEditMode={isEditMode} />
            </div>,
            overlayHost,
          )}
      </div>
    </div>
  );
}
