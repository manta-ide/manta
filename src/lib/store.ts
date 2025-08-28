import { create } from 'zustand';
import { Selection, FileNode } from '@/app/api/lib/schemas';
import supabaseRealtimeService, { GraphChangeEvent, Graph, GraphNode } from './supabase-realtime';

interface ProjectStore {
  // File system state
  files: Map<string, string>;
  currentFile: string | null;
  selectedFile: string | null;
  fileTree: FileNode[];
  selection: Selection | null;
  refreshTrigger: number;
  
  // Graph state
  selectedNodeId: string | null;
  selectedNode: GraphNode | null;
  graph: Graph | null;
  graphLoading: boolean;
  graphError: string | null;
  graphConnected: boolean;
  supabaseConnected: boolean;
  
  // File operations
  loadProject: () => Promise<void>;
  setFileContent: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createFile: (path: string, content: string) => Promise<void>;
  setCurrentFile: (path: string | null) => void;
  setSelectedFile: (path: string | null) => void;
  setSelection: (selection: Selection | null) => void;
  getFileContent: (path: string) => string;
  getAllFiles: () => Map<string, string>;
  buildFileTree: () => void;
  triggerRefresh: () => void;
  
  // Graph operations
  setSelectedNode: (id: string | null, node?: GraphNode | null) => void;
  loadGraph: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  updateGraph: (graph: Graph) => void;
  setGraphLoading: (loading: boolean) => void;
  setGraphError: (error: string | null) => void;
  
  // Supabase graph operations (priority)
  saveNodeToSupabase: (node: GraphNode) => Promise<void>;
  updateNodeInSupabase: (nodeId: string, updates: Partial<GraphNode>) => Promise<void>;
  updatePropertyInSupabase: (nodeId: string, propertyId: string, value: any) => Promise<void>;
  deleteNodeFromSupabase: (nodeId: string) => Promise<void>;
  syncGraphToSupabase: (graph: Graph) => Promise<void>;
  
  // Graph event handling
  connectToGraphEvents: (userId?: string) => Promise<void>;
  disconnectFromGraphEvents: () => void;
}

// Private variable to track the EventSource connection
let graphEventSource: EventSource | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

