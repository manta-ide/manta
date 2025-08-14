'use client';

import React from 'react';
import { Property, PropertyValue } from '@/app/api/lib/schemas';
import ColorPropertyEditor from './ColorPropertyEditor';
import SelectPropertyEditor from './SelectPropertyEditor';

interface PropertyEditorProps {
  property: Property;
  onChange: (propertyId: string, value: any) => void;
}

export default function PropertyEditor({ property, onChange }: PropertyEditorProps) {
  const handleChange = (value: any) => {
    onChange(property.id, value);
  };

  switch (property.propertyType.type) {
    case 'color':
      return (
        <ColorPropertyEditor
          property={property.propertyType}
          onChange={handleChange}
        />
      );
    case 'select':
      return (
        <SelectPropertyEditor
          property={property.propertyType}
          onChange={handleChange}
        />
      );
    default:
      return (
        <div className="text-xs text-zinc-500">
          Editor not implemented for type: {property.propertyType.type}
        </div>
      );
  }
}
