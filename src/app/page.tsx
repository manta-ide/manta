'use client';

import { useState, useEffect } from 'react';
import FloatingChat from "@/components/FloatingChat";
import FileTree from "@/components/FileTree";
import FileEditor from "@/components/FileEditor";
import AppViewer from "@/components/AppViewer";
import GraphView from "@/components/GraphView";
import SelectedNodeSidebar from "@/components/SelectedNodeSidebar";
import TopBar from "@/components/TopBar";
import SandboxStatus from "@/components/sandbox/SandboxStatus";
import SandboxCreationNotification from "@/components/sandbox/SandboxCreationNotification";
import SupabaseStatus from "@/components/SupabaseStatus";
import { useProjectStore } from "@/lib/store";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export default function Home() {
  const [panels, setPanels] = useState({
    files: false,
    editor: false,
    viewer: true,
    graph: true,
    sandbox: false,
  });
  
  const [isEditMode, setIsEditMode] = useState(true);

  const { loadProject: loadProjectFromFileSystem, selectedNodeId, setSelectedNode } = useProjectStore();

  // Load project from filesystem on mount
  useEffect(() => {
    console.log('🚀 Loading project on mount');
    loadProjectFromFileSystem();
  }, [loadProjectFromFileSystem]); // Include loadProjectFromFileSystem in dependencies

  // Set root node as selected on mount
  useEffect(() => {
    const setRootNodeAsSelected = async () => {
      try {
        // Get the graph data from store
        const { graph } = useProjectStore.getState();
        
        if (graph && graph.nodes.length > 0) {
          const rootNode = graph.nodes[0]; // First node is the root
          setSelectedNode(rootNode.id, rootNode);
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

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      <TopBar panels={panels} onTogglePanel={togglePanel} isEditMode={isEditMode} setIsEditMode={setIsEditMode} />
      
      {/* Re-key when the visible layout changes */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
        key={[
          panels.files,
          panels.editor,
          hasSelected,
          panels.viewer,
          panels.graph,
          panels.sandbox,
        ].join('|')}
      >
        {panels.files && (
          <>
            <ResizablePanel defaultSize={15} minSize={8.7} /* consider removing maxSize or raising it */>
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
          {/* Re-key inner group when viewer/graph visibility changes */}
          <ResizablePanelGroup
            direction="horizontal"
            key={`inner-${panels.viewer}-${panels.graph}`}
          >
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

        {/* Sandbox Panel */}
        {panels.sandbox && (
          <>
            <ResizableHandle className="bg-zinc-600 hover:bg-zinc-500 transition-colors" />
            <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
              <div className="h-full border-l border-zinc-700 bg-zinc-900 p-4">
                <SandboxStatus />
              </div>
            </ResizablePanel>
          </>
        )}
        
      </ResizablePanelGroup>
      
      {/* Floating Chat */}
      <FloatingChat />
      
      {/* Sandbox Creation Notifications */}
      <SandboxCreationNotification />
      
      {/* Supabase Connection Status */}
      <SupabaseStatus />
    </div>
  );
}