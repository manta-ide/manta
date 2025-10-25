'use client';

import React from 'react';
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button, Group, Input, NumberField } from "react-aria-components";
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface NumberPropertyEditorProps {
  property: Property & { type: 'number' };
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function NumberPropertyEditor({ property, onChange, disabled = false }: NumberPropertyEditorProps) {
  const value = property.value as number || 0;

  return (
    <BasePropertyEditor title={property.title}>
      <NumberField
        value={value}
        onChange={onChange}
        minValue={property.min}
        maxValue={property.max}
        step={property.step}
        isDisabled={disabled}
      >
        <Group className="border-zinc-700 bg-zinc-800 text-white outline-none data-focus-within:border-blue-500 data-focus-within:ring-1 data-focus-within:ring-blue-500/50 relative inline-flex h-7 w-full items-center overflow-hidden rounded border text-xs whitespace-nowrap transition-[color,box-shadow] data-disabled:opacity-50">
          <Input className="bg-zinc-800 text-white flex-1 px-2 py-1 tabular-nums !text-xs" />
          <div className="flex h-[calc(100%+2px)] flex-col">
            <Button
              slot="increment"
              className="border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white -me-px flex h-1/2 w-5 flex-1 items-center justify-center border text-xs transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronUpIcon size={10} aria-hidden="true" />
            </Button>
            <Button
              slot="decrement"
              className="border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white -me-px -mt-px flex h-1/2 w-5 flex-1 items-center justify-center border text-xs transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronDownIcon size={10} aria-hidden="true" />
            </Button>
          </div>
        </Group>
      </NumberField>
    </BasePropertyEditor>
  );
}
