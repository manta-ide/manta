"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/lib/store";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SearchOverlay() {
  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchCaseSensitive,
    searchIncludeProperties,
    setSearchOptions,
    runSearch,
    searchResults,
    searchActiveIndex,
    nextSearchResult,
    prevSearchResult,
    setSearchActiveIndex,
    graph,
    setSelectedNode,
    setSelectedNodeIds,
  } = useProjectStore();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localQuery, setLocalQuery] = useState<string>(searchQuery);

  // Detect platform for correct keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifierKey = isMac ? '⌘' : 'Ctrl';

  // Sync local input with store state changes
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Global hotkeys (capture Ctrl/Cmd+F to open, F3/Ctrl+G to navigate)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Ctrl/Cmd+F — open search
      if ((e.ctrlKey || e.metaKey) && key === "f") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
        // Next tick to ensure input is present
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      // Esc — close when open
      if (searchOpen && key === "escape") {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(false);
        return;
      }

          // When open, Enter selects current result and closes search
      if (searchOpen && key === "enter") {
        e.preventDefault();
        e.stopPropagation();
        // Select the currently active search result and close search
        if (searchResults.length > 0 && searchActiveIndex >= 0) {
          const result = searchResults[searchActiveIndex];
          if (result && graph?.nodes) {
            const node = graph.nodes.find(n => n.id === result.nodeId);
            if (node) {
              // Use the same selection logic as node clicking
              setSelectedNode(result.nodeId, node);
              setSelectedNodeIds([result.nodeId]);
            }
          }
        }
        setSearchOpen(false);
        return;
      }

      // Arrow keys to navigate results
      if (searchOpen && (key === "arrowup" || key === "arrowdown")) {
        e.preventDefault();
        e.stopPropagation();
        if (key === "arrowup") {
          prevSearchResult();
        } else {
          nextSearchResult();
        }
        return;
      }

      // F3 or Ctrl/Cmd+G to next/prev
      if (searchOpen && (key === "f3" || ((e.ctrlKey || e.metaKey) && key === "g"))) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) prevSearchResult(); else nextSearchResult();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, [searchOpen, setSearchOpen, nextSearchResult, prevSearchResult, searchResults, searchActiveIndex, graph, setSelectedNode, setSelectedNodeIds]);

  // Run search whenever options or query change while open (debounced)
  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => {
      // Push local input to store and run search
      setSearchQuery(localQuery);
      runSearch();
    }, 100);
    return () => clearTimeout(t);
  }, [searchOpen, localQuery, searchCaseSensitive, searchIncludeProperties, setSearchQuery, runSearch]);

  // Auto-scroll to active search result
  useEffect(() => {
    if (!searchOpen || searchResults.length === 0 || searchActiveIndex < 0) return;

    const activeResultElement = document.querySelector(`[data-search-index="${searchActiveIndex}"]`);
    if (activeResultElement) {
      activeResultElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [searchActiveIndex, searchOpen, searchResults.length]);

  if (!searchOpen) return null;

  const count = searchResults.length;
  const active = count > 0 && searchActiveIndex >= 0 ? searchActiveIndex + 1 : 0;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-[2000] -translate-x-1/2">
      <div className="pointer-events-auto w-[540px] max-w-[80vw] rounded-md bg-zinc-900 shadow-md text-zinc-200 border border-zinc-700">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            placeholder={`Search nodes (${modifierKey}+F)`}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
          />
          <Button
            onClick={() => setSearchOptions({ caseSensitive: !searchCaseSensitive })}
            variant="outline"
            size="sm"
            className={`${searchCaseSensitive
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
            style={{ width: '24px', height: '24px', padding: '0', fontSize: '10px', lineHeight: '1' }}
            title="Case sensitive (Aa)"
          >
            Aa
          </Button>
          <Button
            onClick={() => setSearchOptions({ includeProperties: !searchIncludeProperties })}
            variant="outline"
            size="sm"
            className={`${searchIncludeProperties
              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
              : 'bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
            style={{ width: '24px', height: '24px', padding: '0', fontSize: '10px', lineHeight: '1' }}
            title="Include properties (P)"
          >
            P
          </Button>
          <div className="flex items-center gap-1 text-xs text-zinc-300">
            <span className="tabular-nums">{active}/{count}</span>
            <Button
              variant="outline"
              size="icon"
              className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              style={{ width: '24px', height: '24px', padding: '0' }}
              title="Previous (↑)"
              onClick={() => prevSearchResult()}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              style={{ width: '24px', height: '24px', padding: '0' }}
              title="Next (↓)"
              onClick={() => nextSearchResult()}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            style={{ width: '24px', height: '24px', padding: '0' }}
            title="Close (Esc)"
            onClick={() => {
              setSearchOpen(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        {count > 0 && (
          <>
            <div className="border-t border-zinc-700">
              <div className="max-h-64 overflow-auto text-left">
                {searchResults.map((r, i) => {
                  const isActive = i === searchActiveIndex;
                  const label = r.field === 'title' ? 'Title' : r.field === 'description' ? 'Description' : `Property: ${r.propertyId}`;
                  const nodeTitle = graph?.nodes?.find((n: any) => n.id === r.nodeId)?.title || r.nodeId;
                  const value = r.value || '';
                  const q = (searchQuery || '').trim();
                  const idx = q ? (value || '').toString().toLowerCase().indexOf(q.toLowerCase()) : -1;
                  const before = idx >= 0 ? value.slice(0, idx) : value;
                  const match = idx >= 0 ? value.slice(idx, idx + q.length) : '';
                  const after = idx >= 0 ? value.slice(idx + q.length) : '';
                  return (
                    <button
                      key={`${r.nodeId}-${r.field}-${r.propertyId ?? ''}-${i}`}
                      data-search-index={i}
                      onClick={() => setSearchActiveIndex(i)}
                      className={`block w-full px-3 py-2 text-sm hover:bg-zinc-800 ${isActive ? 'bg-zinc-800' : ''}`}
                    >
                      <div className="flex items-center justify-between text-xs text-zinc-400">
                        <span>{label}</span>
                        <span title={nodeTitle}>Node: {nodeTitle}</span>
                      </div>
                      <div className="truncate text-zinc-100 text-left">
                        {idx >= 0 ? (
                          <>
                            {before}
                            <span className="rounded bg-blue-500/30 text-zinc-50">{match}</span>
                            {after}
                          </>
                        ) : (
                          value
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-zinc-700 px-2 py-1 text-center text-[11px] text-zinc-400">
                Enter to select, ↑↓ to navigate
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
