// AppViewer.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IframeOverlay from './IframeOverlay';
import { LoaderFive } from '@/components/ui/loader';
import { setLastError } from '@/lib/runtimeErrorStore';
import { create } from 'zustand';

// Store for iframe reload functionality
interface IframeReloadStore {
  reloadCount: number;
  triggerReload: () => void;
}

export const useIframeReloadStore = create<IframeReloadStore>((set) => ({
  reloadCount: 0,
  triggerReload: () => set((state) => ({ reloadCount: state.reloadCount + 1 })),
}));

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
  const { reloadCount } = useIframeReloadStore();

  const iframeRef = useRef<HTMLIFrameElement>(null);

  /* host element (inside iframe) that will receive the portal */
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  /* ── create / reuse host <div> inside the iframe once it loads ── */
  const handleIframeLoad = useCallback(() => {
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

        // Inject scrollbar styles into iframe document to match the main app
        const styleId = 'iframe-scrollbar-styles';
        if (!doc.getElementById(styleId)) {
          const style = doc.createElement('style');
          style.id = styleId;
          style.textContent = `
            /* Custom scrollbar styles for iframe content */
            html, body {
              scrollbar-width: thin;
              scrollbar-color: rgb(113 113 122) transparent;
            }
            
            html::-webkit-scrollbar,
            body::-webkit-scrollbar {
              width: 8px;
              height: 8px;
            }
            
            html::-webkit-scrollbar-track,
            body::-webkit-scrollbar-track {
              background: transparent;
            }
            
            html::-webkit-scrollbar-thumb,
            body::-webkit-scrollbar-thumb {
              background-color: rgba(113, 113, 122, 0.4);
              border-radius: 4px;
              transition: background-color 0.2s;
            }
            
            html::-webkit-scrollbar-thumb:hover,
            body::-webkit-scrollbar-thumb:hover {
              background-color: rgba(113, 113, 122, 0.6);
            }
            
            /* Apply to all scrollable elements */
            * {
              scrollbar-width: thin;
              scrollbar-color: rgb(113 113 122) transparent;
            }
            
            *::-webkit-scrollbar {
              width: 6px;
              height: 6px;
            }
            
            *::-webkit-scrollbar-track {
              background: transparent;
            }
            
            *::-webkit-scrollbar-thumb {
              background-color: rgba(113, 113, 122, 0.4);
              border-radius: 3px;
              transition: background-color 0.2s;
            }
            
            *::-webkit-scrollbar-thumb:hover {
              background-color: rgba(113, 113, 122, 0.6);
            }
          `;
          doc.head.appendChild(style);
        }

        setOverlayHost(host);
      }, 100); // Additional delay for iframe hydration
    }, 0);
  }, [isEditMode]);

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

  /* ── reload iframe when reloadCount changes ───────────────────── */
  useEffect(() => {
    if (reloadCount > 0 && iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      }, 50);
    }
  }, [reloadCount]);

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
    <PreviewBoundary iframeRef={iframeRef}  >
    
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
    </PreviewBoundary>

  );
}
