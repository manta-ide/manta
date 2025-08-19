'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';

interface NumberPropertyEditorProps {
  property: Property & { type: 'number' };
  onChange: (value: number) => void;
}

export default function NumberPropertyEditor({ property, onChange }: NumberPropertyEditorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      onChange(value);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-zinc-400">Number</Label>
      <Input
        type="number"
        value={property.value as number || ''}
        onChange={handleChange}
        min={property.min}
        max={property.max}
        step={property.step}
        className="text-xs bg-zinc-800 border border-zinc-700"
      />
    </div>
  );
}
