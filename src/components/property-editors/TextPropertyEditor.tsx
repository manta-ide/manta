'use client';

import React from 'react';
import { Input } from "react-aria-components";
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface TextPropertyEditorProps {
  property: Property & { type: 'string' };
  onChange: (value: string) => void;
}

export default function TextPropertyEditor({ property, onChange }: TextPropertyEditorProps) {
  const value = property.value as string || '';

  return (
    <BasePropertyEditor title={property.title}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-zinc-700 bg-zinc-800 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 h-7 w-full px-2 py-1 rounded border text-xs transition-[color,box-shadow] data-disabled:opacity-50"
        placeholder="Enter value..."
      />
    </BasePropertyEditor>
  );
}
