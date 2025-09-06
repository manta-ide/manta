import { create } from 'zustand';
import { Selection, FileNode, Graph, GraphNode } from '@/app/api/lib/schemas';

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
  resetting: boolean;
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
  setFileCacheContent: (path: string, content: string) => void;
  hasFileInCache: (path: string) => boolean;
  buildFileTree: () => void;
  triggerRefresh: () => void;
  setIframeReady: (ready: boolean) => void;
  setResetting: (resetting: boolean) => void;
  
  // Graph operations
  setSelectedNode: (id: string | null, node?: GraphNode | null) => void;
  loadGraph: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  updateGraph: (graph: Graph) => void;
  setGraphLoading: (loading: boolean) => void;
  setGraphError: (error: string | null) => void;
  
  // Graph mutations (local)
  saveNodeToSupabase: (node: GraphNode) => Promise<void>;
  updateNodeInSupabase: (nodeId: string, updates: Partial<GraphNode>) => Promise<void>;
  updatePropertyInSupabase: (nodeId: string, propertyId: string, value: any) => Promise<void>;
  updatePropertyLocal: (nodeId: string, propertyId: string, value: any) => void;
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
  resetting: false,
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
      console.log('📊 Loading project (graph + files)...');

      // Load graph data directly from Supabase (non-blocking for files)
      try {
        await get().loadGraph();
        console.log('✅ Graph load initiated');
      } catch (graphErr) {
        console.warn('⚠️ Graph load error (continuing to load files):', graphErr);
      }

      try {
        const response = await fetch('/api/files', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          const nextFiles = new Map<string, string>();
          if (data?.files && typeof data.files === 'object') {
            for (const [path, content] of Object.entries<string>(data.files)) {
              nextFiles.set(path, content || '');
            }
          }
          set({ fileTree: Array.isArray(data?.fileTree) ? data.fileTree : [], files: nextFiles });
          console.log(`✅ Loaded file tree with ${Array.isArray(data?.fileTree) ? data.fileTree.length : 0} root entries`);
        } else {
          console.warn('⚠️ Failed to load file tree: HTTP', response.status);
          set({ fileTree: [] });
        }
      } catch (filesErr) {
        console.warn('⚠️ Error loading file tree:', filesErr);
        set({ fileTree: [] });
      }

      console.log('✅ Project load completed');
    } catch (error) {
      console.error('❌ Error loading project from Supabase:', error);
    }
  },
  
  setFileContent: async (filePath, content) => {
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to save file');
      }
      // Update local cache
      set(state => {
        const nextFiles = new Map(state.files);
        nextFiles.set(filePath, content);
        return { files: nextFiles };
      });
      console.log(`💾 Saved file: ${filePath}`);
    } catch (err) {
      console.error('❌ Failed to save file:', err);
      throw err;
    }
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
  
  setFileCacheContent: (path, content) => {
    set(state => {
      const nextFiles = new Map(state.files);
      nextFiles.set(path, content);
      return { files: nextFiles };
    });
  },

  hasFileInCache: (path) => {
    const content = get().files.get(path);
    return typeof content === 'string';
  },
  
  buildFileTree: () => {
    // This will be handled by loadProjectFromFileSystem
  },
  
  triggerRefresh: () => set(state => ({ refreshTrigger: state.refreshTrigger + 1 })),
  setIframeReady: (ready) => set({ iframeReady: ready }),
  setResetting: (resetting) => set({ resetting }),
  
  // Graph operations
  loadGraph: async () => {
    try {
      set({ graphLoading: true, graphError: null });
      console.log('📊 Loading graph from local API...');
      const res = await fetch('/api/graph-api', { method: 'GET' });
      if (!res.ok) throw new Error('Graph not found');
      const data = await res.json();
      if (data?.graph) {
        set({ graph: data.graph, graphLoading: false, graphError: null });
        console.log(`✅ Loaded graph with ${data.graph.nodes?.length || 0} nodes`);
      } else {
        set({ graph: { nodes: [], edges: [] } as any, graphLoading: false });
      }
    } catch (error) {
      set({ graphError: 'Failed to load graph', graphLoading: false });
      console.error('❌ Error loading graph:', error);
    }
  },
  
  refreshGraph: async () => {
    await get().loadGraph();
  },
  
  updateGraph: (graph) => { set({ graph }); },
  
  setGraphLoading: (loading) => set({ graphLoading: loading }),
  
  setGraphError: (error) => set({ graphError: error }),
  
  // Supabase graph operations (priority)
  saveNodeToSupabase: async (node: GraphNode) => {
    const state = get();
    const next = state.graph ? { ...state.graph } : ({ nodes: [] } as Graph);
    const i = next.nodes.findIndex(n => n.id === node.id);
    if (i === -1) next.nodes.push(node); else next.nodes[i] = { ...(next.nodes[i] as any), ...node } as any;
    set({ graph: next });
    await fetch('/api/graph-api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph: next }) });
  },

  updateNodeInSupabase: async (nodeId: string, updates: Partial<GraphNode>) => {
    const state = get();
    if (!state.graph) return;
    const next = { ...state.graph, nodes: state.graph.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } as Graph;
    set({ graph: next });
    await fetch('/api/graph-api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph: next }) });
  },

  updatePropertyInSupabase: async (nodeId: string, propertyId: string, value: any) => {
    const state = get();
    if (state.graph) {
      const updatedGraph = {
        ...state.graph,
        nodes: state.graph.nodes.map((n: any) => n.id === nodeId ? ({
          ...n,
          properties: (n.properties || []).map((p: any) => p.id === propertyId ? { ...p, value } : p).sort((a: any, b: any) => a.id.localeCompare(b.id))
        }) : n)
      } as any;
      set({ graph: updatedGraph });
    }
    await fetch('/api/graph-api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeId, propertyId, value }) });
  },

  updatePropertyLocal: (nodeId: string, propertyId: string, value: any) => {
    const state = get();
    if (!state.graph) return;
    const updatedGraph = {
      ...state.graph,
      nodes: state.graph.nodes.map((n: any) =>
        n.id === nodeId
          ? ({
              ...n,
              properties: (n.properties || []).map((p: any) =>
                p.id === propertyId ? { ...p, value } : p
              ).sort((a: any, b: any) => a.id.localeCompare(b.id))
            })
          : n
      )
    } as any;
    set({ graph: updatedGraph });
  },

  deleteNodeFromSupabase: async (nodeId: string) => {
    const state = get();
    if (!state.graph) return;
    const next = { ...state.graph, nodes: state.graph.nodes.filter(n => n.id !== nodeId) } as Graph;
    set({ graph: next });
    await fetch('/api/graph-api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph: next }) });
  },

  syncGraphToSupabase: async (graph: Graph) => {
    await fetch('/api/graph-api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph }) });
  },
  
  // Graph event handling
  connectToGraphEvents: async (_userId?: string) => {
    try {
      // Local mode: connect to SSE endpoint for periodic graph updates
      if (graphEventSource) { graphEventSource.close(); graphEventSource = null; }
      const es = new EventSource('/api/graph-api?sse=true');
      graphEventSource = es;
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === 'graph-update' && data.graph) {
            set({ graph: data.graph, graphLoading: false, graphError: null, graphConnected: true });
          }
        } catch {}
      };
      es.onerror = () => {
        set({ graphConnected: false });
      };
      // Kick initial load
      await get().loadGraph();
    } catch (error) {
      console.error('❌ Error connecting to graph events:', error);
      set({ graphError: 'Failed to connect to graph events' });
    }
  },
  
  disconnectFromGraphEvents: () => {
    // Clear any pending reconnection timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Close the EventSource connection
    if (graphEventSource) {
      graphEventSource.close();
      graphEventSource = null;
      console.log('🔌 Disconnected from local graph events');
    }
    
    set({ graphConnected: false, supabaseConnected: false });
  },
})); 
