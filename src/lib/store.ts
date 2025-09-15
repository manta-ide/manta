import { create } from 'zustand';
import { Selection, FileNode, Graph, GraphNode } from '@/app/api/lib/schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';

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
  selectedNodeIds: string[];
  graph: Graph | null;
  baseGraph: Graph | null; // Last built version of the graph
  graphLoading: boolean;
  graphError: string | null;
  graphConnected: boolean;
  supabaseConnected: boolean;
  iframeReady: boolean;
  resetting: boolean;
  isBuildingGraph: boolean;
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
  setSelectedNodeIds: (ids: string[]) => void;
  loadGraph: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  updateGraph: (graph: Graph) => void;
  setGraphLoading: (loading: boolean) => void;
  setGraphError: (error: string | null) => void;

  // Graph build operations
  setBaseGraph: (graph: Graph | null) => void;
  setIsBuildingGraph: (building: boolean) => void;
  buildEntireGraph: () => Promise<void>;
  calculateGraphDiff: () => any;
  loadBaseGraph: () => Promise<Graph | null>;
  saveBaseGraph: (graph: Graph) => Promise<void>;
  
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
  selectedNodeIds: [],
  graph: null,
  baseGraph: null,
  graphLoading: true,
  graphError: null,
  graphConnected: false,
  supabaseConnected: false,
  iframeReady: false,
  resetting: false,
  isBuildingGraph: false,
  resetStore: () => set({
    files: new Map(),
    currentFile: null,
    selectedFile: null,
    fileTree: [],
    selection: null,
    refreshTrigger: 0,
    selectedNodeId: null,
    selectedNode: null,
    selectedNodeIds: [],
    graph: null,
    baseGraph: null,
    graphLoading: true,
    graphError: null,
    graphConnected: false,
    supabaseConnected: false,
    iframeReady: false,
    resetting: false,
    isBuildingGraph: false,
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
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: Array.isArray(ids) ? ids : [] }),
  
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
      const res = await fetch('/api/graph-api', { method: 'GET', headers: { Accept: 'application/xml' } });
      if (!res.ok) throw new Error('Graph not found');
      const xml = await res.text();
      const graph = xmlToGraph(xml);
      set({ graph, graphLoading: false, graphError: null });
    } catch (error) {
      set({ graphError: 'Failed to load graph', graphLoading: false });
      console.error('Error loading graph:', error);
    }
  },

  loadCurrentGraph: async () => {
    try {
      set({ graphLoading: true, graphError: null });
      const res = await fetch('/api/graph-api?type=current', { method: 'GET', headers: { Accept: 'application/xml' } });
      if (!res.ok) throw new Error('Current graph not found');
      const xml = await res.text();
      const graph = xmlToGraph(xml);
      set({ graph, graphLoading: false, graphError: null });
    } catch (error) {
      set({ graphError: 'Failed to load current graph', graphLoading: false });
      console.error('Error loading current graph:', error);
    }
  },

  loadBaseGraph: async () => {
    try {
      const res = await fetch('/api/graph-api?type=base', { method: 'GET', headers: { Accept: 'application/xml' } });
      if (!res.ok) {
        // Base graph doesn't exist yet, which is fine
        return null;
      }
      const xml = await res.text();
      const graph = xmlToGraph(xml);
      set({ baseGraph: graph });
      return graph;
    } catch (error) {
      console.error('Error loading base graph:', error);
      return null;
    }
  },
  
  refreshGraph: async () => {
    await get().loadGraph();
  },
  
  updateGraph: (graph) => { set({ graph }); },
  
  setGraphLoading: (loading) => set({ graphLoading: loading }),

  setGraphError: (error) => set({ graphError: error }),

  // Graph build operations
  setBaseGraph: (graph) => set({ baseGraph: graph }),

  setIsBuildingGraph: (building) => set({ isBuildingGraph: building }),

  buildEntireGraph: async () => {
    const state = get();
    if (!state.graph) {
      console.error('❌ No current graph to build');
      return;
    }

    set({ isBuildingGraph: true });

    try {
      // Calculate the diff between current and base graphs
      const diff = state.calculateGraphDiff();

      // Send build request with diff to agent
      const response = await fetch('/api/agent-request/build-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: {
            role: 'user',
            content: 'Build the entire graph with the following changes',
            variables: { GRAPH_DIFF: JSON.stringify(diff) }
          },
          graphDiff: diff,
          currentGraph: state.graph
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start graph build');
      }

      console.log('✅ Graph build started successfully');

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              console.log('Build progress:', line);
              if (line.includes('completed successfully')) {
                console.log('✅ Graph build completed successfully');
                set({ isBuildingGraph: false });
                // Refresh the graph to show any changes
                state.refreshGraph();
                return;
              } else if (line.includes('failed')) {
                console.error('❌ Graph build failed:', line);
                set({ graphError: 'Graph build failed', isBuildingGraph: false });
                return;
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Error reading build stream:', error);
        set({ graphError: 'Failed to read build status', isBuildingGraph: false });
      }
    } catch (error) {
      console.error('❌ Error building graph:', error);
      set({ graphError: 'Failed to build graph', isBuildingGraph: false });
    }
  },

  calculateGraphDiff: () => {
    const state = get();
    const current = state.graph;
    const base = state.baseGraph;

    if (!current) return { changes: [] };
    if (!base) return { changes: [] }; // No base graph yet

    const diff: any = {
      changes: []
    };

    // Compare nodes
    const currentNodeMap = new Map(current.nodes.map(n => [n.id, n]));
    const baseNodeMap = new Map(base.nodes.map(n => [n.id, n]));

    // Find added/modified nodes
    for (const [nodeId, currentNode] of currentNodeMap) {
      const baseNode = baseNodeMap.get(nodeId);
      if (!baseNode) {
        diff.changes.push({ type: 'node-added', node: currentNode });
      } else if (JSON.stringify(currentNode) !== JSON.stringify(baseNode)) {
        diff.changes.push({ type: 'node-modified', nodeId, oldNode: baseNode, newNode: currentNode });
      }
    }

    // Find deleted nodes
    for (const [nodeId, baseNode] of baseNodeMap) {
      if (!currentNodeMap.has(nodeId)) {
        diff.changes.push({ type: 'node-deleted', nodeId, node: baseNode });
      }
    }

    // Compare edges
    const currentEdges = current.edges || [];
    const baseEdges = base.edges || [];
    const currentEdgeMap = new Map(currentEdges.map(e => [`${e.source}-${e.target}`, e]));
    const baseEdgeMap = new Map(baseEdges.map(e => [`${e.source}-${e.target}`, e]));

    // Find added edges
    for (const [edgeKey, currentEdge] of currentEdgeMap) {
      if (!baseEdgeMap.has(edgeKey)) {
        diff.changes.push({ type: 'edge-added', edge: currentEdge });
      }
    }

    // Find deleted edges
    for (const [edgeKey, baseEdge] of baseEdgeMap) {
      if (!currentEdgeMap.has(edgeKey)) {
        diff.changes.push({ type: 'edge-deleted', edge: baseEdge });
      }
    }

    return diff;
  },
  
  // Supabase graph operations (priority)
  saveNodeToSupabase: async (node: GraphNode) => {
    const state = get();
    const next = state.graph ? { ...state.graph } : ({ nodes: [] } as Graph);
    const i = next.nodes.findIndex(n => n.id === node.id);
    if (i === -1) next.nodes.push(node); else next.nodes[i] = { ...(next.nodes[i] as any), ...node } as any;
    set({ graph: next });
    const xml = graphToXml(next);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml });
  },

  updateNodeInSupabase: async (nodeId: string, updates: Partial<GraphNode>) => {
    const state = get();
    if (!state.graph) return;
    const next = { ...state.graph, nodes: state.graph.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } as Graph;
    set({ graph: next });
    const xml = graphToXml(next);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml });
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
    await fetch('/api/graph-api?type=current', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeId, propertyId, value }) });
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
    const xml = graphToXml(next);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml });
  },

  syncGraphToSupabase: async (graph: Graph) => {
    const xml = graphToXml(graph);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml });
  },

  saveBaseGraph: async (graph: Graph) => {
    const xml = graphToXml(graph);
    await fetch('/api/graph-api?type=base', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml });
  },
  
  // Graph event handling
  connectToGraphEvents: async (_userId?: string) => {
    try {
      // Local mode: connect to SSE endpoint for periodic graph updates
      if (graphEventSource) { graphEventSource.close(); graphEventSource = null; }
      const es = new EventSource('/api/graph-api?sse=true');
      graphEventSource = es;

      es.onopen = () => {
        set({ graphConnected: true });
      };

      es.onmessage = (ev) => {
        try {
          const raw = ev.data || '';
          if (raw.trim().startsWith('<')) {
            const graph = xmlToGraph(raw);
            set({ graph, graphLoading: false, graphError: null, graphConnected: true });
          } else if (raw.length > 100 && !raw.includes(' ') && /^[A-Za-z0-9+/=]+$/.test(raw)) {
            // Base64 encoded XML → decode to bytes, then UTF-8 string
            try {
              // Decode base64 to UTF-8 string
              const decodedXml = atob(raw);
              const graph = xmlToGraph(decodedXml);
              set({ graph, graphLoading: false, graphError: null, graphConnected: true });
            } catch (decodeError) {
              console.error('Failed to decode base64 XML:', decodeError);
            }
          } else {
            const data = JSON.parse(raw);
            if (data?.type === 'graph-update' && data.graph) {
              set({ graph: data.graph, graphLoading: false, graphError: null, graphConnected: true });
            }
          }
        } catch (error) {
          console.error('Error processing SSE message:', error);
        }
      };
      es.onerror = () => {
        set({ graphConnected: false });
      };
      // Kick initial load
      await get().loadGraph();
    } catch (error) {
      console.error('Error connecting to graph events:', error);
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
