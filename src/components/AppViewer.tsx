// AppViewer.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IframeOverlay from './IframeOverlay';
import { LoaderFive } from '@/components/ui/loader';
import { setLastError } from '@/lib/runtimeErrorStore';
import { useProjectStore } from '@/lib/store';

interface AppViewerProps {
  isEditMode: boolean;
}
  
/** Isolates runtime errors thrown by the preview iframe. */
class PreviewBoundary extends React.Component<{ children: React.ReactNode, iframeRef: React.RefObject<HTMLIFrameElement | null> }> {
  state = { hasError: false };
  componentDidMount() {
    this.props.iframeRef.current?.contentWindow?.addEventListener('error', function(event) {
      setLastError(
        event.error instanceof Error ? event.error.message : String(event.error),
        undefined,
      );
    });
  }
    
    override componentDidCatch(error: unknown, info: React.ErrorInfo) {
      setLastError(
        error instanceof Error ? error.message : String(error),
        info.componentStack ?? undefined,
      );
      this.setState({ hasError: true });
    }
    override render() {
      return this.state.hasError ? null : this.props.children;
    }
  }

  // Unused component - keeping for potential future use
  // class PreviewBoundaryTest extends React.Component<{ children: React.ReactNode }> {
  //   state = { crash: false };
  //   render() {
  //     if (this.state.crash) throw new Error('Boom from render');
  //     return (
  //         <button onClick={() => {
  //           this.setState({ crash: true });
  //         }}>
  //           TEST ERROR
  //         </button>
  //     );
  //   }
  // }
  

const IFRAME_PATH = '/iframe';

export default function AppViewer({ isEditMode }: AppViewerProps) {
  /* ── state & refs ───────────────────────────────────────────── */
  const [isAppRunning, setIsAppRunning] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const { refreshTrigger, setIframeReady } = useProjectStore();
  
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /* host element (inside iframe) that will receive the portal */
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  /* ── create / reuse host <div> inside the iframe once it loads ── */
  const handleIframeLoad = useCallback(() => {
    setIframeReady(true);
    // Give iframe time to fully hydrate before manipulating DOM
    setTimeout(() => {
      const doc =
        iframeRef.current?.contentDocument ??
        iframeRef.current?.contentWindow?.document;
      if (!doc) return;

      // Wait for iframe's React to fully hydrate before DOM manipulation
      setTimeout(() => {
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
          pointerEvents: isEditMode ? 'auto' : 'none',
        });
        appRoot.appendChild(host);

        setOverlayHost(host);
      }, 100); // Additional delay for iframe hydration
    }, 0);
  }, [isEditMode]);
  useEffect(() => {
    // mark not ready until probe or load fires
    setIframeReady(false);
  }, [setIframeReady]);


  /* ── cleanup overlay host on unmount ───────────────────────── */
  useEffect(() => {
    return () => {
      const currentIframeRef = iframeRef.current;
      if (currentIframeRef) {
        const host = currentIframeRef.contentDocument?.getElementById('selection-overlay-root');
        host?.remove();
      }
    };
  }, []);

  // Toggle click-through behavior when edit mode changes
  useEffect(() => {
    if (overlayHost) {
      overlayHost.style.pointerEvents = isEditMode ? 'auto' : 'none';
    }
  }, [overlayHost, isEditMode]);

  /* ── liveness probe for the child app ───────────────────────── */
  // Reload iframe when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIframeReady(false);
      setIframeKey(prevKey => prevKey + 1);
    }
  }, [refreshTrigger, setIframeReady]);

  useEffect(() => {
    let cancelled = false;
    let delayMs = 5000; // start at 5s
    const maxDelayMs = 30000; // cap at 30s

    const probe = async () => {
      try {
        const res = await fetch(IFRAME_PATH, { method: 'GET', headers: { 'Accept': 'text/html' } });
        if (!cancelled && res.ok) {
          setIsAppRunning(true);
          setIframeReady(true);
          return; // stop probing once ready
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        setIsAppRunning(false);
        setIframeReady(false);
        setTimeout(probe, delayMs);
        delayMs = Math.min(maxDelayMs, Math.floor(delayMs * 1.7));
      }
    };

    // kick off probing
    probe();
    return () => { cancelled = true; };
  }, [setIframeReady]);

  /* No local fallback UI; a global overlay handles loading */

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <PreviewBoundary iframeRef={iframeRef}  >
    
      <div className="flex flex-col h-full bg-background border-l">
        <div className="flex-1 relative min-h-0">
          {isAppRunning && (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={IFRAME_PATH}
              className="w-full h-full border-0"
              title="Demo App"
              onLoad={handleIframeLoad}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          )}

          {/* All overlay UI is portalled INTO the iframe’s document */}
          {overlayHost &&
            createPortal(
              <IframeOverlay isEditMode={isEditMode} />,
              overlayHost,
            )}
        </div>
      </div>
    </PreviewBoundary>

  );
}
