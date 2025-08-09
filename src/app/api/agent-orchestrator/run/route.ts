import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import {
  Message,
  ParsedMessage,
  MessageVariablesSchema,
  MessageSchema
} from '../../lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '../../lib/conversationStorage';
import { storeGraph } from '../../lib/graphStorage';

// Default configuration
const GRAPH_GEN_CONFIG = {
  // Agent configuration
  model: 'gpt-4o',
  maxSteps: 50,
  streaming: true,
  temperature: 1,
  providerOptions: {
    azure: {
      reasoning_effort: 'high'
    }
  },
  promptTemplates: {
    'user': 'user-prompt-template',
    'assistant': 'assistant-prompt-template',
    'system': 'graph-generation-template',
  },
  structuredOutput:true
} as const;

// Default configuration
const CODE_GEN_CONFIG = {
  // Agent configuration
  model: 'o3',
  maxSteps: 50,
  streaming: true,
  temperature: 1,
  providerOptions: {
    azure: {
      reasoning_effort: 'high'
    }
  },
  promptTemplates: {
    'user': 'user-prompt-template',
    'assistant': 'assistant-prompt-template',
    'system': 'graph-code-generation-template',
  },
  structuredOutput:false
} as const;

// Request schema for graph-code generation
const GraphCodeRequestSchema = z.object({
  userMessage: MessageSchema
});

// Constants
const LLM_AGENT_RUN_URL = 'http://localhost:3000/api/llm-agent/run';

type ToolTokenEvent = { t: 'token'; d: string };
type ToolCallEvent = { t: 'tool_call'; toolName: string; args: unknown; language?: string };
type ToolResultEvent = { t: 'tool_result'; result: unknown; [key: string]: unknown };
type ToolFinalEvent = { t: 'final'; [key: string]: unknown };
type ToolErrorEvent = { t: 'error'; error: string };
type ToolEvent = ToolTokenEvent | ToolCallEvent | ToolResultEvent | ToolFinalEvent | ToolErrorEvent;

async function buildParsedMessages(
  sessionId: string,
  userMessage: Message,
  promptTemplates: Record<'system' | 'user' | 'assistant', string>,
  extraVariables?: Record<string, unknown>
): Promise<ParsedMessage[]> {
  const session = getConversationSession(sessionId);
  const systemMessage = await createSystemMessage(sessionId);
  addMessageToSession(sessionId, userMessage);
  const allMessages = [systemMessage, ...session];

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

async function callAgent(
  request: NextRequest,
  body: unknown
): Promise<Response> {
  return fetch(LLM_AGENT_RUN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

async function streamAgentResponse(
  response: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<{ fullText: string; toolCalls: ToolCallEvent[]; toolResults: ToolResultEvent[] }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body from agent');
  }

  let fullText = '';
  const toolCalls: ToolCallEvent[] = [];
  const toolResults: ToolResultEvent[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data: ToolEvent = JSON.parse(line);
          switch (data.t) {
            case 'token':
              fullText += data.d;
              controller.enqueue(encoder.encode(JSON.stringify({ t: 'token', d: data.d }) + '\n'));
              break;
            case 'tool_call':
              toolCalls.push(data);
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ t: 'tool_call', toolName: data.toolName, args: data.args, language: (data as any).language }) + '\n'
                )
              );
              break;
            case 'tool_result':
              toolResults.push(data);
              controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
              break;
            case 'final':
              // no-op; final summary is constructed below
              break;
            case 'error':
              throw new Error((data as ToolErrorEvent).error);
          }
        } catch (parseErr) {
          console.warn('Failed to parse agent response line:', line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { fullText, toolCalls, toolResults };
}

export async function POST(req: NextRequest) {
  try {
    // Parse and validate the request body
    const parsed = GraphCodeRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage } = parsed.data;
    const sessionId = 'default';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Generate Graph
          const parsedGraphGenMessages = await buildParsedMessages(
            sessionId,
            userMessage,
            GRAPH_GEN_CONFIG.promptTemplates
          );

          const graphGenResponse = await callAgent(req, {
            sessionId,
            parsedMessages: parsedGraphGenMessages,
            config: GRAPH_GEN_CONFIG
          });

          if (!graphGenResponse.ok) {
            throw new Error(`Graph generation failed: ${graphGenResponse.statusText}`);
          }

          const graphGenResult = await graphGenResponse.json();
          const graph = graphGenResult.result.object;
          
          await storeGraph(sessionId, graph);
          
          //Generate Code
          const graphSessionId = `${sessionId}-graph-code`;

          const parsedGraphCodeMessages = await buildParsedMessages(
            graphSessionId,
            userMessage,
            CODE_GEN_CONFIG.promptTemplates,
            { GRAPH_DATA: JSON.stringify(graph, null, 2) }
          );

          // Generate code for the entire graph
          const graphResponse = await callAgent(req, {
            sessionId: graphSessionId,
            parsedMessages: parsedGraphCodeMessages,
            config: CODE_GEN_CONFIG,
          });

          if (!graphResponse.ok) {
            throw new Error(`Graph code generation failed: ${graphResponse.statusText}`);
          }

          // Process the streaming response for graph code generation
          const { fullText: graphFull, toolCalls: graphToolCalls, toolResults: graphToolResults } =
            await streamAgentResponse(graphResponse, controller, encoder);

          // Add assistant response for graph to session
          const graphAssistantMessage: Message = {
            role: 'assistant',
            content: graphFull,
            variables: {
              ASSISTANT_RESPONSE: graphFull
            }
          };
          addMessageToSession(graphSessionId, graphAssistantMessage);

          // Send final completion
          const allFileOperations = graphToolResults
            .map((tr) => (tr.result as any)?.operation)
            .filter(Boolean);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ 
                t: 'final', 
                reply: graphFull, 
                operations: allFileOperations,
                toolCalls: graphToolCalls.length,
                toolResults: graphToolResults.length,
                graph: graph
              }) + '\n'
            )
          );

        } catch (err: any) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ t: 'error', error: String(err?.message || err) }) + '\n'
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (err: any) {
    console.error(err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
} 