import type { Graph, GraphNode, Property } from '@/app/api/lib/schemas';

// Lightweight XML helpers (no external deps)
function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(text: string): string {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAttrBlock(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function extractTagContent(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i').exec(xml);
  return m ? m[1] : null;
}

function collectTags(xml: string, tag: string): Array<{ attrs: Record<string,string>; inner: string }>
{
  const out: Array<{ attrs: Record<string,string>; inner: string }> = [];
  const re = new RegExp(`<${tag}([^>]*)>([\s\S]*?)<\/${tag}>`, 'gi');
  const self = new RegExp(`<${tag}([^>]*)\/>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: parseAttrBlock(m[1] || ''), inner: m[2] || '' });
  }
  while ((m = self.exec(xml)) !== null) {
    out.push({ attrs: parseAttrBlock(m[1] || ''), inner: '' });
  }
  return out;
}

function toPropTypeAttr(p: Property): string {
  const t = (p as any)?.type;
  if (!t) return 'string';
  if (t === 'object' || t === 'object-list') return 'json';
  return String(t);
}

function valueToText(p: Property): string {
  const v = (p as any)?.value;
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function graphToXml(graph: Graph): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>`;
  const ns = `xmlns="urn:app:graph"`;
  const directed = `directed="true"`;
  const version = `version="1.0"`;

  const childrenSet = new Set<string>();
  for (const n of graph.nodes || []) {
    for (const c of (n.children || [])) {
      childrenSet.add(`${n.id}→${c.id}`);
    }
  }

  const nodes = (graph.nodes || []).map((n: GraphNode) => {
    const desc = n.prompt ? `\n      <description>${escapeXml(n.prompt)}</description>` : '';
    const buildStatus = (n.state as any) || 'unbuilt';
    const state = `\n      <state status="active">\n        <build status="${escapeXml(String(buildStatus))}"/>\n      </state>`;
    const props = Array.isArray((n as any).properties) && (n as any).properties.length > 0
      ? `\n      <props>\n${((n as any).properties as Property[]).map((p) => `        <prop name="${escapeXml(String((p as any).id || ''))}" type="${escapeXml(toPropTypeAttr(p))}">${escapeXml(valueToText(p))}</prop>`).join("\n")}\n      </props>`
      : '';
    return `    <node id="${escapeXml(n.id)}" title="${escapeXml(n.title)}">${desc}${state}${props}\n    </node>`;
  }).join('\n\n');

  const allEdges = (graph as any).edges || [] as Array<{ id?: string; source: string; target: string; role?: string }>;
  const edges = allEdges.map((e: { id?: string; source: string; target: string; role?: string }) => {
    const role = childrenSet.has(`${e.source}→${e.target}`) ? 'contains' : (e as any).role || 'links-to';
    const id = e.id || `${e.source}-${e.target}`;
    return `    <edge id="${escapeXml(id)}" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" role="${escapeXml(role)}"/>`;
  }).join('\n');

  return `${header}\n<graph ${ns} ${version} ${directed}>\n  <nodes>\n${nodes}\n  </nodes>\n\n  <edges>\n${edges}\n  </edges>\n</graph>\n`;
}

function parsePropValue(type: string | undefined, text: string): any {
  const t = (type || '').toLowerCase();
  const raw = unescapeXml(text || '').trim();
  if (t === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (t === 'boolean') {
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
    return raw;
  }
  if (t === 'json' || raw.startsWith('{') || raw.startsWith('[')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

export function xmlToGraph(xml: string): Graph {
  const rootMatch = /<graph[\s\S]*?>[\s\S]*<\/graph>/i.exec(xml);
  if (!rootMatch) {
    throw new Error('Invalid graph XML: missing <graph> root');
  }

  const nodesXml = extractTagContent(xml, 'nodes') || '';
  const edgesXml = extractTagContent(xml, 'edges') || '';
  const nodeTags = collectTags(nodesXml, 'node');
  const nodes: GraphNode[] = nodeTags.map(({ attrs, inner }) => {
    const id = attrs['id'] || '';
    const title = attrs['title'] || '';
    const description = (extractTagContent(inner, 'description') || '').trim();
    const stateBlock = extractTagContent(inner, 'state') || '';
    let buildStatus: string | undefined;
    const buildTags = collectTags(stateBlock, 'build');
    if (buildTags.length > 0) {
      buildStatus = (buildTags[0].attrs['status'] || '').trim();
    } else {
      const m = /<build\s+([^>]*)\/>/i.exec(stateBlock);
      if (m) buildStatus = (parseAttrBlock(m[1] || '')['status'] || '').trim();
    }

    const propsBlock = extractTagContent(inner, 'props') || '';
    const propTags = collectTags(propsBlock, 'prop');
    const properties: Property[] = propTags.map(({ attrs: pa, inner: pi }) => {
      const name = pa['name'] || '';
      const type = (pa['type'] || 'string') as any;
      const value = parsePropValue(type, pi || '');
      return { id: name, title: name, type, value } as any as Property;
    });

    return {
      id,
      title,
      prompt: unescapeXml(description),
      children: [],
      state: (buildStatus as any) || 'unbuilt',
      properties,
    } as GraphNode;
  });

  const edges: Array<{ id: string; source: string; target: string; role?: string }> = [];
  const edgeSelf = new RegExp(`<edge([^>]*)\/>`, 'gi');
  const edgeOpen = new RegExp(`<edge([^>]*)>([\s\S]*?)<\/edge>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = edgeSelf.exec(edgesXml)) !== null) {
    const a = parseAttrBlock(m[1] || '');
    const id = a['id'] || `${a['source']}-${a['target']}`;
    edges.push({ id, source: a['source'] || '', target: a['target'] || '', role: a['role'] });
  }
  while ((m = edgeOpen.exec(edgesXml)) !== null) {
    const a = parseAttrBlock(m[1] || '');
    const id = a['id'] || `${a['source']}-${a['target']}`;
    edges.push({ id, source: a['source'] || '', target: a['target'] || '', role: a['role'] });
  }

  // Infer children from edges
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const e of edges) {
    const parent = byId.get(e.source);
    const child = byId.get(e.target);
    if (parent && child) {
      parent.children = parent.children || [];
      if (!parent.children.find(c => c.id === child.id)) parent.children.push({ id: child.id, title: child.title });
    }
  }

  const g: Graph = { nodes, edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })) as any } as Graph;
  return g;
}