// Private variable to track Supabase subscription
let supabaseUnsubscribe: (() => void) | null = null;

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // File system state
  files: new Map(),
  currentFile: null,
  selectedFile: null,
  fileTree: [],
  selection: null,
  refreshTrigger: 0,
  
  // Graph state
  selectedNodeId: null,
  selectedNode: null,
  graph: null,
  graphLoading: true,
  graphError: null,
  graphConnected: false,
  supabaseConnected: false,

  loadProject: async () => {
    try {
      console.log('📂 Loading project from filesystem...');
      const response = await fetch('/api/files?graphs=true');
      const data = await response.json();
      
      if (response.ok) {
        const files = new Map(Object.entries(data.files as Record<string, string>));
        console.log(`✅ Loaded ${files.size} files from backend`);
        console.log('📁 File tree structure:', data.fileTree);
        
        // Initialize in-memory graph storage from filesystem as source of truth
        await fetch('/api/backend/storage/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        // Also trigger graph API refresh to ensure it has the latest data
        await fetch('/api/backend/graph-api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh' })
        });
        
        set({ files, fileTree: data.fileTree });
        
        // Load graph data
        await get().loadGraph();
      } else {
        console.error('❌ Error loading project:', data.error);
      }
    } catch (error) {
      console.error('❌ Error loading project from filesystem:', error);
    }
  },
  
  setFileContent: async (filePath, content) => {
    try {
      console.log(`📝 Updating file: ${filePath} (${content.length} chars)`);
      const response = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      
      if (response.ok) {
        const files = new Map(get().files);
        files.set(filePath, content);
        set({ files });
        console.log(`✅ File updated in store: ${filePath}`);
        
        // Trigger iframe refresh after file update
        get().triggerRefresh();
      } else {
        const data = await response.json();
        console.error('❌ Error updating file:', data.error);
      }
    } catch (error) {
      console.error('❌ Error writing file:', error);
    }
  },
  
  deleteFile: async (filePath) => {
    try {
      console.log(`🗑️ Deleting file: ${filePath}`);
      const response = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      
      if (response.ok) {
        const files = new Map(get().files);
        files.delete(filePath);
        const state = get();
        set({ 
          files,
          currentFile: state.currentFile === filePath ? null : state.currentFile
        });
        console.log(`✅ File deleted from store: ${filePath}`);
        
        // Refresh the file tree to reflect the deletion
        console.log('🔄 Refreshing file tree after delete');
        await get().loadProject();
        
        // Trigger iframe refresh after file deletion
        get().triggerRefresh();
      } else {
        const data = await response.json();
        console.error('❌ Error deleting file:', data.error);
      }
    } catch (error) {
      console.error('❌ Error deleting file:', error);
    }
  },
  
  createFile: async (filePath, content) => {
    try {
      console.log(`➕ Creating file: ${filePath} (${content.length} chars)`);
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      
      if (response.ok) {
        const files = new Map(get().files);
        files.set(filePath, content);
        set({ files });
        console.log(`✅ File created in store: ${filePath}`);
        
        // Refresh the file tree to reflect the new file
        console.log('🔄 Refreshing file tree after create');
        await get().loadProject();
        
        // Trigger iframe refresh after file creation
        get().triggerRefresh();
      } else {
        const data = await response.json();
        console.error('❌ Error creating file:', data.error);
      }
    } catch (error) {
      console.error('❌ Error creating file:', error);
    }
  },
  
  setCurrentFile: (path) => set({ currentFile: path }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  setSelection: (selection) => set({ selection }),
  setSelectedNode: (id, node = null) => set({ selectedNodeId: id, selectedNode: node ?? null }),
  
  getFileContent: (path) => {
    return get().files.get(path) || '';
  },
  
  getAllFiles: () => {
    return new Map(get().files);
  },
  
  buildFileTree: () => {
    // This will be handled by loadProjectFromFileSystem
  },
  
  triggerRefresh: () => set(state => ({ refreshTrigger: state.refreshTrigger + 1 })),
  
  // Graph operations
  loadGraph: async () => {
    try {
      set({ graphLoading: true, graphError: null });
      
      // Try Supabase first if connected
      if (supabaseRealtimeService.connected) {
        try {
          console.log('📊 Loading graph from Supabase...');
          const graph = await supabaseRealtimeService.loadGraph();
          if (graph && graph.nodes && graph.nodes.length > 0) {
            set({ graph, graphLoading: false });
            console.log(`✅ Loaded graph from Supabase with ${graph.nodes.length} nodes`);
            return;
          } else {
            console.log('📊 Supabase has no nodes, falling back to backend API...');
          }
        } catch (supabaseError) {
          console.warn('⚠️ Supabase graph load failed, falling back to backend API:', supabaseError);
        }
      }
      
      // Fallback to backend API
      console.log('📊 Loading graph from backend API...');
      const response = await fetch('/api/backend/graph-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.graph) {
          set({ graph: data.graph, graphLoading: false });
          console.log(`✅ Loaded graph from backend with ${data.graph.nodes?.length || 0} nodes`);
          
          // Sync to Supabase if connected and graph has nodes
          if (supabaseRealtimeService.connected && data.graph.nodes && data.graph.nodes.length > 0) {
            try {
              console.log('🔄 Syncing backend graph to Supabase...');
              await get().syncGraphToSupabase(data.graph);
              console.log('✅ Graph synced to Supabase successfully');
            } catch (syncError) {
              console.warn('⚠️ Failed to sync graph to Supabase:', syncError);
            }
          }
        } else {
          set({ graph: null, graphLoading: false });
          console.log('ℹ️ No graph found');
        }
      } else if (response.status === 404) {
        // Graph not found is not an error, just set to null
        set({ graph: null, graphLoading: false });
        console.log('ℹ️ No graph found (404)');
      } else {
        const errorData = await response.json();
        set({ graphError: errorData.error || 'Failed to load graph', graphLoading: false });
        console.error('❌ Error loading graph:', errorData.error);
      }
    } catch (error) {
      set({ graphError: 'Failed to load graph', graphLoading: false });
      console.error('❌ Error loading graph:', error);
    }
  },
  
  refreshGraph: async () => {
    await get().loadGraph();
  },
  
  updateGraph: (graph) => {
    set({ graph });
    
    // Sync to Supabase if connected and graph has nodes (async, don't block UI)
    if (supabaseRealtimeService.connected && graph?.nodes && graph.nodes.length > 0) {
      get().syncGraphToSupabase(graph).catch(error => {
        console.warn('⚠️ Background sync to Supabase failed:', error);
      });
    }
  },
  
  setGraphLoading: (loading) => set({ graphLoading: loading }),
  
  setGraphError: (error) => set({ graphError: error }),
  
  // Supabase graph operations (priority)
  saveNodeToSupabase: async (node: GraphNode) => {
    try {
      if (!supabaseRealtimeService.connected) {
        throw new Error('Supabase not connected');
      }
      await supabaseRealtimeService.saveNode(node);
      console.log(`✅ Node saved to Supabase: ${node.id}`);
    } catch (error) {
      console.error('❌ Failed to save node to Supabase:', error);
      throw error;
    }
  },

  updateNodeInSupabase: async (nodeId: string, updates: Partial<GraphNode>) => {
    try {
      if (!supabaseRealtimeService.connected) {
        throw new Error('Supabase not connected');
      }
      await supabaseRealtimeService.updateNode(nodeId, updates);
      console.log(`✅ Node updated in Supabase: ${nodeId}`);
    } catch (error) {
      console.error('❌ Failed to update node in Supabase:', error);
      throw error;
    }
  },

  updatePropertyInSupabase: async (nodeId: string, propertyId: string, value: any) => {
    try {
      if (!supabaseRealtimeService.connected) {
        throw new Error('Supabase not connected');
      }
      await supabaseRealtimeService.updateProperty(nodeId, propertyId, value);
      console.log(`✅ Property updated in Supabase: ${propertyId}`);
    } catch (error) {
      console.error('❌ Failed to update property in Supabase:', error);
      throw error;
    }
  },

  deleteNodeFromSupabase: async (nodeId: string) => {
    try {
      if (!supabaseRealtimeService.connected) {
        throw new Error('Supabase not connected');
      }
      await supabaseRealtimeService.deleteNode(nodeId);
      console.log(`✅ Node deleted from Supabase: ${nodeId}`);
    } catch (error) {
      console.error('❌ Failed to delete node from Supabase:', error);
      throw error;
    }
  },

  syncGraphToSupabase: async (graph: Graph) => {
    try {
      if (!supabaseRealtimeService.connected) {
        throw new Error('Supabase not connected');
      }
      
      // Save all nodes and edges to Supabase
      for (const node of graph.nodes) {
        await supabaseRealtimeService.saveNode(node);
      }
      // Ensure edges without parents are also persisted (in case children array misses some)
      if ((graph as any).edges && Array.isArray((graph as any).edges)) {
        // Upsert edges directly
        const client: any = (supabaseRealtimeService as any).serviceRoleClient || (supabaseRealtimeService as any).supabase;
        if (client) {
          await client
            .from('graph_edges')
            .upsert(
              (graph as any).edges.map((e: any) => ({
                id: e.id,
                source_id: e.source || e.source_id,
                target_id: e.target || e.target_id,
                user_id: (supabaseRealtimeService as any).currentUserId
              }))
            );
        }
      }
      
      console.log(`✅ Synced ${graph.nodes.length} nodes to Supabase`);
    } catch (error) {
      console.error('❌ Failed to sync graph to Supabase:', error);
      throw error;
    }
  },
  
  // Graph event handling
  connectToGraphEvents: async (userId?: string) => {
    try {
      console.log('🔗 Store: connectToGraphEvents called with userId:', userId);
      
      // Try to connect to Supabase first
      if (userId) {
        console.log('🔗 Store: Attempting Supabase connection...');
        try {
          await supabaseRealtimeService.connect(userId);
          
          // Set up Supabase event handler
          if (supabaseUnsubscribe) {
            supabaseUnsubscribe();
          }
          
          supabaseUnsubscribe = supabaseRealtimeService.onGraphChange((event: GraphChangeEvent) => {
            const state = get();
            
            switch (event.type) {
              case 'node_created':
                // Add new node to graph
                if (state.graph) {
                  const updatedGraph = {
                    ...state.graph,
                    nodes: [...state.graph.nodes, event.node]
                  };
                  set({ graph: updatedGraph });
                }
                break;
                
              case 'node_updated':
                // Update existing node
                if (state.graph) {
                  const updatedGraph = {
                    ...state.graph,
                    nodes: state.graph.nodes.map(n => n.id === event.node.id ? event.node : n)
                  };
                  set({ graph: updatedGraph });
                  
                  // Update selected node if it's the one being updated
                  if (state.selectedNodeId === event.node.id) {
                    set({ selectedNode: event.node });
                  }
                }
                break;
                
              case 'node_deleted':
                // Remove node from graph
                if (state.graph) {
                  const updatedGraph = {
                    ...state.graph,
                    nodes: state.graph.nodes.filter(n => n.id !== event.nodeId)
                  };
                  set({ graph: updatedGraph });
                  
                  // Clear selection if deleted node was selected
                  if (state.selectedNodeId === event.nodeId) {
                    set({ selectedNodeId: null, selectedNode: null });
                  }
                }
                break;
                
              case 'property_updated': {
                // Always update graph copy for consistency across tabs
                if (state.graph) {
                  const targetNode = state.graph.nodes.find(n => n.id === event.nodeId);
                  if (targetNode) {
                    const updatedProps = (targetNode.properties || [])
                      .map(p => p.id === event.property.id ? { ...p, ...event.property } : p)
                      // Keep a stable order by id to avoid UI reordering on updates
                      .sort((a, b) => a.id.localeCompare(b.id));
                    const updatedNode = { ...targetNode, properties: updatedProps };
                    const updatedGraph = {
                      ...state.graph,
                      nodes: state.graph.nodes.map(n => n.id === event.nodeId ? updatedNode : n)
                    };
                    set({ graph: updatedGraph });
                    if (state.selectedNodeId === event.nodeId) {
                      set({ selectedNode: updatedNode });
                    }
                  }
                }
                break;
              }
                
              case 'graph_loaded':
                set({ graph: event.graph, graphLoading: false });
                break;
            }
          });
          
          // Don't mark connected until channel reports SUBSCRIBED
          set({ graphError: null });
          
          // Frequently check connection status for immediate updates
          const connectionCheck = setInterval(() => {
            const isActuallyConnected = supabaseRealtimeService.connected;
            const currentState = get().supabaseConnected;
            
            if (currentState !== isActuallyConnected) {
              console.log(`🔄 Store: Connection state sync - was ${currentState}, now ${isActuallyConnected}`);
              set({ supabaseConnected: isActuallyConnected });
              
              // If disconnected, clear the interval but DON'T auto-reconnect
              // Let the Supabase service handle its own reconnection logic
              if (!isActuallyConnected) {
                clearInterval(connectionCheck);
                console.log('🔄 Store: Supabase disconnected, service will handle reconnection');
              }
            }
          }, 1000); // Check every 1 second for immediate updates (less frequent)
          // Return early - we're using only Supabase for realtime now
          return;
          
        } catch (supabaseError) {
          console.warn('⚠️ Supabase connection failed, falling back to EventSource:', supabaseError);
          set({ supabaseConnected: false });
        }
      }
      
      // No backend fallback - using only Supabase
      console.log('ℹ️ No user ID provided, skipping graph events connection');
    } catch (error) {
      console.error('❌ Error connecting to graph events:', error);
      set({ graphError: 'Failed to connect to graph events' });
    }
  },
  
  disconnectFromGraphEvents: () => {
    // Disconnect Supabase
    if (supabaseUnsubscribe) {
      supabaseUnsubscribe();
      supabaseUnsubscribe = null;
    }
    
    supabaseRealtimeService.disconnect();
    
    // Clear any pending reconnection timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Close the EventSource connection
    if (graphEventSource) {
      graphEventSource.close();
      graphEventSource = null;
      console.log('🔌 Disconnected from backend graph events');
    }
    
    set({ graphConnected: false, supabaseConnected: false });
  },
})); 