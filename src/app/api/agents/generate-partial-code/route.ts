import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { Message, ParsedMessage, MessageVariablesSchema, MessageSchema } from '@/app/api/lib/schemas';
import { addMessageToSession, createSystemMessage, getConversationSession } from '@/app/api/lib/conversationStorage';
import { markNodesBuilt } from '@/app/api/lib/graphStorage';
import { fileTools } from '../../lib/aiFileTools';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';

// Configuration for partial code generation
const PARTIAL_CODE_CONFIG = {
  model: 'o4-mini',
  maxSteps: 50,
  streaming: false,
  temperature: 1,
  provider: 'azure',
  providerOptions: { 
    azure: { 
      reasoning_effort: 'medium' 
    } 
  },
  promptTemplates: {
    user: 'user-prompt-template',
    assistant: 'assistant-prompt-template',
    system: 'graph-partial-code-generation-template',
  },
  structuredOutput: false,
  tools: fileTools,
} as const;

const EditHintSchema = z.object({ previousPrompt: z.string(), newPrompt: z.string() });
const RequestSchema = z.object({
  userMessage: MessageSchema,
  nodeIds: z.array(z.string()).min(1),
  includeDescendants: z.boolean().optional(),
  editHints: z.record(z.string(), EditHintSchema).optional(),
  removedNodeIds: z.array(z.string()).optional(),
});

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

    const { userMessage, nodeIds, includeDescendants = true, editHints, removedNodeIds } = parsed.data;
    const graph = await fetchGraphFromApi(req);
    if (!graph) {
      return new Response(JSON.stringify({ error: 'No graph found. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Extract subset of nodes for partial code gen (optionally include descendants)
    const idSet = new Set<string>();
    const queue = [...nodeIds];
    for (const id of queue) idSet.add(id);
    
    // Only include descendants if explicitly requested AND we're not doing removals
    // For removals, we want to be very surgical and only update the specific nodes
    if (includeDescendants && (!removedNodeIds || removedNodeIds.length === 0)) {
      const byId = new Map(graph.nodes.map((n: any) => [n.id, n]));
      for (let i = 0; i < queue.length; i++) {
        const currentId = queue[i];
        const node = byId.get(currentId);
        if (!node) continue;
        for (const child of (node as any).children || []) {
          if (!idSet.has(child.id)) {
            idSet.add(child.id);
            queue.push(child.id);
          }
        }
      }
    }
    const partialGraph = {
      nodes: graph.nodes.filter((n: any) => idSet.has(n.id)),
    };
    
    console.log(`🔄 Partial code generation: ${nodeIds.length} requested nodes, ${partialGraph.nodes.length} nodes in partial graph`);
    if (removedNodeIds && removedNodeIds.length > 0) {
      console.log(`🔄 Removing ${removedNodeIds.length} nodes: ${removedNodeIds.join(', ')}`);
    }

    const parsedMessages = await buildParsedMessages(
      userMessage,
      PARTIAL_CODE_CONFIG.promptTemplates,
      {
        GRAPH_DATA: JSON.stringify(partialGraph, null, 2),
        STRICT_EDIT_MODE: '1',
        EDIT_HINTS: editHints ? JSON.stringify(editHints) : undefined,
        REMOVED_NODE_IDS: removedNodeIds && removedNodeIds.length > 0 ? JSON.stringify(removedNodeIds) : undefined,
      }
    );

    // Call agent with centralized logging
    const response = await callAgent(req, {
      parsedMessages,
      config: PARTIAL_CODE_CONFIG,
      operationName: 'partial-code-generation',
      metadata: {
        nodeIds: Array.from(idSet),
        editHints: editHints ?? null,
        removedNodeIds: removedNodeIds ?? null
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Partial code generation failed: ${response.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the full response as JSON instead of streaming
    const result = await response.json();
    
    // After completion, mark nodes as built
    try {
      await markNodesBuilt(nodeIds);
    } catch (error) {
      console.warn('Failed to mark nodes as built:', error);
    }

    return new Response(JSON.stringify({ 
      success: true,
      result: result,
      message: 'Partial code generation completed successfully',
      nodeIds: Array.from(idSet)
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


