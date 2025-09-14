import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { graphToXml } from '@/lib/graph-xml';
import '@/app/api/lib/prompts/registry';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { storeGraph } from '@/app/api/lib/graph-service';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { loadBaseGraphFromFile, storeBaseGraph } from '@/app/api/lib/graph-service';
import path from 'node:path';
import fs from 'node:fs';

// Prompt templates for graph building
const GRAPH_BUILD_PROMPT_TEMPLATES = {
  user: 'user-prompt-template',
  assistant: 'assistant-prompt-template',
  system: 'build-graph-template', // New template for graph building
} as const;

const GraphDiffSchema = z.object({
  changes: z.array(z.object({
    type: z.enum(['node-added', 'node-modified', 'node-deleted', 'edge-added', 'edge-deleted']),
    node: z.any().optional(),
    nodeId: z.string().optional(),
    oldNode: z.any().optional(),
    newNode: z.any().optional(),
    edge: z.any().optional(),
  })).optional(),
});

const RequestSchema = z.object({
  userMessage: MessageSchema,
  graphDiff: GraphDiffSchema,
  currentGraph: z.any(),
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

// Local system message generator
async function createSystemMessage(): Promise<Message> {
  return {
    role: 'system',
    variables: {
      PROJECT_FILES: [],
      GRAPH_CONTEXT: '',
      MAX_NODES: '50', // Higher limit for graph builds
    },
    content: '',
  };
}

// Local job queue utilities
const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';
const projectDir = () => process.env.MANTA_PROJECT_DIR || process.cwd();
const jobsPath = () => path.join(projectDir(), '_graph', 'jobs.json');
const readJobs = (): any[] => { try { const p = jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as any[]; } catch { return []; } };
const writeJobs = (jobs: any[]) => { try { fs.mkdirSync(path.dirname(jobsPath()), { recursive: true }); fs.writeFileSync(jobsPath(), JSON.stringify(jobs, null, 2), 'utf8'); } catch {} };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });

// Simple job polling for local mode
const ensureJobWorkerStarted = () => {
  if (LOCAL_MODE) {
    console.log('[GraphBuilder] Local mode detected - job worker should be running separately');
  }
};

export async function POST(req: NextRequest) {
  try {
    ensureJobWorkerStarted();

    // Use default user for all requests
    const userId = 'default-user';
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.log('Graph build request schema error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage, graphDiff, currentGraph } = parsed.data;

    // Get the base graph for comparison
    const baseGraph = await loadBaseGraphFromFile(userId);

    // forward auth headers for downstream API calls
    setGraphEditorAuthHeaders({
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    });
    // ensure absolute base url is used
    setGraphEditorBaseUrl(req.nextUrl.origin);

    // Set up save function for the graph editor
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

    // Set the current graph for the agent to work with
    await setCurrentGraph(currentGraph);

    // Prepare variables for the prompt template (no graph data or diff sent)
    const variables = {
      // Graph data and diff will be read by the agent using MCP tools
    };

    // Build the system message with graph context
    const systemMessage = await createSystemMessage();
    systemMessage.variables = {
      ...systemMessage.variables,
      GRAPH_CONTEXT: JSON.stringify(currentGraph, null, 2),
    };

    const parsedMessages = await buildParsedMessages(
      req,
      userMessage,
      GRAPH_BUILD_PROMPT_TEMPLATES,
      variables
    );

    // Build a single prompt from template for the CLI provider
    const template = await getTemplate('build-graph-template');
    const templateVariables = {
      ...variables,
      USER_REQUEST: userMessage.content || userMessage.variables?.USER_REQUEST || '',
    } as Record<string, any>;
    const prompt = parseMessageWithTemplate(template, templateVariables);

    // Queue a local job for the Codex provider (with unified MCP tools)
    const now = new Date().toISOString();
    const job = {
      id: uuid(),
      user_id: userId,
      job_name: 'build-graph',
      status: 'queued',
      priority: 10, // High priority for graph builds
      payload: {
        provider: 'codex',
        prompt,
        interactive: false,
        meta: {
          kind: 'graph-builder',
          requestedAt: now,
          graphDiff: graphDiff,
          currentGraph: currentGraph,
          saveBaseGraphOnCompletion: true, // Flag to save base graph when job completes
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
          controller.enqueue(enc.encode('Starting graph build...\n'));

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
                // Save base graph only when build completes successfully
                if (currentJob.payload?.meta?.saveBaseGraphOnCompletion && currentJob.payload?.meta?.currentGraph) {
                  try {
                    await storeBaseGraph(currentJob.payload.meta.currentGraph, 'default-user');
                    console.log('✅ Base graph saved after successful build completion');
                    controller.enqueue(enc.encode('Base graph updated with current state\n'));
                  } catch (error) {
                    console.error('❌ Failed to save base graph after build completion:', error);
                    controller.enqueue(enc.encode('Warning: Failed to save base graph\n'));
                  }
                }
                controller.enqueue(enc.encode('Graph build completed successfully\n'));
                controller.close();
                return;
              } else if (currentJob.status === 'failed') {
                controller.enqueue(enc.encode(`Graph build failed: ${currentJob.error_message || 'Unknown error'}\n`));
                controller.close();
                return;
              } else if (currentJob.status === 'running') {
                // Send progress update
                controller.enqueue(enc.encode('Building graph...\n'));
              } else if (currentJob.status === 'queued') {
                // Send queued message
                controller.enqueue(enc.encode('Graph build queued for processing...\n'));
              }

              // Continue polling if not done and under max polls
              if (pollCount < maxPolls) {
                setTimeout(pollJob, 1000); // Poll every second
              } else {
                controller.enqueue(enc.encode('Graph build timed out\n'));
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
    console.error('Graph build error:', err);
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
