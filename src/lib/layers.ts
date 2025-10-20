import fs from 'fs';
import path from 'path';
import { getDevProjectDir } from '@/lib/project-config';
import { getParentLayerPath } from './layer-utils';

const WELCOME_GRAPH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<graph xmlns="urn:app:graph" version="1.0" directed="true">
  <nodes>
    <node id="node-1760069205219845" title="Welcome to Manta!" x="-171.50757392668527" y="285.3244832323122" z="0" shape="comment">
      <description>Use slash commands to direct the agent:

**/index** - index the codebase

**/build** - build graph changes into code

**/beautify** - auto-align the graph

Use tags to specify the nodes:

**@Node1**

Please reach out at **km@getmanta.ai** with any questions!</description>
      <props>
        <prop name="width" title="width" type="string">910</prop>
        <prop name="height" title="height" type="string">584</prop>
      </props>
    </node>
  </nodes>

  <edges>

  </edges>
</graph>`;

const EMPTY_GRAPH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<graph xmlns="urn:app:graph" version="1.0" directed="true">
  <nodes>
  </nodes>

  <edges>
  </edges>
</graph>`;

export type LayersInfo = {
  layers: string[];
  activeLayer: string | null;
};

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

// Recursively find all layer directories
function findLayerDirectories(dir: string, basePath: string = ''): string[] {
  const layers: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

        // Check if this directory contains graph files (is a layer)
        const currentGraphPath = path.join(fullPath, 'current-graph.xml');
        const baseGraphPath = path.join(fullPath, 'base-graph.xml');

        if (fs.existsSync(currentGraphPath) && fs.existsSync(baseGraphPath)) {
          layers.push(relativePath);
        }

        // Recursively search subdirectories
        const subLayers = findLayerDirectories(fullPath, relativePath);
        layers.push(...subLayers);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return layers;
}

