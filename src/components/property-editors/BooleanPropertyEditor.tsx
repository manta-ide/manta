'use client';

import React, { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';

interface BooleanPropertyEditorProps {
  property: Property & { type: 'boolean' };
  onChange: (value: boolean) => void;
}

export default function BooleanPropertyEditor({ property, onChange }: BooleanPropertyEditorProps) {
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
      <div
        className="group flex items-center gap-2"
        data-state={value ? "checked" : "unchecked"}
      >
        <span
          id={`${id}-off`}
          className="group-data-[state=checked]:text-zinc-500 cursor-pointer text-right text-sm font-medium text-white min-w-[24px]"
          aria-controls={id}
          onClick={() => onChange(false)}
        >
          Off
        </span>
        <Switch
          id={id}
          checked={value}
          onCheckedChange={onChange}
          aria-labelledby={`${id}-off ${id}-on`}
          className="data-[state=unchecked]:bg-zinc-700 data-[state=checked]:bg-blue-600"
        />
        <span
          id={`${id}-on`}
          className="group-data-[state=unchecked]:text-zinc-500 cursor-pointer text-left text-sm font-medium text-white min-w-[24px]"
          aria-controls={id}
          onClick={() => onChange(true)}
        >
          On
        </span>
      </div>
    </div>
  );
}
