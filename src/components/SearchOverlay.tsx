"use client";

import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/lib/store";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
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
  } = useProjectStore();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localQuery, setLocalQuery] = useState<string>(searchQuery);

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

      // When open, Enter navigates results
      if (searchOpen && key === "enter") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) prevSearchResult(); else nextSearchResult();
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
  }, [searchOpen, setSearchOpen, nextSearchResult, prevSearchResult]);

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

  if (!searchOpen) return null;

  const count = searchResults.length;
  const active = count > 0 && searchActiveIndex >= 0 ? searchActiveIndex + 1 : 0;

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-[2000] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-md bg-zinc-800 px-2 py-1.5 shadow-md text-zinc-200">
        <Search className="h-4 w-4 text-zinc-300" />
        <input
          ref={inputRef}
          className="w-72 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          placeholder="Search nodes (Ctrl/Cmd+F)"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
        />
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={searchCaseSensitive}
              onChange={(e) => setSearchOptions({ caseSensitive: e.target.checked })}
            />
            Aa
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={searchIncludeProperties}
              onChange={(e) => setSearchOptions({ includeProperties: e.target.checked })}
            />
            props
          </label>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-300">
          <span className="tabular-nums">{active}/{count}</span>
          <Button
            variant="outline"
            size="icon"
            className="ml-1 h-7 w-7 bg-zinc-800 text-zinc-300 border-0 hover:bg-zinc-700 hover:text-zinc-200"
            title="Previous (Shift+Enter)"
            onClick={() => prevSearchResult()}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-zinc-800 text-zinc-300 border-0 hover:bg-zinc-700 hover:text-zinc-200"
            title="Next (Enter)"
            onClick={() => nextSearchResult()}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 bg-zinc-800 text-zinc-300 border-0 hover:bg-zinc-700 hover:text-zinc-200"
          title="Close (Esc)"
          onClick={() => {
            setSearchOpen(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {count > 0 && (
        <div className="pointer-events-auto mt-2 w-[540px] max-w-[80vw]">
          <div className="max-h-64 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 text-left">
            {searchResults.map((r, i) => {
              const isActive = i === searchActiveIndex;
              const label = r.field === 'title' ? 'Title' : r.field === 'prompt' ? 'Prompt' : `Property: ${r.propertyId}`;
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
                  onClick={() => setSearchActiveIndex(i)}
                  className={`block w-full px-3 py-2 text-sm hover:bg-zinc-800 ${isActive ? 'bg-zinc-800' : ''}`}
                >
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{label}</span>
                    <span title={nodeTitle}>Node: {nodeTitle}</span>
                  </div>
                  <div className="truncate text-zinc-100">
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
          <div className="mt-1 text-center text-[11px] text-zinc-400">
            Enter for next, Shift+Enter for previous
          </div>
        </div>
      )}
    </div>
  );
}
