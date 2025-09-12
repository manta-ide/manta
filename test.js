// Round-trip graph XML <-> JSON test
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeForCompare(obj) {
  // Remove undefined values and sort arrays of edges/nodes/properties consistently
  const seen = new WeakSet();
  const recur = (v) => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return v;
      seen.add(v);
      if (Array.isArray(v)) {
        return v.map(recur);
      }
      const out = {};
      Object.keys(v).forEach((k) => {
        const val = recur(v[k]);
        if (val !== undefined) out[k] = val;
      });

      // Sort common arrays for stable comparison
      if (Array.isArray(out.nodes)) out.nodes = [...out.nodes].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      if (Array.isArray(out.edges)) out.edges = [...out.edges].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      if (Array.isArray(out.properties)) out.properties = [...out.properties].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
      return out;
    }
    return v;
  };
  return recur(obj);
}

function diff(a, b, basePath = '') {
  const changes = [];
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const keys = new Set([...(isObj(a) ? Object.keys(a) : []), ...(isObj(b) ? Object.keys(b) : [])]);
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      changes.push(...diff(a[i], b[i], `${basePath}[${i}]`));
    }
    return changes;
  }
  if (isObj(a) && isObj(b)) {
    for (const k of keys) {
      changes.push(...diff(a[k], b[k], basePath ? `${basePath}.${k}` : k));
    }
    return changes;
  }
  if (a === undefined && b === undefined) return changes;
  if (a !== b) changes.push({ path: basePath, a, b });
  return changes;
}

