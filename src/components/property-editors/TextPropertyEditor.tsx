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
    <div className="space-y-2">
      <Label className="text-xs text-zinc-400">Text</Label>
      <Input
        type="text"
        value={property.value as string || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter text..."
        maxLength={property.maxLength}
        className="text-xs bg-zinc-800 border border-zinc-700"
      />
    </div>
  );
}
