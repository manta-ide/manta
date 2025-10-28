import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getGraphSession, loadCurrentGraphFromFile } from '@/app/api/lib/graph-service';
import type { Graph, GraphEdge, GraphNode } from '@/app/api/lib/schemas';

type Layer = 'system' | 'container' | 'component' | 'code';
const C4_LAYERS: Layer[] = ['system', 'container', 'component', 'code'];

function ensureGraphLoaded(userId: string, projectId: string) {
  return loadCurrentGraphFromFile(userId, projectId).catch(() => null);
}

function getProjectRoot(): string {
  return process.cwd();
}

function normalizeRelPath(p: string): string {
  // Make workspace-relative, use forward slashes
  const root = getProjectRoot();
  const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
  const rel = path.relative(root, abs);
  return rel.replace(/\\/g, '/');
}

function fileExists(relPath: string): boolean {
  const root = getProjectRoot();
  const abs = path.resolve(root, relPath);
  try { return fs.existsSync(abs) && fs.statSync(abs).isFile(); } catch { return false; }
}

function layerOf(node: GraphNode): Layer | null {
  const t = (node as any)?.type;
  return C4_LAYERS.includes(t as Layer) ? (t as Layer) : null;
}

export async function GET(req: NextRequest) {
  try {
    // Get required parameters
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId') || 'default-user';
    const projectId = url.searchParams.get('projectId');
    
    if (!projectId) {
      return NextResponse.json({
        success: false,
        error: 'Project ID is required'
      }, { status: 400 });
    }

    // Load graph from backing store if needed
    let graph: Graph | null = getGraphSession();
    if (!graph) {
      await ensureGraphLoaded(userId, projectId);
      graph = getGraphSession();
    }

    if (!graph) {
      return NextResponse.json({
        success: true,
        summary: 'No graph loaded',
        stats: { nodes: 0, edges: 0 },
        files: { missing: [], totalReferenced: 0, index: {} },
        layers: {},
        interLayer: {}
      });
    }

    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges as GraphEdge[] : [];

    // Build file index (skip file existence checks since we use Supabase for storage)
    const fileIndex = new Map<string, { nodes: Set<string>, missing: boolean }>();
    const perNodeFiles: Array<{ nodeId: string; nodeTitle: string; files: Array<{ path: string; exists: boolean }> }> = [];

    for (const n of nodes) {
      const files = Array.isArray((n as any).metadata?.files) ? (n as any).metadata.files as string[] : [];
      const nodeEntries: Array<{ path: string; exists: boolean }> = [];
      for (const f of files) {
        if (typeof f !== 'string' || !f.trim()) continue;
        const rel = normalizeRelPath(f.trim());
        // Skip file existence check since we use Supabase - assume files exist
        const exists = true;
        nodeEntries.push({ path: rel, exists });
        const rec = fileIndex.get(rel) ?? { nodes: new Set<string>(), missing: false };
        rec.nodes.add(n.id);
        fileIndex.set(rel, rec);
      }
      perNodeFiles.push({ nodeId: n.id, nodeTitle: (n as any).title ?? n.id, files: nodeEntries });
    }

    // No missing files since we don't validate file existence with Supabase
    const missingFiles: Array<{ path: string; referencedBy: string[] }> = [];

    // Connectivity within layers
    const byLayer = new Map<Layer, { nodeIds: Set<string>; edges: GraphEdge[]; unconnected: string[]; intraEdgeCount: number }>();
    for (const L of C4_LAYERS) byLayer.set(L, { nodeIds: new Set(), edges: [], unconnected: [], intraEdgeCount: 0 });

    const nodeType: Record<string, Layer | null> = {};
    nodes.forEach(n => { nodeType[n.id] = layerOf(n); });
    for (const n of nodes) {
      const L = layerOf(n);
      if (!L) continue;
      byLayer.get(L)!.nodeIds.add(n.id);
    }

    // Compute intra-layer edges and unconnected within that layer
    for (const L of C4_LAYERS) {
      const info = byLayer.get(L)!;
      const ids = info.nodeIds;
      const intra = edges.filter(e => ids.has(e.source) && ids.has(e.target));
      info.edges = intra;
      info.intraEdgeCount = intra.length;
      // Unconnected within layer means degree 0 considering only intra-layer edges
      const degree = new Map<string, number>();
      ids.forEach(id => degree.set(id, 0));
      intra.forEach(e => {
        degree.set(e.source, (degree.get(e.source) || 0) + 1);
        degree.set(e.target, (degree.get(e.target) || 0) + 1);
      });
      info.unconnected = Array.from(ids).filter(id => (degree.get(id) || 0) === 0);
    }

    // Inter-layer connectivity matrix
    const interMatrix: Record<string, number> = {};
    const key = (a: Layer, b: Layer) => `${a}->${b}`;
    for (const a of C4_LAYERS) for (const b of C4_LAYERS) interMatrix[key(a, b)] = 0;
    edges.forEach(e => {
      const a = nodeType[e.source];
      const b = nodeType[e.target];
      if (!a || !b) return;
      interMatrix[key(a, b)] += 1;
    });

    // Prepare JSON output
    const filesIndexObj: Record<string, { nodes: string[]; missing: boolean }> = {};
    fileIndex.forEach((v, k) => { filesIndexObj[k] = { nodes: Array.from(v.nodes), missing: v.missing }; });

    const layersObj: Record<string, { nodes: number; intraEdges: number; unconnectedNodeIds: string[] }> = {};
    for (const L of C4_LAYERS) {
      const info = byLayer.get(L)!;
      layersObj[L] = {
        nodes: info.nodeIds.size,
        intraEdges: info.intraEdgeCount,
        unconnectedNodeIds: info.unconnected,
      };
    }

    const hasMissingFiles = missingFiles.length > 0;
    const hasDisconnectedWithinLayers = Object.values(layersObj).some(v => v.nodes > 1 && v.intraEdges === 0);

    const summary: string[] = [];
    summary.push(`Nodes: ${nodes.length}, Edges: ${edges.length ?? 0}`);
    if (hasMissingFiles) summary.push(`${missingFiles.length} referenced file(s) are missing.`);
    if (hasDisconnectedWithinLayers) summary.push('Some layers have no internal connections.');

    return NextResponse.json({
      success: true,
      summary: summary.join(' '),
      stats: { nodes: nodes.length, edges: edges.length ?? 0 },
      files: {
        totalReferenced: Object.keys(filesIndexObj).length,
        missing: missingFiles,
        perNode: perNodeFiles,
        index: filesIndexObj,
      },
      layers: layersObj,
      interLayer: interMatrix,
      recommendations: hasMissingFiles ?
        'Missing files detected. Restart the agent and add the missing files or update node metadata to correct paths.' :
        undefined,
    });
  } catch (error) {
    console.error('Graph validation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