async function main() {
  const xmlPath = path.join(__dirname, '_graph', 'graph.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');

  const { xmlToGraph, graphToXml } = await import('./src/lib/graph-xml.ts');

  console.log('Parsing original XML...');
  const g1 = xmlToGraph(xml);
  console.log(`Parsed nodes: ${g1.nodes?.length ?? 0}, edges: ${g1.edges?.length ?? 0}`);

  console.log('Serializing to XML...');
  const xml2 = graphToXml(g1);

  // Write temporary files for debugging
  const outDir = path.join(__dirname, '_graph', '.roundtrip');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'roundtrip.xml'), xml2, 'utf8');

  console.log('Parsing round-tripped XML...');
  const g2 = xmlToGraph(xml2);

  // Normalize and diff
  const n1 = normalizeForCompare(g1);
  const n2 = normalizeForCompare(g2);

  const changes = diff(n1, n2);
  if (changes.length === 0) {
    console.log('✅ Round-trip JSON matches.');
  } else {
    console.log(`❌ Differences found: ${changes.length}`);
    // Print a few diffs for inspection
    for (const c of changes.slice(0, 50)) {
      console.log(`- ${c.path}:`, JSON.stringify(c.a), '!=', JSON.stringify(c.b));
    }
    process.exitCode = 1;
  }

  // Additional strict test: object-list with item schema but no values
  console.log('\nRunning strict object-list schema test...');
  const schemaGraph = {
    nodes: [{
      id: 'reviews-section',
      title: 'Reviews Section',
      prompt: 'desc',
      state: 'unbuilt',
      properties: [
        { id: 'reviews-title', title: 'Section Title', type: 'text', value: '' },
        { id: 'reviews-subtitle', title: 'Section Subtitle', type: 'text', value: '' },
        {
          id: 'reviews-list', title: 'Reviews', type: 'object-list',
          item: {
            author: { title: 'Author Name', type: 'text' },
            role: { title: 'Author Role', type: 'text' },
            company: { title: 'Company', type: 'text' },
            rating: { title: 'Rating (1-5)', type: 'select', options: ['1','2','3','4','5'], value: '5' },
            quote: { title: 'Quote', type: 'text' },
            avatar: { title: 'Avatar URL', type: 'text' }
          },
          value: []
        }
      ]
    }],
    edges: []
  };
  const xmlSchema = graphToXml(schemaGraph);
  // Assert object-list prop is not empty
  const propMatch = xmlSchema.match(/<prop[^>]*name="reviews-list"[^>]*type="object-list"[^>]*>([\s\S]*?)<\/prop>/);
  if (!propMatch) {
    console.error('❌ reviews-list prop not found in XML');
    process.exit(1);
  }
  const inner = propMatch[1];
  if (!/(<item\b[\s\S]*?<field\b|<field\b)/.test(inner)) {
    console.error('❌ reviews-list prop content is empty; expected nested item/field structure');
    process.exit(1);
  }
  const parsedSchema = xmlToGraph(xmlSchema);
  const rl = parsedSchema.nodes[0].properties.find(p => p.id === 'reviews-list');
  if (!rl) { console.error('❌ Parsed reviews-list property missing'); process.exit(1); }
  if (!Array.isArray(rl.itemFields) || rl.itemFields.length < 5) {
    console.error('❌ Parsed reviews-list.itemFields missing or too short');
    process.exit(1);
  }
  const ratingDef = rl.itemFields.find(f => f.id === 'rating');
  if (!ratingDef || !Array.isArray(ratingDef.options) || ratingDef.options.length !== 5) {
    console.error('❌ Parsed rating field options incorrect in itemFields');
    process.exit(1);
  }
  if (!Array.isArray(rl.value) || rl.value.length === 0) {
    console.error('❌ Parsed reviews-list.value should include at least one template item');
    process.exit(1);
  }
  console.log('✅ Strict object-list schema test passed.');

  // Additional strict test: object-list with items array containing nested field defs
  console.log('\nRunning strict object-list items[] test...');
  const itemsGraph = {
    nodes: [{
      id: 'reviews-section',
      title: 'Reviews / Testimonials',
      prompt: 'desc',
      state: 'unbuilt',
      properties: [
        { id: 'reviews-title', title: 'Section Title', type: 'text', value: 'What people say' },
        { id: 'reviews-subtitle', title: 'Section Subtitle', type: 'text', value: 'A few kind words' },
        {
          id: 'reviews-items', title: 'Reviews', type: 'object-list',
          items: [
            {
              name: { title: 'Name', type: 'text', value: 'Alex Chen' },
              role: { title: 'Role / Company', type: 'text', value: 'Engineering Manager' },
              rating: { title: 'Rating (1-5)', type: 'text', value: '5' },
              text: { title: 'Review Text', type: 'text', value: 'Great work' },
              avatar: { title: 'Avatar URL', type: 'text', value: 'https://example.com/a.jpg' },
              date: { title: 'Date', type: 'text', value: '2024-06-14' }
            },
            {
              name: { title: 'Name', type: 'text', value: 'Priya' },
              role: { title: 'Role / Company', type: 'text', value: 'Product Lead' },
              rating: { title: 'Rating (1-5)', type: 'text', value: '5' },
              text: { title: 'Review Text', type: 'text', value: 'Solid' },
              avatar: { title: 'Avatar URL', type: 'text', value: 'https://example.com/b.jpg' },
              date: { title: 'Date', type: 'text', value: '2024-03-02' }
            }
          ]
        }
      ]
    }],
    edges: []
  };
  const itemsXml = graphToXml(itemsGraph);
  const propMatch2 = itemsXml.match(/<prop[^>]*name="reviews-items"[^>]*type="object-list"[^>]*>([\s\S]*?)<\/prop>/);
  if (!propMatch2) { console.error('❌ reviews-items prop not found in XML'); process.exit(1); }
  const inner2 = propMatch2[1];
  if (!/\<item\b[\s\S]*?\<field\b/.test(inner2)) { console.error('❌ reviews-items prop missing items/fields'); process.exit(1); }
  const parsedItems = xmlToGraph(itemsXml);
  const ri = parsedItems.nodes[0].properties.find(p => p.id === 'reviews-items');
  if (!ri || !Array.isArray(ri.value) || ri.value.length !== 2 || !ri.value[0].name) {
    console.error('❌ Parsed reviews-items not populated as expected');
    process.exit(1);
  }
  console.log('✅ Strict object-list items[] test passed.');
}

main().catch((e) => {
  console.error('Test failed:', e?.message || e);
  process.exit(1);
});
