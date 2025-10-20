import { NextRequest, NextResponse } from 'next/server';
import { createLayer, deleteLayer, getLayersInfo, setActiveLayer, ensureLayersRoot, layersRootDir, mantaDir, cloneLayer, renameLayer } from '@/lib/layers';
import { initializeGraphsFromFiles, broadcastGraphJson } from '@/app/api/lib/graph-service';
import { graphToXml } from '@/lib/graph-xml';
import { loadCurrentGraphFromFile } from '@/app/api/lib/graph-service';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    ensureLayersRoot();
    let info = getLayersInfo();
    // Auto-initialize a default layer if none exist
    if (info.layers.length === 0) {
      const root = mantaDir();
      const rootCurrent = path.join(root, 'current-graph.xml');
      const rootBase = path.join(root, 'base-graph.xml');
      const name = createLayer('graph1');
      // Copy existing root graphs into the new layer if available
      const layerDir = path.join(layersRootDir(), name);
      try {
        if (fs.existsSync(rootCurrent)) {
          fs.copyFileSync(rootCurrent, path.join(layerDir, 'current-graph.xml'));
        }
        if (fs.existsSync(rootBase)) {
          fs.copyFileSync(rootBase, path.join(layerDir, 'base-graph.xml'));
        }
      } catch {}
      setActiveLayer(name);
      info = getLayersInfo();
    }
    return NextResponse.json({ success: true, ...info });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to list layers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Clone operation if cloneFrom is provided
    if (body?.cloneFrom) {
      const newName = cloneLayer(String(body.cloneFrom), body?.name, body?.parentPath);
      if (body?.setActive !== false) setActiveLayer(newName);
      return NextResponse.json({ success: true, name: newName, clonedFrom: String(body.cloneFrom) });
    }
    // Otherwise create a new empty layer
    const name = createLayer(body?.name, body?.parentPath);
    if (body?.setActive) setActiveLayer(name);
    return NextResponse.json({ success: true, name });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to create layer' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const from = String(body?.from || '').trim();
    const to = String(body?.to || '').trim();
    if (!from || !to) return NextResponse.json({ error: 'from and to names required' }, { status: 400 });

    const newName = renameLayer(from, to);

    // Sync memory and notify
    await initializeGraphsFromFiles();
    const info = getLayersInfo();
    broadcastGraphJson({ type: 'active-layer-changed', activeLayer: info.activeLayer });

    return NextResponse.json({ success: true, name: newName });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to rename layer' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    setActiveLayer(name);

    // Refresh in-memory session to point to new layer
    await initializeGraphsFromFiles();

    // Broadcast a layer change event to SSE clients
    // We do this by sending a small JSON message on the same SSE channel
    // using the registerStreamController/enqueue pattern.
    broadcastGraphJson({ type: 'active-layer-changed', activeLayer: name });

    // Also send a graph snapshot for immediate UI refresh if possible
    const graph = await loadCurrentGraphFromFile('default-user');
    if (graph) {
      const xml = graphToXml(graph);
      const payload = new TextEncoder().encode(`data: ${Buffer.from(xml, 'utf8').toString('base64')}\n\n`);
      // Use broadcastGraphJson wrapper by sending an explicit graph-update message
      broadcastGraphJson({ type: 'graph-update', xml: Buffer.from(xml, 'utf8').toString('base64') });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to set active layer' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = String(url.searchParams.get('name') || '').trim();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    deleteLayer(name);

    // Sync memory and notify
    await initializeGraphsFromFiles();
    const info = getLayersInfo();
    broadcastGraphJson({ type: 'active-layer-changed', activeLayer: info.activeLayer });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to delete layer' }, { status: 500 });
  }
}
