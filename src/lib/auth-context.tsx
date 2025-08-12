'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from './auth';
import { authClient } from './auth-client';

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

  useEffect(() => {
    // Mark as client-side and initialize auth
    setIsClient(true);
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Use Better Auth client to get current session
      const { data } = await authClient.getSession();
      
      if (data?.session && data?.user) {
        setUser(data.user as User);
        setSession(data as Session);
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
      await authClient.signOut();
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('Error signing out:', error);
      // Clear state even if signout fails
      setUser(null);
      setSession(null);
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