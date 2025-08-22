'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';

interface TextPropertyEditorProps {
  property: Property & { type: 'text' };
  onChange: (value: string) => void;
}

export default function TextPropertyEditor({ property, onChange }: TextPropertyEditorProps) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <Label className="text-sm font-bold text-white">
        {property.title}
      </Label>
      <Input
        type="text"
        value={property.value as string || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter text..."
        maxLength={property.maxLength}
        className="border-zinc-700 bg-zinc-800 text-white outline-none data-focus-within:border-blue-500 data-focus-within:ring-blue-500/50 data-focus-within:has-aria-invalid:ring-red-500/20 data-focus-within:has-aria-invalid:border-red-500 relative inline-flex h-9 w-full items-center overflow-hidden rounded-md border text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] data-disabled:opacity-50 data-focus-within:ring-[3px] px-3 py-2"
      />
    </div>
  );
}
