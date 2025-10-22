import { NextRequest, NextResponse } from 'next/server';
import { loadLayerDefinition } from '@/lib/layers-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ layerName: string }> }
) {
  try {
    const { layerName } = await params;
    const layerDef = loadLayerDefinition(layerName);
    return NextResponse.json(layerDef);
  } catch (error) {
    return NextResponse.json({ error: 'Layer not found' }, { status: 404 });
  }
}
