'use client';

import React from 'react';
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button, Group, Input, Label, NumberField } from "react-aria-components";
import { Property } from '@/app/api/lib/schemas';

interface NumberPropertyEditorProps {
  property: Property & { type: 'number' };
  onChange: (value: number) => void;
}

export default function NumberPropertyEditor({ property, onChange }: NumberPropertyEditorProps) {
  const value = property.value as number || 0;

  return (
    <div className="flex flex-col gap-2 py-2">
      <Label className="text-sm font-bold text-white">
        {property.title}
      </Label>
      <NumberField
        value={value}
        onChange={onChange}
        minValue={property.min}
        maxValue={property.max}
        step={property.step}
      >
        <Group className="border-zinc-700 bg-zinc-800 text-white outline-none data-focus-within:border-blue-500 data-focus-within:ring-blue-500/50 data-focus-within:has-aria-invalid:ring-red-500/20 data-focus-within:has-aria-invalid:border-red-500 relative inline-flex h-9 w-full items-center overflow-hidden rounded-md border text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] data-disabled:opacity-50 data-focus-within:ring-[3px]">
          <Input className="bg-zinc-800 text-white flex-1 px-3 py-2 tabular-nums" />
          <div className="flex h-[calc(100%+2px)] flex-col">
            <Button
              slot="increment"
              className="border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white -me-px flex h-1/2 w-6 flex-1 items-center justify-center border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronUpIcon size={12} aria-hidden="true" />
            </Button>
            <Button
              slot="decrement"
              className="border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white -me-px -mt-px flex h-1/2 w-6 flex-1 items-center justify-center border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronDownIcon size={12} aria-hidden="true" />
            </Button>
          </div>
        </Group>
      </NumberField>
    </div>
  );
}
