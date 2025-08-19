import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { storeGraph } from '@/app/api/lib/graphStorage';
import { fetchGraphFromApi } from '@/app/api/lib/graphApiUtils';
import { GraphSchema } from '@/app/api/lib/schemas';

// Configuration for graph quick patch operations
const GRAPH_QUICK_PATCH_CONFIG = {
  model: 'gemini-2.5-flash',
  temperature: 1,
  promptTemplate: 'graph-quick-patch-template',
  provider: 'google',
  useGoogleStructuredOutput: true,
  googleStructuredSchema: {
    type: "OBJECT",
    properties: {
      patched_graph: {
        type: "OBJECT",
        properties: {
          rootId: {
            type: "STRING",
            description: "The ID of the root node in the graph"
          },
          nodes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: {
                  type: "STRING",
                  description: "Unique identifier for the node"
                },
                title: {
                  type: "STRING",
                  description: "Display title for the node"
                },
                prompt: {
                  type: "STRING",
                  description: "The prompt text for this node"
                },
                children: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: {
                        type: "STRING",
                        description: "ID of the child node"
                      },
                      title: {
                        type: "STRING",
                        description: "Title of the child node"
                      }
                    },
                    required: ["id", "title"]
                  },
                  description: "Array of child node references"
                },
                built: {
                  type: "BOOLEAN",
                  description: "Whether code for this node has been generated"
                },
                properties: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      id: {
                        type: "STRING",
                        description: "Property identifier"
                      },
                      title: {
                        type: "STRING",
                        description: "Property display title"
                      },
                      propertyType: {
                        type: "OBJECT",
                        properties: {
                          type: {
                            type: "STRING",
                            enum: ["color", "text", "number", "select"]
                          },
                          value: {
                            type: "STRING",
                            description: "Property value (string or number)"
                          },
                          options: {
                            type: "ARRAY",
                            items: { type: "STRING" },
                            description: "Available options for select properties"
                          },
                          maxLength: {
                            type: "NUMBER",
                            description: "Maximum length for text properties"
                          },
                          min: {
                            type: "NUMBER",
                            description: "Minimum value for number properties"
                          },
                          max: {
                            type: "NUMBER",
                            description: "Maximum value for number properties"
                          },
                          step: {
                            type: "NUMBER",
                            description: "Step value for number properties"
                          }
                        },
                        required: ["type"]
                      },
                      codeBinding: {
                        type: "OBJECT",
                        properties: {
                          file: {
                            type: "STRING",
                            description: "File path for code binding"
                          },
                          start: {
                            type: "NUMBER",
                            description: "Start line number"
                          },
                          end: {
                            type: "NUMBER",
                            description: "End line number"
                          }
                        },
                        required: ["file", "start", "end"]
                      }
                    },
                    required: ["id", "title"]
                  },
                  description: "Array of node properties"
                }
              },
              required: ["id", "title", "prompt", "children"]
            },
            description: "Array of graph nodes"
          }
        },
        required: ["rootId", "nodes"],
        description: "The complete graph structure after applying all edits"
      },
      success: {
        type: "BOOLEAN",
        description: "Whether the patching operation was successful"
      },
      error_message: {
        type: "STRING",
        description: "Error message if the patching failed, empty string if successful"
      }
    },
    required: ["patched_graph", "success"],
    propertyOrdering: ["success", "patched_graph", "error_message"]
  }
} as const;

const RequestSchema = z.string();

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
      console.error('Graph quick patch error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const editSpecification = parsed.data;
    const graph = await fetchGraphFromApi(req);
    if (!graph) {
      console.log('No graph found. Generate graph first.');
      return new Response(JSON.stringify({ error: 'No graph found. Generate graph first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the prompt template
    const template = await getTemplate(GRAPH_QUICK_PATCH_CONFIG.promptTemplate);
    const content = parseMessageWithTemplate(template, {
      GRAPH_CONTENT: JSON.stringify(graph, null, 2),
      PATCH_DESCRIPTION: editSpecification,
    });

    // Call agent with centralized logging
    const response = await callAgent(req, {
      parsedMessages: [
        {
          role: 'user',
          content: content,
        },
      ],
      config: GRAPH_QUICK_PATCH_CONFIG,
      operationName: 'graph-quick-patch',
      metadata: {
        editSpecification,
        originalGraphId: graph.rootId,
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Graph quick patch failed: ${response.status} ${response.statusText}`, details: errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    
    // Extract the structured response
    const structuredResponse = result.result.object;
    
    if (!structuredResponse.success) {
      return new Response(JSON.stringify({ 
        error: structuredResponse.error_message || 'Graph patching failed',
        success: false 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate the patched graph against our schema
    const validationResult = GraphSchema.safeParse(structuredResponse.patched_graph);
    if (!validationResult.success) {
      console.error('Graph schema validation failed:', validationResult.error);
      return new Response(JSON.stringify({ 
        error: `Invalid graph structure: ${validationResult.error.message}`,
        success: false 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const newGraph = validationResult.data;

    // Store the updated graph
    await storeGraph(newGraph);
    
    return new Response(JSON.stringify({ 
      success: true,
      graph: newGraph,
      originalGraph: graph,
      editSpecification,
      message: 'Graph quick patch applied successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Graph quick patch error:', err);
    return new Response(JSON.stringify({ 
      error: err?.message || 'Server error',
      success: false 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
