import { create } from 'zustand';
import { FileNode, Graph, GraphNode, GraphEdge } from '@/app/api/lib/schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';
import { applyLayerToGraph } from './layers';

interface ProjectStore {
  // Project state
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // File system state
  files: Map<string, string>;
  currentFile: string | null;
  selectedFile: string | null;
  fileTree: FileNode[];
  refreshTrigger: number;

  // Graph state
  layers: string[];
  activeLayer: string | null;
  layersSidebarOpen: boolean;
  selectedNodeId: string | null;
  selectedNode: GraphNode | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  selectedEdge: GraphEdge | null;
  selectedEdgeIds: string[];
  graph: Graph | null;
  fullGraph: Graph | null; // Full unfiltered graph for outline calculations
  graphLoading: boolean;
  graphError: string | null;
  graphConnected: boolean;
  iframeReady: boolean;
  resetting: boolean;
  isBuildingGraph: boolean;
  optimisticOperationsActive: boolean; // Flag to prevent graph updates during optimistic operations
  // Timestamp (ms) until which SSE updates are suppressed to avoid stale snapshots overriding optimistic UI
  sseSuppressedUntil?: number | null;
  resetStore: () => void;

  // Sidebar layout state
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;

  
  // File operations
  loadProject: () => Promise<void>;
  setFileContent: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createFile: (path: string, content: string) => Promise<void>;
  setCurrentFile: (path: string | null) => void;
  setSelectedFile: (path: string | null) => void;
  getFileContent: (path: string) => string;
  getAllFiles: () => Map<string, string>;
  setFileCacheContent: (path: string, content: string) => void;
  hasFileInCache: (path: string) => boolean;
  buildFileTree: () => void;
  triggerRefresh: () => void;
  setIframeReady: (ready: boolean) => void;
  setResetting: (resetting: boolean) => void;
  // Layer operations
  loadLayers: () => Promise<void>;
  setActiveLayer: (name: string) => Promise<void>;
  setLayersSidebarOpen: (open: boolean) => void;
  toggleLayersSidebar: () => void;
  
  // Graph operations
  setSelectedNode: (id: string | null, node?: GraphNode | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  setSelectedEdge: (id: string | null, edge?: GraphEdge | null) => void;
  setSelectedEdgeIds: (ids: string[]) => void;
  loadGraph: () => Promise<void>;
  refreshGraph: () => Promise<void>;
  refreshGraphStates: () => void;
  reconcileGraphRefresh: () => Promise<void>;
  updateGraph: (graph: Graph) => void;
  setGraphLoading: (loading: boolean) => void;
  setGraphError: (error: string | null) => void;

  // Graph build operations
  setIsBuildingGraph: (building: boolean) => void;
  buildEntireGraph: () => Promise<void>;
  calculateGraphDiff: () => any;
  loadGraphs: () => Promise<void>;
  
  // Graph mutations (local + persist via API)
  saveNode: (node: GraphNode) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<GraphNode>) => Promise<void>;
  updateEdge: (edgeId: string, updates: Partial<GraphEdge>) => Promise<void>;
  updateProperty: (nodeId: string, propertyId: string, value: any) => Promise<void>;
  updatePropertyLocal: (nodeId: string, propertyId: string, value: any) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  syncGraph: (graph: Graph) => Promise<void>;
  
  // Graph event handling
  connectToGraphEvents: (userId?: string) => Promise<void>;
  disconnectFromGraphEvents: () => void;
  setOptimisticOperationsActive: (active: boolean) => void;
  // Temporarily suppress SSE updates for a stabilization window after mutations
  suppressSSE: (ms: number) => void;

  // Search state
  searchOpen: boolean;
  searchQuery: string;
  searchCaseSensitive: boolean;
  searchIncludeProperties: boolean;
  searchResults: Array<{ nodeId: string; field: 'title' | 'description' | 'property'; propertyId?: string; index: number; matchLength: number; value: string }>;
  searchActiveIndex: number;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  setSearchOptions: (opts: { caseSensitive?: boolean; includeProperties?: boolean }) => void;
  setSearchActiveIndex: (i: number) => void;
  runSearch: () => void;
  clearSearch: () => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
}

// Private variable to track the EventSource connection
let graphEventSource: EventSource | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;

