import { NextRequest, NextResponse } from 'next/server';
import { MessageSchema } from '@/app/api/lib/schemas';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import '@/app/api/lib/prompts/registry';
import { fetchGraphFromApi, fetchGraphXmlFromApi } from '@/app/api/lib/graphApiUtils';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
const projectDir = () => process.env.MANTA_PROJECT_DIR || process.cwd();
const jobsPath = () => path.join(projectDir(), '_graph', 'jobs.json');
const readJobs = (): any[] => { try { const p = jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as any[]; } catch { return []; } };
const writeJobs = (jobs: any[]) => { try { fs.mkdirSync(path.dirname(jobsPath()), { recursive: true }); fs.writeFileSync(jobsPath(), JSON.stringify(jobs, null, 2), 'utf8'); } catch {} };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

const RequestSchema = z.object({
  // Kept for backward compatibility but ignored for prompt construction
  userMessage: MessageSchema.optional(),
  // Single node selection (legacy)
  nodeId: z.string().optional(),
  // New: explicit array of selected node IDs
  selectedNodeIds: z.array(z.string()).optional(),
  // Rebuild all nodes in the graph
  rebuildAll: z.boolean().optional().default(false)
});

export async function POST(req: NextRequest) {
  try {
    // Use default user for all requests
    const userId = 'default-user';

    const body = await req.json();
    const { userMessage, nodeId, selectedNodeIds, rebuildAll } = RequestSchema.parse(body);

    console.log('🔄 Build nodes request received');

    // Determine target node IDs
    let targetNodeIds: string[] = [];
    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0) {
      targetNodeIds = selectedNodeIds;
    } else if (nodeId) {
      targetNodeIds = [nodeId];
    } else if (rebuildAll) {
      // Fetch graph to derive all node IDs
      const graph = await fetchGraphFromApi(req);
      if (graph?.nodes?.length) targetNodeIds = graph.nodes.map((n: any) => n.id);
    }

    // Build prompt from template (ignore any user-provided message content)
    const template = await getTemplate('build-nodes-template');
    const graphXml = await fetchGraphXmlFromApi(req);
    const graph = graphXml ? null : await fetchGraphFromApi(req); // prefer XML; JSON fallback
    const variables = {
      SELECTED_NODE_IDS: JSON.stringify(targetNodeIds),
      GRAPH_DATA: graphXml ? graphXml : (graph ? JSON.stringify(graph, null, 2) : ''),
      REBUILD_ALL: rebuildAll ? '1' : '',
    } as Record<string, any>;
    const parsedPrompt = parseMessageWithTemplate(template, variables);

    // Compose provider-driven job payload
    const prompt = process.env.CLI_CODEX_PROMPT || parsedPrompt;
    const payload = {
      provider: 'codex',
      prompt,
      interactive: false,
      meta: {
        kind: 'build-nodes',
        nodeId: nodeId ?? null,
        selectedNodeIds: targetNodeIds,
        rebuildAll: Boolean(rebuildAll),
        requestedAt: new Date().toISOString(),
      },
    };

    // Always use local file-based job queue; Supabase removed
    {
      const now = new Date().toISOString();
      const job = {
        id: uuid(),
        user_id: userId,
        job_name: 'run',
        status: 'queued',
        priority: rebuildAll ? 10 : 5,
        payload: { ...payload, meta: { ...payload.meta, requestedAt: now } },
        created_at: now,
        updated_at: now,
      };
      const jobs = readJobs();
      jobs.push(job);
      writeJobs(jobs);
      return NextResponse.json({ success: true, jobId: job.id });
    }
  } catch (error) {
    console.error('❌ Build nodes request error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
