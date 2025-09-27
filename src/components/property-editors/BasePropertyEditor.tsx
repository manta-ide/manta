'use client';

import React, { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface BasePropertyEditorProps {
  title: string;
  children: ReactNode;
  value?: any;
  showValue?: boolean;
  className?: string;
  rightSlot?: ReactNode; // optional action placed on the title row
}

export default function BasePropertyEditor({
  title,
  children,
  value,
  showValue = false,
  className = '',
  rightSlot
}: BasePropertyEditorProps) {
  return (
    <div className={`flex flex-col gap-2 py-1 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-zinc-300">
          {title}
        </Label>
        {rightSlot}
      </div>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
