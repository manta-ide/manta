'use client';

import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface ColorPropertyEditorProps {
  property: Property & { type: 'color' };
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function ColorPropertyEditor({ property, onChange, disabled = false }: ColorPropertyEditorProps) {
  const value = (property.value as string) || '#000000';
  const [localValue, setLocalValue] = useState<string>(value);
  
  // Keep local value in sync when external value changes (e.g., other client broadcast)
  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value);
    }
  }, [value]);
  
  const displayValue = localValue.replace('#', '').toUpperCase();

  return (
    <BasePropertyEditor title={property.title}>
      <div className="flex items-center border border-zinc-700 rounded bg-zinc-800">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="h-7 w-7 rounded-l border-r border-zinc-700 flex-shrink-0"
              style={{ backgroundColor: localValue }}
              aria-label={`Choose color ${value}`}
              disabled={disabled}
            />
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3 bg-zinc-800 border-zinc-700">
            <HexColorPicker 
              color={localValue}
              onChange={(next) => {
                if (!disabled) {
                  setLocalValue(next);
                  onChange(next);
                }
              }} 
            />
            <HexColorInput
              color={localValue}
              onChange={(next) => {
                if (!disabled) {
                  setLocalValue(next);
                  onChange(next);
                }
              }}
              prefixed
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 text-white"
            />
          </PopoverContent>
        </Popover>
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            if (!disabled) {
              const inputValue = e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '');
              if (inputValue.length <= 6) {
                const newValue = inputValue.length === 0 ? '#000000' : `#${inputValue.padEnd(6, '0')}`;
                setLocalValue(newValue);
                onChange(newValue);
              }
            }
          }}
          placeholder="000000"
          className="flex-1 bg-zinc-800 text-white px-2 py-1 text-xs rounded-r focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent [&::placeholder]:text-xs"
          maxLength={6}
          disabled={disabled}
        />
      </div>
    </BasePropertyEditor>
  );
}
