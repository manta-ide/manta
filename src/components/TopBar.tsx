'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Folder, Code, Edit3, Eye, Monitor, User, LogOut, Network, Download } from 'lucide-react';
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
  const [isExporting, setIsExporting] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleExportProject = async () => {
    if (isExporting) return; // Prevent multiple clicks
    
    try {
      setIsExporting(true);
      const response = await fetch('/api/export');
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project-export.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        console.error('Failed to export project:', errorData.error);
        alert(`Export failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error exporting project:', error);
      alert('Export failed. Check console for details.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <header className="border-b border-zinc-700 bg-zinc-800 px-4 py-1.5">
      <div className="flex items-center justify-between">
        {/* Left side - App title */}
        <div className="flex items-center">
        </div>

        {/* Right side - Controls and Auth */}
        <div className="flex items-center gap-3">
          {/* Edit/Preview Switch */}
          <div className="flex items-center gap-2">
            <div className="relative inline-grid h-7 grid-cols-[1fr_1fr] items-center text-xs font-medium">
              <Switch
                id={switchId}
                checked={isEditMode}
                onCheckedChange={setIsEditMode}
                className="peer data-[state=checked]:bg-transparent data-[state=unchecked]:bg-transparent absolute inset-0 h-[inherit] w-auto border border-zinc-600 [&_span]:h-full [&_span]:w-1/2 [&_span]:rounded-full [&_span]:bg-zinc-700 [&_span]:shadow-none [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-x-full [&_span]:data-[state=checked]:rtl:-translate-x-full"
              />
              <span className="peer-data-[state=checked]:text-zinc-400 pointer-events-none relative ms-0.5 flex min-w-6 items-center justify-center text-center text-white">
                <Eye size={14} aria-hidden="true" />
              </span>
              <span className="peer-data-[state=unchecked]:text-zinc-400 pointer-events-none relative me-0.5 flex min-w-6 items-center justify-center text-center text-zinc-400 peer-data-[state=checked]:text-white">
                <Edit3 size={14} aria-hidden="true" />
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
                                 ? "bg-zinc-700 text-white border-0 h-6 w-6 p-0 rounded-sm"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
              }
            >
                             <Folder className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant={panels.editor ? "default" : "outline"}
              size="sm"
              onClick={() => onTogglePanel('editor')}
              className={panels.editor
                                 ? "bg-zinc-700 text-white border-0 h-6 w-6 p-0 rounded-sm"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
              }
            >
                             <Code className="w-3.5 h-3.5" />
             </Button>

             <Button
               variant={panels.viewer ? "default" : "outline"}
               size="sm"
               onClick={() => onTogglePanel('viewer')}
               className={panels.viewer
                 ? "bg-zinc-700 text-white border-0 h-6 w-6 p-0 rounded-sm"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
               }
             >
               <Monitor className="w-3.5 h-3.5" />
             </Button>

             <Button
               variant={panels.graph ? "default" : "outline"}
               size="sm"
               onClick={() => onTogglePanel('graph')}
               className={panels.graph
                 ? "bg-zinc-700 text-white border-0 h-6 w-6 p-0 rounded-sm"
                : "bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
               }
             >
               <Network className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportProject}
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300"
            title="Export project as ZIP"
            disabled={isExporting}
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </Button>

          {/* Authentication Section */}
          <div className="flex items-center gap-2">
            {loading ? (
              <div className="w-6 h-6 rounded-full border-2 border-zinc-600 border-t-white animate-spin"></div>
            ) : user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                                     <Button variant="ghost" className="flex items-center gap-1.5 px-1.5 h-7">
                     <Avatar className="h-5 w-5">
                       <AvatarImage src={user.avatar || undefined} />
                       <AvatarFallback className="text-xs">{user.name?.[0] || '?'}</AvatarFallback>
                     </Avatar>
                     <span className="hidden sm:inline text-white text-xs">{user.name || user.email}</span>
                   </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleSignOut} className="flex items-center gap-2">
                    <LogOut size={16} /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsAuthModalOpen(true)}>
                <User className="mr-1 h-3 w-3" /> Sign In
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