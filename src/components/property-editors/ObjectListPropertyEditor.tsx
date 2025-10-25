'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import BasePropertyEditor from './BasePropertyEditor';
import { Property } from '@/app/api/lib/schemas';
import PropertyEditor from './index';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, XIcon, Move } from 'lucide-react';

interface ObjectListPropertyEditorProps {
  property: Property & { type: 'object-list'; itemFields?: Property[]; itemTitle?: string; addLabel?: string };
  onChange: (value: Array<Record<string, any>>) => void;
  disabled?: boolean;
}

export default function ObjectListPropertyEditor({ property, onChange, disabled = false }: ObjectListPropertyEditorProps) {
  const items = Array.isArray(property.value) ? (property.value as Array<Record<string, any>>) : [];
  const explicitFields = Array.isArray(property.itemFields) ? property.itemFields : [];

  // If no explicit itemFields defined, create them dynamically from the first item or empty object
  const fields = explicitFields.length > 0 ? explicitFields :
    (items.length > 0 ? Object.keys(items[0]).map(key => ({
      id: key,
      title: key.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert to title case
      type: typeof items[0][key] === 'string' ? 'string' :
            typeof items[0][key] === 'number' ? 'number' :
            typeof items[0][key] === 'boolean' ? 'boolean' :
            'string', // fallback to string for complex types
      value: items[0][key]
    })) : []);
  const [open, setOpen] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    (items || []).forEach((_, i) => (initial[i] = false)); // collapsed by default
    return initial;
  });

  // Drag & drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | null>(null);

  // Scroll container ref for auto-scroll
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleAutoScroll = useCallback((clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const threshold = Math.min(64, rect.height / 3);
    const topDist = clientY - rect.top;
    const bottomDist = rect.bottom - clientY;
    let delta = 0;
    if (topDist < threshold) {
      delta = -((threshold - topDist) / threshold) * 20;
    } else if (bottomDist < threshold) {
      delta = ((threshold - bottomDist) / threshold) * 20;
    }
    if (delta !== 0) container.scrollBy({ top: delta, behavior: 'auto' });
  }, []);

  // Custom drag image element
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const createDragImage = (label: string) => {
    const el = document.createElement('div');
    el.textContent = label;
    el.style.position = 'fixed';
    el.style.top = '-1000px';
    el.style.left = '-1000px';
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
    el.style.padding = '6px 10px';
    el.style.borderRadius = '6px';
    el.style.background = 'rgba(39,39,42,0.95)'; // zinc-800
    el.style.border = '1px solid rgba(63,63,70,0.9)'; // zinc-700
    el.style.color = '#e4e4e7'; // zinc-200
    el.style.fontSize = '12px';
    el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    document.body.appendChild(el);
    dragImageRef.current = el;
    return el;
  };
  const createDragImageFromElement = (el: HTMLElement) => {
    const clone = el.cloneNode(true) as HTMLElement;
    // Remove transient indicators
    clone.querySelectorAll('[data-drop-indicator]')?.forEach((n) => n.parentElement?.removeChild(n));
    clone.style.position = 'fixed';
    clone.style.top = '-1000px';
    clone.style.left = '-1000px';
    clone.style.zIndex = '9999';
    clone.style.pointerEvents = 'none';
    clone.style.background = 'rgba(39,39,42,0.96)';
    clone.style.border = '1px solid rgba(63,63,70,0.9)';
    clone.style.boxShadow = '0 8px 28px rgba(0,0,0,0.35)';
    clone.style.borderRadius = '8px';
    clone.style.padding = '2px 4px';
    const maxW = Math.min(280, el.getBoundingClientRect().width);
    clone.style.width = `${maxW}px`;
    document.body.appendChild(clone);
    dragImageRef.current = clone as HTMLDivElement;
    return clone as HTMLDivElement;
  };
  const cleanupDragImage = () => {
    const img = dragImageRef.current;
    if (img && img.parentNode) img.parentNode.removeChild(img);
    dragImageRef.current = null;
  };

  // Stable item keys aligned by index, so inputs don't remount on every keystroke
  const keyCounterRef = useRef(0);
  const makeKey = () => `item_${keyCounterRef.current++}`;
  const [itemKeys, setItemKeys] = useState<string[]>(() => (items || []).map(() => makeKey()));

  // Keep keys length in sync if items length changes externally
  useEffect(() => {
    setItemKeys((prev) => {
      if (prev.length === items.length) return prev;
      if (prev.length < items.length) {
        const add = Array.from({ length: items.length - prev.length }, () => makeKey());
        return [...prev, ...add];
      }
      return prev.slice(0, items.length);
    });
  }, [items.length]);

  const reorder = useCallback((list: any[], startIndex: number, endIndex: number) => {
    const result = [...list];
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  }, []);

  const handleDropReorder = useCallback((from: number, to: number) => {
    if (from === to || from == null || to == null) return;
    const next = reorder(items, from, to);
    onChange(next);
    // Reorder the open map to follow the items
    setOpen((prev) => {
      const flags = items.map((_, i) => !!prev[i]);
      const newFlags = reorder(flags, from, to);
      const mapping: Record<number, boolean> = {};
      newFlags.forEach((v, i) => (mapping[i] = v));
      return mapping;
    });
    // Reorder the stable keys to match
    setItemKeys((prev) => reorder(prev, from, to));
  }, [items, onChange, reorder]);

  const addItem = () => {
    const empty: Record<string, any> = {};
    for (const f of fields) {
      // initialize with field default if provided
      if (f?.id !== undefined) empty[f.id] = f.value ?? '';
    }
    const next = [...(items || []), empty];
    onChange(next);
    setOpen((prev) => ({ ...prev, [next.length - 1]: true }));
    setItemKeys((prev) => [...prev, makeKey()]);
  };

  const removeItem = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    onChange(next);
    setItemKeys((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItemField = (index: number, fieldId: string, fieldValue: any) => {
    const next = [...items];
    const obj = { ...(next[index] || {}) };
    obj[fieldId] = fieldValue;
    next[index] = obj;
    onChange(next);
  };

  // Derive a single-line item header from the item's content
  const getItemHeaderText = (item: Record<string, any>, idx: number) => {
    const getStr = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
    const prefer = ['name', 'title', 'label'];
    for (const k of prefer) {
      const s = getStr(item?.[k]);
      if (s) return s;
    }
    const hash = getStr(item?.hash);
    if (hash) return `#${hash}`;
    const fallbacks = ['id', 'key', 'text', 'value'];
    for (const k of fallbacks) {
      const s = getStr(item?.[k]);
      if (s) return s;
    }
    // Any other non-empty string field
    for (const k of Object.keys(item || {})) {
      const s = getStr(item[k]);
      if (s) return s;
    }
    return property.itemTitle ? `${property.itemTitle} ${idx + 1}` : `Item ${idx + 1}`;
  };

  return (
    <BasePropertyEditor
      title={property.title}
      rightSlot={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-xs hover:bg-zinc-700 rounded-sm flex items-center justify-center"
          onClick={addItem}
          title={property.addLabel || 'Add'}
          disabled={disabled}
        >
          <PlusIcon size={16} className="text-muted-foreground/80" />
        </Button>
      }
    >
      <div className="space-y-2" ref={containerRef}>
        {items?.length ? items.map((item, idx) => (
          <div
            key={itemKeys[idx] ?? `fallback_${idx}`}
            className={`rounded border border-zinc-700 bg-zinc-800 ${dragOverIndex === idx ? 'ring-1 ring-ring/40' : ''}`}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const position = offsetY < rect.height / 2 ? 'before' : 'after';
              setDragOverIndex(idx);
              setDragOverPosition(position);
              handleAutoScroll(e.clientY);
            }}
            onDragEnter={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const offsetY = e.clientY - rect.top;
              const position = offsetY < rect.height / 2 ? 'before' : 'after';
              setDragOverIndex(idx);
              setDragOverPosition(position);
              handleAutoScroll(e.clientY);
            }}
            onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
              // Only clear when truly leaving the item container
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDragOverIndex(null);
                setDragOverPosition(null);
              }
            }}
            onDrop={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              e.stopPropagation();
              const from = draggedIndex ?? parseInt(e.dataTransfer.getData('text/plain'));
              if (!Number.isNaN(from)) {
                const pos = dragOverPosition ?? 'before';
                const toIndex = pos === 'after' ? Math.min(idx + 1, items.length) : idx;
                handleDropReorder(from, toIndex);
              }
              setDraggedIndex(null);
              setDragOverIndex(null);
              setDragOverPosition(null);
              cleanupDragImage();
            }}
          >
            <div
              className="list-item-header relative flex items-center px-2 py-1.5 border-b border-zinc-700/50 cursor-pointer select-none"
              onClick={() => setOpen((s) => ({ ...s, [idx]: !s[idx] }))}
            >
              {/* Drop-between indicator bars */}
              {dragOverIndex === idx && dragOverPosition === 'before' && (
                <div
                  data-drop-indicator
                  className="absolute -top-0.5 left-0 right-0 h-1 bg-primary shadow-[0_0_12px_rgba(59,130,246,0.45)]"
                />
              )}
              {dragOverIndex === idx && dragOverPosition === 'after' && (
                <div
                  data-drop-indicator
                  className="absolute -bottom-0.5 left-0 right-0 h-1 bg-primary shadow-[0_0_12px_rgba(59,130,246,0.45)]"
                />
              )}
              {/* Drag handle */}
              <div
                className="mr-1 text-muted-foreground/70 hover:text-muted-foreground/90 cursor-grab active:cursor-grabbing active:scale-95 transition"
                title="Drag to reorder"
                draggable
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
                  setDraggedIndex(idx);
                  try {
                    e.dataTransfer.setData('text/plain', String(idx));
                    const header = (e.currentTarget as HTMLElement).closest('.list-item-header') as HTMLElement | null;
                    const label = property.itemTitle ? `${property.itemTitle} ${idx + 1}` : `Item ${idx + 1}`;
                    const img = header ? createDragImageFromElement(header) : createDragImage(label);
                    // Small offset to avoid covering cursor
                    e.dataTransfer.setDragImage(img, 10, 10);
                  } catch { /* noop */ }
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                  setDragOverPosition(null);
                  cleanupDragImage();
                }}
              >
                <Move size={14} />
              </div>
              {open[idx] ? (
                <ChevronDownIcon size={16} className="text-muted-foreground/80" />
              ) : (
                <ChevronRightIcon size={16} className="text-muted-foreground/80" />
              )}
              <div className="ml-2 min-w-0">
                <span className="text-xs font-medium text-zinc-300 truncate">
                  {(() => {
                    const text = getItemHeaderText(item, idx);
                    return text.length > 64 ? `${text.slice(0, 63)}…` : text;
                  })()}
                </span>
              </div>
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-xs hover:bg-zinc-700 rounded-sm flex items-center justify-center"
                  onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                  title="Remove"
                  disabled={disabled}
                >
                  <XIcon size={16} className="text-muted-foreground/80" />
                </Button>
              </div>
            </div>
            {open[idx] && (
              <div className="overflow-hidden">
                <div className="p-2 space-y-1.5">
                  {fields.map((f: Property, i: number) => (
                    <div key={f.id || i} className={i < fields.length - 1 ? 'border-b border-zinc-700/20 pb-1.5' : ''}>
                      <PropertyEditor
                        property={{ ...f, value: item[f.id] ?? f.value } as Property}
                        onChange={(pid, v) => updateItemField(idx, pid, v)}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )) : (
          <div className="text-xs text-zinc-500">No items yet.</div>
        )}

        {/* Tail dropzone to drop at end */}
        {items?.length > 0 && (
          <div
            className="relative h-3"
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOverIndex(items.length);
              setDragOverPosition('before');
              handleAutoScroll(e.clientY);
            }}
            onDragEnter={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOverIndex(items.length);
              setDragOverPosition('before');
              handleAutoScroll(e.clientY);
            }}
            onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setDragOverIndex(null);
                setDragOverPosition(null);
              }
            }}
            onDrop={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const from = draggedIndex ?? parseInt(e.dataTransfer.getData('text/plain'));
              if (!Number.isNaN(from)) handleDropReorder(from, items.length);
              setDraggedIndex(null);
              setDragOverIndex(null);
              setDragOverPosition(null);
              cleanupDragImage();
            }}
          >
            {dragOverIndex === items.length && (
              <div
                data-drop-indicator
                className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 bg-primary shadow-[0_0_12px_rgba(59,130,246,0.45)]"
              />
            )}
          </div>
        )}
      </div>
    </BasePropertyEditor>
  );
}
