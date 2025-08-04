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
  concurrency: z.number().int().min(1).max(16).optional(),        // default 4 (parallel batches)
  batchSize: z.number().int().min(1).max(20).optional(),          // default 4 (nodes per LLM call)
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
  const base = parentId ? `${parentId}-${slugify(title)}` : `node-element-${slugify(title)}`;
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
   CORE: batched expand (single LLM call for N nodes)
   ================================ */

/** One queued job to expand */
type QueueItem = {
  prompt: string;
  depth: number;
  parentId: string | null;
  parentTitle: string | null;
  parentKind: string | null;
  ancestorTitles: string[];
  expectedId?: string; // carry stub id forward to force exact match
};

/** Shape the model must echo back to match jobs 1:1 */
const NodeDetailWithUid = NodeDetail.extend({
  uid: z.string().describe('Echo back the job uid you are answering for.'),
});
type NodeDetailWithUidT = z.infer<typeof NodeDetailWithUid>;

/**
 * ⚠️ OpenAI/Azure function calling requires a schema with type "object".
 * So we wrap the array in an object: { results: NodeDetailWithUid[] }.
 */
const BatchOutWrapper = z.object({
  results: z.array(NodeDetailWithUid),
});
type BatchOutWrapperT = z.infer<typeof BatchOutWrapper>;

/** static, reused */
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

/**
 * Ask the model to create multiple NodeDetail results in ONE call.
 * Jobs are independent; the model MUST return an object { results: [...] }
 * where results[i].uid matches the corresponding job uid.
 */
async function expandBatch({
  jobs,
  rootTask,
  childLimit,
  minChildComplexity,
  allowPrimitiveExpansion,
  modelName,
  temperature,
  topP,
  seed,
}: {
  jobs: Array<{
    uid: string;
    nodePrompt: string;
    parent: { id: string | null; title: string | null; kind: string | null };
    ancestorPath: string[];
    depthRemaining: number;
    childLimitForThisJob: number;
  }>;
  rootTask: string;
  childLimit: number;
  minChildComplexity: number;
  allowPrimitiveExpansion: boolean;
  modelName: string;
  temperature: number;
  topP: number;
  seed?: number;
}): Promise<NodeDetailWithUidT[]> {
  const header = [
    'Return a SINGLE JSON object with this shape:',
    '{ "results": NodeDetailWithUid[] }',
    '- results.length MUST equal the number of jobs.',
    '- Each results[i] MUST include "uid" that EXACTLY matches jobs[i].uid.',
    'For each job, return ONE node detail and its DIRECT children as stubs. No grandchildren.',
    'JSON must strictly match the provided schema.',
    styleGuide,
    '',
    `Global Context:`,
    `rootTask: ${rootTask}`,
    `Default childLimit: ${childLimit}`,
    '',
    'Jobs:',
  ].join('\n');

  const jobsText = jobs.map((j, i) => {
    return [
      `- job[${i}]`,
      `  uid: ${j.uid}`,
      `  parent: ${JSON.stringify(j.parent)}`,
      `  ancestorPath: ${JSON.stringify(j.ancestorPath)}`,
      `  nodePrompt: ${j.nodePrompt}`,
      `  depthRemaining: ${j.depthRemaining}`,
      `  childLimitForThisJob: ${j.childLimitForThisJob}`,
    ].join('\n');
  }).join('\n');

  const prompt = `${header}\n${jobsText}`;

  const t0 = Date.now();
  const { object } = await withRetry(
    () => generateObject({
      model: azure(modelName as any),
      schema: BatchOutWrapper,
      prompt,
      temperature,
      topP,
      seed,
    }),
    'generateObject(batch)'
  );
  const dt = Date.now() - t0;
  console.log(`[graph] expandBatch ${dt}ms | jobs=${jobs.length}`);

  // prune children per job-specific depth + global rules
  const results = (object as BatchOutWrapperT).results.map((node, idx) => {
    const j = jobs[idx];
    let children = (node.children ?? []).slice(0, j.childLimitForThisJob);
    children = children.filter(c => {
      const okKind = ['page','section','group','component'].includes(c.kind) ||
                     (allowPrimitiveExpansion && c.kind === 'primitive');
      const meetsComplexity = (c.complexity ?? 1) >= minChildComplexity;
      const isExpandable = c.expandable === true;
      return j.depthRemaining > 0 && okKind && isExpandable && meetsComplexity;
    });
    return { ...node, children };
  });

  return results;
}

