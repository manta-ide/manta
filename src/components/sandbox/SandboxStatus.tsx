'use client';

import { useState } from 'react';
import { useSandbox } from '@/hooks/useSandbox';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, RefreshCw, ExternalLink } from 'lucide-react';

export default function SandboxStatus() {
  const { user } = useAuth();
  const { sandbox, isLoading, error, initializeSandbox, refreshSandbox, hasSandbox } = useSandbox();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  if (!user) {
    return null;
  }

  const handleInitialize = async () => {
    setIsInitializing(true);
    setIsNewUser(true);
    try {
      await initializeSandbox();
      setIsNewUser(false);
    } catch (err) {
      // Error is already handled in the hook
      setIsNewUser(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'standby': return 'bg-yellow-500';
      case 'stopped': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Development Sandbox
        </CardTitle>
        <CardDescription>
          Your personal coding environment powered by Blaxel
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading sandbox information...</span>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm">
            Error: {error}
          </div>
        )}

        {!hasSandbox && !isLoading && !error && (
          <div className="space-y-4">
            <div className="text-center">
              {isNewUser ? (
                <div className="space-y-2">
                  <div className="text-blue-600 font-medium">Welcome to Manta! 🎉</div>
                  <p className="text-gray-600 text-sm">
                    Setting up your personal development environment...
                  </p>
                </div>
              ) : (
                <p className="text-gray-600">
                  No sandbox found. Initialize your development environment to get started.
                </p>
              )}
            </div>
            <Button 
              onClick={handleInitialize} 
              disabled={isInitializing}
              className="w-full"
            >
              {isInitializing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isNewUser ? 'Creating Your Sandbox...' : 'Initializing Sandbox...'}
                </>
              ) : (
                'Initialize Sandbox'
              )}
            </Button>
          </div>
        )}

        {sandbox && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(sandbox.status)}`} />
                  <Badge variant="outline" className="capitalize">
                    {sandbox.status}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Created</label>
                <p className="text-sm text-gray-600 mt-1">
                  {new Date(sandbox.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Sandbox ID</label>
              <p className="text-sm text-gray-600 mt-1 font-mono">
                {sandbox.sandboxId}
              </p>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={refreshSandbox}
                disabled={isLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              
              {sandbox.sandboxUrl && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.open(sandbox.sandboxUrl, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Sandbox
                </Button>
              )}
            </div>

            <div className="text-xs text-gray-500">
              <p>
                <strong>MCP Server:</strong> {sandbox.mcpServerUrl}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
