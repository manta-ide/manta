#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

function esc(s: any) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function propType(p: any) {
  const t = p?.type;
  if (!t) return 'string';
  if (t === 'object' || t === 'object-list') return 'json';
  return String(t);
}
function propVal(p: any) {
  const v = p?.value;
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

const root = path.join('manta-template', '_graph');
const inPath = path.join(root, 'graph.json');
const outPath = path.join(root, 'graph.xml');

if (!fs.existsSync(inPath)) {
  console.error(`Missing ${inPath}`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

const childPairs = new Set<string>();
(data.nodes || []).forEach((n: any) => (n.children || []).forEach((c: any) => childPairs.add(`${n.id}→${c.id}`)));

const nodes = (data.nodes || []).map((n: any) => {
  const desc = n.prompt ? `\n      <description>${esc(n.prompt)}</description>` : '';
  const state = `\n      <state status=\"active\">\n        <build status=\"${esc(String(n.state || 'unbuilt'))}\"/>\n      </state>`;
  const props = Array.isArray(n.properties) && n.properties.length > 0
    ? `\n      <props>\n${n.properties.map((p: any) => `        <prop name=\"${esc(String(p.id || ''))}\" type=\"${esc(propType(p))}\">${esc(propVal(p))}</prop>`).join("\n")}\n      </props>`
    : '';
  return `    <node id=\"${esc(n.id)}\" title=\"${esc(n.title)}\">${desc}${state}${props}\n    </node>`;
}).join('\n\n');

const edges = ((data.edges || []) as Array<any>).map((e) => {
  const role = childPairs.has(`${e.source}→${e.target}`) ? 'contains' : (e.role || 'links-to');
  const id = e.id || `${e.source}-${e.target}`;
  return `    <edge id=\"${esc(id)}\" source=\"${esc(e.source)}\" target=\"${esc(e.target)}\" role=\"${esc(role)}\"/>`;
}).join('\n');

const xml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<graph xmlns=\"urn:app:graph\" version=\"1.0\" directed=\"true\">\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;

fs.writeFileSync(outPath, xml, 'utf8');
console.log(`Wrote ${outPath}`);

