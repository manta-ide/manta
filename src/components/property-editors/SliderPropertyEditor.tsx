'use client';

import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface SliderPropertyEditorProps {
  property: Property & { type: 'slider' };
  onChange: (value: number[]) => void;
}

export default function SliderPropertyEditor({ property, onChange }: SliderPropertyEditorProps) {
  const value = Array.isArray(property.value)
    ? property.value.map((v: number) => typeof v === 'number' ? v : Number(v) || 50)
    : [typeof property.value === 'number' ? property.value : 50]; // Default to 50 if no valid value

  return (
    <BasePropertyEditor title={property.title}>
      <div className="w-full px-1">
        <Slider
          value={value}
          onValueChange={onChange}
          min={property.min || 0}
          max={property.max || 100}
          step={property.step || 1}
          aria-label={property.title}
          className="[&_[data-slot=slider-track]]:bg-zinc-700 [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3"
        />
      </div>
    </BasePropertyEditor>
  );
}
