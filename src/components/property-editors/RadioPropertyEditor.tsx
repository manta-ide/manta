'use client';

import React, { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface RadioPropertyEditorProps {
  property: Property & { type: 'radio'; options: string[] };
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function RadioPropertyEditor({ property, onChange, disabled = false }: RadioPropertyEditorProps) {
  const id = useId();
  const value = property.value as string || '';

  return (
    <BasePropertyEditor title={property.title}>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="w-full space-y-1"
        disabled={disabled}
      >
        {property.options.map((option: string, index: number) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem
              value={option}
              id={`${id}-${index}`}
              className="scale-75"
            />
            <Label htmlFor={`${id}-${index}`} className="text-xs text-zinc-300">
              {option}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </BasePropertyEditor>
  );
}
