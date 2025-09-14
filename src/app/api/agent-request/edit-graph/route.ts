import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { graphToXml } from '@/lib/graph-xml';
import '@/app/api/lib/prompts/registry';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { getGraphSession } from '@/app/api/lib/graph-service';
import { storeGraph } from '@/app/api/lib/graph-service';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import path from 'node:path';
import fs from 'node:fs';
// Prompt templates for graph editing
const GRAPH_EDIT_PROMPT_TEMPLATES = {
  user: 'user-prompt-template',
  assistant: 'assistant-prompt-template',
  system: 'graph-editor-template', // Use graph editor template for node editing
} as const;

const RequestSchema = z.object({
  userMessage: MessageSchema,
  selectedNodeId: z.string().optional(),
  selectedNodeTitle: z.string().optional(),
  selectedNodePrompt: z.string().optional(),
  // Build-nodes compatibility fields
  nodeId: z.string().optional(),
  selectedNodeIds: z.array(z.string()).optional(),
  rebuildAll: z.boolean().optional().default(false),
});

async function buildParsedMessages(
  req: NextRequest,
  userMessage: Message,
  promptTemplates: Record<'system' | 'user' | 'assistant', string>,
  extraVariables?: Record<string, unknown>
): Promise<ParsedMessage[]> {
  const systemMessage = await createSystemMessage();
  // Load chat history from database for the authenticated user
  let chatHistory: Message[] = [];
  try {
    const chatRes = await fetch(`${req.nextUrl.origin}/api/chat`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
      },
      signal: req.signal,
    });
    if (chatRes.ok) {
      const data = await chatRes.json();
      if (Array.isArray(data?.chatHistory)) {
        chatHistory = data.chatHistory as Message[];
      }
    }
  } catch {}
  // Prefer DB history (already includes current userMessage saved by client) but ensure it's present
  const all = chatHistory.length > 0 ? chatHistory : [userMessage];
  const allMessages = [systemMessage, ...all];

  const parsed: ParsedMessage[] = await Promise.all(
    allMessages.map(async (message) => {
      const template = await getTemplate(promptTemplates[message.role]);
      const validatedVariables = MessageVariablesSchema.parse({
        ...(message.variables || {}),
        ...(extraVariables || {}),
      });
      const content = parseMessageWithTemplate(template, validatedVariables);
      return { role: message.role, content };
    })
  );
  return parsed;
}

// Local system message generator (no separate module)
async function createSystemMessage(options?: { files?: string[] }): Promise<Message> {
  const files = Array.isArray(options?.files) ? options!.files : [];
  let graphContext = '';
  try {
    const graph = getGraphSession();
    if (graph) graphContext = JSON.stringify(graph, null, 2);
  } catch (error) {
    console.warn('Failed to get graph from storage:', error);
  }
  return {
    role: 'system',
    variables: {
      PROJECT_FILES: files,
      GRAPH_CONTEXT: graphContext,
      MAX_NODES: '5',
    },
    content: '',
  };
}

// Local job queue utilities (shared pattern with build-nodes route)
const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
const projectDir = () => process.env.MANTA_PROJECT_DIR || process.cwd();
const jobsPath = () => path.join(projectDir(), '_graph', 'jobs.json');
const readJobs = (): any[] => { try { const p = jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as any[]; } catch { return []; } };
const writeJobs = (jobs: any[]) => { try { fs.mkdirSync(path.dirname(jobsPath()), { recursive: true }); fs.writeFileSync(jobsPath(), JSON.stringify(jobs, null, 2), 'utf8'); } catch {} };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });

// Simple job polling for local mode
const ensureJobWorkerStarted = () => {
  // In local mode, we assume the job worker is started separately
  // This is just a placeholder for now
  if (LOCAL_MODE) {
    console.log('[JobWorker] Local mode detected - job worker should be running separately');
  }
};

