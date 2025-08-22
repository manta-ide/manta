'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';

interface SelectPropertyEditorProps {
  property: Property & { type: 'select'; options: string[] };
  onChange: (value: string) => void;
}

export default function SelectPropertyEditor({ property, onChange }: SelectPropertyEditorProps) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <Label className="text-sm font-bold text-white">
        {property.title}
      </Label>
      <div className="flex items-center border border-zinc-700 rounded-md bg-zinc-800">
        <Select value={property.value as string || ''} onValueChange={onChange}>
          <SelectTrigger className="flex-1 bg-zinc-800 border-none text-white hover:bg-zinc-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-l-md">
            <SelectValue placeholder="Select option..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {property.options.map((option) => (
              <SelectItem key={option} value={option} className="text-white hover:bg-zinc-700 focus:bg-zinc-700">
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
