import { NextRequest } from 'next/server';
import { streamText, tool } from 'ai';
import { azure } from '@ai-sdk/azure';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { join } from 'path';
import { 
  Message, 
  ParsedMessage, 
  ChatRequestSchema,
  MessageVariablesSchema
} from '../lib/schemas';

// File operation tools
const fileTools = {
  createFile: tool({
    description: 'Create a new file with the given content',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
      content: z.string().describe('The content to write to the file'),
    }),
    execute: async ({ path, content }) => {
      try {
        const fullPath = join(process.cwd(), path);
        const dir = dirname(fullPath);
        
        // Create directory if it doesn't exist
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        
        writeFileSync(fullPath, content, 'utf-8');
        return { 
          success: true, 
          message: `Created file: ${path}`,
          operation: { type: 'create', path, content }
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to create file: ${error}`,
          operation: { type: 'create', path, content }
        };
      }
    },
  }),

  updateFile: tool({
    description: 'Update an existing file with new content',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
      content: z.string().describe('The new content for the file'),
    }),
    execute: async ({ path, content }) => {
      try {
        const fullPath = join(process.cwd(), path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'update', path, content }
          };
        }
        
        writeFileSync(fullPath, content, 'utf-8');
        return { 
          success: true, 
          message: `Updated file: ${path}`,
          operation: { type: 'update', path, content }
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to update file: ${error}`,
          operation: { type: 'update', path, content }
        };
      }
    },
  }),

  patchFile: tool({
    description: 'Apply a patch to an existing file using unified diff format',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
      patch: z.string().describe('The unified diff patch to apply'),
    }),
    execute: async ({ path, patch }) => {
      try {
        const fullPath = join(process.cwd(), path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'patch', path, content: patch }
          };
        }
        
        // Read current content and apply patch using the same logic as the old system
        const currentContent = readFileSync(fullPath, 'utf-8');
        
        // For now, we'll return the patch info for UI display
        // The actual patching will be handled by the chat service
        return { 
          success: true, 
          message: `Patch prepared for: ${path}`,
          operation: { type: 'patch', path, content: patch },
          patch: patch,
          path: path
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to patch file: ${error}`,
          operation: { type: 'patch', path, content: patch }
        };
      }
    },
  }),

  deleteFile: tool({
    description: 'Delete an existing file',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
    }),
    execute: async ({ path }) => {
      try {
        const fullPath = join(process.cwd(), path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'delete', path }
          };
        }
        
        unlinkSync(fullPath);
        return { 
          success: true, 
          message: `Deleted file: ${path}`,
          operation: { type: 'delete', path }
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to delete file: ${error}`,
          operation: { type: 'delete', path }
        };
      }
    },
  }),
};

export async function POST(req: NextRequest) {
  try {
    // Parse and validate the request body using Zod
    const { messages } = ChatRequestSchema.parse(await req.json());

    const templates = {
      'user': await getTemplate('user-prompt-template'),
      'assistant': await getTemplate('assistant-prompt-template'),
      'system': await getTemplate('system-prompt-template')
    };

    // Parse all messages uniformly, with Zod validation on variables
    const parsedMessages: ParsedMessage[] = messages.map(message => {
      const template = templates[message.role];
      // Validate message variables against schema before using them
      const validatedVariables = MessageVariablesSchema.parse(message.variables || {});
      const content = parseMessageWithTemplate(template, validatedVariables);
      return { role: message.role, content };
    });

    // Kick off model stream with tools
    const result = await streamText({
      model: azure('o4-mini'),
      messages: parsedMessages,
      tools: fileTools,
      maxSteps: 5, // Allow up to 5 steps for multi-step operations
    });

    const encoder = new TextEncoder();
    let full = '';
    const toolCalls: any[] = [];
    const toolResults: any[] = [];
    const fileOperations: any[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Consume full stream including tool calls
          for await (const chunk of result.fullStream) {
            switch (chunk.type) {
              case 'text-delta':
                full += chunk.textDelta;
                controller.enqueue(
                  encoder.encode(JSON.stringify({ t: 'token', d: chunk.textDelta }) + '\n')
                );
                break;

              case 'tool-call':
                toolCalls.push(chunk);
                // Send tool call info to UI for display
                controller.enqueue(
                  encoder.encode(JSON.stringify({ 
                    t: 'tool_call', 
                    toolName: chunk.toolName,
                    args: chunk.args 
                  }) + '\n')
                );
                break;

              case 'tool-result':
                toolResults.push(chunk);
                
                // Extract file operation from tool result
                if (chunk.result?.operation) {
                  fileOperations.push(chunk.result.operation);
                }
                
                // Send tool result to UI, including any file content for code blocks
                const resultData: any = { 
                  t: 'tool_result', 
                  toolName: chunk.toolName,
                  result: chunk.result 
                };

                // For file operations, add code block data
                if (chunk.toolName === 'createFile' || chunk.toolName === 'updateFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: chunk.toolName === 'createFile' ? `create:${toolCall.args.path}` : `update:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: toolCall.args.content
                    };
                  }
                } else if (chunk.toolName === 'patchFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: `patch:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: toolCall.args.patch
                    };
                  }
                } else if (chunk.toolName === 'deleteFile') {
                  const toolCall = toolCalls.find(tc => tc.toolCallId === chunk.toolCallId);
                  if (toolCall) {
                    resultData.codeBlock = {
                      language: `delete:${toolCall.args.path}`,
                      filename: toolCall.args.path,
                      content: `File deleted: ${toolCall.args.path}`
                    };
                  }
                }

                controller.enqueue(
                  encoder.encode(JSON.stringify(resultData) + '\n')
                );
                break;

              case 'step-finish':
                // Step finished, continue to next step
                break;

              case 'finish':
                // All steps completed
                break;
            }
          }

          // Send final completion with file operations for the old system compatibility
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ 
                t: 'final', 
                reply: full, 
                operations: fileOperations,
                toolCalls: toolCalls.length,
                toolResults: toolResults.length 
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
