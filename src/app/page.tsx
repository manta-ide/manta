'use client';

import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import FloatingChat from '@/components/FloatingChat';
import SearchOverlay from '@/components/SearchOverlay';
import LayersSidebar from '@/components/LayersSidebar';
import { useProjectStore } from '@/lib/store';
import { useEffect } from 'react';

export default function Home() {
  const layersSidebarOpen = useProjectStore((s) => s.layersSidebarOpen);
  const setLayersSidebarOpen = useProjectStore((s) => s.setLayersSidebarOpen);
  useEffect(() => {
    const handler = () => setLayersSidebarOpen(true);
    window.addEventListener('manta:open-layers', handler as EventListener);
    return () => window.removeEventListener('manta:open-layers', handler as EventListener);
  }, [setLayersSidebarOpen]);
  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex h-full">
        <SelectedNodeSidebar />
        <div className="relative flex-1">
          <GraphView />
          <SearchOverlay />
          <FloatingChat />
        </div>
        <LayersSidebar open={layersSidebarOpen} onClose={() => setLayersSidebarOpen(false)} />
      </div>
    </main>
  );
}
