'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Property } from '@/app/api/lib/schemas';
import ColorPropertyEditor from './ColorPropertyEditor';
import SelectPropertyEditor from './SelectPropertyEditor';
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
  onBackendUpdate?: (propertyId: string, value: any) => Promise<void>;
  disabled?: boolean;
}

export default function PropertyEditor({ property, onChange, onPreview, onBackendUpdate, disabled = false }: PropertyEditorProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdate = useRef<number>(0);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = useCallback((value: any) => {
    // Call immediate onChange for UI responsiveness
    onChange(property.id, value);

    // Handle backend updates with debouncing if onBackendUpdate is provided
    if (onBackendUpdate) {
      // Check if this is a high-frequency property type
      const isHighFrequency = ['color', 'slider', 'number'].includes(property.type);
      const debounceDelay = isHighFrequency ? 500 : 250;

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // For high-frequency updates, also throttle immediate backend calls
      if (isHighFrequency) {
        const now = Date.now();
        if (now - lastUpdate.current >= 200) {
          lastUpdate.current = now;
          onBackendUpdate(property.id, value).catch(console.error);
        }
      }

      // Set debounced update
      debounceTimeoutRef.current = setTimeout(async () => {
        setIsUpdating(true);
        try {
          await onBackendUpdate(property.id, value);
        } catch (error) {
          console.error('Failed to update property:', error);
        } finally {
          setIsUpdating(false);
        }
      }, debounceDelay);
    }
  }, [property.id, property.type, onChange, onBackendUpdate]);

  const handlePreview = useCallback((value: any) => {
    onPreview?.(property.id, value);
  }, [property.id, onPreview]);

  const renderPropertyEditor = () => {
    switch (property.type) {
      case 'font':
        return (
          <FontPropertyEditor
            property={property as Property & { type: 'font' }}
            onChange={handleChange}
            onPreview={handlePreview}
            disabled={disabled}
          />
        );
      case 'text':
        return (
          <TextAreaPropertyEditor
            property={property as Property & { type: 'text' }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'object':
        return (
          <ObjectPropertyEditor
            property={property as Property & { type: 'object' }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'object-list':
        return (
          <ObjectListPropertyEditor
            property={property as Property & { type: 'object-list' }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'color':
        return (
          <ColorPropertyEditor
            property={property as Property & { type: 'color' }}
            onChange={handleChange}
            disabled={disabled}
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
            disabled={disabled}
          />
        );
      }
      case 'number':
        return (
          <NumberPropertyEditor
            property={property as Property & { type: 'number' }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'boolean':
        return (
          <BooleanPropertyEditor
            property={property as Property & { type: 'boolean' }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'checkbox':
        return (
          <CheckboxPropertyEditor
            property={property as Property & { type: 'checkbox'; options?: string[] }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'radio':
        return (
          <RadioPropertyEditor
            property={property as Property & { type: 'radio'; options: string[] }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      case 'slider':
        return (
          <SliderPropertyEditor
            property={property as Property & { type: 'slider' }}
            onChange={handleChange}
            disabled={disabled}
          />
        );
      default:
        return (
          <div className="text-xs text-zinc-500">
            Editor not implemented for type: {property.type}
          </div>
        );
    }
  };

  return (
    <div className={`relative ${isUpdating ? 'opacity-80' : ''}`}>
      {renderPropertyEditor()}
      {isUpdating && (
        <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
      )}
    </div>
  );
}
