'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import { Graph } from '@/app/api/lib/schemas';

export default function GraphPage() {
  const params = useParams();
  const graphId = params['graph-id'] as string;
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadGraph = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load graph via API
        const response = await fetch(`/api/graph-api/${graphId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError(`Graph "${graphId}" not found`);
          } else {
            setError('Failed to load graph');
          }
          return;
        }

        const data = await response.json();
        setGraph(data.graph || data);
      } catch (err) {
        console.error('Error loading graph:', err);
        setError('Failed to load graph');
      } finally {
        setLoading(false);
      }
    };

    if (graphId) {
      loadGraph();
    }
  }, [graphId]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-100 mx-auto mb-4"></div>
          <p>Loading graph "{graphId}"...</p>
        </div>
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">Graph Not Found</h1>
          <p className="text-zinc-400">{error || `Could not load graph "${graphId}"`}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="flex h-full">
        {/* Readonly sidebar with readonly properties */}
        <SelectedNodeSidebar readonly={true} />
        {/* Readonly graph view */}
        <div className="flex-1 min-w-0 relative">
          <GraphView graph={graph} readonly={true} />
        </div>
      </div>
    </main>
  );
}
