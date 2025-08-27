'use client';

import React, { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface BasePropertyEditorProps {
  title: string;
  children: ReactNode;
  value?: any;
  showValue?: boolean;
  className?: string;
}

export default function BasePropertyEditor({ 
  title, 
  children, 
  value, 
  showValue = false, 
  className = '' 
}: BasePropertyEditorProps) {
  return (
    <div className={`flex flex-col gap-2 py-1 ${className}`}>
      <Label className="text-xs font-medium text-zinc-300">
        {title}
      </Label>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
