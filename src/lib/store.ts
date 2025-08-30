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
  iframeReady: boolean;
  resetStore: () => void;
  
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
  setIframeReady: (ready: boolean) => void;
  
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
  iframeReady: false,
  resetStore: () => set({
    files: new Map(),
    currentFile: null,
    selectedFile: null,
    fileTree: [],
    selection: null,
    refreshTrigger: 0,
    selectedNodeId: null,
    selectedNode: null,
    graph: null,
    graphLoading: true,
    graphError: null,
    graphConnected: false,
    supabaseConnected: false,
    iframeReady: false,
  }),

  loadProject: async () => {
    try {
      console.log('📊 Loading project from Supabase...');

      // Load graph data directly from Supabase
      await get().loadGraph();

      console.log('✅ Project loaded from Supabase successfully');
    } catch (error) {
      console.error('❌ Error loading project from Supabase:', error);
    }
  },
  
  setFileContent: async (filePath, content) => {
    // File operations disabled - using Supabase only
    console.log(`📝 File update skipped (Supabase only mode): ${filePath}`);
  },
  
  deleteFile: async (filePath) => {
    // File operations disabled - using Supabase only
    console.log(`🗑️ File deletion skipped (Supabase only mode): ${filePath}`);
  },
  
  createFile: async (filePath, content) => {
    // File operations disabled - using Supabase only
    console.log(`➕ File creation skipped (Supabase only mode): ${filePath}`);
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
  setIframeReady: (ready) => set({ iframeReady: ready }),
  
  // Graph operations
  loadGraph: async () => {
    try {
      set({ graphLoading: true, graphError: null });
      
      // Load graph from Supabase only; if not connected yet, wait for subscribe loader
      if (!supabaseRealtimeService.connected) {
        console.log('⏳ Supabase not connected yet; waiting for initial subscribe to load graph');
        return;
      }

      try {
        console.log('📊 Loading graph from Supabase...');
        const graph = await supabaseRealtimeService.loadGraph();
        if (graph) {
          set({ graph, graphLoading: false });
          console.log(`✅ Loaded graph from Supabase with ${graph.nodes?.length || 0} nodes and ${graph.edges?.length || 0} edges`);
          if (graph.edges && graph.edges.length > 0) {
            console.log('📊 Store: Edge details:', graph.edges);
          }
        } else {
          console.log('📊 No graph data found in Supabase');
          set({ graph: { nodes: [], edges: [] }, graphLoading: false });
        }
      } catch (supabaseError) {
        console.error('❌ Supabase graph load failed:', supabaseError);
        set({ graphLoading: false, graphError: 'Failed to load graph from Supabase' });
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
                // Optimize: avoid full graph updates to prevent GraphView re-renders
                if (state.selectedNodeId === event.nodeId && state.selectedNode) {
                  const updatedProps = (state.selectedNode.properties || [])
                    .map(p => p.id === event.property.id ? { ...p, ...event.property } : p)
                    .sort((a, b) => a.id.localeCompare(b.id));
                  set({ selectedNode: { ...state.selectedNode, properties: updatedProps } as any });
                }
                break;
              }
                
              case 'graph_loaded':
                set({ graph: event.graph, graphLoading: false });
                break;
                
              case 'node_position_updated':
                // Update node position from broadcast (real-time collaborative editing)
                if (state.graph && event.fromBroadcast) {
                  const existingNode = state.graph.nodes.find(n => n.id === event.nodeId);
                  const same = existingNode && existingNode.position && existingNode.position.x === event.position.x && existingNode.position.y === event.position.y;
                  if (!existingNode || same) break;
                  const updatedGraph = {
                    ...state.graph,
                    nodes: state.graph.nodes.map(n => 
                      n.id === event.nodeId 
                        ? { ...n, position: event.position }
                        : n
                    )
                  };
                  set({ graph: updatedGraph });
                  
                  // Update selected node if it's the one being updated
                  if (state.selectedNodeId === event.nodeId) {
                    const updatedNode = updatedGraph.nodes.find(n => n.id === event.nodeId);
                    if (updatedNode) {
                      set({ selectedNode: updatedNode });
                    }
                  }
                }
                break;
                
              case 'property_updated_broadcast':
                // Optimize: only update selected node locally to avoid GraphView churn
                if (event.fromBroadcast && state.selectedNodeId === event.nodeId && state.selectedNode) {
                  const existingVal = state.selectedNode.properties?.find(p => p.id === event.propertyId)?.value;
                  if (existingVal === event.value) break;
                  const updatedProps = (state.selectedNode.properties || []).map(p =>
                    p.id === event.propertyId ? { ...p, value: event.value } : p
                  ).sort((a, b) => a.id.localeCompare(b.id));
                  set({ selectedNode: { ...state.selectedNode, properties: updatedProps } as any });
                }
                break;
            }
          });
          
          // Don't mark connected until channel reports SUBSCRIBED
          set({ graphError: null });

          // Poll connection; if disconnected for >10s, attempt reconnect
          let disconnectedSince: number | null = null;
          let attempts = 0;
          const connectionCheck = setInterval(async () => {
            const isConnected = supabaseRealtimeService.connected;
            const prev = get().supabaseConnected;
            if (prev !== isConnected) {
              set({ supabaseConnected: isConnected });
            }
            if (!isConnected) {
              if (disconnectedSince === null) disconnectedSince = Date.now();
              const elapsed = Date.now() - disconnectedSince;
              // Also treat a missing graph as a trigger to retry
              const graphMissing = !get().graph || (get().graph?.nodes?.length || 0) === 0;
              if ((elapsed > 3000 || graphMissing) && userId) {
                try {
                  console.log('🔄 Store: Reconnecting to Supabase after prolonged disconnect...');
                  await supabaseRealtimeService.connect(userId);
                  disconnectedSince = null;
                  // Reload graph after reconnect
                  set({ graphLoading: true });
                  await get().loadGraph();
                  attempts = 0;
                } catch {}
              }
              // Backoff: if repeatedly failing, also try a fresh loadGraph with service client
              attempts += 1;
              if (attempts % 3 === 0) {
                try { await get().loadGraph(); } catch {}
              }
            } else {
              disconnectedSince = null;
              attempts = 0;
            }
          }, 1500);

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