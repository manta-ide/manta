'use client';

import { use, useState } from 'react';
import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import FloatingChat from '@/components/FloatingChat';
import SearchOverlay from '@/components/SearchOverlay';
import LayersSidebar from '@/components/LayersSidebar';
import { SidebarProvider, useSidebar } from '@/components/DashboardSidebar';
import { useProjectStore } from '@/lib/store';
import { useEffect } from 'react';

function ProjectGraphContent({ projectName }: { projectName: string }) {
  const { sidebarWidth } = useSidebar();
  const layersSidebarOpen = useProjectStore((s) => s.layersSidebarOpen);
  const setCurrentProjectId = useProjectStore((s) => s.setCurrentProjectId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project by name to get its ID
  useEffect(() => {
    async function fetchProject() {
      try {
        setLoading(true);
        const response = await fetch('/api/projects');
        if (!response.ok) {
          throw new Error('Failed to fetch projects');
        }
        const projects = await response.json();
        
        // Find the project by name
        const project = projects.find((p: any) => p.name === projectName);
        
        if (!project) {
          setError(`Project "${projectName}" not found`);
          return;
        }
        
        setProjectId(project.id);
        setCurrentProjectId(project.id);
      } catch (err) {
        console.error('Error fetching project:', err);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    fetchProject();

    // Clean up on unmount
    return () => {
      setCurrentProjectId(null);
    };
  }, [projectName, setCurrentProjectId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ marginLeft: sidebarWidth }}>
        <div className="text-zinc-400">Loading project...</div>
      </div>
    );
  }

  if (error || !projectId) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ marginLeft: sidebarWidth }}>
        <div className="text-red-400">{error || 'Project not found'}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ marginLeft: sidebarWidth }}>
      <div className="flex h-full">
        <SelectedNodeSidebar />
        <div className="relative flex-1 min-w-0">
          <GraphView projectId={projectId} />
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

export default function ProjectPage({ params }: { params: Promise<{ name: string }> }) {
  const resolvedParams = use(params);
  const setLayersSidebarOpen = useProjectStore((s) => s.setLayersSidebarOpen);
  
  // Convert URL format from "account-repo" back to "account/repo"
  const projectName = resolvedParams.name.replace(/-/g, '/');

  useEffect(() => {
    const handler = () => setLayersSidebarOpen(true);
    window.addEventListener('manta:open-layers', handler as EventListener);
    return () => window.removeEventListener('manta:open-layers', handler as EventListener);
  }, [setLayersSidebarOpen]);

  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="flex h-full">
          <ProjectGraphContent projectName={projectName} />
        </div>
      </div>
    </SidebarProvider>
  );
}