// Reconcile graphs: apply additions, updates, and deletions from incoming; preserve local positions when possible
function reconcileGraph(current: Graph | null, incoming: Graph | null): Graph | null {
  if (!incoming) return current;
  if (!current) return incoming;

  const currentNodeMap = new Map<string, any>((current.nodes || []).map(n => [n.id, n]));
  const nextNodes: any[] = [];

  for (const inNode of (incoming.nodes || [])) {
    const existing = currentNodeMap.get(inNode.id);
    if (!existing) {
      nextNodes.push({ ...inNode });
    } else {
      // Keep the incoming node as-is (positions are managed locally in GraphView now)
      nextNodes.push(inNode);
    }
  }

  // Edges: adopt incoming edges (dedup by id or source-target)
  const ensureEdgeId = (e: any) => e.id || `${e.source}-${e.target}`;
  const edgeSet = new Set<string>();
  const nextEdges: any[] = [];
  for (const e of (incoming.edges || [])) {
    const id = ensureEdgeId(e);
    if (edgeSet.has(id)) continue;
    edgeSet.add(id);
    nextEdges.push({ ...e, id });
  }

  const merged: any = { nodes: nextNodes };
  if (nextEdges.length > 0) merged.edges = nextEdges;
  return merged as Graph;
}


export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Project state
  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  // File system state
  files: new Map(),
  currentFile: null,
  selectedFile: null,
  fileTree: [],
  refreshTrigger: 0,

  // Graph state
  layers: [],
  activeLayer: null,
  layersSidebarOpen: true,
  selectedNodeId: null,
  selectedNode: null,
  selectedNodeIds: [],
  selectedEdgeId: null,
  selectedEdge: null,
  selectedEdgeIds: [],
  graph: null,
  fullGraph: null,
  baseGraph: null,
  graphLoading: true,
  graphError: null,
  graphConnected: false,
  iframeReady: false,
  resetting: false,
  isBuildingGraph: false,
  optimisticOperationsActive: false,
  sseSuppressedUntil: null,

  // Sidebar layout state
  leftSidebarWidth: 320,
  rightSidebarWidth: 288,

  // Search state (defaults)
  searchOpen: false,
  searchQuery: '',
  searchCaseSensitive: false,
  searchIncludeProperties: true,
  searchResults: [],
  searchActiveIndex: -1,
  resetStore: () => set({
    currentProjectId: null,
    files: new Map(),
    currentFile: null,
    selectedFile: null,
    fileTree: [],
    refreshTrigger: 0,
    layers: [],
    activeLayer: null,
    layersSidebarOpen: true,
    selectedNodeId: null,
    selectedNode: null,
    selectedNodeIds: [],
    selectedEdgeId: null,
    selectedEdge: null,
    selectedEdgeIds: [],
    graph: null,
    fullGraph: null,
    graphLoading: true,
    graphError: null,
    graphConnected: false,
    iframeReady: false,
    resetting: false,
    isBuildingGraph: false,
    optimisticOperationsActive: false,
    sseSuppressedUntil: null,
    leftSidebarWidth: 320,
    rightSidebarWidth: 288,
  }),

  loadProject: async () => {
    try {
      console.log('📊 Loading project (graph + files)...');

      // Load graph data (non-blocking for files)
      try {
        await get().loadLayers();
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
      console.error('❌ Error loading project:', error);
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
    // File operations disabled in this environment
    console.log(`🗑️ File deletion skipped: ${filePath}`);
  },
  
  createFile: async (filePath, content) => {
    // File operations disabled in this environment
    console.log(`➕ File creation skipped: ${filePath}`);
  },
  
  setCurrentFile: (path) => set({ currentFile: path }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  setSelectedNode: (id, node = null) => {
    const prevId = get().selectedNodeId;
    const prevNode = get().selectedNode;
    if (prevId === id && prevNode === (node ?? null)) return;
    set({ selectedNodeId: id, selectedNode: node ?? null });
  },
  setSelectedNodeIds: (ids) => {
    const next = Array.isArray(ids) ? ids : [];
    const prev = get().selectedNodeIds || [];
    const sameLength = next.length === prev.length;
    const sameSet = sameLength && next.every((id) => prev.includes(id));
    if (sameSet) return;
    set({ selectedNodeIds: next });
  },
  setSelectedEdge: (id, edge = null) => {
    const prevId = get().selectedEdgeId;
    const prevEdge = get().selectedEdge;
    if (prevId === id && prevEdge === (edge ?? null)) return;
    set({ selectedEdgeId: id, selectedEdge: edge ?? null });
  },
  setSelectedEdgeIds: (ids) => {
    const next = Array.isArray(ids) ? ids : [];
    const prev = get().selectedEdgeIds || [];
    const sameLength = next.length === prev.length;
    const sameSet = sameLength && next.every((id) => prev.includes(id));
    if (sameSet) return;
    set({ selectedEdgeIds: next });
  },

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

  // Layer operations
  loadLayers: async () => {
    try {
      const res = await fetch('/api/layers', { method: 'GET' });
      if (!res.ok) return;
      const data = await res.json();
      set({ layers: data.layers ?? [], activeLayer: data.activeLayer ?? null });
    } catch (e) {
      console.warn('Failed to load layers:', e);
    }
  },
  setActiveLayer: async (name: string) => {
    // Only C4 layers are supported
    const c4Layers = ['system', 'container', 'component', 'code'];
    if (!c4Layers.includes(name)) {
      console.warn(`Invalid layer: ${name}. Only C4 layers are supported.`);
      return;
    }

    // Update active layer via API
    await fetch('/api/layers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    // Update immediately for UI feedback
    set({ activeLayer: name });
    // Refresh graph after layer switch
    await get().loadGraph();
  },
  setLayersSidebarOpen: (open: boolean) => set({ layersSidebarOpen: open }),
  toggleLayersSidebar: () => set((state) => ({ layersSidebarOpen: !state.layersSidebarOpen })),

  // Sidebar layout operations
  setLeftSidebarWidth: (width: number) => {
    const constrainedWidth = Math.max(200, Math.min(600, width));
    set({ leftSidebarWidth: constrainedWidth });
  },
  setRightSidebarWidth: (width: number) => {
    const constrainedWidth = Math.max(200, Math.min(600, width));
    set({ rightSidebarWidth: constrainedWidth });
  },

  
  // Graph operations

  loadGraph: async () => {
    try {
      const { currentProjectId } = get();
      if (!currentProjectId) {
        console.warn('No project ID set, skipping graph load');
        return;
      }
      set({ graphLoading: true, graphError: null });
      const res = await fetch(`/api/graph-api?graphType=current&projectId=${currentProjectId}`, { method: 'GET', headers: { Accept: 'application/xml' } });
      if (!res.ok) throw new Error('Graph not found');
      const xml = await res.text();
      let fullGraph = xmlToGraph(xml);

      // Apply active layer filtering and positioning
      const state = get();

      // Store the full graph for outline calculations
      set({ fullGraph });

      // Apply layer filtering to the graph
      let graph = fullGraph;
      if (state.activeLayer) {
        const c4Layers = ['system', 'container', 'component', 'code'];
        if (c4Layers.includes(state.activeLayer)) {
          // For C4 layers, filter by type directly
          graph = applyLayerToGraph(fullGraph, state.activeLayer);
        }
        // User layers are no longer supported
      }

      set({ graph, graphLoading: false, graphError: null });
    } catch (error) {
      set({ graphError: 'Failed to load graph', graphLoading: false });
      console.error('Error loading graph:', error);
    }
  },

// Removed loadCurrentGraph and loadBaseGraph - base graphs no longer exist

  loadGraphs: async () => {
    // Simplified - just load the current graph
    await get().loadGraph();
  },
  
  refreshGraph: async () => {
    await get().loadGraph();
  },

  refreshGraphStates: () => {
    const state = get();
    if (state.graph) {
      // No longer need to update graph states - base graphs removed
    }
  },

  // Reconcile-based graph refresh for polling (preserves UI state)
  reconcileGraphRefresh: async () => {
    try {
      // Use API call that reads directly from filesystem
      const res = await fetch('/api/graph-api?type=current&fresh=true', { method: 'GET', headers: { Accept: 'application/xml' } });
      if (!res.ok) return; // Silently fail for polling

      const xml = await res.text();
      let incoming = xmlToGraph(xml);
      const current = get().graph;
      let reconciled = reconcileGraph(current, incoming);

      if (reconciled) {
        set({ graph: reconciled, graphError: null });
      }
    } catch (error) {
      // Silently fail polling errors to avoid spam
      console.debug('Graph reconciliation polling failed:', error);
    }
  },
  
  updateGraph: (graph) => {
    set({ graph });
  },
  
  setGraphLoading: (loading) => set({ graphLoading: loading }),

  setGraphError: (error) => set({ graphError: error }),

  // Graph build operations

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

      // Send build request - subagent will analyze diff itself
      const response = await fetch('/api/agent-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: {
            role: 'user',
            content: 'Build the graph - analyze changes and implement code for all nodes that need building'
          },
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
              if (line.includes('completed successfully') || line.includes('build process is now complete') || line.includes('[STREAM_END]')) {
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
    // Graph diff functionality disabled - no base graphs
    return { changes: [] };
  },
  
  // Graph operations (persist via API)
  saveNode: async (node: GraphNode) => {
    const state = get();
    const next = state.graph ? { ...state.graph } : ({ nodes: [] } as Graph);
    const i = next.nodes.findIndex(n => n.id === node.id);
    if (i === -1) next.nodes.push(node); else next.nodes[i] = { ...(next.nodes[i] as any), ...node } as any;

    // Skip graph state update if optimistic operations are active
    if (!state.optimisticOperationsActive) {
      set({ graph: next });
    }

    const xml = graphToXml(next);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml });
  },

  updateNode: async (nodeId: string, updates: Partial<GraphNode>) => {
    const state = get();
    if (!state.graph) return;

    // Update the node in the graph (positions are managed locally in GraphView)
    const next = { ...state.graph, nodes: state.graph.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } as Graph;
    set({ graph: next });

    // Save updates to the graph API
    if (Object.keys(updates).length > 0) {
      const xml = graphToXml({ ...state.graph, nodes: state.graph.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } as Graph);
      await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml });
    }
  },

  updateEdge: async (edgeId: string, updates: Partial<GraphEdge>) => {
    const state = get();
    if (!state.graph) return;

    const sanitizeShape = (shape: GraphEdge['shape']) => (shape === 'relates' || shape === 'refines') ? shape : undefined;

    const matchEdge = (edge: GraphEdge) => {
      if (edge.id === edgeId) return true;
      const compositeId = `${edge.source}-${edge.target}`;
      return compositeId === edgeId;
    };

    const nextEdges = (state.graph.edges || []).map((edge) => {
      if (!matchEdge(edge as GraphEdge)) return edge;
      const nextShape = sanitizeShape(updates.shape);
      const merged = {
        ...edge,
        ...updates,
        ...(updates.shape !== undefined ? { shape: nextShape ?? undefined } : {}),
      } as GraphEdge;
      if (merged.shape === undefined) {
        delete (merged as any).shape;
      }
      return merged;
    });

    const nextGraph = { ...state.graph, edges: nextEdges } as Graph;

    let nextSelectedEdge: GraphEdge | null = null;
    if (state.selectedEdgeId) {
      const currentSelectionId = state.selectedEdgeId;
      const found = nextEdges.find((edge) => {
        const actualId = edge.id || `${edge.source}-${edge.target}`;
        return actualId === currentSelectionId;
      });
      nextSelectedEdge = (found as GraphEdge | undefined) ?? null;
    }

    set({
      graph: nextGraph,
      ...(state.selectedEdgeId ? { selectedEdge: nextSelectedEdge } : {}),
    });

    const xml = graphToXml(nextGraph);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml });
  },

  updateProperty: async (nodeId: string, propertyId: string, value: any) => {
    const state = get();
    if (state.graph) {
      const updatedGraph = {
        ...state.graph,
        nodes: state.graph.nodes.map((n: any) => n.id === nodeId ? ({
          ...n,
          properties: (n.properties || []).map((p: any) => p.id === propertyId ? { ...p, value } : p).sort((a: any, b: any) => a.id.localeCompare(b.id))
        }) : n)
      } as any;

      // Skip graph state update if optimistic operations are active
      if (!state.optimisticOperationsActive) {
        set({ graph: updatedGraph });
      }
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

  deleteNode: async (nodeId: string) => {
    const state = get();
    if (!state.graph) return;
    const next = { ...state.graph, nodes: state.graph.nodes.filter(n => n.id !== nodeId) } as Graph;
    set({ graph: next });

    const xml = graphToXml(next);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml });
  },

  syncGraph: async (graph: Graph) => {
    const state = get();
    set({ graph });

    const xml = graphToXml(graph);
    await fetch('/api/graph-api?type=current', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml });
  },

  
  // Graph event handling
  connectToGraphEvents: async (_userId?: string) => {
    try {
      const { currentProjectId } = get();
      if (!currentProjectId) {
        console.warn('No project ID set, skipping graph events connection');
        return;
      }

      // Close any previous source
      if (graphEventSource) { graphEventSource.close(); graphEventSource = null; }

      const es = new EventSource(`/api/graph-api?sse=true&projectId=${currentProjectId}`);
      graphEventSource = es;

      es.onopen = () => {
        set({ graphConnected: true });
      };

      es.onmessage = (ev) => {
        try {
          const raw = ev.data || '';

          // Check if we're in a suppression window (will be bypassed for agent updates)
          const currentState = get();
          const now = Date.now();
          const suppressed = currentState.optimisticOperationsActive || (currentState.sseSuppressedUntil != null && now < (currentState.sseSuppressedUntil as number));

          const trimmed = raw.trim();
          // Case 1: plain XML
          if (trimmed.startsWith('<')) {
            const incoming = xmlToGraph(trimmed);
            const reconciled = reconcileGraph(get().graph, incoming);
            if (reconciled) set({ graph: reconciled, graphLoading: false, graphError: null, graphConnected: true });
            return;
          }

          // Case 2: JSON message
          try {
            const data = JSON.parse(trimmed);

            // Allow agent-driven updates even during optimistic operations
            const isAgentUpdate = data?.source === 'agent' || data?.metadata?.source === 'agent';
            if (suppressed && !isAgentUpdate) return;

            if (data?.type === 'graph-update') {
              if (data.xml) {
                // New format with base64 XML and metadata
                const xml = Buffer.from(data.xml, 'base64').toString('utf8');
                const incoming = xmlToGraph(xml);
                const reconciled = reconcileGraph(get().graph, incoming);
                if (reconciled) set({ graph: reconciled, graphLoading: false, graphError: null, graphConnected: true });
                return;
              } else if (data.graph) {
                // Legacy format with direct graph object
                const reconciled = reconcileGraph(get().graph, data.graph);
                if (reconciled) set({ graph: reconciled, graphLoading: false, graphError: null, graphConnected: true });
                return;
              }
            }
            // Handle base graph updates
// Base graph updates removed - no longer supported

            // Handle active layer changes
            if (data?.type === 'active-layer-changed') {
              console.log('🔁 SSE: Active layer changed to', data.activeLayer);
              set({ activeLayer: data.activeLayer ?? null, graphLoading: true });
              get().loadGraph().catch(() => {});
              return;
            }

            // Handle build completion
            if (data?.type === 'build-complete') {
              console.log('✅ SSE: Build process completed - clearing UI loading states');
              // Clear both optimistic operations and building graph states when build completes
              set({ optimisticOperationsActive: false, isBuildingGraph: false });
              console.log('✅ SSE: UI states cleared - optimisticOperationsActive: false, isBuildingGraph: false');
              return;
            }
          } catch {}

          // Case 3: base64-encoded XML (any length)
          if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
            try {
              const decodedXml = atob(trimmed);
              const incoming = xmlToGraph(decodedXml);
              const reconciled = reconcileGraph(get().graph, incoming);
              if (reconciled) set({ graph: reconciled, graphLoading: false, graphError: null, graphConnected: true });
              return;
            } catch (decodeError) {
              console.error('Failed to decode base64 XML:', decodeError);
            }
          }
        } catch (error) {
          console.error('Error processing SSE message:', error);
        }
      };
      es.onerror = () => {
        set({ graphConnected: false });
      };
      // Initial load for good measure
      await get().loadGraph();
    } catch (error) {
      console.error('Error connecting to graph events:', error);
      set({ graphError: 'Failed to connect to graph events' });
    }
  },
  
  disconnectFromGraphEvents: () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (graphEventSource) {
      graphEventSource.close();
      graphEventSource = null;
      console.log('🔌 Disconnected from local graph events');
    }
    set({ graphConnected: false });
  },

  setOptimisticOperationsActive: (active: boolean) => {
    set({ optimisticOperationsActive: active });
  },
  suppressSSE: (ms: number) => {
    const until = Date.now() + Math.max(0, ms || 0);
    set({ sseSuppressedUntil: until });
    // Clear after the window to avoid lingering suppression
    setTimeout(() => {
      const state = get();
      if (state.sseSuppressedUntil && state.sseSuppressedUntil <= until) {
        set({ sseSuppressedUntil: null });
      }
    }, Math.max(0, ms || 0) + 5);
  },

  // --- Search ---
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchOptions: (opts) => set((state) => ({
    searchCaseSensitive: opts.caseSensitive ?? state.searchCaseSensitive,
    searchIncludeProperties: opts.includeProperties ?? state.searchIncludeProperties,
  })),
  setSearchActiveIndex: (i) => set((state) => {
    const len = state.searchResults.length;
    if (len === 0) return { searchActiveIndex: -1 } as any;
    const clamped = Math.max(0, Math.min(i, len - 1));
    return { searchActiveIndex: clamped };
  }),
  runSearch: () => {
    const state = get();
    const graph = state.graph;
    const queryRaw = state.searchQuery || '';

    if (!graph || !Array.isArray(graph.nodes) || queryRaw.trim() === '') {
      set({ searchResults: [], searchActiveIndex: -1 });
      return;
    }

    const query = state.searchCaseSensitive ? queryRaw : queryRaw.toLowerCase();
    const results: Array<{ nodeId: string; field: 'title' | 'description' | 'property'; propertyId?: string; index: number; matchLength: number; value: string }> = [];

    const findAll = (haystack: string, needle: string) => {
      const out: number[] = [];
      if (!needle) return out;
      let start = 0;
      // Avoid infinite loop on zero-length
      const step = Math.max(1, needle.length);
      while (start <= haystack.length - needle.length) {
        const idx = haystack.indexOf(needle, start);
        if (idx === -1) break;
        out.push(idx);
        start = idx + step;
      }
      return out;
    };

    const norm = (s: any) => {
      const str = String(s ?? '');
      return state.searchCaseSensitive ? str : str.toLowerCase();
    };

    for (const n of graph.nodes) {
      // Title
      const title = n.title ?? '';
      const titleNorm = norm(title);
      for (const idx of findAll(titleNorm, query)) {
        results.push({ nodeId: n.id, field: 'title', index: idx, matchLength: queryRaw.length, value: title });
      }

      // Description
      const description = n.description ?? '';
      const descriptionNorm = norm(description);
      for (const idx of findAll(descriptionNorm, query)) {
        results.push({ nodeId: n.id, field: 'description', index: idx, matchLength: queryRaw.length, value: description });
      }

      // Properties (optional)
      if (state.searchIncludeProperties && Array.isArray((n as any).properties)) {
        for (const p of (n as any).properties as any[]) {
          // Prioritize value search, fall back to id/title if value empty
          const sources: Array<{ value: string; kind: 'value' | 'id' | 'title' }>= [];
          const val = p?.value;
          if (val !== undefined && val !== null) {
            try { sources.push({ value: typeof val === 'string' ? val : JSON.stringify(val), kind: 'value' }); } catch { sources.push({ value: String(val), kind: 'value' }); }
          }
          if (p?.id) sources.push({ value: String(p.id), kind: 'id' });
          if (p?.title) sources.push({ value: String(p.title), kind: 'title' });

          for (const s of sources) {
            const sNorm = norm(s.value);
            for (const idx of findAll(sNorm, query)) {
              results.push({ nodeId: n.id, field: 'property', propertyId: p.id, index: idx, matchLength: queryRaw.length, value: s.value });
            }
          }
        }
      }
    }

    // Keep stable ordering by node order then field order then index
    results.sort((a, b) => {
      if (a.nodeId !== b.nodeId) return String(a.nodeId).localeCompare(String(b.nodeId));
      const order = { title: 0, description: 1, property: 2 } as const;
      if (order[a.field] !== order[b.field]) return order[a.field] - order[b.field];
      return a.index - b.index;
    });

    set({ searchResults: results, searchActiveIndex: results.length > 0 ? 0 : -1 });
  },
  clearSearch: () => set({ searchQuery: '', searchResults: [], searchActiveIndex: -1 }),
  nextSearchResult: () => set((state) => {
    const len = state.searchResults.length;
    if (len === 0) return {} as any;
    const next = (state.searchActiveIndex + 1) % len;
    return { searchActiveIndex: next };
  }),
  prevSearchResult: () => set((state) => {
    const len = state.searchResults.length;
    if (len === 0) return {} as any;
    const prev = (state.searchActiveIndex - 1 + len) % len;
    return { searchActiveIndex: prev };
  }),
})); 


