'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSandbox } from '@/hooks/useSandbox';
import { toast } from 'sonner';
import { CheckCircle, Loader2 } from 'lucide-react';

/**
 * Component that shows a notification when a sandbox is being created for a new user
 * This component monitors sandbox status and shows appropriate notifications
 */
export default function SandboxCreationNotification() {
  const { user } = useAuth();
  const { sandbox, isLoading } = useSandbox();
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasShownWelcome(false);
      setIsCreating(false);
      return;
    }

    // Check if this is a new user without a sandbox
    if (!sandbox && !isLoading && !hasShownWelcome) {
      // Show welcome notification for new users
      setIsCreating(true);
      toast.info(
        'Welcome to Manta! Setting up your development environment...',
        {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          duration: 4000,
        }
      );
      setHasShownWelcome(true);
    }

    // Show success notification when sandbox is ready
    if (sandbox && isCreating) {
      toast.success(
        'Your development environment is ready! 🚀',
        {
          icon: <CheckCircle className="h-4 w-4" />,
          duration: 5000,
          description: 'You can now access your personal sandbox from the sidebar.',
        }
      );
      setIsCreating(false);
    }
  }, [user, sandbox, isLoading, hasShownWelcome, isCreating]);

  // This component doesn't render anything visible - it only manages notifications
  return null;
}

