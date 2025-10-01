import { NextRequest } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';
import { createGraphTools } from '../../lib/claude-code-tools';
import { orchestratorSystemPrompt } from '@/app/api/lib/agentPrompts';

// Type definitions for Qwen API requests
interface QwenRequestOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  verbose?: boolean;
}

interface QwenRequest {
  prompt: string;
  options?: QwenRequestOptions;
}

// Qwen API configuration
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const DEFAULT_QWEN_MODEL = 'qwen-coder-plus';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Environment variable helpers
function envVerbose(): boolean {
  const v = String(process.env.VERBOSE_QWEN_LOGS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

// Logging helpers
function pretty(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

// Qwen API client
async function callQwenAPI(prompt: string, options: QwenRequestOptions = {}): Promise<string> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY environment variable is required for Qwen integration');
  }

  const requestBody = {
    model: options.model || DEFAULT_QWEN_MODEL,
    input: {
      messages: [
        {
          role: 'system',
          content: orchestratorSystemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    },
    parameters: {
      temperature: options.temperature || 0.1,
      max_tokens: options.max_tokens || 2048,
      top_p: options.top_p || 0.9,
      stream: false, // We'll handle streaming at the response level
    }
  };

  const response = await fetch(QWEN_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'disable', // Disable server-sent events for now
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.output || !data.output.choices || data.output.choices.length === 0) {
    throw new Error('No response generated from Qwen API');
  }

  return data.output.choices[0].message?.content || '';
}

// Alternative Qwen API client for OpenAI-compatible endpoint
async function callQwenOpenAIAPI(prompt: string, options: QwenRequestOptions = {}): Promise<string> {
  const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('QWEN_API_KEY or DASHSCOPE_API_KEY environment variable is required for Qwen integration');
  }

  // Try OpenAI-compatible endpoint first (if available)
  const openAIEndpoint = process.env.QWEN_API_URL || 'https://api.qwen.ai/v1/chat/completions';

  const requestBody = {
    model: options.model || 'qwen-coder-plus',
    messages: [
      {
        role: 'system',
        content: orchestratorSystemPrompt
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: options.temperature || 0.1,
    max_tokens: options.max_tokens || 2048,
    top_p: options.top_p || 0.9,
    stream: false,
  };

  const response = await fetch(openAIEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response generated from Qwen OpenAI API');
  }

  return data.choices[0].message?.content || '';
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, options = {} }: QwenRequest = await req.json();

    const verbose = options?.verbose ?? envVerbose();
    const logHeader = (title: string) => { if (!verbose) return; console.log(`\n====== ${title} ======`); };
    const logLine = (prefix: string, message?: any) => { if (!verbose) return; console.log(prefix, message ?? ''); };

    logHeader('Qwen Execute');
    logLine('🎯 Qwen: User request:', prompt);
    logLine('🎯 Qwen: Options:', pretty(options));

    // Get working directory context
    const workingDirectory = projectDir();
    const mode = process.env.MANTA_MODE === 'user-project' ? 'user project' : 'development';
    logLine(`📁 Qwen: Working directory (${mode} mode): ${workingDirectory}`);

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

          // Try Qwen API (try OpenAI-compatible first, fallback to DashScope)
          let response: string;
          try {
            logLine('🚀 Calling Qwen OpenAI-compatible API...');
            response = await callQwenOpenAIAPI(enhancedPrompt, options);
            logLine('✅ Qwen OpenAI API response received');
          } catch (error) {
            logLine('⚠️ Qwen OpenAI API failed, trying DashScope API...');
            response = await callQwenAPI(enhancedPrompt, options);
            logLine('✅ Qwen DashScope API response received');
          }

          // Send the response
          const resultData = {
            type: 'result',
            content: response.trim()
          };

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
          controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));

          streamClosed = true;
          controller.close();

        } catch (error) {
          console.error('Qwen API error:', error);

          if (!streamClosed) {
            const errorData = {
              type: 'error',
              content: `Qwen error: ${error instanceof Error ? error.message : String(error)}`
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
    console.error('Qwen Execute API error:', error);
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