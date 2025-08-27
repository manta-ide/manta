'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { UserSandboxInfo } from '@/lib/sandbox-service';
import { toast } from 'sonner';

export function useSandbox() {
  const { user } = useAuth();
  const [sandbox, setSandbox] = useState<UserSandboxInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sandbox info when user is available
  useEffect(() => {
    if (user) {
      loadSandboxInfo();
    } else {
      setSandbox(null);
    }
  }, [user]);

  const loadSandboxInfo = async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sandbox/init', {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load sandbox info');
      }

      setSandbox(data.sandbox);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to load sandbox info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeSandbox = async () => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sandbox/init', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize sandbox');
      }

      setSandbox(data.sandbox);
      toast.success('Sandbox initialized successfully!');
      return data.sandbox;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error(`Failed to initialize sandbox: ${errorMessage}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    sandbox,
    isLoading,
    error,
    initializeSandbox,
    refreshSandbox: loadSandboxInfo,
    hasSandbox: !!sandbox
  };
}

