'use client';

import React, { useMemo } from 'react';
import BasePropertyEditor from './BasePropertyEditor';
import { Property } from '@/app/api/lib/schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface FontPropertyValue {
  family?: string;
}

interface FontPropertyEditorProps {
  property: Property & { type: 'font'; options?: string[] };
  onChange: (value: FontPropertyValue) => void;
  onPreview?: (value: FontPropertyValue) => void;
  disabled?: boolean;
}

const DEFAULT_FAMILIES = [
  'Inter', 'Lato', 'Lora', 'Montserrat', 'Noto Sans', 'Open Sans', 'Oswald', 'Playfair Display', 'Poppins', 'PT Sans', 'Raleway', 'Roboto', 'Source Sans Pro'
];


export default function FontPropertyEditor({ property, onChange, onPreview, disabled = false }: FontPropertyEditorProps) {
  const val: FontPropertyValue = (property.value as any) || {};
  const families = useMemo(() => (Array.isArray(property.options) && property.options.length ? property.options : DEFAULT_FAMILIES), [property.options]);

  const update = (patch: Partial<FontPropertyValue>, preview = false) => {
    if (disabled) return;
    const next = { ...val, ...patch } as FontPropertyValue;
    if (preview) onPreview?.(next);
    else onChange(next);
  };

  return (
    <BasePropertyEditor title={property.title}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select value={val.family || ''} onValueChange={(v) => update({ family: v })} disabled={disabled}>
              <SelectTrigger className="w-full h-7 bg-zinc-800 border-zinc-700 text-xs text-white">
                <SelectValue placeholder="Select font family..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                {families.map((f: string) => (
                  <SelectItem key={f} value={f} className="text-white hover:bg-zinc-700" onMouseEnter={() => update({ family: f }, true)}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </BasePropertyEditor>
  );
}
