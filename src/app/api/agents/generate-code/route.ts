import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { markNodesBuilt } from '@/app/api/lib/graphStorage';
import { fileTools } from '@/app/api/lib/aiFileTools';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';

const CODE_GEN_CONFIG = {
  model: 'o4-mini',
  maxSteps: 50, // Increased max steps to allow for file operations
  streaming: false,
  temperature: 0.7, // Slightly lower temperature for more focused execution
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-code-generation-template',
  },
  structuredOutput: false,
  tools: fileTools,
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
  console.log("generate-code calling agent with body", body);
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
    
    // Get graph from API
    const graph = await fetchGraphFromApi(req);
    
    if (!graph) {
      return new Response(JSON.stringify({ error: 'No graph found. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // At this point, graph is guaranteed to be non-null
    const graphData = graph;

    // Get project files for the prompt template
    const projectFilesRes = await fetch(`${req.nextUrl.origin}/api/files?list=true`);
    let projectFiles = [];
    if (projectFilesRes.ok) {
      const filesData = await projectFilesRes.json();
      // Ensure projectFiles is an array of file objects with route and lines properties
      projectFiles = Array.isArray(filesData.files) ? filesData.files : [];
    }

    const graphSessionId = 'graph-code';
    const parsedGraphCodeMessages = await buildParsedMessages(
      userMessage,
      CODE_GEN_CONFIG.promptTemplates,
      { 
        GRAPH_DATA: JSON.stringify(graphData, null, 2),
        PROJECT_FILES: projectFiles
      }
    );

    console.log('🔄 Calling agent with config:', JSON.stringify(CODE_GEN_CONFIG, null, 2));
    console.log('🔄 Agent messages:', JSON.stringify(parsedGraphCodeMessages, null, 2));
    
    const graphResponse = await callAgent(req, {
      sessionId: graphSessionId,
      parsedMessages: parsedGraphCodeMessages,
      config: CODE_GEN_CONFIG,
      operationName: 'generate-code',
    });

    if (!graphResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Graph code generation failed: ${graphResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the full response as JSON instead of streaming
    const result = await graphResponse.json();
    
    console.log('📝 Code generation result:', JSON.stringify(result, null, 2));
    
    // Mark all nodes as built
    try {
      if (graphData && graphData.nodes) {
        await markNodesBuilt(graphData.nodes.map((n: any) => n.id));
      }
    } catch (error) {
      console.warn('Failed to mark nodes as built:', error);
    }

    const generatedCode = result.result?.content || result.result || result.content || '';
    console.log('📝 Generated code length:', generatedCode.length);

    return new Response(JSON.stringify({ 
      success: true,
      result: result,
      generatedCode: generatedCode,
      message: 'Code generation completed successfully'
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


