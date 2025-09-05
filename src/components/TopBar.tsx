'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Folder, Code, Edit3, Eye, Monitor, User, LogOut, Network, Download, RotateCcw, Key, Copy, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import AuthModal from '@/components/auth/AuthModal';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
// Remove SandboxService import - using direct API calls now
import { useProjectStore } from '@/lib/store';

interface TopBarProps {
  panels: {
    files: boolean;
    editor: boolean;
    viewer: boolean;
    graph: boolean;
    sandbox: boolean;
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
  const [isResetting, setIsResetting] = useState(false);
  const { loadProject, setGraphLoading, resetStore, setResetting } = useProjectStore();
  const [isApiKeyOpen, setIsApiKeyOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  const openApiKeyDialog = async () => {
    setIsApiKeyOpen(true);
    if (!user) return;
    setApiKey('');
    setApiKeyError(null);
    setApiKeyLoading(true);
    try {
      const res = await fetch('/api/backend/mcp/access-token', { method: 'GET', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch API key');
      setApiKey(data?.token || '');
    } catch (e: any) {
      setApiKeyError(e?.message || 'Failed to fetch API key');
    } finally {
      setApiKeyLoading(false);
    }
  };

  const copyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 1500);
    } catch {
      console.warn('Failed to copy API key');
    }
  };

  const handleExportProject = async () => {
    if (isExporting) return; // Prevent multiple clicks
    
    try {
      setIsExporting(true);
      const response = await fetch('/api/sandbox/export', { method: 'POST' });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.files) {
          // Create a downloadable ZIP file from the files
          const JSZip = (await import('jszip')).default;
          const zip = new JSZip();
          
          // Add all files to the ZIP
          Object.entries(data.files).forEach(([path, content]) => {
            zip.file(path, content as string);
          });
          
          // Generate and download the ZIP
          const blob = await zip.generateAsync({ type: 'blob' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'project-export.zip';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          console.error('Failed to export project:', data.error);
          alert(`Export failed: ${data.error || 'Unknown error'}`);
        }
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

  const handleResetProject = async () => {
    if (isResetting) return;
    const confirmed = window.confirm('Reset project to base template? This will clear chat, overwrite files and graph.');
    if (!confirmed) return;
    try {
      setIsResetting(true);
      setResetting(true);
      // Show global overlay while resetting
      setGraphLoading(true);
      // Clear app-local storages (not auth). Keep this resilient to future keys.
      try {
        if (typeof window !== 'undefined') {
          const preservedKeys = new Set<string>([
            // Add auth-related keys here if any are ever stored in localStorage.
          ]);
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            // Remove our app keys while preserving anything unrelated to auth
            if (key.startsWith('manta.') && !preservedKeys.has(key)) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
        }
      } catch (e) {
        console.warn('Local storage cleanup failed (continuing):', e);
      }

      // Hit consolidated reset route (clears chat, server sessions, graph, and resets template)
      const res = await fetch('/api/sandbox/reset', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Reset failed');
      }

      // Hard reload to ensure all client state and hooks reinitialize cleanly
      // This also ensures FloatingChat and other components reflect cleared sessions
      if (typeof window !== 'undefined') {
        // Small delay to let overlay paint
        setTimeout(() => { window.location.reload(); }, 200);
      } else {
        // Fallback: reset store and try reloading project
        resetStore();
        setTimeout(() => { loadProject().catch(() => {}); }, 500);
      }
    } catch (error) {
      console.error('Reset failed:', error);
      // Keep overlay off if we failed
      setGraphLoading(false);
      setResetting(false);
      alert('Failed to reset project. Check console for details.');
    } finally {
      setIsResetting(false);
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
            
          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportProject}
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
            title="Export project as ZIP"
            disabled={isExporting}
          >
            {isExporting ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </Button>

          {/* Reset to Template Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetProject}
            className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
            title="Reset project to base template"
            disabled={isResetting}
          >
            {isResetting ? (
              <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
          </Button>

          {/* API Key Dialog Button */}
          {user && (
            <Button
              variant="outline"
              size="sm"
              onClick={openApiKeyDialog}
              className="bg-zinc-800 text-zinc-400 border-0 hover:bg-zinc-700 hover:text-zinc-300 h-6 w-6 p-0 rounded-sm"
              title="Show API key for MCP"
            >
              <Key className="w-3.5 h-3.5" />
            </Button>
          )}
          </div>

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

      {/* API Key Dialog */}
      <Dialog open={isApiKeyOpen} onOpenChange={setIsApiKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API Key for MCP</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {apiKeyLoading ? (
              <div className="text-sm text-zinc-400">Loading key…</div>
            ) : apiKeyError ? (
              <div className="text-sm text-red-400">{apiKeyError}</div>
            ) : (
              <>
                <label className="text-xs text-zinc-400">Use this as MANTA_API_KEY (or MCP_ACCESS_TOKEN)</label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={apiKey} className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={copyApiKey} title="Copy">
                    {apiKeyCopied ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Paste into your MCP server environment as MCP_ACCESS_TOKEN. Treat this like a password.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsApiKeyOpen(false)} variant="outline" size="sm">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
} 
