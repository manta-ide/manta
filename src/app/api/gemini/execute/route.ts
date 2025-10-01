import { NextRequest } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';
import { createGraphTools } from '../../lib/claude-code-tools';
import { orchestratorSystemPrompt } from '@/app/api/lib/agentPrompts';

// Type definitions for Gemini API requests
interface GeminiRequestOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  candidate_count?: number;
  stream?: boolean;
  verbose?: boolean;
}

interface GeminiRequest {
  prompt: string;
  options?: GeminiRequestOptions;
}

// Gemini API configuration
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-pro';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Environment variable helpers
function envVerbose(): boolean {
  const v = String(process.env.VERBOSE_GEMINI_LOGS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

// Logging helpers
function pretty(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

// Gemini API client
async function callGeminiAPI(prompt: string, options: GeminiRequestOptions = {}): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required for Gemini integration');
  }

  const model = options.model || DEFAULT_GEMINI_MODEL;
  const endpoint = `${GEMINI_API_URL}/${model}:generateContent`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${orchestratorSystemPrompt}\n\nUser Request: ${prompt}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: options.temperature || 0.1,
      maxOutputTokens: options.max_tokens || 2048,
      topP: options.top_p || 0.95,
      topK: options.top_k || 64,
      candidateCount: options.candidate_count || 1,
    },
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ]
  };

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response generated from Gemini API');
  }

  const candidate = data.candidates[0];
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    throw new Error('Invalid response format from Gemini API');
  }

  return candidate.content.parts[0].text || '';
}

// Alternative Gemini streaming API client
async function callGeminiStreamingAPI(prompt: string, options: GeminiRequestOptions = {}): Promise<AsyncGenerator<string>> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required for Gemini integration');
  }

  const model = options.model || DEFAULT_GEMINI_MODEL;
  const endpoint = `${GEMINI_API_URL}/${model}:streamGenerateContent`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${orchestratorSystemPrompt}\n\nUser Request: ${prompt}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: options.temperature || 0.1,
      maxOutputTokens: options.max_tokens || 2048,
      topP: options.top_p || 0.95,
      topK: options.top_k || 64,
    }
  };

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Streaming API error (${response.status}): ${errorText}`);
  }

  return parseGeminiStream(response);
}

// Parse Gemini streaming response
async function* parseGeminiStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to read Gemini streaming response');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;

        try {
          const data = JSON.parse(line);
          if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const parts = data.candidates[0].content.parts;
            if (parts && parts[0] && parts[0].text) {
              yield parts[0].text;
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, options = {} }: GeminiRequest = await req.json();

    const verbose = options?.verbose ?? envVerbose();
    const logHeader = (title: string) => { if (!verbose) return; console.log(`\n====== ${title} ======`); };
    const logLine = (prefix: string, message?: any) => { if (!verbose) return; console.log(prefix, message ?? ''); };

    logHeader('Gemini Execute');
    logLine('🎯 Gemini: User request:', prompt);
    logLine('🎯 Gemini: Options:', pretty(options));

    // Get working directory context
    const workingDirectory = projectDir();
    const mode = process.env.MANTA_MODE === 'user-project' ? 'user project' : 'development';
    logLine(`📁 Gemini: Working directory (${mode} mode): ${workingDirectory}`);

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let streamClosed = false;

        try {
          // Send stream start
          controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));

          // Prepare enhanced prompt with project context
          const enhancedPrompt = await enhancePromptWithContext(prompt, workingDirectory);
          logLine('🔧 Enhanced prompt with project context');

          // Call Gemini API
          if (options.stream) {
            logLine('🚀 Calling Gemini Streaming API...');
            const streamGenerator = await callGeminiStreamingAPI(enhancedPrompt, options);

            let fullResponse = '';
            for await (const chunk of streamGenerator) {
              fullResponse += chunk;

              // Send incremental updates
              const updateData = {
                type: 'partial',
                content: chunk
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(updateData)}\n\n`));
            }

            // Send final result
            const resultData = {
              type: 'result',
              content: fullResponse.trim()
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
            logLine('✅ Gemini streaming response completed');
          } else {
            logLine('🚀 Calling Gemini API...');
            const response = await callGeminiAPI(enhancedPrompt, options);

            // Send the response
            const resultData = {
              type: 'result',
              content: response.trim()
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
            logLine('✅ Gemini response received');
          }

          controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
          streamClosed = true;
          controller.close();

        } catch (error) {
          console.error('Gemini API error:', error);

          if (!streamClosed) {
            const errorData = {
              type: 'error',
              content: `Gemini error: ${error instanceof Error ? error.message : String(error)}`
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
            controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
            controller.close();
          }
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('Gemini Execute API error:', error);
    return new Response(`Error: ${error?.message || String(error)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Helper to enhance prompt with project context
async function enhancePromptWithContext(prompt: string, workingDirectory: string): Promise<string> {
  let context = '';

  try {
    // Get basic project structure
    const files = await getProjectFiles(workingDirectory);
    if (files.length > 0) {
      context += `\n\nProject Structure:\n${files.slice(0, 20).join('\n')}`;
      if (files.length > 20) {
        context += `\n... and ${files.length - 20} more files`;
      }
    }

    // Check for common config files
    const configFiles = ['package.json', 'tsconfig.json', 'next.config.js', 'next.config.mjs'];
    for (const configFile of configFiles) {
      const configPath = path.join(workingDirectory, configFile);
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          context += `\n\n${configFile}:\n${content.slice(0, 1000)}`;
        } catch (e) {
          // Ignore read errors
        }
      }
    }
  } catch (e) {
    // Ignore context gathering errors
  }

  return `${prompt}${context}`;
}

// Helper to get project files list
async function getProjectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
          continue; // Skip common build/dependency directories
        }
        files.push(`${relativePath}/`);

        // Recursively add files from subdirectories (limited depth)
        if (files.length < 100) {
          const subFiles = await getProjectFiles(fullPath);
          files.push(...subFiles.map(f => path.join(relativePath, f)).slice(0, 50));
        }
      } else {
        files.push(relativePath);
      }

      if (files.length >= 100) break; // Limit total files
    }
  } catch (e) {
    // Ignore errors
  }

  return files;
}