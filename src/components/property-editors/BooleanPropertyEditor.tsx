'use client';

import React, { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface BooleanPropertyEditorProps {
  property: Property & { type: 'boolean' };
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export default function BooleanPropertyEditor({ property, onChange, disabled = false }: BooleanPropertyEditorProps) {
  const id = useId();
  const value = Boolean(property.value) || false;

  return (
    <BasePropertyEditor title={property.title}>
      <div
        className="group flex items-center gap-2"
        data-state={value ? "checked" : "unchecked"}
      >
        <span
          id={`${id}-off`}
          className="group-data-[state=checked]:text-zinc-500 cursor-pointer text-right text-xs font-medium text-white min-w-[20px]"
          aria-controls={id}
          onClick={() => !disabled && onChange(false)}
        >
          Off
        </span>
        <Switch
          id={id}
          checked={value}
          onCheckedChange={onChange}
          aria-labelledby={`${id}-off ${id}-on`}
          className="data-[state=unchecked]:bg-zinc-700 data-[state=checked]:bg-blue-600 scale-75"
          disabled={disabled}
        />
        <span
          id={`${id}-on`}
          className="group-data-[state=unchecked]:text-zinc-500 cursor-pointer text-left text-xs font-medium text-white min-w-[20px]"
          aria-controls={id}
          onClick={() => !disabled && onChange(true)}
        >
          On
        </span>
      </div>
    </BasePropertyEditor>
  );
}