export function listLayers(): string[] {
  try {
    ensureLayersRoot();
    const layers = findLayerDirectories(layersRootDir());
    // Sort by depth first, then by name
    return layers.sort((a, b) => {
      const depthA = (a.match(/\//g) || []).length;
      const depthB = (b.match(/\//g) || []).length;

      if (depthA !== depthB) {
        return depthA - depthB;
      }

      // Same depth, sort lexicographically
      return a.localeCompare(b);
    });
  } catch {
    return [];
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

  // Fallback to first available layer
  const layers = listLayers();
  return layers.length > 0 ? layers[0] : null;
}

export function setActiveLayer(name: string | null): void {
  fs.mkdirSync(mantaDir(), { recursive: true });
  const content = JSON.stringify({ active: name }, null, 2);
  fs.writeFileSync(activeLayerFile(), content, 'utf8');
}

export function activeLayerDir(): string | null {
  const active = getActiveLayer();
  if (!active) return null;
  return path.join(layersRootDir(), active);
}

export function getLayerGraphPaths(name: string): { current: string; base: string } {
  const dir = path.join(layersRootDir(), name);
  return {
    current: path.join(dir, 'current-graph.xml'),
    base: path.join(dir, 'base-graph.xml'),
  };
}


export function getActiveLayerGraphPaths(): { current: string | null; base: string | null } {
  const dir = activeLayerDir();
  if (!dir) return { current: null, base: null };
  return {
    current: path.join(dir, 'current-graph.xml'),
    base: path.join(dir, 'base-graph.xml'),
  };
}

// Get layer name (last part of path)
function getLayerName(layerPath: string): string {
  const parts = layerPath.split('/');
  return parts[parts.length - 1];
}

export function createLayer(desiredName?: string, parentPath?: string): string {
  ensureLayersRoot();
  let name = desiredName?.trim();
  if (!name) {
    // Find next graphN name
    const existing = new Set(listLayers());
    let i = 1;
    while (existing.has(`graph${i}`)) i++;
    name = `graph${i}`;
  } else {
    // Sanitize name: keep simple alphanum, dash, underscore, and forward slash for paths
    name = name.replace(/[^a-zA-Z0-9-_\/]/g, '').trim() || 'graph1';
  }

  // If parentPath is provided, prepend it to create nested path
  const fullName = parentPath ? `${parentPath}/${name}` : name;

  const dir = path.join(layersRootDir(), fullName);
  fs.mkdirSync(dir, { recursive: true });

  const currentPath = path.join(dir, 'current-graph.xml');
  const basePath = path.join(dir, 'base-graph.xml');

  // Use welcome message only for the first layer
  const existingLayers = listLayers();
  const isFirstLayer = existingLayers.length === 0;
  const initialXml = isFirstLayer ? WELCOME_GRAPH_XML : EMPTY_GRAPH_XML;

  if (!fs.existsSync(basePath)) fs.writeFileSync(basePath, initialXml, 'utf8');
  if (!fs.existsSync(currentPath)) fs.writeFileSync(currentPath, initialXml, 'utf8');

  return fullName;
}

export function deleteLayer(name: string): void {
  const dir = path.join(layersRootDir(), name);
  if (!fs.existsSync(dir)) return;
  // Remove files and directory recursively
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const p = path.join(dir, e);
    try { fs.unlinkSync(p); } catch {}
  }
  try { fs.rmdirSync(dir); } catch {}

  // Fix active layer if needed
  const active = getActiveLayer();
  if (active === name) {
    const rest = listLayers();
    setActiveLayer(rest[0] ?? null);
  }
}

export function renameLayer(sourceName: string, newName: string): string {
  ensureLayersRoot();
  const srcDir = path.join(layersRootDir(), sourceName);
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source layer not found: ${sourceName}`);
  }

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

  const dstDir = path.join(layersRootDir(), targetName);

  // Move the directory
  try {
    fs.renameSync(srcDir, dstDir);
  } catch (error) {
    // If rename fails (e.g., cross-device), fall back to copy+delete
    fs.mkdirSync(dstDir, { recursive: true });
    const srcPaths = getLayerGraphPaths(sourceName);
    const dstPaths = getLayerGraphPaths(targetName);

    if (fs.existsSync(srcPaths.base)) {
      fs.copyFileSync(srcPaths.base, dstPaths.base);
    }
    if (fs.existsSync(srcPaths.current)) {
      fs.copyFileSync(srcPaths.current, dstPaths.current);
    }

    // Remove old directory
    const entries = fs.readdirSync(srcDir);
    for (const e of entries) {
      const p = path.join(srcDir, e);
      try { fs.unlinkSync(p); } catch {}
    }
    try { fs.rmdirSync(srcDir); } catch {}
  }

  // Update active layer if needed
  const active = getActiveLayer();
  if (active === sourceName) {
    setActiveLayer(targetName);
  }

  return targetName;
}

export function cloneLayer(sourceName: string, desiredName?: string, parentPath?: string): string {
  ensureLayersRoot();
  const srcDir = path.join(layersRootDir(), sourceName);
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Source layer not found: ${sourceName}`);
  }

  // Determine target name and path
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, '').trim();
  let targetName = sanitize(desiredName || '');
  if (!targetName) {
    // Use source layer name + "-copy"
    const sourceLayerName = getLayerName(sourceName);
    targetName = `${sourceLayerName}-copy`;
  }

  // Determine full target path
  const targetPath = parentPath ? `${parentPath}/${targetName}` : targetName;

  // Ensure uniqueness
  const existing = new Set(listLayers());
  let finalTargetPath = targetPath;
  if (existing.has(finalTargetPath)) {
    const baseName = getLayerName(finalTargetPath);
    const parentPath = getParentLayerPath(finalTargetPath);
    const basePath = parentPath ? `${parentPath}/${baseName}` : baseName;
    let i = 2;
    while (existing.has(parentPath ? `${parentPath}/${baseName}-${i}` : `${baseName}-${i}`)) i++;
    finalTargetPath = parentPath ? `${parentPath}/${baseName}-${i}` : `${baseName}-${i}`;
  }

  const dstDir = path.join(layersRootDir(), finalTargetPath);
  fs.mkdirSync(dstDir, { recursive: true });

  const srcPaths = getLayerGraphPaths(sourceName);
  const dstPaths = getLayerGraphPaths(finalTargetPath);

  // Copy files if they exist; otherwise create empty placeholders
  if (fs.existsSync(srcPaths.base)) {
    fs.copyFileSync(srcPaths.base, dstPaths.base);
  } else {
    fs.writeFileSync(dstPaths.base, EMPTY_GRAPH_XML, 'utf8');
  }
  if (fs.existsSync(srcPaths.current)) {
    fs.copyFileSync(srcPaths.current, dstPaths.current);
  } else {
    fs.writeFileSync(dstPaths.current, EMPTY_GRAPH_XML, 'utf8');
  }

  return finalTargetPath;
}

export function getLayersInfo(): LayersInfo {
  return { layers: listLayers(), activeLayer: getActiveLayer() };
}
