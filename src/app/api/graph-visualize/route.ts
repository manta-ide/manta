// app/graph/route.ts

import { NextRequest } from 'next/server';
import { z } from 'zod';
import ELK from 'elkjs';
import { getGraphSession } from '../lib/graphStorage';
export const runtime = 'nodejs';

/* ---------- Schemas matching your generator ---------- */
const ChildStub = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  kind: z.enum(['page','section','group','component','primitive','behavior']),
});
const NodeDetail = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  kind: z.enum(['page','section','group','component','primitive','behavior']),
  what: z.string(),
  how: z.string(),
  properties: z.array(z.string()),
  children: z.array(ChildStub),
});
const GraphSchema = z.object({
  rootId: z.string(),
  nodes: z.array(NodeDetail),
});
type GraphT = z.infer<typeof GraphSchema>;

/* ---------- ELK helpers ---------- */
const elk = new ELK();

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const pathFromPoints = (pts: Array<{x:number;y:number}>) =>
  !pts.length ? '' : `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join('');

const collectEdges = (g: GraphT) =>
  g.nodes.flatMap(n => n.children.map(c => ({ id: `${n.id}→${c.id}`, source: n.id, target: c.id })));

const nodeLabel = (n: GraphT['nodes'][number]) => `${n.title}\n(${n.kind})`;

async function graphToSVG(graph: GraphT) {
  const NODE_W = 240, NODE_H = 80;

  const elkGraph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.spacing.nodeNode': '36',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: graph.nodes.map(n => ({
      id: n.id,
      width: NODE_W,
      height: NODE_H,
      labels: [{ text: nodeLabel(n) }],
    })),
    edges: collectEdges(graph).map(e => ({
      id: e.id, sources: [e.source], targets: [e.target]
    })),
  };

  const layout = await elk.layout(elkGraph);

  const xs = layout.children?.map((c: any) => c.x) ?? [0];
  const ys = layout.children?.map((c: any) => c.y) ?? [0];
  const maxX = Math.max(...layout.children?.map((c: any) => c.x + c.width) ?? [0]);
  const maxY = Math.max(...layout.children?.map((c: any) => c.y + c.height) ?? [0]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const P = 24;
  const width = Math.ceil(maxX - minX + 2*P);
  const height = Math.ceil(maxY - minY + 2*P);

  const pos = new Map<string, any>(layout.children?.map((c: any) => [c.id, c]) ?? []);

  const svg: string[] = [];
  svg.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="12">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/></marker></defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`
  );

  for (const e of layout.edges ?? []) {
    for (const s of e.sections ?? []) {
      const pts = [
        { x: s.startPoint.x - minX + P, y: s.startPoint.y - minY + P },
        ...(s.bendPoints ?? []).map((bp: any) => ({ x: bp.x - minX + P, y: bp.y - minY + P })),
        { x: s.endPoint.x - minX + P, y: s.endPoint.y - minY + P },
      ];
      svg.push(`<path d="${pathFromPoints(pts)}" fill="none" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#arrow)"/>`);
    }
  }

  for (const n of graph.nodes) {
    const c = pos.get(n.id); if (!c) continue;
    const x = c.x - minX + P, y = c.y - minY + P;

    svg.push(
      `<g id="${esc(n.id)}">`,
      `<rect x="${x}" y="${y}" rx="8" ry="8" width="${c.width}" height="${c.height}" fill="#ffffff" stroke="#0ea5e9" stroke-width="1.5"/>`,
      `<rect x="${x}" y="${y}" width="${c.width}" height="24" fill="#e0f2fe" stroke="#0ea5e9" stroke-width="1.5"/>`,
      `<text x="${x + 10}" y="${y + 16}" fill="#0369a1">${esc(n.title)} · ${esc(n.kind)}</text>`
    );
    (n.properties ?? []).slice(0, 2).forEach((t, i) =>
      svg.push(`<text x="${x + 10}" y="${y + 40 + i * 16}" fill="#475569">${esc(t)}</text>`)
    );
    svg.push(`</g>`);
  }

  svg.push(`</svg>`);
  return svg.join('');
}

/* ---------- GET: get graph from storage and render ---------- */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId') ?? 'default';
  const format = url.searchParams.get('format');   // 'json' to return JSON

  // Get graph from storage
  const graph = getGraphSession(sessionId);
  if (!graph) {
    return new Response(
      `No graph found for session: ${sessionId}`,
      { status: 404, headers: { 'Content-Type': 'text/plain' } }
    );
  }

  const parsed = GraphSchema.safeParse(graph);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (format === 'json') {
    return new Response(JSON.stringify(parsed.data, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const svg = await graphToSVG(parsed.data);
  return new Response(svg, {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml' },
  });
}

/* ---------- POST: render a given graph JSON directly ---------- */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // if a full graph is posted, render it
  const maybeGraph = GraphSchema.safeParse(body);
  if (maybeGraph.success) {
    const svg = await graphToSVG(maybeGraph.data);
    return new Response(svg, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  }

  return new Response('Invalid graph format', {
    status: 400,
    headers: { 'Content-Type': 'text/plain' },
  });
}
