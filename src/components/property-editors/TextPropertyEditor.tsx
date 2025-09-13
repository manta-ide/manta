'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface TextPropertyEditorProps {
  property: Property & { type: 'text' };
  onChange: (value: string) => void;
}

export default function TextPropertyEditor({ property, onChange }: TextPropertyEditorProps) {
  const val = (property.value as string) || '';
  const [isMultiline, setIsMultiline] = useState(false);
  const measureRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const prevIsMultiline = useRef<boolean>(false);

  // Measure overflow using a hidden input with the same width/styles
  useEffect(() => {
    const checkOverflow = () => {
      const el = measureRef.current;
      if (!el) return;
      // Force the value for measurement
      el.value = val;
      // If content's scroll width exceeds visible width, treat as overflow
      const overflowing = el.scrollWidth > el.clientWidth;
      setIsMultiline(overflowing);
    };
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [val]);

  // Keep focus and caret when switching between input/textarea
  useEffect(() => {
    if (prevIsMultiline.current !== isMultiline) {
      const end = val.length;
      if (isMultiline) {
        // Moved to textarea
        const ta = textareaRef.current;
        if (ta) {
          // Delay to allow element to mount before focusing
          setTimeout(() => {
            ta.focus();
            try { ta.setSelectionRange(end, end); } catch {}
          }, 0);
        }
      } else {
        // Back to input
        const inp = inputRef.current;
        if (inp) {
          setTimeout(() => {
            inp.focus();
            try { inp.setSelectionRange(end, end); } catch {}
          }, 0);
        }
      }
      prevIsMultiline.current = isMultiline;
    }
  }, [isMultiline, val.length]);

  return (
    <BasePropertyEditor title={property.title}>
      <div className="relative w-full">
        {isMultiline ? (
          <Textarea
            ref={textareaRef}
            value={val}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter text..."
            maxLength={property.maxLength}
            rows={2}
            className="w-full !text-xs bg-zinc-800 border-zinc-700 text-white leading-relaxed focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 selection:bg-blue-500 selection:text-white"
          />
        ) : (
          <Input
            ref={inputRef}
            type="text"
            value={val}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter text..."
            maxLength={property.maxLength}
            className="border-zinc-700 bg-zinc-800 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 h-7 w-full rounded !text-xs px-2 py-1 transition-all [&::placeholder]:text-xs selection:bg-blue-500 selection:text-white"
          />
        )}
        {/* Hidden measurer to detect horizontal overflow */}
        <input
          ref={measureRef}
          readOnly
          aria-hidden
          className="absolute left-0 top-0 h-0 w-full opacity-0 pointer-events-none border-0 px-2 py-1 text-xs"
        />
      </div>
    </BasePropertyEditor>
  );
}
