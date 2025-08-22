'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Property } from '@/app/api/lib/schemas';

interface SliderPropertyEditorProps {
  property: Property & { type: 'slider' };
  onChange: (value: number[]) => void;
}

export default function SliderPropertyEditor({ property, onChange }: SliderPropertyEditorProps) {
  const value = property.value as number[] || [50]; // Default to 50 if no value

  return (
    <div className="flex flex-col gap-2 py-2">
      <Label className="text-sm font-bold text-white">
        {property.title}
      </Label>
      <div className="w-full">
        <Slider
          value={value}
          onValueChange={onChange}
          min={property.min || 0}
          max={property.max || 100}
          step={property.step || 1}
          aria-label={property.title}
        />
      </div>
    </div>
  );
}
