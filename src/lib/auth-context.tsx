'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from './auth';
import { authClient } from './auth-client';
import { useProjectStore } from './store';
import { useRouter } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  
  // Get store functions
  const connectToGraphEvents = useProjectStore(state => state.connectToGraphEvents);
  const disconnectFromGraphEvents = useProjectStore(state => state.disconnectFromGraphEvents);
  const resetStore = useProjectStore(state => state.resetStore);
  const setGraphLoading = useProjectStore(state => state.setGraphLoading);
  const router = useRouter();

  useEffect(() => {
    // Mark as client-side and initialize auth
    setIsClient(true);
    initializeAuth();
  }, []);

  // Connect to Supabase when user becomes available
  useEffect(() => {
    console.log('🔍 AuthProvider: Effect triggered', {
      userId: user?.id,
      isClient,
      hasUser: !!user,
      userObject: user ? { id: user.id, email: user.email } : null
    });
    
    if ((process.env.NEXT_PUBLIC_LOCAL_MODE === '1') && isClient) {
      // Local mode: no auth, connect and show app
      setGraphLoading(true);
      connectToGraphEvents('local');
      router.replace('/');
    } else if (user?.id && isClient) {
      console.log('🔗 AuthProvider: User authenticated, connecting to Supabase:', user.id);
      // Set loading first, then connect
      setGraphLoading(true);
      connectToGraphEvents(user.id);
      router.replace('/');
    } else if (!user?.id && isClient) {
      console.log('🔌 AuthProvider: User logged out, disconnecting from Supabase');
      disconnectFromGraphEvents();
      resetStore();
      router.replace('/signin');
    } else {
      console.log('⏳ AuthProvider: Waiting for user authentication or client initialization');
    }
    
    return () => {
      // Cleanup on unmount
      if (user?.id) {
        disconnectFromGraphEvents();
      }
    };
  }, [user?.id, isClient, connectToGraphEvents, disconnectFromGraphEvents]);

  // Ensure sandbox exists for the authenticated user; create if missing
  useEffect(() => {
    if ((process.env.NEXT_PUBLIC_LOCAL_MODE === '1')) return; // skip sandbox init in local mode
    if (!user?.id || !isClient) return;
    let cancelled = false;
    (async () => {
      try {
        const check = await fetch('/api/sandbox/init', { method: 'GET', credentials: 'include' });
        const data = await check.json().catch(() => ({}));
        const hasSandbox = !!data?.sandbox;
        const hasPreview = !!data?.sandbox?.previewUrl;
        if (!cancelled && (!check.ok || !hasSandbox || !hasPreview)) {
          await fetch('/api/sandbox/init', { method: 'POST', credentials: 'include' });
        }
      } catch (e) {
        // Non-fatal; user can retry from UI
        console.warn('Sandbox ensure failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isClient]);

  const initializeAuth = async () => {
    try {
      if (process.env.NEXT_PUBLIC_LOCAL_MODE === '1') {
        setUser({ id: 'local', email: 'local@example.com' } as any);
        setSession(null);
        setLoading(false);
        return;
      }
      // Use Better Auth client to get current session
      const { data } = await authClient.getSession();
      
      if (data?.session && data?.user) {
        setUser(data.user as User);
        setSession(data as Session);
        // Sandbox UI and notifications removed; backend init can be triggered elsewhere as needed
      } else {
        // If no session, clear any stale state
        setUser(null);
        setSession(null);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      // Clear state on error
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async () => {
    try {
      const { data } = await authClient.getSession();
      
      if (data?.session && data?.user) {
        setUser(data.user as User);
        setSession(data as Session);
      } else {
        setUser(null);
        setSession(null);
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
      setUser(null);
      setSession(null);
    }
  };

  const signOut = async () => {
    try {
      if (process.env.NEXT_PUBLIC_LOCAL_MODE !== '1') {
        await authClient.signOut();
      }
      setUser(null);
      setSession(null);
      resetStore();
      router.replace('/signin');
    } catch (error) {
      console.error('Error signing out:', error);
      // Clear state even if signout fails
      setUser(null);
      setSession(null);
      resetStore();
      router.replace('/signin');
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading: loading || !isClient, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 
