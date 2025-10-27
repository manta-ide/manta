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
const isEqual = JSON.stringify(testGraph) === JSON.stringify(graphFromXml);
console.log('Original equals converted:', isEqual);

if (isEqual) {
  console.log('✅ XML conversion test passed!');
} else {
  console.log('❌ XML conversion test failed!');
  console.log('Original:', testGraph);
  console.log('Converted:', graphFromXml);
}
