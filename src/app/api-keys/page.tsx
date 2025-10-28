'use client';

import { useState, useEffect } from 'react';
import { SidebarProvider, useSidebar } from '@/components/DashboardSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Copy, Eye, EyeOff, Trash2, Key, Calendar, Shield, User } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  type: 'admin' | 'user';
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
}

function ApiKeysContent() {
  const { sidebarWidth } = useSidebar();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState<'admin' | 'user'>('user');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/api-keys');
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      } else {
        toast.error('Failed to load API keys');
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), type: newKeyType }),
      });

      if (response.ok) {
        const data = await response.json();
        setCreatedKey(data.key);
        setNewKeyName('');
        setNewKeyType('user');
        setDialogOpen(false);
        fetchApiKeys();
        toast.success('API key created successfully!');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const response = await fetch(`/api/api-keys?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setApiKeys(apiKeys.filter(key => key.id !== id));
        toast.success('API key deleted successfully');
      } else {
        toast.error('Failed to delete API key');
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const toggleKeyVisibility = (id: string) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(id)) {
      newVisibleKeys.delete(id);
    } else {
      newVisibleKeys.add(id);
    }
    setVisibleKeys(newVisibleKeys);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarWidth }}>
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="text-zinc-400">Loading API keys...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarWidth }}>
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100">API Keys</h1>
              <p className="text-zinc-400 mt-1">
                Manage your API keys for external integrations and access.
              </p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-zinc-900 border-zinc-800">
                <DialogHeader>
                  <DialogTitle className="text-zinc-100">Create New API Key</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Create a new API key for external access. Make sure to copy it immediately - you won't be able to see it again!
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="keyName" className="text-zinc-300">Key Name</Label>
                    <Input
                      id="keyName"
                      placeholder="e.g., Production API Key"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100"
                    />
                  </div>
                  <div>
                    <Label htmlFor="keyType" className="text-zinc-300">Key Type</Label>
                    <Select value={newKeyType} onValueChange={(value: 'admin' | 'user') => setNewKeyType(value)}>
                      <SelectTrigger className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-100">
                        <SelectValue placeholder="Select key type" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="user" className="text-zinc-100 focus:bg-zinc-700">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <div>
                              <div className="font-medium">User (Read-only)</div>
                              <div className="text-xs text-zinc-400">Can list projects and read graphs</div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="admin" className="text-zinc-100 focus:bg-zinc-700">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <div>
                              <div className="font-medium">Admin (Full Access)</div>
                              <div className="text-xs text-zinc-400">Can create, edit, and delete nodes and edges</div>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={createApiKey}
                      disabled={creating}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {creating ? 'Creating...' : 'Create Key'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Created Key Alert */}
          {createdKey && (
            <Card className="mb-6 border-yellow-600 bg-yellow-950/20">
              <CardHeader>
                <CardTitle className="text-yellow-400 flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Key Created!
                </CardTitle>
                <CardDescription className="text-yellow-300">
                  Copy this key now - it will not be shown again for security reasons.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 p-3 bg-zinc-900 rounded border border-yellow-600">
                  <code className="text-yellow-400 font-mono text-sm break-all flex-1">
                    {createdKey}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(createdKey)}
                    className="border-yellow-600 text-yellow-400 hover:bg-yellow-600 hover:text-yellow-950"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setCreatedKey(null)}
                  className="mt-3 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  I've copied it
                </Button>
              </CardContent>
            </Card>
          )}

          {/* API Keys List */}
          <div className="space-y-4">
            {apiKeys.length === 0 ? (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Key className="h-12 w-12 text-zinc-600 mb-4" />
                  <h3 className="text-lg font-medium text-zinc-300 mb-2">No API keys yet</h3>
                  <p className="text-zinc-500 text-center mb-4">
                    Create your first API key to get started with external integrations.
                  </p>
                  <Button
                    onClick={() => setDialogOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create API Key
                  </Button>
                </CardContent>
              </Card>
            ) : (
              apiKeys.map((apiKey) => (
                <Card key={apiKey.id} className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Key className="h-5 w-5 text-zinc-400" />
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-zinc-100">{apiKey.name}</CardTitle>
                            <Badge 
                              variant={apiKey.type === 'admin' ? 'default' : 'secondary'}
                              className={apiKey.type === 'admin' 
                                ? 'bg-blue-600 text-blue-100 hover:bg-blue-700' 
                                : 'bg-zinc-700 text-zinc-300'
                              }
                            >
                              {apiKey.type === 'admin' ? (
                                <><Shield className="h-3 w-3 mr-1" /> Admin</>
                              ) : (
                                <><User className="h-3 w-3 mr-1" /> User</>
                              )}
                            </Badge>
                          </div>
                          <CardDescription className="text-zinc-400">
                            Created {formatDate(apiKey.created_at)}
                            {apiKey.last_used_at && (
                              <span className="ml-2">
                                • Last used {formatDate(apiKey.last_used_at)}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-600 text-red-400 hover:bg-red-600 hover:text-red-950"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-zinc-100">
                                Delete API Key
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-zinc-400">
                                Are you sure you want to delete the API key "{apiKey.name}"? This action cannot be undone and any applications using this key will stop working.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteApiKey(apiKey.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete Key
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <code className="text-zinc-500 font-mono text-sm bg-zinc-800 px-2 py-1 rounded flex-1">
                        {visibleKeys.has(apiKey.id)
                          ? `manta_${'*'.repeat(64)}`
                          : `manta_${'*'.repeat(64)}`
                        }
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                        className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                      >
                        {visibleKeys.has(apiKey.id) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                      API keys are hashed and stored securely. The actual key value is not retrievable after creation.
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ApiKeysPage() {
  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="flex h-full">
          <ApiKeysContent />
        </div>
      </div>
    </SidebarProvider>
  );
}
