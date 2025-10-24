import { NextRequest, NextResponse } from 'next/server';
import { getLayersInfo, setActiveLayer } from '@/lib/layers-server';
import { broadcastGraphJson } from '@/app/api/lib/graph-service';

export async function GET() {
  try {
    const info = getLayersInfo();
    return NextResponse.json({ success: true, ...info });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to list layers' }, { status: 500 });
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
