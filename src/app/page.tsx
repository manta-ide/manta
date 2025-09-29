'use client';

import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import FloatingChat from '@/components/FloatingChat';
import SearchOverlay from '@/components/SearchOverlay';

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex h-full">
        <SelectedNodeSidebar />
        <div className="relative flex-1">
          <GraphView />
          <SearchOverlay />
          <FloatingChat />
        </div>
      </div>
    </main>
  );
}
