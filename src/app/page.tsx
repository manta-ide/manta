'use client';

import { useState, useEffect } from 'react';
import FloatingChat from "@/components/FloatingChat";
import FileTree from "@/components/FileTree";
import FileEditor from "@/components/FileEditor";
import AppViewer from "@/components/AppViewer";
import GraphView from "@/components/GraphView";
import SelectedNodeSidebar from "@/components/SelectedNodeSidebar";
import TopBar from "@/components/TopBar";
// Removed sandbox/supabase UI widgets
import GlobalLoaderOverlay from "@/components/GlobalLoaderOverlay";
import { useProjectStore } from "@/lib/store";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const [panels, setPanels] = useState({
    files: false,
    editor: false,
    viewer: true,
    graph: true,
    sandbox: false,
  });
  const [panelsLoaded, setPanelsLoaded] = useState(false);
  
  const [isEditMode, setIsEditMode] = useState(true);

  const { loadProject: loadProjectFromFileSystem, selectedNodeId, setSelectedNode } = useProjectStore();

  // Load project only when authenticated
  useEffect(() => {
    if (user && !loading) {
      console.log('🚀 Loading project on auth ready');
      loadProjectFromFileSystem();
    }
  }, [user, loading, loadProjectFromFileSystem]);

  // Restore panel layout from localStorage once after auth is ready
  useEffect(() => {
    if (!user || loading || panelsLoaded) return;
    try {
      const key = `manta.panels.${user.id}`;
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = {
          files: typeof parsed?.files === 'boolean' ? parsed.files : panels.files,
          editor: typeof parsed?.editor === 'boolean' ? parsed.editor : panels.editor,
          viewer: typeof parsed?.viewer === 'boolean' ? parsed.viewer : panels.viewer,
          graph: typeof parsed?.graph === 'boolean' ? parsed.graph : panels.graph,
          sandbox: typeof parsed?.sandbox === 'boolean' ? parsed.sandbox : panels.sandbox,
        };
        setPanels(next);
      }
    } catch (e) {
      console.warn('Failed to restore panel layout:', e);
    } finally {
      setPanelsLoaded(true);
    }
  }, [user, loading, panelsLoaded, panels.files, panels.editor, panels.viewer, panels.graph, panels.sandbox]);

  // Persist panel layout on change (per-user)
  useEffect(() => {
    if (!user || loading) return;
    try {
      const key = `manta.panels.${user.id}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(panels));
      }
    } catch (e) {
      console.warn('Failed to persist panel layout:', e);
    }
  }, [panels, user, loading]);

  // Set root node as selected on mount
  useEffect(() => {
    const setRootNodeAsSelected = async () => {
      try {
        // Get the graph data from store
        const { graph } = useProjectStore.getState();
        
        if (graph && graph.nodes.length > 0) {
          const rootNode = graph.nodes[0]; // First node is the root
          setSelectedNode(rootNode.id);
        }
      } catch (error) {
        console.error('Failed to set root node as selected:', error);
      }
    };

    // Wait a bit for the project to load, then set root node
    const timer = setTimeout(setRootNodeAsSelected, 1000);
    return () => clearTimeout(timer);
  }, [setSelectedNode]);

  const togglePanel = (panel: keyof typeof panels) => {
    setPanels(prev => ({
      ...prev,
      [panel]: !prev[panel]
    }));
  };
  const hasSelected = Boolean(selectedNodeId);

  // inner group (viewer + graph) requires min 30 each when present
  const mainMin =
    (panels.viewer ? 30 : 0) +
    (panels.graph ? 30 : 0) ||
    0;

  // choose sane outer defaults that sum to <= 100
  const leftDefaults =
    (panels.files ? 15 : 0) +
    (panels.editor ? 30 : 0) +
    (hasSelected ? 20 : 0);

  const mainDefault = Math.max(
    mainMin,
    100 - leftDefaults
  );

  // Adjust panel sizes when SelectedNodeSidebar is visible
  // const selectedPanelSize = hasSelected ? 20 : 0;

  if (!user || loading) {
    return (
      <div className="flex flex-col h-screen bg-zinc-900">
        <TopBar panels={panels} onTogglePanel={togglePanel} isEditMode={isEditMode} setIsEditMode={setIsEditMode} />
        <GlobalLoaderOverlay />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      <TopBar panels={panels} onTogglePanel={togglePanel} isEditMode={isEditMode} setIsEditMode={setIsEditMode} />
      
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
      >
        {panels.files && (
          <>
            <ResizablePanel defaultSize={15} minSize={8.7}>
              <div className="h-full border-r border-zinc-700">
                <FileTree />
              </div>
            </ResizablePanel>
            <ResizableHandle className="bg-zinc-600 hover:bg-zinc-500 transition-colors" />
          </>
        )}

        {panels.editor && (
          <>
            <ResizablePanel defaultSize={30} minSize={20}>
              <div className="h-full border-r border-zinc-700">
                <FileEditor />
              </div>
            </ResizablePanel>
            <ResizableHandle className="bg-zinc-600 hover:bg-zinc-500 transition-colors" />
          </>
        )}

        {hasSelected && (
          <>
            <ResizablePanel defaultSize={10} minSize={15.5}>
              <div className="h-full border-r border-zinc-700">
                <SelectedNodeSidebar />
              </div>
            </ResizablePanel>
            <ResizableHandle className="bg-zinc-600 hover:bg-zinc-500 transition-colors" />
          </>
        )}

        {/* Main Content Area - outer main uses computed min/default */}
        <ResizablePanel minSize={mainMin} defaultSize={mainDefault}>
          <ResizablePanelGroup direction="horizontal">
            {panels.graph && (
              <>
                <ResizablePanel defaultSize={panels.viewer ? 40 : 100} minSize={30}>
                  <div className="h-full bg-zinc-900">
                    <GraphView />
                  </div>
                </ResizablePanel>
                {panels.viewer && <ResizableHandle className="bg-zinc-600 hover:bg-zinc-500 transition-colors" />}
              </>
            )}

            {panels.viewer && (
              <ResizablePanel defaultSize={panels.graph ? 60 : 100} minSize={30}>
                <div className="h-full bg-zinc-900">
                  <AppViewer isEditMode={isEditMode} />
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        {/* Sandbox Panel removed */}
        
      </ResizablePanelGroup>
      
      {/* Floating Chat */}
      <FloatingChat />
      
      {/* Global loader overlay */}
      <GlobalLoaderOverlay />
    </div>
  );
}