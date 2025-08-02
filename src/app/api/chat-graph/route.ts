// app/api/graph/route.ts
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { azure } from '@ai-sdk/azure';

/* ================================
   SCHEMAS
   ================================ */

const ChildStub = z.object({
  id: z.string().optional(), // model-provided (ignored for final id)
  title: z.string().min(2).describe('Short, human-readable name of a UI container/group/component'),
  prompt: z.string().min(8).describe('1–2 sentences describing what to generate when expanding this child'),
  kind: z.enum(['page','section','group','component','primitive','behavior'])
       .describe('UI granularity for the child'),
  expandable: z.boolean().describe('true only if the child should be expanded further'),
  complexity: z.number().int().min(1).max(5)
       .describe('1=trivial leaf, 5=complex structure worth expanding'),
});

const NodeDetail = z.object({
  id: z.string().optional(), // model-provided (ignored for final id)
  title: z.string().min(2),
  prompt: z.string().min(8).describe('Concise source prompt for this node'),
  kind: z.enum(['page','section','group','component','primitive','behavior'])
       .describe('UI granularity for THIS node'),
  what: z.string().min(8).describe('Describe the UI element/group succinctly'),
  how: z.string().min(8).describe('Describe structure/behavior; avoid vague product-speak'),
  properties: z.array(z.string()).max(8).describe('Key properties; implementation-relevant'),
  children: z.array(ChildStub).describe('Direct children as stubs only (no grandchildren)'),
});
type NodeDetailT = z.infer<typeof NodeDetail>;

const Graph = z.object({
  rootId: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    prompt: z.string(),
    kind: z.enum(['page','section','group','component','primitive','behavior']),
    what: z.string(),
    how: z.string(),
    properties: z.array(z.string()),
    children: z.array(z.object({
      id: z.string(),
      title: z.string(),
      prompt: z.string(),
      kind: z.enum(['page','section','group','component','primitive','behavior']),
    })),
  })),
});
type GraphT = z.infer<typeof Graph>;

const RequestSchema = z.object({
  userMessage: z.object({
    role: z.string(),
    content: z.string(),
    variables: z.object({
      USER_REQUEST: z.string(),
    }),
  }),
  // Controls (all optional)
  maxDepth: z.number().int().min(0).max(12).optional(),           // default 3
  maxNodes: z.number().int().min(1).max(1000).optional(),         // default 120
  childLimit: z.number().int().min(0).max(20).optional(),         // default 3
  concurrency: z.number().int().min(1).max(16).optional(),        // default 4
  minChildComplexity: z.number().int().min(1).max(5).optional(),  // default 3
  allowPrimitiveExpansion: z.boolean().optional(),                // default false
  model: z.string().optional(),                                   // default 'gpt-4o'
  temperature: z.number().min(0).max(2).optional(),               // default 0.2
  topP: z.number().min(0).max(1).optional(),                      // default 1
  seed: z.number().int().optional(),
});

