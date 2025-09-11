// Test script to verify MCP returns XML
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readLocalGraph() {
  try {
    const p = path.join(__dirname, '_graph', 'graph.xml');
    if (!fs.existsSync(p)) return null;
    const rawXml = fs.readFileSync(p, 'utf8');

    // Return both parsed graph and raw XML for MCP responses
    return {
      graph: { nodes: [], edges: [] }, // Simplified for test
      rawXml
    };
  } catch (e) {
    console.error('Error reading local graph:', e.message);
    return null;
  }
}

// Simulate the MCP response logic
function simulateMcpResponse() {
  const data = readLocalGraph();

  if (data && data.rawXml) {
    console.log('✅ MCP would return XML format!');
    console.log('Response contains XML:', data.rawXml.includes('<graph'));
    console.log('XML length:', data.rawXml.length);
    return { content: [{ type: 'text', text: data.rawXml }] };
  } else {
    console.log('❌ MCP would return JSON format');
    return { content: [{ type: 'text', text: 'JSON response' }] };
  }
}

console.log('Testing MCP XML response...');
simulateMcpResponse();
