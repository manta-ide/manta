'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PropertyValue } from '@/app/api/lib/schemas';

type ColorProperty = Extract<PropertyValue, { type: 'color' }>;

interface ColorPropertyEditorProps {
  property: ColorProperty;
  onChange: (value: string) => void;
}

export default function ColorPropertyEditor({ property, onChange }: ColorPropertyEditorProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-zinc-400">Color</Label>
      <div className="flex gap-2">
        <Input
          type="color"
          value={property.value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-8 p-1 border border-zinc-700 bg-zinc-800"
        />
        <Input
          type="text"
          value={property.value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 text-xs bg-zinc-800 border border-zinc-700"
        />
      </div>
    </div>
  );
}
