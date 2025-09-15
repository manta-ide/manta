import { NextRequest } from 'next/server';
import { z } from 'zod';
import path from 'path';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { graphToXml } from '@/lib/graph-xml';
import '@/app/api/lib/prompts/registry';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { storeGraph } from '@/app/api/lib/graph-service';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { loadBaseGraphFromFile, storeBaseGraph } from '@/app/api/lib/graph-service';
import { getDevProjectDir } from '@/lib/project-config';

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

// Direct Claude Code execution utilities
const projectDir = () => {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (require('fs').existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  return process.cwd();
};

export async function POST(req: NextRequest) {
  try {

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

    // Call Claude Code API endpoint
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status}`);
    }

    const result = await response.text();

    // Stream the result with graph saving logic
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();

        // Send initial message
        controller.enqueue(enc.encode('Starting graph build...\n'));

        // Send result
        controller.enqueue(enc.encode(result + '\n'));

        // Save base graph only when build completes successfully
        (async () => {
          try {
            await storeBaseGraph(currentGraph, 'default-user');
            console.log('✅ Base graph saved after successful build completion');
            controller.enqueue(enc.encode('Base graph updated with current state\n'));
          } catch (error: any) {
            console.error('❌ Failed to save base graph after build completion:', error);
            controller.enqueue(enc.encode('Warning: Failed to save base graph\n'));
          }

          controller.enqueue(enc.encode('Graph build completed successfully\n'));
          controller.close();
        })();
      }
    });

    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
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
