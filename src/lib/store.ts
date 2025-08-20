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
  
  // Graph event handling
  connectToGraphEvents: () => void;
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
  graph: null,
  graphLoading: true,
  graphError: null,
  graphConnected: false,

  loadProject: async () => {
    try {
      console.log('📂 Loading project from filesystem...');
      const response = await fetch('http://localhost:3000/api/files?graphs=true');
      const data = await response.json();
      
      if (response.ok) {
        const files = new Map(Object.entries(data.files as Record<string, string>));
        console.log(`✅ Loaded ${files.size} files from backend`);
        console.log('📁 File tree structure:', data.fileTree);
        
        // Initialize in-memory graph storage from filesystem as source of truth
        await fetch('http://localhost:3000/api/backend/storage/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        // Also trigger graph API refresh to ensure it has the latest data
        await fetch('http://localhost:3000/api/backend/graph-api', {
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
      const response = await fetch('http://localhost:3000/api/files', {
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
      const response = await fetch('http://localhost:3000/api/files', {
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
      const response = await fetch('http://localhost:3000/api/files', {
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
      const response = await fetch('http://localhost:3000/api/backend/graph-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.graph) {
          set({ graph: data.graph, graphLoading: false });
          console.log(`✅ Loaded graph with ${data.graph.nodes?.length || 0} nodes`);
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
  
  updateGraph: (graph) => set({ graph }),
  
  setGraphLoading: (loading) => set({ graphLoading: loading }),
  
  setGraphError: (error) => set({ graphError: error }),
  
  // Graph event handling
  connectToGraphEvents: () => {
    // Prevent multiple connections
    if (graphEventSource && graphEventSource.readyState !== EventSource.CLOSED) {
      console.log('🔗 Graph events already connected, skipping...');
      return;
    }
    
    // Also check the connection state
    const state = get();
    if (state.graphConnected) {
      console.log('🔗 Graph events already connected (state check), skipping...');
      return;
    }
    
    // Clear any existing reconnection timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Close existing connection if it exists
    if (graphEventSource) {
      graphEventSource.close();
    }
    
    console.log('🔗 Connecting to graph events...');
    graphEventSource = new EventSource('/api/backend/graph-api?sse=true');
    
    graphEventSource.onopen = () => {
      console.log('🔗 Connected to graph events');
      set({ graphError: null, graphConnected: true });
    };

    graphEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'graph-update') {
          set({ graph: data.graph, graphLoading: false });
        }
      } catch (err) {
        console.error('Error parsing graph event:', err);
      }
    };

    graphEventSource.onerror = (error) => {
      console.error('❌ Graph event source error:', error);
      set({ graphError: 'Connection lost. Reconnecting...', graphConnected: false });
      
      // Close the current connection
      if (graphEventSource) {
        graphEventSource.close();
        graphEventSource = null;
      }
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeout = setTimeout(() => {
        console.log('🔄 Attempting to reconnect to graph events...');
        get().connectToGraphEvents();
      }, 3000);
    };
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
      console.log('🔌 Disconnected from graph events');
    }
    
    set({ graphConnected: false });
  },
})); 