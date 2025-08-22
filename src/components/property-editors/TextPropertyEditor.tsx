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
        className="w-full"
      />
    </div>
  );
}
