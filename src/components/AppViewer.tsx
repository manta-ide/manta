// AppViewer.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IframeOverlay from './IframeOverlay';
import { setLastError } from '@/lib/runtimeErrorStore';
import { useProjectStore } from '@/lib/store';
import { postVarsUpdate } from '@/lib/child-bridge';

interface AppViewerProps {
  isEditMode: boolean;
}
  
/** Isolates runtime errors thrown by the preview iframe. */
class PreviewBoundary extends React.Component<{ children: React.ReactNode, iframeRef: React.RefObject<HTMLIFrameElement | null> }> {
  state = { hasError: false };
  componentDidMount() {
    try {
      this.props.iframeRef.current?.contentWindow?.addEventListener('error', function(event) {
        setLastError(
          event.error instanceof Error ? event.error.message : String(event.error),
          undefined,
        );
      });
    } catch {}
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
  

const childPort = (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_CHILD_PORT || '') : '') as string;
const childUrl = (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_CHILD_URL || '') : '') as string;
const IFRAME_URL = childUrl || (childPort ? `/iframe/` : '/iframe/');

// Timeout for iframe loading (15 seconds - faster than before)
const IFRAME_LOAD_TIMEOUT = 15000;

export default function AppViewer({ isEditMode }: AppViewerProps) {
  /* ── state & refs ───────────────────────────────────────────── */
  const [iframeKey, setIframeKey] = useState(0);
  const { refreshTrigger, setIframeReady } = useProjectStore();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  /* host element (inside iframe) that will receive the portal */
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  /* ── handle iframe errors ── */
  // Ensure overlay host exists and is properly set up
  const ensureOverlayHost = useCallback(() => {
    if (!iframeRef.current) return;

    try {
      const doc = iframeRef.current?.contentDocument ?? iframeRef.current?.contentWindow?.document ?? null;
      if (!doc) {
        console.warn('Cannot access iframe document for overlay host setup');
        return;
      }

      // Check if overlay host already exists
      let host = doc.getElementById('selection-overlay-root') as HTMLElement;
      if (host) {
        console.log('Overlay host already exists, updating styles');
        // Update styles in case they changed
        Object.assign(host.style, {
          position: 'absolute',
          inset: '0',
          zIndex: '9999',
          pointerEvents: isEditMode ? 'auto' : 'none',
        });
        setOverlayHost(host);
        return;
      }

      // Create new overlay host
      console.log('Creating new overlay host');
      host = doc.createElement('div');
      host.id = 'selection-overlay-root';
      Object.assign(host.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '9999',
        pointerEvents: isEditMode ? 'auto' : 'none',
      });

      // Find container and ensure proper positioning
      const appRoot = (doc.getElementById('app-root') as HTMLElement) || doc.body;
      if (getComputedStyle(appRoot).position === 'static') {
        appRoot.style.position = 'relative';
      }

      try {
        appRoot.appendChild(host);
        setOverlayHost(host);
        console.log('Overlay host created successfully');
      } catch (error) {
        console.error('Failed to append overlay host:', error);
      }
    } catch (error) {
      console.error('Error ensuring overlay host:', error);
    }
  }, [isEditMode]);

  const handleIframeError = useCallback(() => {
    console.error('Iframe failed to load - child app may not be running');

    // Clear the timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    // Try to retry if we haven't exceeded max retries
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current += 1;
      console.log(`Retrying iframe load (attempt ${retryCountRef.current}/${maxRetries}) - make sure child app is running with 'npm run dev:app'`);
      setTimeout(() => {
        setIframeKey(prev => prev + 1);
      }, 2000); // Wait 2 seconds before retry
    } else {
      console.warn('Max iframe load retries exceeded, assuming ready (child app may not be available)');
      setIframeReady(true);
    }
  }, [maxRetries]);

  /* ── create / reuse host <div> inside the iframe once it loads ── */
  const handleIframeLoad = useCallback(async () => {
    console.log('✅ Iframe load event fired');

    // Clear the timeout since iframe loaded successfully
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    // Reset retry count on successful load
    retryCountRef.current = 0;

    // Verify iframe content is actually accessible
    try {
      const iframeDoc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
      if (iframeDoc && iframeDoc.readyState === 'complete') {
        console.log('✅ Iframe content is ready');
        setIframeReady(true);
      } else {
        // Wait a bit more for content to be ready
        setTimeout(() => {
          console.log('✅ Iframe marked as ready (after verification delay)');
          setIframeReady(true);
        }, 1000);
      }
    } catch (error) {
      console.warn('⚠️ Could not verify iframe content, assuming ready:', error);
      setIframeReady(true);
    }

    // Give iframe time to fully hydrate before manipulating DOM
    setTimeout(() => {
      let doc: Document | null = null;
      try {
        doc = iframeRef.current?.contentDocument ?? iframeRef.current?.contentWindow?.document ?? null;
      } catch {
        doc = null; // Cross-origin: skip overlay injection
      }
      try {
        // Expose child window globally for message bridge
        if (typeof window !== 'undefined') {
          (window as any).__mantaChildWindow = iframeRef.current?.contentWindow || null;
          (window as any).__mantaChildOrigin = window.location.origin;
        }
      } catch {}
      if (!doc) return;

      // Wait for iframe's React to fully hydrate before DOM manipulation
      setTimeout(() => {
        try { doc.getElementById('selection-overlay-root')?.remove(); } catch {}

        // pick a container that scrolls with content
        const appRoot =
          (doc.getElementById('app-root') as HTMLElement) || doc.body;

        // ensure positioned ancestor for absolute children
        if (getComputedStyle(appRoot).position === 'static') {
          appRoot.style.position = 'relative';
        }

        // Ensure overlay host exists (this will create or update it)
        ensureOverlayHost();
      }, 100); // Additional delay for iframe hydration
    }, 0);
  }, [isEditMode]);
  useEffect(() => {
    // mark not ready until probe or load fires
    setIframeReady(false);
  }, []); // Remove setIframeReady from dependencies to prevent infinite loop

  // Set up timeout for iframe loading
  useEffect(() => {
    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    // Set new timeout - if iframe doesn't load within timeout, assume it's ready anyway
    loadTimeoutRef.current = setTimeout(() => {
      console.warn(`Iframe load timeout reached (${IFRAME_LOAD_TIMEOUT}ms), assuming ready`);
      setIframeReady(true);
      loadTimeoutRef.current = null;
    }, IFRAME_LOAD_TIMEOUT);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [iframeKey, setIframeReady]); // Restart timeout when iframe reloads

  // Subscribe to server-sent vars updates and forward to child iframe
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/vars/subscribe');
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          if (data && (data.type === 'vars') && data.updates && typeof data.updates === 'object') {
            postVarsUpdate(data.updates);
          }
        } catch {}
      };
      es.onerror = () => {
        // Silently ignore; the overlay remains usable
      };
    } catch {}
    return () => {
      try { es?.close(); } catch {}
    };
  }, []);

  // Listen for child ready signals and establish connection
  useEffect(() => {
    const handleChildReady = (event: MessageEvent) => {
      if (event.data?.type === 'manta:child:ready' && event.data?.source === 'child') {
        console.log('Parent received child ready signal, establishing connection');

        // Set up the child window reference for the bridge
        if (iframeRef.current?.contentWindow) {
          (window as any).__mantaChildWindow = iframeRef.current.contentWindow;
          (window as any).__mantaChildOrigin = window.location.origin;

          // Acknowledge the ready signal to stop child retrying
          try {
            iframeRef.current.contentWindow.postMessage({
              type: 'manta:parent:ready',
              source: 'parent'
            }, '*');
            console.log('Parent acknowledged child ready signal');
          } catch (error) {
            console.warn('Failed to acknowledge child ready signal:', error);
          }

          // Send current vars to establish initial state
          const currentVars = useProjectStore.getState().vars;
          if (currentVars && Object.keys(currentVars).length > 0) {
            const handleChildReadyVars = (updates: any) => {
              if (iframeRef.current?.contentWindow && updates) {
                try {
                  iframeRef.current.contentWindow.postMessage({
                    type: 'manta:vars:update',
                    updates,
                    source: 'parent'
                  }, '*');
                  console.log('Sent initial vars to child on connection');
                } catch (error) {
                  console.warn('Failed to send initial vars to child:', error);
                }
              }
            };
            handleChildReadyVars(currentVars);
          }

          // Now that child is ready, ensure overlay host is created/updated
          setTimeout(() => {
            ensureOverlayHost();
          }, 500); // Give child time to fully hydrate
        }
      }
    };

    window.addEventListener('message', handleChildReady);
    return () => window.removeEventListener('message', handleChildReady);
  }, []);

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

  // Periodically ensure overlay host persists (in case iframe content changes)
  useEffect(() => {
    if (!iframeRef.current) return;

    const checkOverlayHost = () => {
      try {
        const doc = iframeRef.current?.contentDocument ?? iframeRef.current?.contentWindow?.document ?? null;
        if (doc) {
          const host = doc.getElementById('selection-overlay-root');
          if (!host) {
            console.log('Overlay host missing, recreating...');
            ensureOverlayHost();
          }
        }
      } catch (error) {
        // Silently ignore cross-origin errors
      }
    };

    // Check every 2 seconds
    const interval = setInterval(checkOverlayHost, 2000);
    return () => clearInterval(interval);
  }, [ensureOverlayHost]);

  // Reload iframe when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      console.log('refreshing iframe');
      // Reset retry count on manual refresh
      retryCountRef.current = 0;
      setIframeKey(prevKey => prevKey + 1);
    }
  }, [refreshTrigger]); // Remove setIframeReady from dependencies

  /* No local fallback UI; a global overlay handles loading */

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <PreviewBoundary iframeRef={iframeRef}  >
    
      <div className="flex flex-col h-full bg-background border-l">
        <div className="flex-1 relative min-h-0">
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={IFRAME_URL}
            className="w-full h-full border-0"
            title="Demo App"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
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
