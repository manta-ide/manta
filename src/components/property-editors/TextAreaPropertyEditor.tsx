'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface TextAreaPropertyEditorProps {
  property: Property & { type: 'text' };
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function TextAreaPropertyEditor({ property, onChange, disabled = false }: TextAreaPropertyEditorProps) {
  const value = (property.value as string) || '';
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [wasMultiline, setWasMultiline] = useState<boolean | null>(null);

  // Detect if text would visually wrap to multiple lines in input field
  const detectMultiline = (text: string): boolean => {
    if (!text.trim()) return false;

    // Check for actual line breaks first
    const hasLineBreaks = /\r\n|\r|\n/.test(text);

    // If there are line breaks, definitely multiline
    if (hasLineBreaks) return true;

    // For single lines, check if text length would cause visual wrapping
    // Assuming input field width of ~300px and ~8px per character, ~35-40 chars fit
    // Using 50 as conservative threshold to account for variable character widths
    return text.length > 25;
  };

  const isMultiline = detectMultiline(value);

  // Preserve focus and cursor position when switching between input types
  useEffect(() => {
    if (wasMultiline !== null && wasMultiline !== isMultiline && inputRef.current) {
      // Component type changed, restore focus and position cursor at end
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Position cursor at the end of the text
          const length = inputRef.current.value.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 0);
    }
    setWasMultiline(isMultiline);
  }, [isMultiline, wasMultiline]);

  return (
    <BasePropertyEditor title={property.title}>
      {isMultiline ? (
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text..."
          maxLength={property.maxLength}
          className="w-full h-24 !text-xs bg-zinc-800 border-zinc-700 text-white leading-relaxed focus:border-blue-500/50 focus:ring-blue-500/50"
          readOnly={disabled}
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text..."
          maxLength={property.maxLength}
          className="w-full !text-xs bg-zinc-800 border-zinc-700 text-white focus:border-blue-500/50 focus:ring-blue-500/50 font-medium leading-tight"
          readOnly={disabled}
        />
      )}
    </BasePropertyEditor>
  );
}

