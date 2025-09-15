import { NextRequest } from 'next/server';
import { z } from 'zod';
import path from 'path';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { graphToXml } from '@/lib/graph-xml';
import '@/app/api/lib/prompts/registry';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { getGraphSession } from '@/app/api/lib/graph-service';
import { storeGraph } from '@/app/api/lib/graph-service';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { setCurrentGraph, resetPendingChanges, setGraphEditorAuthHeaders, setGraphEditorBaseUrl, setGraphEditorSaveFn } from '@/app/api/lib/graphEditorTools';
import { getDevProjectDir } from '@/lib/project-config';

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

    // Build a single prompt from template for Claude Code
    const template = await getTemplate('graph-editor-template');
    const templateVariables = {
      ...variables,
      USER_REQUEST: userMessage.content || userMessage.variables?.USER_REQUEST || '',
    } as Record<string, any>;
    const prompt = process.env.CLI_CODEX_PROMPT || parseMessageWithTemplate(template, templateVariables);

    // Call Claude Code API endpoint
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status}`);
    }

    // If the response is already streaming, pass it through
    if (response.headers.get('content-type')?.includes('text/plain')) {
      // Create a new stream that processes the Server-Sent Events from Claude Code
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enc = new TextEncoder();

          try {
            if (!reader) {
              controller.close();
              return;
            }

            let buffer = '';
            let hasStarted = false;

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');

              // Keep the last incomplete line in buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6); // Remove 'data: ' prefix

                  if (data === '[STREAM_START]') {
                    if (!hasStarted) {
                      hasStarted = true;
                      // Send initial thinking indicator
                      controller.enqueue(enc.encode('Thinking...\n'));
                    }
                  } else if (data === '[STREAM_END]') {
                    // Send completion message
                    controller.enqueue(enc.encode('\n\nProcessing completed successfully\n'));
                    controller.close();
                    return;
                  } else {
                    try {
                      const parsed = JSON.parse(data);
                      if (parsed.content) {
                        // Stream the actual content
                        controller.enqueue(enc.encode(parsed.content));
                      } else if (parsed.error) {
                        controller.enqueue(enc.encode(`\n\nError: ${parsed.error}\n`));
                      }
                    } catch (e) {
                      // If it's not JSON, treat as plain text
                      controller.enqueue(enc.encode(data + '\n'));
                    }
                  }
                }
              }
            }

            // Close if we finish without [STREAM_END]
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.enqueue(enc.encode(`\n\nError: ${error instanceof Error ? error.message : String(error)}\n`));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } else {
      // Fallback for non-streaming responses
      const result = await response.text();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(result));
          controller.close();
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
