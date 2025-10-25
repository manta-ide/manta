'use client';

import React, { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface CheckboxPropertyEditorProps {
  property: Property & { type: 'checkbox' };
  onChange: (value: boolean | string[]) => void;
  disabled?: boolean;
}

export default function CheckboxPropertyEditor({ property, onChange, disabled = false }: CheckboxPropertyEditorProps) {
  const id = useId();

  // If options are provided, treat as multi-select checkbox group
  if (Array.isArray(property.options) && property.options.length > 0) {
    const selectedValues = Array.isArray(property.value) ? property.value as string[] : [];

    const handleOptionChange = (option: string, checked: boolean) => {
      let newSelected: string[];
      if (checked) {
        newSelected = [...selectedValues, option];
      } else {
        newSelected = selectedValues.filter(v => v !== option);
      }
      onChange(newSelected);
    };

    return (
      <BasePropertyEditor title={property.title}>
        <div className="space-y-1">
          {property.options.map((option: string, index: number) => (
            <div key={option} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${index}`}
                checked={selectedValues.includes(option)}
                onCheckedChange={(checked) => handleOptionChange(option, checked as boolean)}
                className="scale-75"
                disabled={disabled}
              />
              <Label htmlFor={`${id}-${index}`} className="text-xs text-zinc-300">
                {option}
              </Label>
            </div>
          ))}
        </div>
      </BasePropertyEditor>
    );
  }

  // Single checkbox for boolean values
  const value = Boolean(property.value) || false;

  return (
    <BasePropertyEditor title={property.title}>
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={value}
          onCheckedChange={(checked) => onChange(Boolean(checked))}
          className="scale-75"
          disabled={disabled}
        />
        <Label htmlFor={id} className="text-xs text-zinc-300">
          {property.title}
        </Label>
      </div>
    </BasePropertyEditor>
  );
}
