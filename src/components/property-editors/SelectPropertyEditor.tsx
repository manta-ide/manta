'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PropertyValue } from '@/app/api/lib/schemas';

type SelectProperty = Extract<PropertyValue, { type: 'select' }>;

interface SelectPropertyEditorProps {
  property: SelectProperty;
  onChange: (value: string) => void;
}

export default function SelectPropertyEditor({ property, onChange }: SelectPropertyEditorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-zinc-400">Select</Label>
      <Select value={property.value} onValueChange={onChange}>
        <SelectTrigger className="w-full text-xs bg-zinc-800 border border-zinc-700">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border border-zinc-700">
          {property.options.map((option) => (
            <SelectItem key={option} value={option} className="text-white hover:bg-zinc-700">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
