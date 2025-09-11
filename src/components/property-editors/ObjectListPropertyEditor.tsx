'use client';

import React, { useState } from 'react';
import BasePropertyEditor from './BasePropertyEditor';
import { Property } from '@/app/api/lib/schemas';
import PropertyEditor from './index';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, XIcon } from 'lucide-react';

interface ObjectListPropertyEditorProps {
  property: Property & { type: 'object-list'; itemFields?: Property[]; itemTitle?: string; addLabel?: string };
  onChange: (value: Array<Record<string, any>>) => void;
}

export default function ObjectListPropertyEditor({ property, onChange }: ObjectListPropertyEditorProps) {
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

  const addItem = () => {
    const empty: Record<string, any> = {};
    for (const f of fields) {
      // initialize with field default if provided
      if (f?.id !== undefined) empty[f.id] = f.value ?? '';
    }
    const next = [...(items || []), empty];
    onChange(next);
    setOpen((prev) => ({ ...prev, [next.length - 1]: true }));
  };

  const removeItem = (index: number) => {
    const next = [...items];
    next.splice(index, 1);
    onChange(next);
  };

  const updateItemField = (index: number, fieldId: string, fieldValue: any) => {
    const next = [...items];
    const obj = { ...(next[index] || {}) };
    obj[fieldId] = fieldValue;
    next[index] = obj;
    onChange(next);
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
        >
          <PlusIcon size={16} className="text-muted-foreground/80" />
        </Button>
      }
    >
      <div className="space-y-2">
        {items?.length ? items.map((item, idx) => (
          <div key={idx} className="rounded border border-zinc-700 bg-zinc-800">
            <div
              className="flex items-center px-2 py-1.5 border-b border-zinc-700/50 cursor-pointer"
              onClick={() => setOpen((s) => ({ ...s, [idx]: !s[idx] }))}
            >
              {open[idx] ? (
                <ChevronDownIcon size={16} className="text-muted-foreground/80" />
              ) : (
                <ChevronRightIcon size={16} className="text-muted-foreground/80" />
              )}
              <span className="text-xs font-medium text-zinc-300 ml-2">
                {property.itemTitle ? `${property.itemTitle} ${idx + 1}` : `Item ${idx + 1}`}
              </span>
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-xs hover:bg-zinc-700 rounded-sm flex items-center justify-center"
                  onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                  title="Remove"
                >
                  <XIcon size={16} className="text-muted-foreground/80" />
                </Button>
              </div>
            </div>
            {open[idx] && (
              <div className="p-2 space-y-1.5">
                {fields.map((f: Property, i: number) => (
                  <div key={f.id || i} className={i < fields.length - 1 ? 'border-b border-zinc-700/20 pb-1.5' : ''}>
                    <PropertyEditor
                      property={{ ...f, value: item[f.id] ?? f.value } as Property}
                      onChange={(pid, v) => updateItemField(idx, pid, v)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )) : (
          <div className="text-xs text-zinc-500">No items yet.</div>
        )}
      </div>
    </BasePropertyEditor>
  );
}
