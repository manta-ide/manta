import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { 
  Message, 
  ParsedMessage, 
  ClientChatRequestSchema,
  MessageVariablesSchema
} from '../../lib/schemas';
import { buildConversationForAI, addMessageToSession } from '../../lib/conversationStorage';
import { storeGraph } from '../../lib/graphStorage';
import { traverseGraph, GraphTraversalConfig } from '../../lib/graph-operations/graphTraversalUtils';
import { AgentProcessor } from '../../lib/graph-operations/agentProcessor';

// Default configuration
const DEFAULT_CONFIG = {
  // Graph generation parameters
  maxDepth: 1,
  maxNodes: 120,
  childLimit: 3,
  concurrency: 4,
  batchSize: 4,
  minChildComplexity: 3,
  allowPrimitiveExpansion: false,
  model: 'gpt-4o',
  temperature: 0.2,
  topP: 1,
  
  // Agent configuration
  agentModel: 'o4-mini',
  agentMaxSteps: 10,
  agentStreaming: true,
  agentProviderOptions: {
    azure: {
      reasoning_effort: 'high'
    }
  }
} as const;

// Request schema for graph-code generation
const GraphCodeRequestSchema = z.object({
  userMessage: z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    variables: z.object({
      USER_REQUEST: z.string(),
    }),
    messageContext: z.any().optional(),
  }),
  sessionId: z.string().optional(),
  // Graph generation parameters (all optional with defaults)
  maxDepth: z.number().int().min(0).max(12).optional(),
  maxNodes: z.number().int().min(1).max(1000).optional(),
  childLimit: z.number().int().min(0).max(20).optional(),
  concurrency: z.number().int().min(1).max(16).optional(),
  batchSize: z.number().int().min(1).max(20).optional(),
  minChildComplexity: z.number().int().min(1).max(5).optional(),
  allowPrimitiveExpansion: z.boolean().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
  // Agent configuration (all optional with defaults)
  agentModel: z.string().optional(),
  agentMaxSteps: z.number().int().min(1).optional(),
  agentStreaming: z.boolean().optional(),
  agentProviderOptions: z.record(z.any()).optional(),
});

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

    // Merge with defaults
    const config = {
      ...DEFAULT_CONFIG,
      ...parsed.data,
    };

    const {
      userMessage,
      sessionId = 'default',
      maxDepth,
      maxNodes,
      childLimit,
      concurrency,
      batchSize,
      minChildComplexity,
      allowPrimitiveExpansion,
      model,
      temperature,
      topP,
      seed,
      agentModel,
      agentMaxSteps,
      agentStreaming,
      agentProviderOptions,
    } = config;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Step 1: Generate graph using graph traversal utilities
          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              t: 'status', 
              message: 'Generating UI structure graph...' 
            }) + '\n')
          );

          // Create the graph traversal configuration
          const graphConfig: GraphTraversalConfig = {
            maxDepth,
            maxNodes,
            childLimit,
            concurrency,
            batchSize,
            minChildComplexity,
            allowPrimitiveExpansion,
          };
          // Create the agent processor for graph generation
          const agentProcessor = new AgentProcessor();

          const rootPrompt = userMessage.variables.USER_REQUEST.trim();
          if (!rootPrompt) {
            throw new Error('USER_REQUEST is empty');
          }
          const graph = await traverseGraph({
            rootPrompt,
            config: graphConfig,
            agentProcessor,
            model,
            temperature,
            topP,
            seed,
          });
          
          
          // Store the graph
          await storeGraph(sessionId, graph);

          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              t: 'graph_generated', 
              graph: graph,
              message: 'Graph generated successfully. Generating code...' 
            }) + '\n')
          );

          // Step 2: Generate code for each node individually, starting from root
          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              t: 'status', 
              message: 'Generating code for individual UI components...' 
            }) + '\n')
          );

          // Process nodes from leaves to root for code generation
          const processedNodes = new Set<string>();
          const nodeQueue: string[] = [];
          
          // Build a map of node dependencies (parent -> children)
          const nodeDependencies = new Map<string, string[]>();
          const reverseDependencies = new Map<string, string[]>();
          
          // Initialize dependency maps
          graph.nodes.forEach(node => {
            nodeDependencies.set(node.id, node.children.map(child => child.id));
            node.children.forEach(child => {
              if (!reverseDependencies.has(child.id)) {
                reverseDependencies.set(child.id, []);
              }
              reverseDependencies.get(child.id)!.push(node.id);
            });
          });
          
          // Find leaf nodes (nodes with no children or no unprocessed children)
          const findLeafNodes = () => {
            return graph.nodes.filter(node => {
              const children = nodeDependencies.get(node.id) || [];
              return children.length === 0 || children.every(childId => processedNodes.has(childId));
            }).filter(node => !processedNodes.has(node.id));
          };
          
          // Start with leaf nodes
          const leafNodes = findLeafNodes();
          leafNodes.forEach(node => nodeQueue.push(node.id));
          
          let totalToolCalls = 0;
          let totalToolResults = 0;
          let allOperations: any[] = [];
          let finalResponse = '';
          
          while (nodeQueue.length > 0) {
            const nodeId = nodeQueue.shift()!;
            if (processedNodes.has(nodeId)) continue;
            
            const node = graph.nodes.find(n => n.id === nodeId);
            if (!node) continue;
            
            processedNodes.add(nodeId);
            
            // Generate code for this specific node
            controller.enqueue(
              encoder.encode(JSON.stringify({ 
                t: 'status', 
                message: `Generating code for: ${node.title}` 
              }) + '\n')
            );

            // Create node-specific system message
            const nodeSystemMessage: Message = {
              role: 'system',
              content: '',
              variables: {
                NODE_TITLE: node.title,
                NODE_KIND: node.kind,
                NODE_WHAT: node.what,
                NODE_HOW: node.how,
                NODE_PROPERTIES: node.properties.join(', '),
                NODE_CHILDREN: node.children.map(child => `${child.title} (${child.kind})`).join(', ')
              }
            };
            
            // Create user message for this node
            const nodeUserMessage: Message = {
              role: 'user',
              content: `Implement the ${node.kind} component: ${node.title}`,
              variables: {
                USER_REQUEST: `Create the ${node.kind} component "${node.title}" with the following specifications: ${node.what}. Implementation approach: ${node.how}. Properties: ${node.properties.join(', ')}. Child components: ${node.children.map(child => `${child.title} (${child.kind})`).join(', ')}`
              }
            };

            // Create unique session ID for this node
            const nodeSessionId = `${sessionId}-node-${nodeId}`;

            // Add messages to node-specific session
            addMessageToSession(nodeSessionId, nodeSystemMessage);
            addMessageToSession(nodeSessionId, nodeUserMessage);

            // Build conversation for this node using node-specific session
            const nodeMessages = await buildConversationForAI(nodeSessionId, nodeUserMessage);

            // Get templates
            const templates = {
              'user': await getTemplate('user-prompt-template'),
              'assistant': await getTemplate('assistant-prompt-template'),
              'system': await getTemplate('node-code-generation-template') // Use node-specific template
            };

            // Parse messages for this node
            const parsedNodeMessages: ParsedMessage[] = nodeMessages.map(message => {
              const template = templates[message.role];
              const validatedVariables = MessageVariablesSchema.parse(message.variables || {});
              const content = parseMessageWithTemplate(template, validatedVariables);
              return { role: message.role, content };
            });

            // Generate code for this node
            const nodeResponse = await fetch('http://localhost:3000/api/llm-agent/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userMessage: nodeUserMessage,
                sessionId: nodeSessionId, // Use node-specific session ID
                parsedMessages: parsedNodeMessages,
                config: {
                  model: agentModel,
                  maxSteps: agentMaxSteps,
                  tools: undefined, // Use default fileTools
                  streaming: agentStreaming,
                  structuredOutput: false,
                  providerOptions: agentProviderOptions,
                }
              }),
              signal: req.signal
            });

            if (!nodeResponse.ok) {
              throw new Error(`Node code generation failed for ${node.title}: ${nodeResponse.statusText}`);
            }

            // Process the streaming response for this node
            const nodeReader = nodeResponse.body?.getReader();
            if (!nodeReader) {
              throw new Error('No response body from node generation');
            }

            let nodeFull = '';
            const nodeToolCalls: any[] = [];
            const nodeToolResults: any[] = [];

            try {
              while (true) {
                const { done, value } = await nodeReader.read();
                if (done) break;

                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                  try {
                    const data = JSON.parse(line);
                    
                    switch (data.t) {
                      case 'token':
                        nodeFull += data.d;
                        controller.enqueue(
                          encoder.encode(JSON.stringify({ t: 'token', d: data.d, nodeId }) + '\n')
                        );
                        break;

                      case 'tool_call':
                        nodeToolCalls.push(data);
                        controller.enqueue(
                          encoder.encode(JSON.stringify({ 
                            t: 'tool_call', 
                            toolName: data.toolName,
                            args: data.args,
                            language: data.language,
                            nodeId
                          }) + '\n')
                        );
                        break;

                      case 'tool_result':
                        nodeToolResults.push(data);
                        controller.enqueue(
                          encoder.encode(JSON.stringify({ ...data, nodeId }) + '\n')
                        );
                        break;

                      case 'final':
                        break;

                      case 'error':
                        throw new Error(data.error);
                    }
                  } catch (parseErr) {
                    console.warn('Failed to parse node response line:', line);
                  }
                }
              }
            } finally {
              nodeReader.releaseLock();
            }

            // Add assistant response for this node to session
            const nodeAssistantMessage: Message = {
              role: 'assistant',
              content: nodeFull,
              variables: {
                ASSISTANT_RESPONSE: nodeFull
              }
            };
            addMessageToSession(nodeSessionId, nodeAssistantMessage);

            // Track totals for final response
            totalToolCalls += nodeToolCalls.length;
            totalToolResults += nodeToolResults.length;
            allOperations.push(...nodeToolResults);
            finalResponse += `\n\n--- ${node.title} ---\n${nodeFull}`;

            // Add parent nodes to queue for processing when all their children are processed
            const parents = reverseDependencies.get(nodeId) || [];
            parents.forEach(parentId => {
              const parentChildren = nodeDependencies.get(parentId) || [];
              const allChildrenProcessed = parentChildren.every(childId => processedNodes.has(childId));
              
              if (allChildrenProcessed && !processedNodes.has(parentId) && !nodeQueue.includes(parentId)) {
                nodeQueue.push(parentId);
              }
            });

            // Send node completion
            controller.enqueue(
              encoder.encode(JSON.stringify({ 
                t: 'node_completed', 
                nodeId,
                nodeTitle: node.title,
                reply: nodeFull, 
                operations: nodeToolResults.map(tr => (tr.result as any)?.operation).filter(Boolean),
                toolCalls: nodeToolCalls.length,
                toolResults: nodeToolResults.length
              }) + '\n')
            );
          }

          // Send final completion
          const allFileOperations = allOperations
            .map(tr => (tr.result as any)?.operation)
            .filter(Boolean);

          controller.enqueue(
            encoder.encode(
              JSON.stringify({ 
                t: 'final', 
                reply: finalResponse, 
                operations: allFileOperations,
                toolCalls: totalToolCalls,
                toolResults: totalToolResults,
                graph: graph // Include the generated graph in final response
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