/* ================================
   UTILS
   ================================ */

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function deriveId(parentId: string | null, title: string, reserved: Set<string>) {
  const base = parentId ? `${parentId}-${slugify(title)}` : slugify(title);
  if (!reserved.has(base)) return base;
  let i = 2;
  while (reserved.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
const truncate = (s: string, n = 140) => (s?.length ?? 0) > n ? s.slice(0, n - 1) + '…' : s;

// retry with backoff
async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 3): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (err: any) {
      lastErr = err;
      const delay = 250 * Math.pow(2, i - 1);
      console.warn(`[graph] ${label} failed (${i}/${tries}): ${String(err?.message || err)} | retry in ${delay}ms`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

/* ================================
   CORE: expandOne (non-streaming)
   ================================ */

async function expandOne({
  nodePrompt,
  rootTask,
  parent,
  ancestorPath,
  depthRemaining,
  childLimit,
  minChildComplexity,
  allowPrimitiveExpansion,
  modelName,
  temperature,
  topP,
  seed,
}: {
  nodePrompt: string;
  rootTask: string;
  parent: { id: string | null; title: string | null; kind: string | null };
  ancestorPath: string[];
  depthRemaining: number;
  childLimit: number;
  minChildComplexity: number;
  allowPrimitiveExpansion: boolean;
  modelName: string;
  temperature: number;
  topP: number;
  seed?: number;
}): Promise<NodeDetailT> {
  const styleGuide = `
You are composing a UI graph. Be STRICTLY UI-focused.

Valid kinds:
- "page": entire page
- "section": top-level region (hero, footer, sidebar)
- "group": a subsection grouping components (card grid, filter bar)
- "component": concrete reusable UI (card, navbar, modal, gallery)
- "primitive": atomic content (title text, icon, background, divider)
- "behavior": interactive facility tied to the UI (filtering, search, sort)

Granularity rules:
- Only "page|section|group|component" are typically expandable.
- "primitive" and trivial "behavior" are LEAVES unless explicitly complex.
- DO NOT create micro-leaves like "icons", "background", or "subtitle" unless they are actual components.
- Children must be cohesive UI parts of THEIR PARENT, not generic product features.

When depthRemaining=0, return children: [].

Children constraints:
- Provide AT MOST childLimit children.
- Each child includes: title, prompt, kind, expandable, complexity (1-5).
- expandable=true ONLY if kind ∈ {page,section,group,component} AND complexity≥3.
- Avoid synonyms that rename the same concept already present in the ancestorPath.
`;

  const instructions = [
    'Return ONE node detail and its DIRECT children as stubs. No grandchildren.',
    'JSON must strictly match the schema.',
    styleGuide,
    '',
    'Context:',
    `rootTask: ${rootTask}`,
    `parent: ${JSON.stringify(parent)}`,
    `ancestorPath: ${JSON.stringify(ancestorPath)}`,
    `nodePrompt: ${nodePrompt}`,
    `depthRemaining: ${depthRemaining}`,
    `childLimit: ${childLimit}`,
  ].join('\n');

  const t0 = Date.now();
  const { object } = await withRetry(
    () => generateObject({
      model: azure(modelName as any),
      schema: NodeDetail,
      prompt: instructions,
      temperature,
      topP,
      seed,
    }),
    'generateObject'
  );
  const dt = Date.now() - t0;

  let node = object as NodeDetailT;

  // prune children based on rules + depth
  let children = (node.children ?? []).slice(0, childLimit);
  children = children.filter(c => {
    const okKind = ['page','section','group','component'].includes(c.kind) ||
                   (allowPrimitiveExpansion && c.kind === 'primitive');
    const meetsComplexity = (c.complexity ?? 1) >= minChildComplexity;
    const isExpandable = c.expandable === true;
    return depthRemaining > 0 && okKind && isExpandable && meetsComplexity;
  });

  node = { ...node, children };
  console.log(
    `[graph] expandOne ${dt}ms | kind=${node.kind} | prunedChildren=${(object.children?.length ?? 0)}→${children.length} | depthRemaining=${depthRemaining}`
  );

  return node;
}

/* ================================
   BFS with bounded concurrency
   (stable IDs via expectedId)
   ================================ */

type QueueItem = {
  prompt: string;
  depth: number;
  parentId: string | null;
  parentTitle: string | null;
  parentKind: string | null;
  ancestorTitles: string[];
  expectedId?: string; // carry stub id forward to force exact match
};

async function buildGraphBFS({
  rootPrompt,
  maxDepth,
  maxNodes,
  childLimit,
  concurrency,
  minChildComplexity,
  allowPrimitiveExpansion,
  modelName,
  temperature,
  topP,
  seed,
}: {
  rootPrompt: string;
  maxDepth: number;
  maxNodes: number;
  childLimit: number;
  concurrency: number;
  minChildComplexity: number;
  allowPrimitiveExpansion: boolean;
  modelName: string;
  temperature: number;
  topP: number;
  seed?: number;
}): Promise<GraphT> {
  console.log(
    `[graph] START rootPrompt="${truncate(rootPrompt)}" | maxDepth=${maxDepth} | maxNodes=${maxNodes} | childLimit=${childLimit} | minChildComplexity=${minChildComplexity} | concurrency=${concurrency}`
  );

  const nodesById = new Map<string, NodeDetailT>();
  const reserved = new Set<string>();
  const queue: QueueItem[] = [{
    prompt: rootPrompt,
    depth: 0,
    parentId: null,
    parentTitle: null,
    parentKind: null,
    ancestorTitles: [],
  }];

  let rootId: string | null = null;
  let total = 0;

  async function worker(wid: number) {
    while (queue.length > 0) {
      if (total >= maxNodes) {
        console.warn('[graph] HALT: reached maxNodes');
        return;
      }

      const { prompt, depth, parentId, parentTitle, parentKind, ancestorTitles, expectedId } = queue.shift()!;
      console.log(`[graph] [w${wid}] -> expand depth=${depth} | qlen=${queue.length} | reserved=${reserved.size} | prompt="${truncate(prompt)}"`);

      const node = await expandOne({
        nodePrompt: prompt,
        rootTask: rootPrompt,
        parent: { id: parentId, title: parentTitle, kind: parentKind },
        ancestorPath: ancestorTitles,
        depthRemaining: Math.max(0, maxDepth - depth),
        childLimit,
        minChildComplexity,
        allowPrimitiveExpansion,
        modelName,
        temperature,
        topP,
        seed,
      });

      // force-stable ID: use expectedId if provided, else derive
      const computedId = expectedId ?? deriveId(parentId, node.title, reserved);
      if (expectedId && expectedId !== computedId) {
        console.warn(`[graph] expectedId mismatch: expected="${expectedId}" got="${computedId}"`);
      }

      // compute child IDs immediately (reserve them to avoid races)
      const normalizedChildren = node.children.map(c => {
        const childId = deriveId(computedId, c.title, reserved);
        return { ...c, id: childId };
      });

      // reserve ids before enqueue to minimize collisions
      reserved.add(computedId);
      for (const c of normalizedChildren) reserved.add(c.id!);

      const normalizedNode: NodeDetailT = { ...node, id: computedId, children: normalizedChildren };
      nodesById.set(computedId, normalizedNode);
      total++;
      if (!rootId) rootId = computedId;

      if (depth >= maxDepth) {
        console.log(`[graph] [w${wid}] depth cap @ id="${computedId}" -> children skipped`);
        continue;
      }

      // enqueue children; carry expectedId = child.id
      for (const c of normalizedChildren) {
        if (total + queue.length >= maxNodes) {
          console.warn(`[graph] [w${wid}] HALT enqueue: maxNodes @ parent="${computedId}"`);
          break;
        }
        queue.push({
          prompt: c.prompt,
          depth: depth + 1,
          parentId: computedId,
          parentTitle: normalizedNode.title,
          parentKind: normalizedNode.kind,
          ancestorTitles: [...ancestorTitles, normalizedNode.title],
          expectedId: c.id, // critical for stable ids
        });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  if (!rootId) throw new Error('Failed to create root node.');

  console.log(`[graph] DONE | nodes=${nodesById.size} | root="${rootId}"`);
  const graph: GraphT = {
    rootId,
    nodes: Array.from(nodesById.values()).map(n => ({
      id: n.id!, // now guaranteed
      title: n.title,
      prompt: n.prompt,
      kind: n.kind,
      what: n.what,
      how: n.how,
      properties: n.properties,
      children: n.children.map(c => ({
        id: c.id!, // stable
        title: c.title,
        prompt: c.prompt,
        kind: c.kind,
      })),
    })),
  };
  return graph;
}

/* ================================
   HTTP HANDLER
   ================================ */

export async function POST(req: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      userMessage,
      maxDepth = 3,
      maxNodes = 120,
      childLimit = 3,
      concurrency = 4,
      minChildComplexity = 3,
      allowPrimitiveExpansion = false,
      model = 'gpt-4o',
      temperature = 0.2,
      topP = 1,
      seed,
    } = parsed.data;

    const rootPrompt = userMessage.variables.USER_REQUEST.trim();
    if (!rootPrompt) {
      return new Response(JSON.stringify({ error: 'USER_REQUEST is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const t0 = Date.now();
    const graph = await buildGraphBFS({
      rootPrompt,
      maxDepth,
      maxNodes,
      childLimit,
      concurrency,
      minChildComplexity,
      allowPrimitiveExpansion,
      modelName: model,
      temperature,
      topP,
      seed,
    });
    const dt = Date.now() - t0;

    console.log(`[graph] total time=${dt}ms | nodes=${graph.nodes.length} | avg=${(dt / Math.max(1, graph.nodes.length)).toFixed(1)}ms/node`);

    const safe = Graph.safeParse(graph);
    if (!safe.success) {
      console.error('[graph] Graph validation failed:', safe.error);
      return new Response(JSON.stringify({ error: safe.error.flatten() }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log(JSON.stringify(safe.data, null, 2));
    return Response.json(safe.data);
  } catch (err: any) {
    console.error('[graph] ERROR:', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
