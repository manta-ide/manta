import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { markNodesBuilt } from '@/app/api/lib/graphStorage';
import { fetchGraphFromApi, fetchUnbuiltNodeIdsFromApi } from '@/app/api/lib/graphApiUtils';

const CODE_EDITOR_CONFIG = {
  model: 'o4-mini',
  maxSteps: 50,
  streaming: false,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'high' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'website-template',
  },
  structuredOutput: false,
  toolsetName: 'code-editor'
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

function filterGraphForUnbuiltNodes(graph: any, unbuiltNodeIds: string[]): any {
  if (!graph || !graph.nodes) return { nodes: [] };
  
  const unbuiltNodes = graph.nodes.filter((node: any) => unbuiltNodeIds.includes(node.id));
  
  // Create a new graph with only unbuilt nodes
  return {
    ...graph,
    nodes: unbuiltNodes
  };
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

    // Get unbuilt node IDs from API
    const unbuiltNodeIds = await fetchUnbuiltNodeIdsFromApi(req);
    
    if (unbuiltNodeIds.length === 0) {
      return new Response(JSON.stringify({ 
        success: true,
        message: 'No unbuilt nodes found. All nodes are already built.',
        unbuiltNodeIds: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Filter graph to only include unbuilt nodes
    const filteredGraph = filterGraphForUnbuiltNodes(graph, unbuiltNodeIds);

    // Get project files for the prompt template
    const projectFilesRes = await fetch(`${req.nextUrl.origin}/api/files?list=true`);
    let projectFiles = [];
    if (projectFilesRes.ok) {
      const filesData = await projectFilesRes.json();
      projectFiles = Array.isArray(filesData.files) ? filesData.files : [];
    }

    const codeEditorSessionId = 'code-editor';
    const parsedCodeEditorMessages = await buildParsedMessages(
      userMessage,
      CODE_EDITOR_CONFIG.promptTemplates,
      { 
        GRAPH_DATA: JSON.stringify(filteredGraph, null, 2),
        PROJECT_FILES: projectFiles,
      }
    );

    console.log('🔄 Calling code editor agent with config:', JSON.stringify(CODE_EDITOR_CONFIG, null, 2));
    console.log('🔄 Unbuilt node IDs:', unbuiltNodeIds);
    console.log('🔄 Filtered graph nodes:', filteredGraph.nodes.length);
    
    const codeEditorResponse = await callAgent(req, {
      sessionId: codeEditorSessionId,
      parsedMessages: parsedCodeEditorMessages,
      config: CODE_EDITOR_CONFIG,
      operationName: 'code-editor',
    });

    if (!codeEditorResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Code generation failed: ${codeEditorResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the full response as JSON instead of streaming
    const result = await codeEditorResponse.json();
    
    console.log('📝 Code editor result:', JSON.stringify(result, null, 2));
    
    // Mark unbuilt nodes as built
    try {
      await markNodesBuilt(unbuiltNodeIds);
    } catch (error) {
      console.warn('Failed to mark nodes as built:', error);
    }

    const generatedCode = result.result?.content || result.result || result.content || '';
    console.log('📝 Generated code length:', generatedCode.length);

    return new Response(JSON.stringify({ 
      success: true,
      result: result,
      generatedCode: generatedCode,
      unbuiltNodeIds: unbuiltNodeIds,
      processedNodes: filteredGraph.nodes.length,
      message: 'Code generation completed successfully for unbuilt nodes'
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
