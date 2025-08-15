'use client';

import { useState, useEffect } from 'react';
import ChatSidebar from "@/components/ChatSidebar";
import FileTree from "@/components/FileTree";
import FileEditor from "@/components/FileEditor";
import AppViewer from "@/components/AppViewer";
import GraphView from "@/components/GraphView";
import SelectedNodeSidebar from "@/components/SelectedNodeSidebar";
import TopBar from "@/components/TopBar";
import { useProjectStore } from "@/lib/store";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export default function Home() {
  const [panels, setPanels] = useState({
    files: false,
    editor: false,
    viewer: true,
    chat: true,
    graph: true,
  });
  
  const [isEditMode, setIsEditMode] = useState(true);

  const { loadProject: loadProjectFromFileSystem, selectedNodeId, selectedNode, setSelectedNode } = useProjectStore();

  // Load project from filesystem on mount
  useEffect(() => {
    console.log('🚀 Loading project on mount');
    loadProjectFromFileSystem();
  }, []); // Empty dependency array to run only once on mount

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

  const rightDefaults = panels.chat ? 25 : 0;

  const mainDefault = Math.max(
    mainMin,
    100 - (leftDefaults + rightDefaults)
  );

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
          panels.chat,
          panels.viewer,
          panels.graph,
        ].join('|')}
      >
        {panels.files && (
          <>
            <ResizablePanel defaultSize={15} minSize={8.7} /* consider removing maxSize or raising it */>
              <div className="h-full border-r border-zinc-700">
                <FileTree />
              </div>
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {panels.editor && (
          <>
            <ResizablePanel defaultSize={30} minSize={20}>
              <div className="h-full border-r border-zinc-700">
                <FileEditor />
              </div>
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {hasSelected && (
          <>
            <ResizablePanel defaultSize={14} minSize={14}>
              <div className="h-full border-r border-zinc-700">
                <SelectedNodeSidebar />
              </div>
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {/* Main Content Area - outer main uses computed min/default */}
        <ResizablePanel minSize={mainMin} defaultSize={mainDefault}>
          {/* Re-key inner group when viewer/graph visibility changes */}
          <ResizablePanelGroup
            direction="horizontal"
            key={`inner-${panels.viewer}-${panels.graph}`}
          >
            {panels.viewer && (
              <>
                <ResizablePanel defaultSize={panels.graph ? 60 : 100} minSize={30}>
                  <div className="h-full bg-zinc-900">
                    <AppViewer isEditMode={isEditMode} />
                  </div>
                </ResizablePanel>
                {panels.graph && <ResizableHandle />}
              </>
            )}

            {panels.graph && (
              <ResizablePanel defaultSize={panels.viewer ? 40 : 100} minSize={30}>
                <div className="h-full bg-zinc-900">
                  <GraphView />
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        {panels.chat && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize={17} minSize={17} /* consider raising max or removing */>
              <div className="h-full border-l border-zinc-700">
                <ChatSidebar />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}