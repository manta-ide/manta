'use client';

import { useState } from 'react';
import AuthModal from '@/components/auth/AuthModal';

export default function SignInPage() {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-900">
      <AuthModal isOpen={open} onClose={() => setOpen(false)} defaultTab="signin" />
    </div>
  );
}


