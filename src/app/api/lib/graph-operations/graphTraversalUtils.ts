import { z } from 'zod';

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
export type NodeDetailT = z.infer<typeof NodeDetail>;

export const Graph = z.object({
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
export type GraphT = z.infer<typeof Graph>;

/* ================================
   UTILS
   ================================ */

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"']/g, '')
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

export const truncate = (s: string, n = 140) => (s?.length ?? 0) > n ? s.slice(0, n - 1) + '…' : s;

// retry with backoff
export async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 3): Promise<T> {
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
   CORE: Generic Graph Traversal
   ================================ */

/** One queued job to expand */
export type QueueItem = {
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
export type NodeDetailWithUidT = z.infer<typeof NodeDetailWithUid>;

/**
 * ⚠️ OpenAI/Azure function calling requires a schema with type "object".
 * So we wrap the array in an object: { results: NodeDetailWithUid[] }.
 */
const BatchOutWrapper = z.object({
  results: z.array(NodeDetailWithUid),
});
export type BatchOutWrapperT = z.infer<typeof BatchOutWrapper>;

export interface GraphTraversalConfig {
  maxDepth: number;
  maxNodes: number;
  childLimit: number;
  concurrency: number;
  batchSize: number;
  minChildComplexity: number;
  allowPrimitiveExpansion: boolean;
}

export interface AgentProcessor {
  processBatch: (params: {
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
    model: string;
    temperature: number;
    topP: number;
    seed?: number;
  }) => Promise<NodeDetailWithUidT[]>;
}

/**
 * Generic graph traversal function that works with any agent processor
 */
export async function traverseGraph({
  rootPrompt,
  config,
  agentProcessor,
  model,
  temperature,
  topP,
  seed,
}: {
  rootPrompt: string;
  config: GraphTraversalConfig;
  agentProcessor: AgentProcessor;
  model: string;
  temperature: number;
  topP: number;
  seed?: number;
}): Promise<GraphT> {

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
      if (total >= config.maxNodes) {
        console.warn('[graph] HALT: reached maxNodes');
        return;
      }

      // take a batch
      const take = Math.max(1, Math.min(config.batchSize, queue.length, Math.max(0, config.maxNodes - total)));
      const items = queue.splice(0, take);
      const now = Date.now();
      const jobs = items.map((it, idx) => ({
        uid: `${wid}-${now}-${uidCounter++}-${idx}`,
        nodePrompt: it.prompt,
        parent: { id: it.parentId, title: it.parentTitle, kind: it.parentKind },
        ancestorPath: it.ancestorTitles,
        depthRemaining: Math.max(0, config.maxDepth - it.depth),
        childLimitForThisJob: config.childLimit,
      }));


      const results = await agentProcessor.processBatch({
        jobs,
        rootTask: rootPrompt,
        childLimit: config.childLimit,
        minChildComplexity: config.minChildComplexity,
        allowPrimitiveExpansion: config.allowPrimitiveExpansion,
        model,
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
        if (it.depth < config.maxDepth) {
          for (const c of normalizedChildren) {
            if (total + queue.length >= config.maxNodes) {
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
        }

        if (total >= config.maxNodes) {
          console.warn('[graph] HALT: reached maxNodes while processing batch');
          break;
        }
      }
    }
  }

  const workers = Array.from({ length: config.concurrency }, (_, i) => worker(i + 1));
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