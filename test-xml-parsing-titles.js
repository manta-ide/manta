// Test XML parsing to verify titles and types are working
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the function dynamically
import('./src/lib/graph-xml.ts').then(module => {
  const { xmlToGraph } = module;

  // Read the XML file
  const xmlPath = path.join(__dirname, '_graph', 'graph.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');

  console.log('Testing XML parsing...');

  try {
    const graph = xmlToGraph(xml);
    console.log('✅ Successfully parsed XML graph');

    if (graph.nodes && graph.nodes.length > 0) {
      const firstNode = graph.nodes[0];
      console.log(`\nNode: ${firstNode.title}`);
      console.log('Properties:');

      firstNode.properties?.slice(0, 5).forEach(prop => {
        console.log(`- ${prop.id}: ${prop.type} (title: "${prop.title}") = ${typeof prop.value === 'object' ? '[object]' : prop.value}`);
      });
    }

  } catch (error) {
    console.error('❌ Error parsing XML:', error.message);
    console.error('Stack:', error.stack);
  }
}).catch(err => {
  console.error('❌ Error importing module:', err.message);
});
