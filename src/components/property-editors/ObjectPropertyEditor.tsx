'use client';

import React, { useState } from 'react';
import BasePropertyEditor from './BasePropertyEditor';
import { Property } from '@/app/api/lib/schemas';
import PropertyEditor from './index';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';

interface ObjectPropertyEditorProps {
  property: Property & { type: 'object'; fields?: Property[] };
  onChange: (value: Record<string, any>) => void;
  disabled?: boolean;
}

export default function ObjectPropertyEditor({ property, onChange, disabled = false }: ObjectPropertyEditorProps) {
  const [open, setOpen] = useState(false); // collapsed by default
  const value = (property.value && typeof property.value === 'object' && !Array.isArray(property.value))
    ? (property.value as Record<string, any>)
    : {};

  const explicitFields = Array.isArray(property.fields) ? property.fields : [];

  // If no explicit fields defined, create them dynamically from the object keys
  const fields = explicitFields.length > 0 ? explicitFields : Object.keys(value).map(key => ({
    id: key,
    title: key.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert to title case
    type: typeof value[key] === 'string' ? 'string' :
          typeof value[key] === 'number' ? 'number' :
          typeof value[key] === 'boolean' ? 'boolean' :
          'string', // fallback to string for complex types
    value: value[key]
  }));

  const handleChildChange = (childId: string, childValue: any) => {
    const next = { ...value, [childId]: childValue };
    onChange(next);
  };

  return (
    <BasePropertyEditor title="">
      <div className="rounded border border-zinc-700 bg-zinc-800">
        <div
          className="flex items-center px-2 py-1.5 border-b border-zinc-700/50 cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          {open ? (
            <ChevronDownIcon size={16} className="text-muted-foreground/80" />
          ) : (
            <ChevronRightIcon size={16} className="text-muted-foreground/80" />
          )}
          <span className="text-xs font-medium text-zinc-300 ml-2">{property.title}</span>
        </div>
        {open && (
        <div className="p-2 space-y-2">
          {fields.length === 0 && (
            <div className="text-xs text-zinc-500">No fields defined for this group.</div>
          )}
          {fields.map((field: Property, idx: number) => (
            <div key={field.id || idx} className={idx < fields.length - 1 ? 'border-b border-zinc-700/20 pb-1.5' : ''}>
              <PropertyEditor
                property={{
                  ...field,
                  // Ensure field value comes from the group value
                  value: value[field.id] ?? field.value,
                } as Property}
                onChange={handleChildChange}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
        )}
      </div>
    </BasePropertyEditor>
  );
}
