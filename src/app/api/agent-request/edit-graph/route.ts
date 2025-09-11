import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import '@/app/api/lib/prompts/registry';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { getGraphSession } from '@/app/api/lib/graph-service';
import { storeGraph } from '@/app/api/lib/graph-service';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import path from 'node:path';
import fs from 'node:fs';

// Multi-step agent configuration for graph editing
const GRAPH_EDITOR_CONFIG = {
  model: 'gpt-4o',
  maxSteps: 20,
  streaming: true,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'minimal' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-editor-template',
  },
  structuredOutput: false,
  toolsetName: 'graph-editor'
} as const;

const RequestSchema = z.object({
  userMessage: MessageSchema,
  selectedNodeId: z.string().optional(),
  selectedNodeTitle: z.string().optional(),
  selectedNodePrompt: z.string().optional(),
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

export async function POST(req: NextRequest) {
  try {
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

    const { userMessage, selectedNodeId, selectedNodeTitle, selectedNodePrompt } = parsed.data;
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
          'Content-Type': 'application/json',
          ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
          ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
        },
        body: JSON.stringify({ graph })
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.success;
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

    const variables = {
      GRAPH_DATA: JSON.stringify(graph, null, 2),
      SELECTED_NODE_ID: selectedNodeId || userMessage.variables?.SELECTED_NODE_ID,
      SELECTED_NODE_TITLE: selectedNodeTitle || userMessage.variables?.SELECTED_NODE_TITLE,
      SELECTED_NODE_PROMPT: selectedNodePrompt || userMessage.variables?.SELECTED_NODE_PROMPT,
    };

    const parsedMessages = await buildParsedMessages(
      req,
      userMessage,
      GRAPH_EDITOR_CONFIG.promptTemplates,
      variables
    );

    // Build a single prompt from template for the CLI provider
    const template = await getTemplate('graph-editor-template');
    const templateVariables = {
      ...variables,
      USER_REQUEST: userMessage.content || userMessage.variables?.USER_REQUEST || '',
    } as Record<string, any>;
    const prompt = process.env.CLI_CODEX_PROMPT || parseMessageWithTemplate(template, templateVariables);

    // Queue a local job for the Codex provider (with MCP graph-editor tools)
    const now = new Date().toISOString();
    const job = {
      id: uuid(),
      user_id: userId,
      job_name: 'run',
      status: 'queued',
      priority: 5,
      payload: {
        provider: 'codex',
        prompt,
        interactive: false,
        meta: {
          kind: 'graph-editor',
          requestedAt: now,
          selectedNodeId: variables.SELECTED_NODE_ID || null,
        }
      },
      created_at: now,
      updated_at: now,
    };
    const jobs = readJobs();
    jobs.push(job);
    writeJobs(jobs);

    // Mock streaming output for now. The UI treats text/plain and event-stream similarly.
    if (GRAPH_EDITOR_CONFIG.streaming) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode('Thinking'));
          controller.close();
        }
      });
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Non-streaming JSON ack
    return new Response(JSON.stringify({ success: true, message: 'Thinking', jobId: job.id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
