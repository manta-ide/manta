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

// Utility function to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
  lastGeneratedImage: any | null; // Last generated image data
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
  buildSelectedGraph: (selectedNodeIds: string[]) => Promise<void>;
  resetGraph: () => Promise<void>;
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

  // Search state
  searchOpen: boolean;
  searchQuery: string;
  searchCaseSensitive: boolean;
  searchIncludeProperties: boolean;
  searchResults: Array<{ nodeId: string; field: 'title' | 'prompt' | 'property'; propertyId?: string; index: number; matchLength: number; value: string }>;
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
  lastGeneratedImage: null,
  graphLoading: true,
  graphError: null,
  graphConnected: false,
  iframeReady: false,
  resetting: false,
  isBuildingGraph: false,
  optimisticOperationsActive: false,
  sseSuppressedUntil: null,
  // Search state (defaults)
  searchOpen: false,
  searchQuery: '',
  searchCaseSensitive: false,
  searchIncludeProperties: true,
  searchResults: [],
  searchActiveIndex: -1,
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

      // Ensure partial template files are present
      console.log('🔍 Ensuring partial template files are present...');
      try {
        const ensureRes = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ensurePartial: true })
        });

        if (ensureRes.ok) {
          const result = await ensureRes.json();
          console.log('✅ Partial template check completed:', result.message);
        } else {
          console.warn('⚠️ Failed to ensure partial template files');
        }
      } catch (error) {
        console.warn('⚠️ Error ensuring partial template files:', error);
      }

      // Load both graphs in parallel
      const [currentRes, baseRes] = await Promise.all([
        fetch('/api/graph-api?type=current', { method: 'GET', headers: { Accept: 'application/xml' } }),
        fetch('/api/graph-api?type=base', { method: 'GET', headers: { Accept: 'application/xml' } })
      ]);

      if (!currentRes.ok) {
        // If graphs don't exist, automatically apply partial template
        if (currentRes.status === 404) {
          console.log('ℹ️ No graphs found, automatically applying partial template...');
          try {
            const templateRes = await fetch('/api/templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ templateBranch: 'partial' })
            });

            if (!templateRes.ok) {
              throw new Error(`Failed to apply partial template: ${templateRes.status}`);
            }

            console.log('✅ Partial template applied, retrying graph load...');

            // Retry loading graphs after applying template
            const [retryCurrentRes, retryBaseRes] = await Promise.all([
              fetch('/api/graph-api?type=current', { method: 'GET', headers: { Accept: 'application/xml' } }),
              fetch('/api/graph-api?type=base', { method: 'GET', headers: { Accept: 'application/xml' } })
            ]);

            if (!retryCurrentRes.ok) {
              throw new Error(`Failed to load current graph after template application: ${retryCurrentRes.status}`);
            }

            const currentXml = await retryCurrentRes.text();
            let currentGraph = xmlToGraph(currentXml);
            console.log('📄 Current graph parsed:', currentGraph.nodes?.length || 0, 'nodes');

            let baseGraph = null;
            if (retryBaseRes.ok) {
              const baseXml = await retryBaseRes.text();
              baseGraph = xmlToGraph(baseXml);
              console.log('📄 Base graph parsed:', baseGraph.nodes?.length || 0, 'nodes');
            } else {
              console.log('ℹ️ No base graph found after template, using current graph as base');
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

            console.log('✅ Graphs loaded and states computed after template application');

            set({
              graph: currentGraph,
              baseGraph,
              graphLoading: false,
              graphError: null
            });

            return { currentGraph, baseGraph };
          } catch (templateError) {
            console.error('❌ Failed to apply partial template:', templateError);
            const errorMessage = templateError instanceof Error ? templateError.message : String(templateError);
            throw new Error(`Failed to load current graph: ${currentRes.status} (and failed to auto-initialize: ${errorMessage})`);
          }
        } else {
          throw new Error(`Failed to load current graph: ${currentRes.status}`);
        }
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

  resetGraph: async () => {
    const state = get();
    if (!state.baseGraph) {
      console.error('❌ No base graph to reset');
      return;
    }

    set({ resetting: true });

    try {
      console.log('🔄 Resetting base graph...');

      // Call the reset API to clear images
      const response = await fetch('/api/graph-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reset graph');
      }

      const result = await response.json();
      console.log('✅ Base graph reset successfully:', result);

      // Reset base graph to empty state (current graph remains unchanged)
      const emptyBaseGraph = { nodes: [], edges: [] };
      set({
        resetting: false,
        baseGraph: emptyBaseGraph,
        lastGeneratedImage: null,
        graphError: null
      });

      console.log('🎉 Base graph reset complete');

    } catch (error) {
      console.error('❌ Error resetting base graph:', error);
      set({
        graphError: error instanceof Error ? error.message : 'Failed to reset base graph',
        resetting: false
      });
    }
  },

  buildSelectedGraph: async (selectedNodeIds: string[]) => {
    const state = get();
    if (!state.graph) {
      console.error('❌ No current graph to build');
      return;
    }

    if (!selectedNodeIds || selectedNodeIds.length === 0) {
      console.error('❌ No selected nodes to build');
      return;
    }

    set({ isBuildingGraph: true });

    try {
      console.log('🎨 Generating image for selected nodes:', selectedNodeIds);

      // Filter to only selected nodes
      const selectedNodes = state.graph.nodes.filter(node => selectedNodeIds.includes(node.id));
      const descriptions: string[] = [];
      const nodeImages: { nodeId: string; image: string; title: string }[] = [];

      for (const node of selectedNodes) {
        if (node.title && node.prompt) {
          descriptions.push(`${node.title}: ${node.prompt}`);
        } else if (node.title) {
          descriptions.push(node.title);
        }

        // Collect images from selected nodes
        if (node.image) {
          nodeImages.push({
            nodeId: node.id,
            image: node.image,
            title: node.title
          });
        }
      }

      let imagePrompt = 'Generate an image showing ';

      if (descriptions.length > 0) {
        imagePrompt += descriptions.join('. ') + '.';
      } else {
        imagePrompt += 'the selected application interface elements.';
      }

      // Add node images to the prompt
      if (nodeImages.length > 0) {
        const imageDescriptions = nodeImages.map(ni => `image from node ${ni.nodeId} (${ni.title})`);
        imagePrompt += ` Incorporate these reference images: ${imageDescriptions.join(', ')}.`;
      }

      imagePrompt += ' Create a realistic image showing these elements and details.';

      // Call image generation API with previous images if available
      const imageRequestBody: any = {
        prompt: imagePrompt,
        aspectRatio: '16:9'
      };

      // Include node images as previous images for reference
      const previousImages: any[] = [];

      // Add cached previous image if available
      if (state.lastGeneratedImage?.data) {
        previousImages.push({
          data: state.lastGeneratedImage.data,
          mimeType: state.lastGeneratedImage.mimeType
        });
        console.log('🖼️ Including cached previous image in generation request');
      }

      // Add selected node images as references
      for (const nodeImage of nodeImages) {
        try {
          console.log(`🖼️ Fetching image for node ${nodeImage.nodeId}: ${nodeImage.image}`);
          const imageResponse = await fetch(`/uploaded-images/${nodeImage.image}`);
          if (imageResponse.ok) {
            const imageBlob = await imageResponse.blob();
            const base64Data = await blobToBase64(imageBlob);
            const mimeType = imageBlob.type || 'image/png';
            previousImages.push({
              data: base64Data,
              mimeType: mimeType
            });
            console.log(`✅ Added image from node ${nodeImage.nodeId} to generation request`);
          } else {
            console.warn(`⚠️ Failed to fetch image for node ${nodeImage.nodeId}: ${imageResponse.status}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error fetching image for node ${nodeImage.nodeId}:`, error);
        }
      }

      if (previousImages.length > 0) {
        imageRequestBody.previousImages = previousImages;
        console.log(`🖼️ Including ${previousImages.length} reference images in generation request`);
      }

      const imageResponse = await fetch('/api/image-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageRequestBody),
      });

      if (!imageResponse.ok) {
        const errorData = await imageResponse.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }

      const imageData = await imageResponse.json();
      console.log('✅ Image generated successfully');

      // Store the generated image for future iterations
      set({ lastGeneratedImage: imageData.image });

      // Now sync only selected nodes to base
      console.log('🔄 Syncing selected nodes to base via API...');

      const syncResponse = await fetch('/api/graph-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedNodeIds }) // Pass selected node IDs
      });

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        throw new Error(errorData.error || 'Failed to sync selected nodes');
      }

      const syncResult = await syncResponse.json();
      console.log('✅ Selected nodes synced successfully:', syncResult);

      // Refresh the base graph in local state
      try {
        const baseGraphResponse = await fetch('/api/graph-api?graphType=base');
        if (baseGraphResponse.ok) {
          const baseGraphData = await baseGraphResponse.json();
          if (baseGraphData.success) {
            set({ baseGraph: baseGraphData.graph });
          }
        }
      } catch (refreshError) {
        console.warn('⚠️ Could not refresh base graph after sync:', refreshError);
      }

      // Update local state - only set loading to false after both operations complete
      set({
        isBuildingGraph: false,
        graphError: null
      });

      console.log(`🎉 Image generated and synced ${syncResult.syncedNodes} selected node(s) and ${syncResult.syncedEdges} edge(s) to base graph`);

    } catch (error) {
      console.error('❌ Error in build selected process:', error);
      set({
        graphError: error instanceof Error ? error.message : 'Failed to build selected nodes',
        isBuildingGraph: false
      });
    }
  },

  buildEntireGraph: async () => {
    const state = get();
    if (!state.graph) {
      console.error('❌ No current graph to build');
      return;
    }

    set({ isBuildingGraph: true });

    try {
      // First generate the image
      console.log('🎨 Generating image for graph...');



      // Calculate what changed since last build
      const diff = state.calculateGraphDiff();

      // Build a comprehensive description of what the current graph represents
      const allNodes = state.graph?.nodes || [];
      const descriptions: string[] = [];
      const nodeImages: { nodeId: string; image: string; title: string }[] = [];

      for (const node of allNodes) {
        if (node.title && node.prompt) {
          descriptions.push(`${node.title}: ${node.prompt}`);
        } else if (node.title) {
          descriptions.push(node.title);
        }

        // Collect images from nodes
        if (node.image) {
          nodeImages.push({
            nodeId: node.id,
            image: node.image,
            title: node.title
          });
        }
      }

      let imagePrompt = 'Generate an image showing ';

      if (descriptions.length > 0) {
        imagePrompt += descriptions.join('. ') + '.';
      } else {
        imagePrompt += 'the current application interface.';
      }

      // Add context about changes if any
      const addedNodes = diff.changes.filter((c: any) => c.type === 'node-added');
      const modifiedNodes = diff.changes.filter((c: any) => c.type === 'node-modified');
      const deletedNodes = diff.changes.filter((c: any) => c.type === 'node-deleted');

      if (addedNodes.length > 0 || modifiedNodes.length > 0 || deletedNodes.length > 0) {
        const changeDescriptions: string[] = [];

        if (addedNodes.length > 0) {
          const newDescriptions = addedNodes
            .map((c: any) => c.node.prompt ? `${c.node.title}: ${c.node.prompt}` : c.node.title)
            .filter(Boolean);
          if (newDescriptions.length > 0) {
            changeDescriptions.push(`New features: ${newDescriptions.join(', ')}`);
          }
        }

        if (modifiedNodes.length > 0) {
          const modifiedTitles = modifiedNodes.map((c: any) => c.newNode.title).filter(Boolean);
          if (modifiedTitles.length > 0) {
            changeDescriptions.push(`Updated: ${modifiedTitles.join(', ')}`);
          }
        }

        if (deletedNodes.length > 0) {
          const deletedTitles = deletedNodes.map((c: any) => c.node.title).filter(Boolean);
          if (deletedTitles.length > 0) {
            changeDescriptions.push(`Removed: ${deletedTitles.join(', ')}`);
          }
        }

        if (changeDescriptions.length > 0) {
          imagePrompt += ' Recent changes: ' + changeDescriptions.join('. ') + '.';
        }
      }

      // Add node images to the prompt
      if (nodeImages.length > 0) {
        const imageDescriptions = nodeImages.map(ni => `image from node ${ni.nodeId} (${ni.title})`);
        imagePrompt += ` Incorporate these reference images: ${imageDescriptions.join(', ')}.`;
      }

      imagePrompt += ' Create a realistic image showing these elements and details.';

      // Call image generation API with previous images if available
      const imageRequestBody: any = {
        prompt: imagePrompt,
        aspectRatio: '16:9'
      };

      // Include node images as previous images for reference
      const previousImages: any[] = [];

      // Add cached previous image if available
      if (state.lastGeneratedImage?.data) {
        previousImages.push({
          data: state.lastGeneratedImage.data,
          mimeType: state.lastGeneratedImage.mimeType
        });
        console.log('🖼️ Including cached previous image in generation request');
      }

      // Add node images as references
      for (const nodeImage of nodeImages) {
        try {
          console.log(`🖼️ Fetching image for node ${nodeImage.nodeId}: ${nodeImage.image}`);
          const imageResponse = await fetch(`/uploaded-images/${nodeImage.image}`);
          if (imageResponse.ok) {
            const imageBlob = await imageResponse.blob();
            const base64Data = await blobToBase64(imageBlob);
            const mimeType = imageBlob.type || 'image/png';
            previousImages.push({
              data: base64Data,
              mimeType: mimeType
            });
            console.log(`✅ Added image from node ${nodeImage.nodeId} to generation request`);
          } else {
            console.warn(`⚠️ Failed to fetch image for node ${nodeImage.nodeId}: ${imageResponse.status}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error fetching image for node ${nodeImage.nodeId}:`, error);
        }
      }

      if (previousImages.length > 0) {
        imageRequestBody.previousImages = previousImages;
        console.log(`🖼️ Including ${previousImages.length} reference images in generation request`);
      }

      const imageResponse = await fetch('/api/image-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageRequestBody),
      });

      if (!imageResponse.ok) {
        const errorData = await imageResponse.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }

      const imageData = await imageResponse.json();
      console.log('✅ Image generated successfully');

      // Store the generated image for future iterations
      set({ lastGeneratedImage: imageData.image });

      // Now sync the graph to base
      console.log('🔄 Syncing graph to base via API...');

      const syncResponse = await fetch('/api/graph-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        throw new Error(errorData.error || 'Failed to sync graph');
      }

      const syncResult = await syncResponse.json();
      console.log('✅ Graph synced successfully:', syncResult);

      // Refresh the base graph in local state
      try {
        const baseGraphResponse = await fetch('/api/graph-api?graphType=base');
        if (baseGraphResponse.ok) {
          const baseGraphData = await baseGraphResponse.json();
          if (baseGraphData.success) {
            set({ baseGraph: baseGraphData.graph });
          }
        }
      } catch (refreshError) {
        console.warn('⚠️ Could not refresh base graph after sync:', refreshError);
      }

      // Update local state - only set loading to false after both operations complete
      set({
        isBuildingGraph: false,
        graphError: null
      });

      console.log(`🎉 Image generated and synced ${syncResult.syncedNodes} node(s) and ${syncResult.syncedEdges} edge(s) to base graph`);

    } catch (error) {
      console.error('❌ Error in build process:', error);
      set({
        graphError: error instanceof Error ? error.message : 'Failed to build graph',
        isBuildingGraph: false
      });
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

    // If this is the currently selected node, update the selectedNode state too
    if (state.selectedNodeId === nodeId) {
      const updatedNode = next.nodes.find(n => n.id === nodeId);
      if (updatedNode) {
        set({ selectedNode: updatedNode });
      }
    }

    const xml = graphToXml(next);
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
            if (data?.type === 'base-graph-update' && data.baseGraph) {
              console.log('📊 SSE: Received base graph update');
              set({ baseGraph: data.baseGraph, graphLoading: false, graphError: null, graphConnected: true });
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
    const results: Array<{ nodeId: string; field: 'title' | 'prompt' | 'property'; propertyId?: string; index: number; matchLength: number; value: string }> = [];

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

      // Prompt
      const prompt = n.prompt ?? '';
      const promptNorm = norm(prompt);
      for (const idx of findAll(promptNorm, query)) {
        results.push({ nodeId: n.id, field: 'prompt', index: idx, matchLength: queryRaw.length, value: prompt });
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
      const order = { title: 0, prompt: 1, property: 2 } as const;
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


