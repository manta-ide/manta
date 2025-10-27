// Test script to verify JSON/XML format support in graph service
const { graphToXml, xmlToGraph } = require('./src/lib/graph-xml.ts');

// Sample graph data for testing
const testGraph = {
  nodes: [
    {
      id: 'test-node-1',
      title: 'Test Node 1',
      description: 'A test node',
      type: 'component',
      properties: [
        {
          id: 'name',
          title: 'Name',
          type: 'text',
          value: 'Test Component'
        }
      ]
    }
  ],
  edges: []
};

console.log('🧪 Testing graph format conversion...\n');

// Test XML conversion
console.log('1. Converting graph to XML:');
const xmlOutput = graphToXml(testGraph);
console.log(xmlOutput);
console.log('\n2. Converting XML back to graph:');
const graphFromXml = xmlToGraph(xmlOutput);
console.log(JSON.stringify(graphFromXml, null, 2));

// Verify round-trip conversion
console.log('\n3. Round-trip verification:');

// Deep equality check that ignores property order
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (!deepEqual(keysA, keysB)) return false;

  for (const key of keysA) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

const isEqual = deepEqual(testGraph, graphFromXml);
console.log('Original equals converted:', isEqual);

if (isEqual) {
  console.log('✅ XML conversion test passed!');
} else {
  console.log('❌ XML conversion test failed - checking differences...');

  // Check what's different
  console.log('Original node keys:', Object.keys(testGraph.nodes[0]));
  console.log('Converted node keys:', Object.keys(graphFromXml.nodes[0]));

  // Check if properties are the same
  const origProps = testGraph.nodes[0].properties[0];
  const convProps = graphFromXml.nodes[0].properties[0];
  console.log('Property equal:', deepEqual(origProps, convProps));
}