/* ================================
   BFS with bounded concurrency + batching
   (stable IDs via expectedId)
   ================================ */

async function buildGraphBFS({
  rootPrompt,
  maxDepth,
  maxNodes,
  childLimit,
  concurrency,
  batchSize,
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
  batchSize: number;
  minChildComplexity: number;
  allowPrimitiveExpansion: boolean;
  modelName: string;
  temperature: number;
  topP: number;
  seed?: number;
}): Promise<GraphT> {
  console.log(
    `[graph] START rootPrompt="${truncate(rootPrompt)}" | maxDepth=${maxDepth} | maxNodes=${maxNodes} | childLimit=${childLimit} | minChildComplexity=${minChildComplexity} | concurrency=${concurrency} | batchSize=${batchSize}`
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
  let uidCounter = 0;

  async function worker(wid: number) {
    while (queue.length > 0) {
      if (total >= maxNodes) {
        console.warn('[graph] HALT: reached maxNodes');
        return;
      }

      // take a batch
      const take = Math.max(1, Math.min(batchSize, queue.length, Math.max(0, maxNodes - total)));
      const items = queue.splice(0, take);
      const now = Date.now();
      const jobs = items.map((it, idx) => ({
        uid: `${wid}-${now}-${uidCounter++}-${idx}`,
        nodePrompt: it.prompt,
        parent: { id: it.parentId, title: it.parentTitle, kind: it.parentKind },
        ancestorPath: it.ancestorTitles,
        depthRemaining: Math.max(0, maxDepth - it.depth),
        childLimitForThisJob: childLimit,
      }));

      console.log(`[graph] [w${wid}] -> expand batch size=${jobs.length} | qlen=${queue.length} | reserved=${reserved.size}`);

      const results = await expandBatch({
        jobs,
        rootTask: rootPrompt,
        childLimit,
        minChildComplexity,
        allowPrimitiveExpansion,
        modelName,
        temperature,
        topP,
        seed,
      });

      // map uid => result
      const byUid = new Map(results.map(r => [r.uid, r]));

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const job = jobs[i];
        const node = byUid.get(job.uid);
        if (!node) {
          console.warn(`[graph] [w${wid}] missing result for uid=${job.uid}; skipping`);
          continue;
        }

        // force-stable ID: use expectedId if provided, else derive
        const computedId = it.expectedId ?? deriveId(it.parentId, node.title, reserved);
        if (it.expectedId && it.expectedId !== computedId) {
          console.warn(`[graph] expectedId mismatch: expected="${it.expectedId}" got="${computedId}"`);
        }

        // compute child IDs immediately (reserve them to avoid races)
        const normalizedChildren = node.children.map(c => {
          const childId = deriveId(computedId, c.title, reserved);
          return { ...c, id: childId };
        });

        // reserve ids before enqueue to minimize collisions
        reserved.add(computedId);
        for (const c of normalizedChildren) reserved.add(c.id!);

        const normalizedNode: NodeDetailT = {
          id: computedId,
          title: node.title,
          prompt: node.prompt,
          kind: node.kind,
          what: node.what,
          how: node.how,
          properties: node.properties,
          children: normalizedChildren,
        };

        nodesById.set(computedId, normalizedNode);
        total++;
        if (!rootId) rootId = computedId;

        // enqueue children if within depth
        if (it.depth < maxDepth) {
          for (const c of normalizedChildren) {
            if (total + queue.length >= maxNodes) {
              console.warn(`[graph] [w${wid}] HALT enqueue: maxNodes @ parent="${computedId}"`);
              break;
            }
            queue.push({
              prompt: c.prompt,
              depth: it.depth + 1,
              parentId: computedId,
              parentTitle: normalizedNode.title,
              parentKind: normalizedNode.kind,
              ancestorTitles: [...it.ancestorTitles, normalizedNode.title],
              expectedId: c.id, // critical for stable ids
            });
          }
        } else {
          console.log(`[graph] [w${wid}] depth cap @ id="${computedId}" -> children skipped`);
        }

        if (total >= maxNodes) {
          console.warn('[graph] HALT: reached maxNodes while processing batch');
          break;
        }
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
      batchSize = 4,                 // NEW: number of nodes per LLM call
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
      batchSize,
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
