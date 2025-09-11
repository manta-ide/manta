'use client';

import React from 'react';
import { Property } from '@/app/api/lib/schemas';
import ColorPropertyEditor from './ColorPropertyEditor';
import SelectPropertyEditor from './SelectPropertyEditor';
import TextPropertyEditor from './TextPropertyEditor';
import NumberPropertyEditor from './NumberPropertyEditor';
import BooleanPropertyEditor from './BooleanPropertyEditor';
import CheckboxPropertyEditor from './CheckboxPropertyEditor';
import RadioPropertyEditor from './RadioPropertyEditor';
import SliderPropertyEditor from './SliderPropertyEditor';
import ObjectPropertyEditor from './ObjectPropertyEditor';
import ObjectListPropertyEditor from './ObjectListPropertyEditor';
import TextAreaPropertyEditor from './TextAreaPropertyEditor';
import FontPropertyEditor from './FontPropertyEditor';

interface PropertyEditorProps {
  property: Property;
  onChange: (propertyId: string, value: any) => void;
  onPreview?: (propertyId: string, value: any) => void;
}

export default function PropertyEditor({ property, onChange, onPreview }: PropertyEditorProps) {
  const handleChange = (value: any) => {
    onChange(property.id, value);
  };
  const handlePreview = (value: any) => {
    onPreview?.(property.id, value);
  };

  switch (property.type) {
    case 'font':
      return (
        <FontPropertyEditor
          property={property as Property & { type: 'font' }}
          onChange={handleChange}
          onPreview={handlePreview}
        />
      );
    case 'textarea':
      return (
        <TextAreaPropertyEditor
          property={property as Property & { type: 'textarea' }}
          onChange={handleChange}
        />
      );
    case 'object':
      return (
        <ObjectPropertyEditor
          property={property as Property & { type: 'object' }}
          onChange={handleChange}
        />
      );
    case 'object-list':
      return (
        <ObjectListPropertyEditor
          property={property as Property & { type: 'object-list' }}
          onChange={handleChange}
        />
      );
    case 'color':
      return (
        <ColorPropertyEditor
          property={property as Property & { type: 'color' }}
          onChange={handleChange}
        />
      );
    case 'select': {
      // Narrow property to include options to satisfy the editor props
      const p = property as Property & { type: 'select'; options: string[] };
      return (
        <SelectPropertyEditor
          property={p}
          onChange={handleChange}
          onPreview={handlePreview}
        />
      );
    }
    case 'text':
      return (
        <TextPropertyEditor
          property={property as Property & { type: 'text' }}
          onChange={handleChange}
        />
      );
    case 'string':
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
    case 'boolean':
      return (
        <BooleanPropertyEditor
          property={property as Property & { type: 'boolean' }}
          onChange={handleChange}
        />
      );
    case 'checkbox':
      return (
        <CheckboxPropertyEditor
          property={property as Property & { type: 'checkbox' }}
          onChange={handleChange}
        />
      );
    case 'radio':
      return (
        <RadioPropertyEditor
          property={property as Property & { type: 'radio'; options: string[] }}
          onChange={handleChange}
        />
      );
    case 'slider':
      return (
        <SliderPropertyEditor
          property={property as Property & { type: 'slider' }}
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
