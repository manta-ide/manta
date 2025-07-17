'use client';

import { useCodeStore } from '@/lib/store';
import { LiveProvider, LivePreview, LiveError } from 'react-live';

export default function EditableComponent() {
  const { code } = useCodeStore();

  return (
    <LiveProvider code={code}>
      <LivePreview className="react-live-preview w-full h-full p-4" />
      <LiveError className="absolute bottom-0 left-0 w-full p-2 bg-red-500 text-white" />
    </LiveProvider>
  );
} 