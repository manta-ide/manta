import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { storeGraph } from '@/app/api/lib/graphStorage';

// Config for full graph generation
const GRAPH_GEN_CONFIG = {
  model: 'gpt-4o',
  maxSteps: 50,
  streaming: false,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-generation-template',
  },
  structuredOutput: true,
} as const;

// Config for full code generation
const CODE_GEN_CONFIG = {
  model: 'o3',
  maxSteps: 50,
  streaming: false,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-code-generation-template',
  },
  structuredOutput: false,
} as const;

const RequestSchema = z.object({ userMessage: MessageSchema });

async function buildParsedMessages(
  userMessage: Message,
  promptTemplates: Record<'system' | 'user' | 'assistant', string>,
  extraVariables?: Record<string, unknown>
): Promise<ParsedMessage[]> {
  const session = getConversationSession();
  const systemMessage = await createSystemMessage();
  addMessageToSession(userMessage);
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

async function callAgent(request: NextRequest, body: unknown): Promise<Response> {
  return fetch('http://localhost:3000/api/llm-agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage } = parsed.data;

    // Step 1: Generate graph
    const parsedGraphGenMessages = await buildParsedMessages(
      userMessage,
      GRAPH_GEN_CONFIG.promptTemplates
    );

    const graphGenResponse = await callAgent(req, {
      sessionId: 'graph-generation',
      parsedMessages: parsedGraphGenMessages,
      config: GRAPH_GEN_CONFIG,
    });

    if (!graphGenResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Graph generation failed: ${graphGenResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const graphGenResult = await graphGenResponse.json();
    const graph = graphGenResult.result.object;

    await storeGraph(graph);

    // Step 2: Generate code for the graph

    const parsedGraphCodeMessages = await buildParsedMessages(
      userMessage,
      CODE_GEN_CONFIG.promptTemplates,
      { GRAPH_DATA: JSON.stringify(graph, null, 2) }
    );

    const graphCodeResponse = await callAgent(req, {
      sessionId: 'graph-code',
      parsedMessages: parsedGraphCodeMessages,
      config: CODE_GEN_CONFIG,
    });

    if (!graphCodeResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Code generation failed: ${graphCodeResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const codeGenResult = await graphCodeResponse.json();

    return new Response(JSON.stringify({ 
      success: true,
      graph: graph,
      codeGeneration: codeGenResult,
      message: 'Graph generation and code generation completed successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 