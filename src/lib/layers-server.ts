import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';
import type { LayerDefinition } from './layers';

const EMPTY_GRAPH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<graph xmlns="urn:app:graph" version="1.0" directed="true">
  <nodes>
  </nodes>

  <edges>
  </edges>
</graph>`;

export function mantaDir(): string {
  return path.join(getDevProjectDir(), 'manta');
}

export function layersRootDir(): string {
  return path.join(mantaDir(), 'graphs');
}

function activeLayerFile(): string {
  return path.join(mantaDir(), 'active-layer.json');
}

export function ensureLayersRoot(): void {
  fs.mkdirSync(layersRootDir(), { recursive: true });
}

export function listLayers(): string[] {
  try {
    ensureLayersRoot();
    const entries = fs
      .readdirSync(layersRootDir())
      .filter((file) => file.endsWith('.json') && file !== 'active-layer.json')
      .map((file) => file.replace('.json', ''));

    // Always include C4 layers first
    const c4Layers = ['system', 'container', 'component', 'code'];
    const userLayers = entries.filter(layer => !c4Layers.includes(layer));

    // Sort user layers by creation time if available, otherwise lexicographically
    const sortedUserLayers = userLayers.sort((a, b) => {
      try {
        const layerA = loadLayerDefinition(a);
        const layerB = loadLayerDefinition(b);
        return new Date(layerA.createdAt).getTime() - new Date(layerB.createdAt).getTime();
      } catch {
        return a.localeCompare(b);
      }
    });

    return [...c4Layers, ...sortedUserLayers];
  } catch {
    // Return C4 layers even if directory doesn't exist
    return ['system', 'container', 'component', 'code'];
  }
}

export function getActiveLayer(): string | null {
  try {
    const f = activeLayerFile();
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.active === 'string') return data.active;
    }
  } catch {}

  // Fallback to system layer (C4 architecture)
  const layers = listLayers();
  return layers.includes('system') ? 'system' : (layers.length > 0 ? layers[0] : null);
}

export function setActiveLayer(name: string | null): void {
  fs.mkdirSync(mantaDir(), { recursive: true });
  const content = JSON.stringify({ active: name }, null, 2);
  fs.writeFileSync(activeLayerFile(), content, 'utf8');
}

export function getLayerDefinitionPath(name: string): string {
  return path.join(layersRootDir(), `${name}.json`);
}

export function loadLayerDefinition(name: string): LayerDefinition {
  const filePath = getLayerDefinitionPath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Layer definition not found: ${name}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

export function saveLayerDefinition(layerDef: LayerDefinition): void {
  const filePath = getLayerDefinitionPath(layerDef.name);
  layerDef.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(layerDef, null, 2), 'utf8');
}

export function getMainGraphPaths(): { current: string; base: string } {
  const dir = path.join(mantaDir(), 'graphs');
  return {
    current: path.join(dir, 'current-graph.xml'),
    base: path.join(dir, 'base-graph.xml'),
  };
}

export function createLayer(desiredName?: string): string {
  ensureLayersRoot();
  let name = desiredName?.trim();
  if (!name) {
    // Find next graphN name
    const existing = new Set(listLayers());
    let i = 1;
    while (existing.has(`graph${i}`)) i++;
    name = `graph${i}`;
  } else {
    // Sanitize name: keep simple alphanum, dash, underscore
    name = name.replace(/[^a-zA-Z0-9-_]/g, '').trim() || 'graph1';
  }

  // Check if layer already exists
  const existingLayers = listLayers();
  if (existingLayers.includes(name)) {
    throw new Error(`Layer '${name}' already exists`);
  }

  // Create layer definition
  const now = new Date().toISOString();
  const layerDef: LayerDefinition = {
    name,
    nodeIds: [],
    positions: {},
    createdAt: now,
    updatedAt: now,
  };

  saveLayerDefinition(layerDef);

  // Initialize graph files for the new layer
  const graphDir = layersRootDir();
  fs.mkdirSync(graphDir, { recursive: true });

  const currentGraphPath = path.join(graphDir, 'current-graph.xml');
  const baseGraphPath = path.join(graphDir, 'base-graph.xml');

  // Always use empty graph for new layers
  const initialGraphXml = EMPTY_GRAPH_XML;

  // Initialize both current and base graphs with the same content
  fs.writeFileSync(currentGraphPath, initialGraphXml, 'utf8');
  fs.writeFileSync(baseGraphPath, initialGraphXml, 'utf8');

  return name;
}

export function deleteLayer(name: string): void {
  const filePath = getLayerDefinitionPath(name);
  if (!fs.existsSync(filePath)) return;

  try { fs.unlinkSync(filePath); } catch {}

  // Fix active layer if needed
  const active = getActiveLayer();
  if (active === name) {
    const rest = listLayers();
    setActiveLayer(rest[0] ?? null);
  }
}

export function renameLayer(sourceName: string, newName: string): string {
  ensureLayersRoot();

  // Sanitize and validate new name
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, '').trim();
  const targetName = sanitize(newName);
  if (!targetName) {
    throw new Error('Invalid layer name');
  }

  // Check if target name already exists
  const existing = new Set(listLayers());
  if (existing.has(targetName) && targetName !== sourceName) {
    throw new Error(`Layer '${targetName}' already exists`);
  }

  if (targetName === sourceName) {
    return sourceName; // No-op
  }

  // Load the source layer definition
  const layerDef = loadLayerDefinition(sourceName);

  // Delete the old file
  const oldPath = getLayerDefinitionPath(sourceName);
  try { fs.unlinkSync(oldPath); } catch {}

  // Create the new layer with updated name
  layerDef.name = targetName;
  saveLayerDefinition(layerDef);

  // Update active layer if needed
  const active = getActiveLayer();
  if (active === sourceName) {
    setActiveLayer(targetName);
  }

  return targetName;
}

export function cloneLayer(sourceName: string, desiredName?: string): string {
  ensureLayersRoot();

  // Determine target name
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, '').trim();
  let targetName = sanitize(desiredName || '');
  if (!targetName) {
    // Prefer `<source>-copy`, then `<source>-copy-2`, etc.
    const base = sanitize(`${sourceName}-copy`);
    targetName = base;
    const existing = new Set(listLayers());
    if (existing.has(targetName)) {
      let i = 2;
      while (existing.has(`${base}-${i}`)) i++;
      targetName = `${base}-${i}`;
    }
  } else {
    // Ensure uniqueness
    const existing = new Set(listLayers());
    if (existing.has(targetName)) {
      let i = 2;
      while (existing.has(`${targetName}-${i}`)) i++;
      targetName = `${targetName}-${i}`;
    }
  }

  // Load and clone the source layer definition
  const sourceLayer = loadLayerDefinition(sourceName);
  const clonedLayer: LayerDefinition = {
    name: targetName,
    nodeIds: [...sourceLayer.nodeIds],
    positions: { ...sourceLayer.positions },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveLayerDefinition(clonedLayer);
  return targetName;
}

export function updateLayerDefinition(layerName: string, updates: Partial<LayerDefinition>): void {
  const layerDef = loadLayerDefinition(layerName);
  const updatedLayer = { ...layerDef, ...updates };
  saveLayerDefinition(updatedLayer);
}

export function addNodeToLayer(layerName: string, nodeId: string): void {
  const layerDef = loadLayerDefinition(layerName);
  if (!layerDef.nodeIds.includes(nodeId)) {
    layerDef.nodeIds.push(nodeId);
    saveLayerDefinition(layerDef);
  }
}

export function removeNodeFromLayer(layerName: string, nodeId: string): void {
  const layerDef = loadLayerDefinition(layerName);
  layerDef.nodeIds = layerDef.nodeIds.filter(id => id !== nodeId);
  // Edges are now automatically determined, so no need to manually remove them
  saveLayerDefinition(layerDef);
}

export function updateNodePositionInLayer(layerName: string, nodeId: string, position: { x: number; y: number; z?: number }): void {
  const layerDef = loadLayerDefinition(layerName);
  layerDef.positions[nodeId] = { ...position };
  saveLayerDefinition(layerDef);
}

export function getLayersInfo(): { layers: string[]; activeLayer: string | null } {
  return { layers: listLayers(), activeLayer: getActiveLayer() };
}

// Re-export the type
export type { LayerDefinition };
