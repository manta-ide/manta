'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Property } from '@/app/api/lib/schemas';

interface ColorPropertyEditorProps {
  property: Property & { type: 'color' };
  onChange: (value: string) => void;
}

export default function ColorPropertyEditor({ property, onChange }: ColorPropertyEditorProps) {
  const value = property.value as string || '#000000';
  const displayValue = value.replace('#', '').toUpperCase();

  return (
    <div className="flex flex-col gap-2 py-2">
      <Label className="text-sm font-bold text-white">
        {property.title}
      </Label>
      <div className="flex items-center border border-zinc-700 rounded-md bg-zinc-800">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-9 w-9 rounded-l-md border-r border-zinc-700 flex-shrink-0"
              style={{ backgroundColor: value }}
              aria-label={`Choose color ${value}`}
            />
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3 bg-zinc-800 border-zinc-700">
            <HexColorPicker color={value} onChange={onChange} />
            <HexColorInput
              color={value}
              onChange={onChange}
              prefixed
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-white"
            />
          </PopoverContent>
        </Popover>
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const inputValue = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '');
            if (inputValue.length <= 6) {
              const newValue = inputValue.length === 0 ? '#000000' : `#${inputValue.padEnd(6, '0')}`;
              onChange(newValue);
            }
          }}
          placeholder="000000"
          className="flex-1 bg-zinc-800 text-white px-3 py-2 text-sm rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          maxLength={6}
        />
      </div>
    </div>
  );
}