export async function POST(req: NextRequest) {
  try {
// Ensure job worker is started for local mode
    ensureJobWorkerStarted();

    // Use default user for all requests
    const userId = 'default-user';
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.log('Graph editor request schema error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage, selectedNodeId, selectedNodeTitle, selectedNodePrompt, nodeId, selectedNodeIds, rebuildAll } = parsed.data;
    // forward auth headers for downstream API calls
    setGraphEditorAuthHeaders({
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    });
    // ensure absolute base url is used
    setGraphEditorBaseUrl(req.nextUrl.origin);
    // As a fallback for environments where headers may be dropped, use a direct save function
    setGraphEditorSaveFn(async (graph) => {
      const res = await fetch(`${req.nextUrl.origin}/api/graph-api`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml',
          ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
          ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
        },
        body: graphToXml(graph)
      });
      if (!res.ok) return false;
      let ok = true;
      try { const data = await res.json(); ok = !!data.success; } catch { ok = true; }
      return ok;
    });
    let graph = await fetchGraphFromApi(req);
    
    // If no graph exists, create a completely empty one
    if (!graph) {
      const emptyGraph = {
        nodes: []
      };
      
      await storeGraph(emptyGraph, userId);
      
      graph = emptyGraph;
    }
    
    // Always set the current graph (either existing or newly created)
    await setCurrentGraph(graph);

    // Determine target node IDs for build operations
    let targetNodeIds: string[] = [];
    if (Array.isArray(selectedNodeIds) && selectedNodeIds.length > 0) {
      targetNodeIds = selectedNodeIds;
    } else if (nodeId) {
      targetNodeIds = [nodeId];
    } else if (rebuildAll && graph?.nodes?.length) {
      targetNodeIds = graph.nodes.map((n: any) => n.id);
    }

    const variables = {
      GRAPH_DATA: JSON.stringify(graph, null, 2),
      SELECTED_NODE_ID: selectedNodeId || userMessage.variables?.SELECTED_NODE_ID,
      SELECTED_NODE_TITLE: selectedNodeTitle || userMessage.variables?.SELECTED_NODE_TITLE,
      SELECTED_NODE_PROMPT: selectedNodePrompt || userMessage.variables?.SELECTED_NODE_PROMPT,
      SELECTED_NODE_IDS: JSON.stringify(targetNodeIds),
      REBUILD_ALL: rebuildAll ? '1' : '',
    };

    const parsedMessages = await buildParsedMessages(
      req,
      userMessage,
      GRAPH_EDIT_PROMPT_TEMPLATES,
      variables
    );

    // Build a single prompt from template for the CLI provider
    const template = await getTemplate('graph-editor-template');
    const templateVariables = {
      ...variables,
      USER_REQUEST: userMessage.content || userMessage.variables?.USER_REQUEST || '',
    } as Record<string, any>;
    const prompt = process.env.CLI_CODEX_PROMPT || parseMessageWithTemplate(template, templateVariables);

    // Queue a local job for the Codex provider (with unified MCP tools)
    const now = new Date().toISOString();
    const job = {
      id: uuid(),
      user_id: userId,
      job_name: 'run',
      status: 'queued',
      priority: rebuildAll ? 10 : 5, // Higher priority for rebuild all operations
      payload: {
        provider: 'codex',
        prompt,
        interactive: false,
        meta: {
          kind: 'graph-editor', // Use graph-editor toolset for full graph editing capabilities
          requestedAt: now,
          selectedNodeId: variables.SELECTED_NODE_ID || null,
          selectedNodeIds: targetNodeIds,
          rebuildAll: Boolean(rebuildAll),
          // Include build-nodes compatibility
          nodeId: nodeId ?? null,
        }
      },
      created_at: now,
      updated_at: now,
    };
    const jobs = readJobs();
    jobs.push(job);
    writeJobs(jobs);

    // Stream real job processing messages
    {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();

          // Send initial message
          controller.enqueue(enc.encode('Starting AI processing...\n'));

          // Poll job status and stream updates
          let pollCount = 0;
          const maxPolls = 300; // 5 minutes at 1 second intervals

          const pollJob = async () => {
            try {
              pollCount++;
              const jobs = readJobs();
              const currentJob = jobs.find(j => j.id === job.id);

              if (!currentJob) {
                controller.enqueue(enc.encode('Job not found in queue\n'));
                controller.close();
                return;
              }

              if (currentJob.status === 'completed') {
                controller.enqueue(enc.encode('AI processing completed successfully\n'));
                controller.close();
                return;
              } else if (currentJob.status === 'failed') {
                controller.enqueue(enc.encode(`AI processing failed: ${currentJob.error_message || 'Unknown error'}\n`));
                controller.close();
                return;
              } else if (currentJob.status === 'running') {
                // Send progress update
                controller.enqueue(enc.encode('AI is processing your request...\n'));
              } else if (currentJob.status === 'queued') {
                // Send queued message
                controller.enqueue(enc.encode('AI request queued for processing...\n'));
              }

              // Continue polling if not done and under max polls
              if (pollCount < maxPolls) {
                setTimeout(pollJob, 1000); // Poll every second
              } else {
                controller.enqueue(enc.encode('AI processing timed out\n'));
                controller.close();
              }
            } catch (error) {
              controller.enqueue(enc.encode(`Error polling job status: ${error}\n`));
              controller.close();
            }
          };

          // Start polling after a short delay
          setTimeout(pollJob, 500);
        }
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  } catch (err: any) {
    console.error(err);
    // Reset pending changes on error
    resetPendingChanges();
    return new Response(JSON.stringify({ 
      error: err?.message || 'Server error',
      success: false 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
