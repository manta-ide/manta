// Test XML generation to verify titles are included
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the function dynamically
import('./src/lib/graph-xml.ts').then(module => {
  const { graphToXml } = module;

  // Read the JSON file
  const jsonPath = path.join(__dirname, 'saved', 'graph.json');
  const jsonData = fs.readFileSync(jsonPath, 'utf8');
  const graph = JSON.parse(jsonData);

  console.log('Testing XML generation...');

  try {
    const xml = graphToXml(graph);
    console.log('Generated XML (first 1000 chars):');
    console.log(xml.substring(0, 1000));

    // Check if titles are included
    const titleMatches = xml.match(/title="[^"]*"/g);
    console.log('\nTitle attributes found:', titleMatches ? titleMatches.length : 0);
    if (titleMatches) {
      console.log('Sample titles:', titleMatches.slice(0, 5));
    }

  } catch (error) {
    console.error('❌ Error generating XML:', error.message);
    console.error('Stack:', error.stack);
  }
}).catch(err => {
  console.error('❌ Error importing module:', err.message);
});
