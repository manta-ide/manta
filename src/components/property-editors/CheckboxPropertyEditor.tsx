'use client';

import React, { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';

interface CheckboxPropertyEditorProps {
  property: Property & { type: 'checkbox' };
  onChange: (value: boolean) => void;
}

export default function CheckboxPropertyEditor({ property, onChange }: CheckboxPropertyEditorProps) {
  const id = useId();
  const value = Boolean(property.value) || false;

  return (
    <div className="flex flex-col gap-2 py-2">
      <Label
        htmlFor={id}
        className="text-sm font-bold text-white"
      >
        {property.title}
      </Label>
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value}
          onCheckedChange={onChange}
        />
        <Label htmlFor={id} className="text-sm font-bold text-white">
          {property.title}
        </Label>
      </div>
    </div>
  );
}
