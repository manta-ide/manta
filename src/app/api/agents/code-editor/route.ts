import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { markNodesBuilt } from '@/app/api/lib/graphStorage';
import { fetchGraphFromApi, fetchUnbuiltNodeIdsFromApi } from '@/app/api/lib/graphApiUtils';

const CODE_EDITOR_CONFIG = {
  model: 'gpt-5-mini',
  maxSteps: 50,
  streaming: false,
  temperature: 1,
  providerOptions: { azure: { reasoning_effort: 'medium' } },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'code-editor-template',
  },
  structuredOutput: false,
  toolsetName: 'code-editor'
} as const;

const RequestSchema = z.object({ 
  userMessage: MessageSchema,
  rebuildAll: z.boolean().optional().default(false),
  nodeIds: z.array(z.string()).optional(),
  nodeId: z.string().optional(),
});

async function buildParsedMessages(
  userMessage: Message,
  promptTemplates: Record<'system' | 'user' | 'assistant', string>,
  extraVariables: Record<string, unknown> | undefined,
  req: NextRequest
): Promise<ParsedMessage[]> {
  const session = getConversationSession();
  const filesRes = await fetch(`${req.nextUrl.origin}/api/files?list=true&from=blaxel`, {
    headers: {
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    },
  });
  let files: string[] = [];
  if (filesRes.ok) {
    const data = await filesRes.json();
    files = Array.isArray(data.files)
      ? data.files.map((f: any) => String(f.route || '').replace(/^\/?(?:blaxel\/app\/)?/i, ''))
      : [];
  }
  const systemMessage = await createSystemMessage({ files });
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

async function callAgent(request: NextRequest, body: any, userId?: string): Promise<Response> {
  const base = process.env.BACKEND_URL || request.nextUrl.origin;
  // Inject metadata hints for runner/tool behavior (informational; tools enforce caps)
  const payload = {
    ...body,
    metadata: {
      enforceWindowedReads: true,
      defaultReadLimitLines: 400,
      maxReadChars: 3000,
      truncateToolOutputs: true,
    },
  };
  return fetch(`${base}/api/llm-agent/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') as string } : {}),
      ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization') as string } : {}),
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    body: JSON.stringify(payload),
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
    // Resolve user for DB updates
    const session = await auth.api.getSession({ headers: req.headers });
    const userId = session?.user?.id as string | undefined;
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { userMessage, rebuildAll } = parsed.data;
    const explicitNodeIds = parsed.data.nodeIds && parsed.data.nodeIds.length > 0
      ? parsed.data.nodeIds
      : (parsed.data.nodeId ? [parsed.data.nodeId] : undefined);
    
    // Get graph from API
    const graph = await fetchGraphFromApi(req);
    
    if (!graph) {
      return new Response(JSON.stringify({ error: 'No graph found. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get node IDs to process
    let nodeIdsToProcess: string[];
    let filteredGraph: any;
    
    if (rebuildAll) {
      // For rebuild, process all nodes
      nodeIdsToProcess = graph.nodes.map((node: any) => node.id);
      filteredGraph = graph; // Use full graph
      console.log(`🔄 Rebuild mode: processing all ${nodeIdsToProcess.length} nodes`);
    } else if (explicitNodeIds && explicitNodeIds.length > 0) {
      // Explicit selection: process provided node ids only
      nodeIdsToProcess = explicitNodeIds;
      filteredGraph = filterGraphForUnbuiltNodes(graph, nodeIdsToProcess);
      console.log(`🎯 Explicit node selection: processing ${nodeIdsToProcess.length} nodes`);
    } else {
      // Normal mode: only process unbuilt nodes
      nodeIdsToProcess = await fetchUnbuiltNodeIdsFromApi(req);
      
      if (nodeIdsToProcess.length === 0) {
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
      filteredGraph = filterGraphForUnbuiltNodes(graph, nodeIdsToProcess);
    }

    // Get project files for the prompt template
    // Ask files API to list from Blaxel (latest content in sandbox)
    const projectFilesRes = await fetch(`${process.env.BACKEND_URL || req.nextUrl.origin}/api/files?list=true&from=blaxel`, {
      // forward cookies for auth
      headers: {
        ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
        ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
      }
    });
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
      },
      req
    );

    
    const codeEditorResponse = await callAgent(req, {
      sessionId: codeEditorSessionId,
      parsedMessages: parsedCodeEditorMessages,
      config: CODE_EDITOR_CONFIG,
      operationName: 'code-editor',
    }, userId);

    if (!codeEditorResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Code generation failed: ${codeEditorResponse.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the full response as JSON instead of streaming
    const result = await codeEditorResponse.json();
    // Avoid logging massive payloads; log a compact summary
    try {
      const content = result?.result?.content || result?.result?.text || result?.content || '';
      const preview = typeof content === 'string' ? content.slice(0, 400) : '';
      console.log('📝 Code editor result: finishReason=', result?.result?.finishReason || result?.finishReason, ' contentLen=', typeof content === 'string' ? content.length : 0, ' preview=', preview);
    } catch {}
    
    // Mark processed nodes as built
    try {
      if (userId) {
        await markNodesBuilt(nodeIdsToProcess, userId);
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
      processedNodeIds: nodeIdsToProcess,
      processedNodes: filteredGraph.nodes.length,
      message: rebuildAll 
        ? 'Code generation completed successfully for all nodes (rebuild mode)'
        : 'Code generation completed successfully for unbuilt nodes'
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
