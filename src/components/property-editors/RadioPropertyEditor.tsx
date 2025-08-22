'use client';

import React, { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Property } from '@/app/api/lib/schemas';

interface RadioPropertyEditorProps {
  property: Property & { type: 'radio'; options: string[] };
  onChange: (value: string) => void;
}

export default function RadioPropertyEditor({ property, onChange }: RadioPropertyEditorProps) {
  const id = useId();
  const value = property.value as string || '';

  return (
    <div className="flex flex-col gap-2 py-2">
      <Label className="text-sm font-bold text-white">
        {property.title}
      </Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="w-full"
      >
        {property.options.map((option, index) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem
              value={option}
              id={`${id}-${index}`}
            />
            <Label htmlFor={`${id}-${index}`} className="text-sm font-bold text-white">
              {option}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
