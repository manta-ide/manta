// Simple test to debug XML parsing
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the XML file
const xmlPath = path.join(__dirname, 'test2', '_graph', 'graph.xml');
const xml = fs.readFileSync(xmlPath, 'utf8');

console.log('XML content length:', xml.length);
console.log('First 200 chars:', xml.substring(0, 200));

// Simple regex test
const rootMatch = /<graph[\s\S]*?>[\s\S]*<\/graph>/i.exec(xml);
console.log('Root match found:', !!rootMatch);

if (rootMatch) {
  console.log('Root content length:', rootMatch[0].length);

  // Extract nodes section
  const nodesMatch = /<nodes>([\s\S]*?)<\/nodes>/i.exec(rootMatch[0]);
  console.log('Nodes section found:', !!nodesMatch);

  if (nodesMatch) {
    console.log('Nodes content length:', nodesMatch[1].length);

    // Count nodes
    const nodeMatches = rootMatch[0].match(/<node[^>]*>/g);
    console.log('Node tags found:', nodeMatches ? nodeMatches.length : 0);
  }

  // Extract edges section
  const edgesMatch = /<edges>([\s\S]*?)<\/edges>/i.exec(rootMatch[0]);
  console.log('Edges section found:', !!edgesMatch);

  if (edgesMatch) {
    console.log('Edges content length:', edgesMatch[1].length);

    // Count edges
    const edgeMatches = rootMatch[0].match(/<edge[^>]*\/?>/g);
    console.log('Edge tags found:', edgeMatches ? edgeMatches.length : 0);
  }
}
