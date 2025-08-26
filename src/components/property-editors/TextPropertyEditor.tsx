'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface TextPropertyEditorProps {
  property: Property & { type: 'text' };
  onChange: (value: string) => void;
}

export default function TextPropertyEditor({ property, onChange }: TextPropertyEditorProps) {
  return (
    <BasePropertyEditor title={property.title}>
      <Input
        type="text"
        value={property.value as string || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter text..."
        maxLength={property.maxLength}
        className="border-zinc-700 bg-zinc-800 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 h-7 w-full rounded !text-xs px-2 py-1 transition-all [&::placeholder]:text-xs selection:bg-blue-500 selection:text-white"
      />
    </BasePropertyEditor>
  );
}
