'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Folder, Code, Edit3, Eye, Monitor, BarChart3, User, LogOut, Network } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import AuthModal from '@/components/auth/AuthModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
// Remove SandboxService import - using direct API calls now

interface TopBarProps {
  panels: {
    files: boolean;
    editor: boolean;
    viewer: boolean;
    graph: boolean;
  };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
}

export default function TopBar({ panels, onTogglePanel, isEditMode, setIsEditMode}: TopBarProps) {
  const switchId = useId();
  const { user, signOut, loading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  // Helper function to call Blaxel API
  const callBlaxelAPI = async (action: string, params: any = {}) => {
    const response = await fetch('/api/blaxel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  };

  const handleConnectSandbox = async () => {
    try {
      setIsLoading(true);
      const result = await callBlaxelAPI('connect');
      setIsConnected(result.success);
      console.log('Sandbox connection:', result);
    } catch (error) {
      console.error('Error connecting to sandbox:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateFile = async () => {
    try {
      setIsLoading(true);
      const content = `// Updated at ${new Date().toISOString()}\nconsole.log("Hello from updated file!");`;
      const result = await callBlaxelAPI('writeFile', {
        path: '/test.js',
        content,
      });
      console.log('File update result:', result);
    } catch (error) {
      console.error('Error updating file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReadFile = async () => {
    try {
      setIsLoading(true);
      const result = await callBlaxelAPI('readFile', {
        path: '/test.js',
      });
      console.log('File content:', result.content);
    } catch (error) {
      console.error('Error reading file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFile = async () => {
    try {
      setIsLoading(true);
      const result = await callBlaxelAPI('deleteFile', {
        path: '/test.js',
      });
      console.log('File delete result:', result);
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-3">
      <div className="flex items-center gap-2 mb-3">
        <Button
          onClick={handleConnectSandbox}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isLoading ? 'Connecting...' : 'Connect Sandbox'}
        </Button>
        <Button
          onClick={handleUpdateFile}
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {isLoading ? 'Updating...' : 'Update File'}
        </Button>
        <Button
          onClick={handleReadFile}
          disabled={isLoading}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          {isLoading ? 'Reading...' : 'Read File'}
        </Button>
        <Button
          onClick={handleDeleteFile}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {isLoading ? 'Deleting...' : 'Delete File'}
        </Button>
        {isConnected && (
          <span className="text-green-400 text-sm">
            ✓ Connected to Blaxel
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        {/* Left side - App title */}
        <div className="flex items-center">
        </div>

        {/* Right side - Controls and Auth */}
        <div className="flex items-center gap-3">
          {/* Edit/Preview Switch */}
          <div className="flex items-center gap-2">
            <div className="relative inline-grid h-9 grid-cols-[1fr_1fr] items-center text-sm font-medium">
              <Switch
                id={switchId}
                checked={isEditMode}
                onCheckedChange={setIsEditMode}
                className="peer data-[state=checked]:bg-transparent data-[state=unchecked]:bg-transparent absolute inset-0 h-[inherit] w-auto border border-zinc-600 [&_span]:h-full [&_span]:w-1/2 [&_span]:rounded-full [&_span]:bg-zinc-700 [&_span]:shadow-none [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full"
              />
              <span className="peer-data-[state=checked]:text-zinc-400 pointer-events-none relative ms-0.5 flex min-w-8 items-center justify-center text-center text-white">
                <Eye size={16} aria-hidden="true" />
              </span>
              <span className="peer-data-[state=unchecked]:text-zinc-400 pointer-events-none relative me-0.5 flex min-w-8 items-center justify-center text-center text-zinc-400 peer-data-[state=checked]:text-white">
                <Edit3 size={16} aria-hidden="true" />
              </span>
            </div>
            <Label htmlFor={switchId} className="sr-only">
              Edit/Preview mode toggle
            </Label>


          </div>

          {/* Panel Toggle Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant={panels.files ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('files')}
              className={panels.files
                ? "bg-zinc-700 text-white border-0"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Folder className="w-4 h-4" />
            </Button>

            <Button
              variant={panels.editor ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('editor')}
              className={panels.editor
                ? "bg-zinc-700 text-white border-0"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Code className="w-4 h-4" />
            </Button>

            <Button
              variant={panels.viewer ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('viewer')}
              className={panels.viewer
                ? "bg-zinc-700 text-white border-0"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Monitor className="w-4 h-4" />
            </Button>



            <Button
              variant={panels.graph ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('graph')}
              className={panels.graph
                ? "bg-zinc-700 text-white border-0"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <Network className="w-4 h-4" />
            </Button>
          </div>

          {/* Authentication Section */}
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-white animate-spin"></div>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>{user.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-white">{user.name || user.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2">
                    <LogOut size={16} /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" onClick={() => setIsAuthModalOpen(true)}>
                <User className="mr-2 h-4 w-4" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </header>
  );
} 