'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import GraphView from '@/components/GraphView';
import SelectedNodeSidebar from '@/components/SelectedNodeSidebar';
import { StickyBanner } from '@/components/ui/sticky-banner';
import { Button } from '@/components/ui/button';
import { GithubIcon } from 'lucide-react';
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
      <StickyBanner className="bg-violet-600 border-b border-violet-500" showCloseButton={false}>
        <div className="flex items-center justify-center w-full px-4 gap-3">
            <img src="/favicon.ico" alt="Manta IDE Logo" className="w-6 h-6" />
          <p className="text-sm text-white">
            Want to see how your repo looks in Manta?
          </p>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="group bg-white border-white text-violet-600 hover:bg-gray-50 hover:text-violet-700 transition-all duration-200"
          >
            <a href="https://github.com/manta-ide/manta" target="_blank" rel="noopener noreferrer" className="flex items-center">
              Try it out
              <svg
                className="w-4 h-4 ml-2 transition-transform duration-200 group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </Button>
        </div>
      </StickyBanner>
      <div className="flex h-[calc(100vh-4rem)]">
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
