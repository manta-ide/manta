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
        
        // Initialize sandbox for the user if they don't have one
        try {
          const checkResponse = await fetch('/api/sandbox/init', {
            method: 'GET',
            credentials: 'include'
          });
          
          const checkData = await checkResponse.json();
          
          // If user doesn't have a sandbox, create one automatically
          if (!checkData.sandbox) {
            console.log('No sandbox found for user, creating one...');
            const createResponse = await fetch('/api/sandbox/init', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (createResponse.ok) {
              const createData = await createResponse.json();
              console.log('Sandbox created automatically:', createData.sandbox);
            }
          }
        } catch (error) {
          console.log('Sandbox initialization check failed:', error);
          // Don't block auth flow if sandbox init fails
        }
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
        
        // Check sandbox status after session refresh
        try {
          await fetch('/api/sandbox/init', {
            method: 'GET',
            credentials: 'include'
          });
        } catch (error) {
          console.log('Sandbox status check failed:', error);
        }
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