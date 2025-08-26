'use client';

import React, { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface CheckboxPropertyEditorProps {
  property: Property & { type: 'checkbox' };
  onChange: (value: boolean) => void;
}

export default function CheckboxPropertyEditor({ property, onChange }: CheckboxPropertyEditorProps) {
  const id = useId();
  const value = Boolean(property.value) || false;

  return (
    <BasePropertyEditor title={property.title}>
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value}
          onCheckedChange={onChange}
          className="scale-75"
        />
        <Label htmlFor={id} className="text-xs text-zinc-300">
          {property.title}
        </Label>
      </div>
    </BasePropertyEditor>
  );
}
