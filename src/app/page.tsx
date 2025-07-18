'use client';

import { useState, useEffect } from 'react';
import ChatSidebar from "@/components/ChatSidebar";
import FileTree from "@/components/FileTree";
import FileEditor from "@/components/FileEditor";
import AppViewer from "@/components/AppViewer";
import TopBar from "@/components/TopBar";
import { useProjectStore } from "@/lib/store";

export default function Home() {
  const [panels, setPanels] = useState({
    files: false,
    editor: false,
    viewer: true,
    chat: true,
  });
  
  const [isEditMode, setIsEditMode] = useState(true);

  const { loadProjectFromFileSystem } = useProjectStore();

  // Load project from filesystem on mount
  useEffect(() => {
    loadProjectFromFileSystem();
  }, []); // Empty dependency array to run only once on mount

  const togglePanel = (panel: keyof typeof panels) => {
    setPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar 
        panels={panels} 
        onTogglePanel={togglePanel}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
      />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Files Panel */}
        {panels.files && (
          <div className="w-64 flex-shrink-0">
            <FileTree />
          </div>
        )}
        
        {/* Editor Panel */}
        {panels.editor && (
          <div className="w-[600px] flex-shrink-0">
            <FileEditor />
          </div>
        )}
        
        {/* App Viewer Panel */}
        {panels.viewer && (
          <div className="flex-1 min-w-0">
            <AppViewer isEditMode={isEditMode} />
          </div>
        )}
        
        {/* Chat Panel */}
        {panels.chat && (
          <div className="w-96 flex-shrink-0">
            <ChatSidebar />
          </div>
        )}
      </div>
    </div>
  );
}
