import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';

// C4 architectural layers - the only supported layers
export const C4_LAYERS = ['system', 'container', 'component', 'code'] as const;
export type C4Layer = typeof C4_LAYERS[number];

export function mantaDir(): string {
  return path.join(getDevProjectDir(), 'manta');
}

function activeLayerFile(): string {
  return path.join(mantaDir(), 'active-layer.json');
}

export function listLayers(): string[] {
  // Return only C4 layers
  return [...C4_LAYERS];
}

export function getActiveLayer(): string | null {
  try {
    const f = activeLayerFile();
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.active === 'string' && C4_LAYERS.includes(data.active as C4Layer)) {
        return data.active;
      }
    }
  } catch {}

  // Default to system layer
  return 'system';
}

export function setActiveLayer(name: string | null): void {
  // Only allow C4 layers or null
  if (name && !C4_LAYERS.includes(name as C4Layer)) {
    throw new Error(`Invalid layer: ${name}. Only C4 layers are supported.`);
  }

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
