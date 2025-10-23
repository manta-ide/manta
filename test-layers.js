// Simple test script to verify layer creation
const fs = require('fs');
const path = require('path');

// Simulate the layer creation logic
function mantaDir() {
  return path.join(process.cwd(), 'manta');
}

function layersRootDir() {
  return path.join(mantaDir(), 'graphs');
}

function ensureLayersRoot() {
  fs.mkdirSync(layersRootDir(), { recursive: true });
}

function listLayers() {
  try {
    ensureLayersRoot();
    const entries = fs.readdirSync(layersRootDir())
      .filter(file => file.endsWith('.json') && file !== 'active-layer.json')
      .map(file => file.replace('.json', ''));

    // Always include C4 layers first
    const c4Layers = ['system', 'container', 'component', 'code'];
    const userLayers = entries.filter(layer => !c4Layers.includes(layer));

    // Sort user layers by creation time if available, otherwise lexicographically
    const sortedUserLayers = userLayers.sort((a, b) => a.localeCompare(b));

    return [...c4Layers, ...sortedUserLayers];
  } catch {
    // Return C4 layers even if directory doesn't exist
    return ['system', 'container', 'component', 'code'];
  }
}

function createLayer(desiredName) {
  ensureLayersRoot();
  let name = desiredName?.trim();
  if (!name) {
    // Find next graphN name
    const existing = new Set(listLayers());
    let i = 1;
    while (existing.has(`graph${i}`)) i++;
    name = `graph${i}`;
  }

  // Check if layer already exists
  const existingLayers = listLayers();
  if (existingLayers.includes(name)) {
    throw new Error(`Layer '${name}' already exists`);
  }

  console.log(`Creating layer: ${name}`);
  console.log(`Layers root: ${layersRootDir()}`);

  // Create layer definition
  const layerDef = {
    name,
    nodeIds: [],
    positions: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const layerDefPath = path.join(layersRootDir(), `${name}.json`);
  fs.writeFileSync(layerDefPath, JSON.stringify(layerDef, null, 2));
  console.log(`Created layer definition: ${layerDefPath}`);

  // Initialize graph files
  const currentGraphPath = path.join(layersRootDir(), 'current-graph.xml');
  const baseGraphPath = path.join(layersRootDir(), 'base-graph.xml');

  const initialGraphXml = `<?xml version="1.0" encoding="UTF-8"?>
<graph xmlns="urn:app:graph" version="1.0" directed="true">
  <nodes>
  </nodes>
  <edges>
  </edges>
</graph>`;

  fs.writeFileSync(currentGraphPath, initialGraphXml);
  fs.writeFileSync(baseGraphPath, initialGraphXml);

  console.log(`Created graph files: ${currentGraphPath}, ${baseGraphPath}`);

  return name;
}

// Test the functions
console.log('Current layers:', listLayers());
try {
  const layerName = createLayer();
  console.log('Created layer:', layerName);
  console.log('Updated layers:', listLayers());
} catch (e) {
  console.error('Error:', e.message);
}

// Check files
console.log('\nFiles in manta directory:');
try {
  const files = fs.readdirSync('manta', { recursive: true });
  console.log(files);
} catch (e) {
  console.log('No manta directory or error:', e.message);
}
