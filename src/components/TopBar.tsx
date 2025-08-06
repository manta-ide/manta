'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Folder, Code, MessageCircle, Edit3, Eye, Monitor, BarChart3, User, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import AuthModal from '@/components/auth/AuthModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface TopBarProps {
  panels: {
    files: boolean;
    editor: boolean;
    viewer: boolean;
    chat: boolean;
    eval: boolean;
  };
  onTogglePanel: (panel: keyof TopBarProps['panels']) => void;
  isEditMode: boolean;
  setIsEditMode: (isEditMode: boolean) => void;
  onOpenEval: () => void;
}

export default function TopBar({ panels, onTogglePanel, isEditMode, setIsEditMode, onOpenEval }: TopBarProps) {
  const switchId = useId();
  const { user, signOut, loading } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left side - App title */}
        <div className="flex items-center">
          <h1 className="text-lg font-semibold text-white">Manta Editor</h1>
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
              variant={panels.chat ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('chat')}
              className={panels.chat
                ? "bg-zinc-700 text-white border-0"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <MessageCircle className="w-4 h-4" />
            </Button>

            {/* Evaluation Button */}
            <Button
              variant={panels.eval ? "default" : "outline"}
              size="sm"
              onClick={onOpenEval}
              className={panels.eval
                ? "bg-zinc-700 text-white border-0"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
              }
            >
              <BarChart3 className="w-4 h-4" />
            </Button>
          </div>

          {/* Authentication Section */}
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-white animate-spin"></div>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar || ''} alt={user.name || ''} />
                      <AvatarFallback>{user.name?.charAt(0) || user.email?.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAuthModalOpen(true)}
                className="bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700"
              >
                <User className="w-4 h-4 mr-2" />
                Sign In
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