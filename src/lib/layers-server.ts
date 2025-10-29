import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';
import { xmlToGraph } from '@/lib/graph-xml';
import { getAvailableLayers } from '@/lib/layers';

export function mantaDir(): string {
  return path.join(getDevProjectDir(), 'manta');
}

function activeLayerFile(): string {
  return path.join(mantaDir(), 'active-layer.json');
}

export function listLayers(): string[] {
  // Note: Layers are now discovered dynamically on the client side from Supabase graph data
  // The server no longer reads from local files since graphs are stored in Supabase
  // Return empty array - the client will discover layers from the loaded graph
  return [];
}

export function getActiveLayer(): string | null {
  try {
    const f = activeLayerFile();
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.active === 'string') {
        return data.active;
      }
    }
  } catch {}

  // No default layer - let the UI show all nodes when no layer is set
  return null;
}

export function setActiveLayer(name: string | null): void {
  // Allow any layer name (dynamic layers)
  fs.mkdirSync(mantaDir(), { recursive: true });
  const content = JSON.stringify({ active: name }, null, 2);
  fs.writeFileSync(activeLayerFile(), content, 'utf8');
}

export function getMainGraphPaths(): { current: string } {
  const dir = path.join(mantaDir(), 'graphs');
  return {
    current: path.join(dir, 'current-graph.xml'),
  };
}

export function getLayersInfo(): { layers: string[]; activeLayer: string | null } {
  return { layers: listLayers(), activeLayer: getActiveLayer() };
}
