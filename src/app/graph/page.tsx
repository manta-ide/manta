'use client';

import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import FloatingChat from '@/components/FloatingChat';
import SearchOverlay from '@/components/SearchOverlay';
import LayersSidebar from '@/components/LayersSidebar';
import { SidebarProvider, useSidebar } from '@/components/DashboardSidebar';
import { useProjectStore } from '@/lib/store';
import { useEffect } from 'react';

function GraphContent() {
  const { sidebarWidth } = useSidebar();
  const layersSidebarOpen = useProjectStore((s) => s.layersSidebarOpen);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ marginLeft: sidebarWidth }}>
      <div className="flex h-full">
        <SelectedNodeSidebar />
        <div className="relative flex-1 min-w-0">
          <GraphView projectId={currentProjectId || ''} />
          <SearchOverlay />
          <FloatingChat />
        </div>
        {layersSidebarOpen && (
          <LayersSidebar
            open={layersSidebarOpen}
          />
        )}
      </div>
    </div>
  );
}

export default function GraphPage() {
  const setLayersSidebarOpen = useProjectStore((s) => s.setLayersSidebarOpen);

  useEffect(() => {
    const handler = () => setLayersSidebarOpen(true);
    window.addEventListener('manta:open-layers', handler as EventListener);
    return () => window.removeEventListener('manta:open-layers', handler as EventListener);
  }, [setLayersSidebarOpen]);

  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="flex h-full">
          <GraphContent />
        </div>
      </div>
    </SidebarProvider>
  );
}
