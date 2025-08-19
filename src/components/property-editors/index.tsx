'use client';

import React from 'react';
import { Property } from '@/app/api/lib/schemas';
import ColorPropertyEditor from './ColorPropertyEditor';
import SelectPropertyEditor from './SelectPropertyEditor';
import TextPropertyEditor from './TextPropertyEditor';
import NumberPropertyEditor from './NumberPropertyEditor';

interface PropertyEditorProps {
  property: Property;
  onChange: (propertyId: string, value: any) => void;
}

export default function PropertyEditor({ property, onChange }: PropertyEditorProps) {
  const handleChange = (value: any) => {
    onChange(property.id, value);
  };

  switch (property.type) {
    case 'color':
      return (
        <ColorPropertyEditor
          property={property as Property & { type: 'color' }}
          onChange={handleChange}
        />
      );
    case 'select':
      return (
        <SelectPropertyEditor
          property={property as Property & { type: 'select'; options: string[] }}
          onChange={handleChange}
        />
      );
    case 'text':
      return (
        <TextPropertyEditor
          property={property as Property & { type: 'text' }}
          onChange={handleChange}
        />
      );
    case 'number':
      return (
        <NumberPropertyEditor
          property={property as Property & { type: 'number' }}
          onChange={handleChange}
        />
      );
    default:
      return (
        <div className="text-xs text-zinc-500">
          Editor not implemented for type: {property.type}
        </div>
      );
  }
}
