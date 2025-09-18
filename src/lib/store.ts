import { create } from 'zustand';
import { Selection, FileNode, Graph, GraphNode } from '@/app/api/lib/schemas';
import { xmlToGraph, graphToXml } from '@/lib/graph-xml';
import { autoMarkUnbuiltFromBaseGraph } from './graph-diff';

// Utility function to update graph states without reloading
const updateGraphStates = (graph: Graph, baseGraph: Graph | null): Graph => {
  return autoMarkUnbuiltFromBaseGraph(graph, baseGraph);
};

// Utility function to determine if we're in local mode
const isLocalMode = (): boolean => {
  if (typeof window === 'undefined') return false; // SSR fallback
  try {
    const { hostname, port } = window.location;
    return (hostname === 'localhost' || hostname === '127.0.0.1') && (port === '' || port === '3000');
  } catch {
    return false;
  }
};

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
  iframeReady: boolean;
  resetting: boolean;
  isBuildingGraph: boolean;
  optimisticOperationsActive: boolean; // Flag to prevent graph updates during optimistic operations
  // Timestamp (ms) until which SSE updates are suppressed to avoid stale snapshots overriding optimistic UI
  sseSuppressedUntil?: number | null;
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
  refreshGraphStates: () => void;
  reconcileGraphRefresh: () => Promise<void>;
  updateGraph: (graph: Graph) => void;
  setGraphLoading: (loading: boolean) => void;
  setGraphError: (error: string | null) => void;

  // Graph build operations
  setBaseGraph: (graph: Graph | null) => void;
  setIsBuildingGraph: (building: boolean) => void;
  buildEntireGraph: () => Promise<void>;
  calculateGraphDiff: () => any;
  loadBaseGraph: () => Promise<Graph | null>;
  loadGraphs: () => Promise<{ currentGraph: Graph; baseGraph: Graph | null } | null>;
  saveBaseGraph: (graph: Graph) => Promise<void>;
  
  // Graph mutations (local + persist via API)
  saveNode: (node: GraphNode) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<GraphNode>) => Promise<void>;
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
      // Prefer keeping the current visual position to avoid viewport jumps
      const merged = {
        ...inNode,
        position: existing.position || inNode.position,
      } as any;
      nextNodes.push(merged);
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
  iframeReady: false,
  resetting: false,
  isBuildingGraph: false,
  optimisticOperationsActive: false,
  sseSuppressedUntil: null,
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
    iframeReady: false,
    resetting: false,
    isBuildingGraph: false,
    optimisticOperationsActive: false,
    sseSuppressedUntil: null,
  }),

  loadProject: async () => {
    try {
      console.log('📊 Loading project (graph + files)...');

      // Load graph data (non-blocking for files)
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
      const res = await fetch('/api/graph-api?graphType=current', { method: 'GET', headers: { Accept: 'application/xml' } });
      if (!res.ok) throw new Error('Graph not found');
      const xml = await res.text();
      let graph = xmlToGraph(xml);

      // Automatically mark nodes as unbuilt based on differences from base graph
      const state = get();
      graph = autoMarkUnbuiltFromBaseGraph(graph, state.baseGraph);

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

  loadGraphs: async () => {
    try {
      console.log('🔄 Loading both current and base graphs...');
      set({ graphLoading: true, graphError: null });

      // Load both graphs in parallel
      const [currentRes, baseRes] = await Promise.all([
        fetch('/api/graph-api?type=current', { method: 'GET', headers: { Accept: 'application/xml' } }),
        fetch('/api/graph-api?type=base', { method: 'GET', headers: { Accept: 'application/xml' } })
      ]);

      if (!currentRes.ok) {
        throw new Error(`Failed to load current graph: ${currentRes.status}`);
      }

      const currentXml = await currentRes.text();
      let currentGraph = xmlToGraph(currentXml);
      console.log('📄 Current graph parsed:', currentGraph.nodes?.length || 0, 'nodes');

      let baseGraph = null;
      if (baseRes.ok) {
        const baseXml = await baseRes.text();
        baseGraph = xmlToGraph(baseXml);
        console.log('📄 Base graph parsed:', baseGraph.nodes?.length || 0, 'nodes');
      } else {
        console.log('ℹ️ No base graph found, using current graph as base');
        baseGraph = JSON.parse(JSON.stringify(currentGraph));
      }

      console.log('🔍 Computing built/unbuilt states...');
      // Apply built/unbuilt state based on comparison
      const originalStates = currentGraph.nodes.map(n => ({ id: n.id, title: n.title, hasState: 'state' in n }));
      currentGraph = autoMarkUnbuiltFromBaseGraph(currentGraph, baseGraph);

      // Log state computation results
      currentGraph.nodes.forEach((node, i) => {
        const original = originalStates[i];
        console.log(`   ${node.id} (${node.title}): ${'state' in node ? 'has computed state' : 'no state field'}`);
      });

      console.log('✅ Graphs loaded and states computed');

      set({
        graph: currentGraph,
        baseGraph,
        graphLoading: false,
        graphError: null
      });

      return { currentGraph, baseGraph };
    } catch (error) {
      set({ graphError: 'Failed to load graphs', graphLoading: false });
      console.error('❌ Error loading graphs:', error);
      return null;
    }
  },
  
  refreshGraph: async () => {
    await get().loadGraph();
  },

  refreshGraphStates: () => {
    const state = get();
    if (state.graph) {
      const updatedGraph = updateGraphStates(state.graph, state.baseGraph);
      set({ graph: updatedGraph });
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
        // Automatically mark nodes as unbuilt based on differences from base graph
        const state = get();
        reconciled = autoMarkUnbuiltFromBaseGraph(reconciled, state.baseGraph);

        set({ graph: reconciled, graphError: null });
      }
    } catch (error) {
      // Silently fail polling errors to avoid spam
      console.debug('Graph reconciliation polling failed:', error);
    }
  },
  
  updateGraph: (graph) => {
    // Automatically apply diff logic to update node states
    const state = get();
    const graphWithCorrectStates = autoMarkUnbuiltFromBaseGraph(graph, state.baseGraph);
    set({ graph: graphWithCorrectStates });
  },
  
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
      const response = await fetch('/api/agent-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'build-graph',
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
    const next = { ...state.graph, nodes: state.graph.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } as Graph;
    set({ graph: next });

    const xml = graphToXml({ ...state.graph, nodes: state.graph.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n) } as Graph);
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

  saveBaseGraph: async (graph: Graph) => {
    const xml = graphToXml(graph);
    await fetch('/api/graph-api?type=base', { method: 'PUT', headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body: xml });
  },
  
  // Graph event handling
  connectToGraphEvents: async (_userId?: string) => {
    try {
      // Close any previous source
      if (graphEventSource) { graphEventSource.close(); graphEventSource = null; }

      const es = new EventSource('/api/graph-api?sse=true');
      graphEventSource = es;

      es.onopen = () => {
        set({ graphConnected: true });
      };

      es.onmessage = (ev) => {
        try {
          const raw = ev.data || '';

          // Skip graph updates if optimistic/suppression window is active
          const currentState = get();
          const now = Date.now();
          const suppressed = currentState.optimisticOperationsActive || (currentState.sseSuppressedUntil != null && now < (currentState.sseSuppressedUntil as number));
          if (suppressed) return;

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
            if (data?.type === 'graph-update' && data.graph) {
              const reconciled = reconcileGraph(get().graph, data.graph);
              if (reconciled) set({ graph: reconciled, graphLoading: false, graphError: null, graphConnected: true });
              return;
            }
            // Handle base graph updates
            if (data?.type === 'base-graph-update' && data.baseGraph) {
              console.log('📊 SSE: Received base graph update');
              set({ baseGraph: data.baseGraph, graphLoading: false, graphError: null, graphConnected: true });
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
})); 


