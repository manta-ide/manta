'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface TextAreaPropertyEditorProps {
  property: Property & { type: 'textarea' };
  onChange: (value: string) => void;
}

export default function TextAreaPropertyEditor({ property, onChange }: TextAreaPropertyEditorProps) {
  return (
    <BasePropertyEditor title={property.title}>
      <Textarea
        value={(property.value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter text..."
        maxLength={property.maxLength}
        className="border-zinc-700 bg-zinc-800 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 w-full rounded !text-xs px-2 py-1.5 min-h-16 selection:bg-blue-500 selection:text-white"
      />
    </BasePropertyEditor>
  );
}

