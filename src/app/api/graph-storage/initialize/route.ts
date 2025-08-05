import { NextRequest, NextResponse } from 'next/server';
import { initializeGraphsFromFiles } from '../../lib/graphStorage';

export async function POST(request: NextRequest) {
  try {
    const { graphs } = await request.json();
    
    // Initialize graphs in memory storage
    if (graphs && Array.isArray(graphs)) {
      for (const graphData of graphs) {
        const { sessionId, graph } = graphData;
        // Import the storeGraph function dynamically to avoid circular imports
        const { storeGraph } = await import('../../lib/graphStorage');
        await storeGraph(sessionId, graph);
      }
      console.log(`✅ Initialized ${graphs.length} graphs in storage`);
    }
    
    return NextResponse.json({ success: true, message: 'Graphs initialized successfully' });
  } catch (error) {
    console.error('Error initializing graphs:', error);
    return NextResponse.json(
      { error: 'Failed to initialize graphs' },
      { status: 500 }
    );
  }
} 