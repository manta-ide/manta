'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { authClient } from '@/lib/auth-client';

interface SignUpFormProps {
  onSuccess?: () => void;
}

export default function SignUpForm({ onSuccess }: SignUpFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { refreshSession } = useAuth();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (error) {
        toast.error(error.message || 'Sign up failed');
      } else {
        // Refresh the session in context after successful sign up
        await refreshSession();
        
        // Create sandbox for new user
        try {
          const sandboxResponse = await fetch('/api/sandbox/init', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (sandboxResponse.ok) {
            const sandboxData = await sandboxResponse.json();
            toast.success('Account created and development environment ready!');
            console.log('Sandbox created for new user:', sandboxData.sandbox);
          } else {
            // Don't fail the signup if sandbox creation fails
            console.warn('Sandbox creation failed, but user was created successfully');
            toast.success('Account created successfully! (Development environment will be set up shortly)');
          }
        } catch (sandboxError) {
          console.warn('Sandbox creation error:', sandboxError);
          toast.success('Account created successfully! (Development environment will be set up shortly)');
        }
        
        onSuccess?.();
      }
    } catch (err) {
      console.error('Sign up error:', err);
      toast.error('An error occurred during sign up');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </Button>
        </form>
      </div>
  );
} 