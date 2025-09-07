import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import '@/app/api/lib/prompts/registry';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { getGraphSession } from '@/app/api/lib/graph-service';
import { storeGraph } from '@/app/api/lib/graph-service';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';

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

async function callAgent(request: NextRequest, body: unknown): Promise<Response> {
  const origin = request.nextUrl.origin;
  const url = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/llm-agent/run` : `${origin}/api/llm-agent/run`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') as string } : {}),
      ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization') as string } : {}),
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate request to associate graph with user
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const userId = session.user.id;

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

    const response = await callAgent(req, {
      sessionId: 'graph-editor',
      parsedMessages,
      config: GRAPH_EDITOR_CONFIG,
      operationName: 'graph-editor',
      metadata: {
        originalGraphId: graph.nodes.length > 0 ? graph.nodes[0].id : '',
        graphNodeCount: graph.nodes.length,
      }
    });

    // If streaming is enabled, forward the stream directly
    if (GRAPH_EDITOR_CONFIG.streaming) {
      if (!response.ok) {
        return new Response(
          `Graph editor failed: ${response.statusText}`,
          { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
      // Best-effort: forward streaming body as-is
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/plain; charset=utf-8',
        },
      });
    }

    // Non-streaming fallback
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Graph editor failed: ${response.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();

    // Check if the agent applied changes and saved the graph
    const finalGraph = await fetchGraphFromApi(req);
    const graphWasModified = finalGraph && JSON.stringify(finalGraph) !== JSON.stringify(graph);

    // Reset pending changes after the operation
    resetPendingChanges();

    return new Response(JSON.stringify({
      success: true,
      result: result.result,
      graphModified: graphWasModified,
      finalGraph: graphWasModified ? finalGraph : null,
      originalGraph: graph,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
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
