import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { graphToXml } from '../../../lib/graph-xml';
import type { Graph } from '../lib/schemas';

// Force Node.js runtime for file operations
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    console.log('🔄 Resetting graph and clearing images...');

    // Clear all generated images
    const imagesDir = path.join(process.cwd(), 'public', 'generated-images');
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      let deletedCount = 0;

      for (const file of files) {
        if (file.startsWith('graph-') && file.endsWith('.png')) {
          const filePath = path.join(imagesDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`🗑️ Deleted image: ${file}`);
          } catch (error) {
            console.warn(`⚠️ Failed to delete ${file}:`, error);
          }
        }
      }

      console.log(`✅ Deleted ${deletedCount} generated images`);
    }

    // Reset base graph to empty state
    const emptyGraph: Graph = { nodes: [], edges: [] };
    // Note: Resetting the base graph by storing empty graph as base
    const baseGraphPath = path.join(process.cwd(), 'manta', 'base-graph.xml');
    const emptyXml = graphToXml(emptyGraph);
    fs.writeFileSync(baseGraphPath, emptyXml);

    console.log('✅ Base graph reset to empty state');

    console.log('✅ Graph reset complete');

    return NextResponse.json({
      success: true,
      message: 'Graph reset successfully'
    });

  } catch (error: any) {
    console.error('❌ Error resetting graph:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset graph' },
      { status: 500 }
    );
  }
}
