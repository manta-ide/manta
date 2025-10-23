import { NextRequest, NextResponse } from 'next/server';
import {
  createLayer,
  deleteLayer,
  getLayersInfo,
  setActiveLayer,
  ensureLayersRoot,
  cloneLayer,
  renameLayer,
  loadLayerDefinition,
  updateLayerDefinition,
  addNodeToLayer,
  removeNodeFromLayer,
  updateNodePositionInLayer,
  LayerDefinition
} from '@/lib/layers-server';
import { broadcastGraphJson } from '@/app/api/lib/graph-service';
import { loadCurrentGraphFromFile, initializeGraphsFromFiles } from '@/app/api/lib/graph-service';

export async function GET() {
  try {
    ensureLayersRoot();
    // Ensure a default layer exists when listing layers
    await initializeGraphsFromFiles();
    const info = getLayersInfo();
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
      const newName = cloneLayer(String(body.cloneFrom), body?.name);
      if (body?.setActive !== false) setActiveLayer(newName);
      return NextResponse.json({ success: true, name: newName, clonedFrom: String(body.cloneFrom) });
    }
    // Otherwise create a new empty layer
    const name = createLayer(body?.name);
    if (body?.setActive) setActiveLayer(name);
    return NextResponse.json({ success: true, name });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to create layer' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Rename operation
    if (body.from && body.to) {
      const from = String(body.from).trim();
      const to = String(body.to).trim();
      if (!from || !to) return NextResponse.json({ error: 'from and to names required' }, { status: 400 });

      const newName = renameLayer(from, to);
      const info = getLayersInfo();
      broadcastGraphJson({ type: 'active-layer-changed', activeLayer: info.activeLayer });

      return NextResponse.json({ success: true, name: newName });
    }

    // Update layer definition operation
    if (body.layerName) {
      const layerName = String(body.layerName).trim();

      if (body.nodeId && body.position) {
        // Update node position in layer
        updateNodePositionInLayer(layerName, String(body.nodeId), body.position);
      } else if (body.addNodeId) {
        // Add node to layer
        addNodeToLayer(layerName, String(body.addNodeId));
      } else if (body.removeNodeId) {
        // Remove node from layer
        removeNodeFromLayer(layerName, String(body.removeNodeId));
      } else if (body.updates) {
        // General layer updates
        updateLayerDefinition(layerName, body.updates);
      }

      // Broadcast layer update
      broadcastGraphJson({ type: 'layer-updated', layerName });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid patch operation' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to update layer' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    setActiveLayer(name);

    // Broadcast a layer change event to SSE clients
    broadcastGraphJson({ type: 'active-layer-changed', activeLayer: name });

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

    // Notify about layer changes
    const info = getLayersInfo();
    broadcastGraphJson({ type: 'active-layer-changed', activeLayer: info.activeLayer });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to delete layer' }, { status: 500 });
  }
}
