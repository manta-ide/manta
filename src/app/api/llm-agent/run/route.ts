import { NextRequest } from 'next/server';
import { setGraphEditorAuthHeaders, setGraphEditorBaseUrl } from '../../lib/graphEditorTools';
import { z } from 'zod';
import { generateObject, generateText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { google } from '@ai-sdk/google';
import { addMessageToSession } from '@/app/api/lib/conversationStorage';
import { graphEditorTools } from '../../lib/graphEditorTools';
import { codeEditorTools } from '../../lib/codeEditorTools';
import { 
  GraphSchema, 
  PropertyGenerationSchema, 
  GraphQuickPatchResponseSchema, 
  PartialCodeGenerationResponseSchema 
} from '../../lib/schemas';
import path from 'path';
import { createWriteStream } from 'fs';
import { promises as fsp } from 'fs';

// Direct mapping for toolsets
const TOOLSET_MAP = {
  'code-editor': codeEditorTools,
  'graph-editor': graphEditorTools,
} as const;

// Direct mapping for schemas
const SCHEMA_MAP = {
  'graph': GraphSchema,
  'property-generation': PropertyGenerationSchema,
  'graph-quick-patch': GraphQuickPatchResponseSchema,
  'partial-code-generation': PartialCodeGenerationResponseSchema,
} as const;

// Helper function to get tools by name
function getToolsByName(toolsetName: string) {
  const tools = TOOLSET_MAP[toolsetName as keyof typeof TOOLSET_MAP];
  if (!tools) {
    throw new Error(`Unknown toolset: ${toolsetName}. Available toolsets: ${Object.keys(TOOLSET_MAP).join(', ')}`);
  }
  return tools;
}

// Helper function to get schema by name
function getSchemaByName(schemaName: string) {
  return SCHEMA_MAP[schemaName as keyof typeof SCHEMA_MAP];
}



// Agent configuration schema
const AgentConfigSchema = z.object({
  model: z.string(),
  maxSteps: z.number().optional(),
  streaming: z.boolean().optional(),
  temperature: z.number().optional(),
  provider: z.enum(['azure', 'google']).optional(),
  providerOptions: z.record(z.any()).optional(),
  promptTemplates: z.record(z.string()).optional(),
  structuredOutput: z.boolean().optional(),
  schemaName: z.enum(['graph', 'property-generation', 'graph-quick-patch', 'partial-code-generation']).optional(),
  toolsetName: z.string(),
  // Google Gemini specific options
  useGoogleStructuredOutput: z.boolean().optional(),
  googleStructuredSchema: z.any().optional(),
});

// Request schema with required configuration
const AgentRequestSchema = z.object({
  parsedMessages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
  config: AgentConfigSchema,
  operationName: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Helper function to call Google Gemini API directly for structured output
async function callGoogleGeminiStructured(
  model: string,
  messages: any[],
  schema: any,
  temperature: number = 1,
  signal?: AbortSignal
) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY in environment');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Convert messages to Google Gemini format
  const geminiMessages = messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: geminiMessages,
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema: schema
      }
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Gemini API failed: ${response.status} ${response.statusText} - ${errText}`);
  }

  const result = await response.json();
  
  // Extract structured output from Gemini response
  const firstCandidate = Array.isArray(result?.candidates) ? result.candidates[0] : undefined;
  const parts = firstCandidate?.content?.parts;
  
  if (Array.isArray(parts) && parts.length > 0) {
    const text = parts[0]?.text;
    if (text) {
      return JSON.parse(text);
    }
  }
  
  throw new Error('Failed to extract structured output from Gemini response');
}

export async function POST(req: NextRequest) {
  try {
    // ensure internal fetches include auth and absolute base url
    setGraphEditorAuthHeaders({
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    });
    setGraphEditorBaseUrl(req.nextUrl.origin);
    // Start timing
    const startTime = Date.now();

    // Parse and validate the request body using Zod
    const { parsedMessages, config, operationName = 'agent', metadata } = AgentRequestSchema.parse(await req.json());
    // If no parsedMessages provided, create a simple message array
    const messages = parsedMessages;
    const tools = getToolsByName(config.toolsetName);
    // Provider/model selection helpers
    const detectProvider = (modelId: string): 'azure' | 'google' => {
      const id = modelId.toLowerCase();
      if (
        id.includes('gemini') ||
        id.includes('gemma') ||
        id.includes('imagen') ||
        id.includes('text-embedding') ||
        id.includes('gemini-embedding')
      ) {
        return 'google';
      }
      return 'azure';
    };

    const selectModel = (modelId: string, provider?: 'azure' | 'google') => {
      const p = provider ?? detectProvider(modelId);
      return p === 'google' ? google(modelId) : azure(modelId);
    };

    // Prepare logging (shared across all modes)
    const logsDir = path.join(process.cwd(), 'logs');
    await fsp.mkdir(logsDir, { recursive: true });
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    const day = now.getDate();
    const month = now.getMonth() + 1; // getMonth() returns 0-11
    const year = now.getFullYear();
    const dateString = `${hour}_${minute.toString().padStart(2, '0')}_${second.toString().padStart(2, '0')}___${day}_${month}_${year}`;
    
    const logFilePath = path.join(
      logsDir,
      `${operationName}-${dateString}.log`
    );
    const logStream = createWriteStream(logFilePath, { flags: 'a' });
    const writeLog = (s: string) => logStream.write(s.endsWith('\n') ? s : s + '\n');

    // Initialize step counter and timing
    let totalSteps = 0;
    let stepStartTime: number | null = null;
    
    // Log available tools
    writeLog(`[${operationName}] available-tools:`);
    if (tools && Array.isArray(tools)) {
      tools.forEach((tool: any, index: number) => {
        writeLog(`[${operationName}]   Tool ${index + 1}: ${tool.name || tool.id || 'Unknown'}`);
        if (tool.description) {
          writeLog(`[${operationName}]     Description: ${tool.description}`);
        }
      });
    } else {
      writeLog(`[${operationName}]   No tools available or tools not in expected format`);
    }

    // Header
    writeLog(`[${operationName}]`);
    if (metadata) writeLog(`[${operationName}] metadata=${JSON.stringify(metadata)}`);
    writeLog(`[${operationName}] messages:`);
    (messages || []).forEach((m, i) => {
      writeLog(`--- message[${i}] role=${m.role} ---`);
      writeLog(m.content);
      writeLog(`--- end message[${i}] ---`);
    });

    // If Google structured output is requested, use direct API call
    if (config.useGoogleStructuredOutput && config.googleStructuredSchema) {
      const result = await callGoogleGeminiStructured(
        config.model,
        messages || [],
        config.googleStructuredSchema,
        config.temperature,
        req.signal
      );

      // Increment step counter for structured output
      totalSteps = 1;

      // Log structured result
      writeLog(`[${operationName}] google-structured-result:`);
      writeLog(JSON.stringify(result, null, 2));
      
      // Note: Google Gemini structured output doesn't provide usage statistics in the same format
      writeLog(`[${operationName}] usage-statistics: Not available for Google structured output`);

      // Add assistant response to conversation
      const assistantMessage = {
        role: 'assistant' as const,
        content: JSON.stringify(result),
        variables: { ASSISTANT_RESPONSE: JSON.stringify(result) }
      };
      addMessageToSession(assistantMessage);

      // Write summary before ending
      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;
      const totalMinutes = Math.floor(totalTimeMs / 60000);
      const totalSeconds = Math.floor((totalTimeMs % 60000) / 1000);
      
      writeLog(`\n[${operationName}] === SUMMARY ===`);
      writeLog(`[${operationName}] Description: ${operationName} operation with Google structured output`);
      writeLog(`[${operationName}] Total Steps: ${totalSteps}`);
      writeLog(`[${operationName}] Total Time: ${totalMinutes}m ${totalSeconds}s`);
      writeLog(`[${operationName}] Model: ${config.model}`);
      writeLog(`[${operationName}] Tokens Per Second: ${result.usage?.totalTokens / totalTimeMs * 1000}`);
      writeLog(`[${operationName}] === END SUMMARY ===\n`);

      logStream.end();
      return new Response(JSON.stringify({
        result: {
          object: result,
          finishReason: 'stop',
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If structured output is requested, use generateObject instead
    if (config.structuredOutput) {
      // Select schema based on schemaName or default to graph
      const schemaName = config.schemaName || 'graph';
      const selectedSchema = getSchemaByName(schemaName);
      
      if (!selectedSchema) {
        throw new Error(`Unknown schema: ${schemaName}`);
      }

      const result = await generateObject({
        model: selectModel(config.model, config.provider) as any,
        messages: messages,
        schema: selectedSchema,
        abortSignal: req.signal,
        providerOptions: config.providerOptions,
        temperature: config.temperature
      } as any);

      // Increment step counter for structured output
      totalSteps = 1;

      // Log structured result
      writeLog(`[${operationName}] structured-result:`);
      writeLog(JSON.stringify({
        object: result.object,
        finishReason: result.finishReason,
        usage: result.usage,
        warnings: result.warnings,
      }, null, 2));
      
      // Log usage statistics if available
      if (result.usage) {
        writeLog(`[${operationName}] usage-statistics:`);
        writeLog(`[${operationName}]   Prompt Tokens: ${result.usage.promptTokens || 'N/A'}`);
        writeLog(`[${operationName}]   Completion Tokens: ${result.usage.completionTokens || 'N/A'}`);
        writeLog(`[${operationName}]   Total Tokens: ${result.usage.totalTokens || 'N/A'}`);
      }

      // Add assistant response to conversation
      const assistantMessage = {
        role: 'assistant' as const,
        content: JSON.stringify(result.object),
        variables: { ASSISTANT_RESPONSE: JSON.stringify(result.object) }
      };
      addMessageToSession(assistantMessage);

      // Write summary before ending
      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;
      const totalMinutes = Math.floor(totalTimeMs / 60000);
      const totalSeconds = Math.floor((totalTimeMs % 60000) / 1000);
      
      writeLog(`\n[${operationName}] === SUMMARY ===`);
      writeLog(`[${operationName}] Description: ${operationName} operation with structured output (${schemaName})`);
      writeLog(`[${operationName}] Total Steps: ${totalSteps}`);
      writeLog(`[${operationName}] Total Time: ${totalMinutes}m ${totalSeconds}s`);
      writeLog(`[${operationName}] Model: ${config.model}`);
      writeLog(`[${operationName}] Schema: ${schemaName}`);
      writeLog(`[${operationName}] Tokens Per Second: ${result.usage?.totalTokens / totalTimeMs * 1000}`);
      writeLog(`[${operationName}] === END SUMMARY ===\n`);

      logStream.end();
      return new Response(JSON.stringify({
        result: {
          object: result.object,
          finishReason: result.finishReason,
          usage: result.usage,
          warnings: result.warnings,
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Real-time step logging callback
    const onStepFinish = (event: any) => {
      const stepIndex = totalSteps + 1;
      const stepEndTime = Date.now();
      const stepDuration = stepStartTime ? stepEndTime - stepStartTime : 0;
      const stepMinutes = Math.floor(stepDuration / 60000);
      const stepSeconds = Math.floor((stepDuration % 60000) / 1000);
      const stepMs = stepDuration % 1000;

      writeLog(`[${operationName}] === STEP ${stepIndex} COMPLETED ===`);
      writeLog(`[${operationName}] Step Duration: ${stepMinutes}m ${stepSeconds}s ${stepMs}ms`);
      writeLog(`[${operationName}] Step Type: ${event.type}`);
      writeLog(`[${operationName}] Step ID: ${event.stepId || 'N/A'}`);
      writeLog(`[${operationName}] Message ID: ${event.messageId || 'N/A'}`);

      // Log tool calls in this step
      if (event.toolCalls && event.toolCalls.length > 0) {
        writeLog(`[${operationName}] Tool Calls in Step ${stepIndex}:`);
        event.toolCalls.forEach((toolCall: any, index: number) => {
          writeLog(`[${operationName}]   Tool Call ${index + 1}:`);
          writeLog(`[${operationName}]     Tool Name: ${toolCall.toolName || 'N/A'}`);
          writeLog(`[${operationName}]     Tool Call ID: ${toolCall.toolCallId || 'N/A'}`);
          if (toolCall.args) {
            writeLog(`[${operationName}]     Arguments: ${JSON.stringify(toolCall.args, null, 2)}`);
          }
        });
      }

      // Log tool results in this step
      if (event.toolResults && event.toolResults.length > 0) {
        writeLog(`[${operationName}] Tool Results in Step ${stepIndex}:`);
        event.toolResults.forEach((toolResult: any, index: number) => {
          writeLog(`[${operationName}]   Tool Result ${index + 1}:`);
          writeLog(`[${operationName}]     Tool Call ID: ${toolResult.toolCallId || 'N/A'}`);
          writeLog(`[${operationName}]     Result: ${JSON.stringify(toolResult.result, null, 2)}`);
        });
      }

      // Log text content if any
      if (event.text) {
        writeLog(`[${operationName}] Text Content in Step ${stepIndex}: ${event.text}`);
      }

      // Log finish reason if available
      if (event.finishReason) {
        writeLog(`[${operationName}] Step Finish Reason: ${event.finishReason}`);
      }

      // Log usage statistics for this step if available
      if (event.usage) {
        writeLog(`[${operationName}] Step Usage Statistics:`);
        writeLog(`[${operationName}]   Prompt Tokens: ${event.usage.promptTokens || 'N/A'}`);
        writeLog(`[${operationName}]   Completion Tokens: ${event.usage.completionTokens || 'N/A'}`);
        writeLog(`[${operationName}]   Total Tokens: ${event.usage.totalTokens || 'N/A'}`);
      }

      writeLog(`[${operationName}] === END STEP ${stepIndex} ===\n`);

      // Update step start time for the next step (if any)
      stepStartTime = Date.now();
      totalSteps = stepIndex;
    };

    // Set initial step start time
    stepStartTime = Date.now();

    // Non-streaming mode only
    const result = await generateText({
      model: selectModel(config.model, config.provider) as any,
      messages: messages,
      tools: tools,
      maxSteps: config.maxSteps,
      abortSignal: req.signal,
      temperature: config.temperature,
      onStepFinish: onStepFinish
    });
    const text = await result.text;

    // Log final summary
    if (result.steps && result.steps.length > 0) {
      // Collect all tool calls and their results from all steps for final summary
      const allToolCalls = result.steps.flatMap(step => step.toolCalls || []);
      const allToolResults = result.steps.flatMap(step => step.toolResults || []);

      // Create a map of tool call results by toolCallId
      const toolResultsMap = new Map();
      allToolResults.forEach((result: any) => {
        if (result.toolCallId) {
          toolResultsMap.set(result.toolCallId, result);
        }
      });

      // Log final tool calls summary
      writeLog(`[${operationName}] === FINAL TOOL CALLS SUMMARY ===`);
      writeLog(`[${operationName}] Total Steps: ${result.steps.length}`);
      writeLog(`[${operationName}] Total Tool Calls: ${allToolCalls.length}`);

      if (allToolCalls.length > 0) {
        allToolCalls.forEach((toolCall: any, index: number) => {
          writeLog(`[${operationName}] Tool Call ${index + 1}:`);
          writeLog(`[${operationName}]   Tool Name: ${toolCall.toolName || 'N/A'}`);
          writeLog(`[${operationName}]   Tool Call ID: ${toolCall.toolCallId || 'N/A'}`);
          if (toolCall.args) {
            writeLog(`[${operationName}]   Arguments: ${JSON.stringify(toolCall.args, null, 2)}`);
          }

          // Get the result for this tool call
          const toolResult = toolCall.toolCallId ? toolResultsMap.get(toolCall.toolCallId) : null;
          if (toolResult) {
            writeLog(`[${operationName}]   Result: ${JSON.stringify(toolResult.result, null, 2)}`);
          } else {
            writeLog(`[${operationName}]   Result: Not found`);
          }
        });
      }
      writeLog(`[${operationName}] === END FINAL SUMMARY ===`);
    } else {
      totalSteps = 1; // Default to 1 step if no step information available
    }

    // Log final result
    writeLog(`[${operationName}] non-streaming-complete`);
    writeLog(`[${operationName}] final-text: ${text}`);
    
    // Log usage statistics if available
    if (result.usage) {
      writeLog(`[${operationName}] usage-statistics:`);
      writeLog(`[${operationName}]   Prompt Tokens: ${result.usage.promptTokens || 'N/A'}`);
      writeLog(`[${operationName}]   Completion Tokens: ${result.usage.completionTokens || 'N/A'}`);
      writeLog(`[${operationName}]   Total Tokens: ${result.usage.totalTokens || 'N/A'}`);
    }
    
    // Log finish reason if available
    if (result.finishReason) {
      writeLog(`[${operationName}] finish-reason: ${result.finishReason}`);
    }

    // Add assistant response to conversation
    const assistantMessage = {
      role: 'assistant' as const,
      content: text,
      variables: { ASSISTANT_RESPONSE: text }
    };
    addMessageToSession(assistantMessage);

    // Write summary before ending
    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;
    const totalMinutes = Math.floor(totalTimeMs / 60000);
    const totalSeconds = Math.floor((totalTimeMs % 60000) / 1000);
    
    writeLog(`\n[${operationName}] === SUMMARY ===`);
    writeLog(`[${operationName}] Description: ${operationName} operation with text generation`);
    writeLog(`[${operationName}] Total Steps: ${totalSteps}`);
    writeLog(`[${operationName}] Total Time: ${totalMinutes}m ${totalSeconds}s`);
    writeLog(`[${operationName}] Model: ${config.model}`);
    writeLog(`[${operationName}] Max Steps: ${config.maxSteps || 'unlimited'}`);
    writeLog(`[${operationName}] Tools Used: ${config.toolsetName}`);
    writeLog(`[${operationName}] Tokens Per Second: ${result.usage?.totalTokens / totalTimeMs * 1000}`);
    writeLog(`[${operationName}] === END SUMMARY ===\n`);

    logStream.end();
    return new Response(JSON.stringify({
      result: {
        content: text,
        finishReason: 'stop',
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('LLM Agent error:', err);
    return new Response(
      JSON.stringify({ 
        error: err?.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err?.stack : undefined
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
