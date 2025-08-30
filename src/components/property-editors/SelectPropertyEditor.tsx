'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface SelectPropertyEditorProps {
  property: Property & { type: 'select'; options: string[] };
  onChange: (value: string) => void;
  onPreview?: (value: string) => void;
}

export default function SelectPropertyEditor({ property, onChange, onPreview }: SelectPropertyEditorProps) {
  return (
    <BasePropertyEditor title={property.title}>
      <div className="flex items-center border border-zinc-700 rounded bg-zinc-800">
        <Select value={property.value as string || ''} onValueChange={onChange}>
          <SelectTrigger className="flex-1 bg-zinc-800 border-none text-white hover:bg-zinc-700 focus:ring-1 focus:ring-blue-500 focus:border-transparent rounded text-xs h-7">
            <SelectValue placeholder="Select option..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {Array.isArray(property.options) ? property.options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className="text-white hover:bg-zinc-700 focus:bg-zinc-700"
                // Hover previews: broadcast/update UI only, do not commit selection (avoid checkmark moving)
                onMouseEnter={() => onPreview?.(option)}
              >
                {option}
              </SelectItem>
            )) : (
              <SelectItem value="" className="text-white hover:bg-zinc-700 focus:bg-zinc-700">
                No options available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </BasePropertyEditor>
  );
}
