import { NextRequest } from 'next/server';
import { AIRequestSchema, type AIRequest, type AIProvider } from '@/app/api/lib/schemas';

// Force Node.js runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// AI Provider routing configuration
const PROVIDER_ENDPOINTS = {
  claude: '/api/claude-code/execute',
  codex: '/api/codex/execute',
  qwen: '/api/qwen/execute',
  gemini: '/api/gemini/execute',
} as const;

// Default providers for different use cases
const DEFAULT_PROVIDERS = {
  code: 'claude',
  general: 'claude',
  translation: 'qwen',
  creative: 'gemini',
} as const;

// Environment variable helpers
function envVerbose(): boolean {
  const v = String(process.env.VERBOSE_AI_LOGS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

// Logging helpers
function pretty(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

// Provider availability check
function isProviderAvailable(provider: AIProvider): boolean {
  switch (provider) {
    case 'claude':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'codex':
      return !!process.env.OPENAI_API_KEY;
    case 'qwen':
      return !!(process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY);
    case 'gemini':
      return !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
    default:
      return false;
  }
}

// Get available providers
function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];

  if (isProviderAvailable('claude')) providers.push('claude');
  if (isProviderAvailable('codex')) providers.push('codex');
  if (isProviderAvailable('qwen')) providers.push('qwen');
  if (isProviderAvailable('gemini')) providers.push('gemini');

  return providers;
}

// Smart provider selection based on prompt content
function selectProvider(prompt: string, requestedProvider?: AIProvider): AIProvider {
  // If a specific provider is requested and available, use it
  if (requestedProvider && isProviderAvailable(requestedProvider)) {
    return requestedProvider;
  }

  // Get available providers
  const available = getAvailableProviders();
  if (available.length === 0) {
    throw new Error('No AI providers are configured. Please set up API keys for at least one provider.');
  }

  // If only one provider is available, use it
  if (available.length === 1) {
    return available[0];
  }

  // Smart selection based on prompt content
  const promptLower = prompt.toLowerCase();

  // Code-related keywords favor Claude or Codex
  if (promptLower.includes('code') || promptLower.includes('function') ||
      promptLower.includes('implement') || promptLower.includes('debug') ||
      promptLower.includes('refactor') || promptLower.includes('typescript') ||
      promptLower.includes('javascript') || promptLower.includes('python')) {
    if (available.includes('claude')) return 'claude';
    if (available.includes('codex')) return 'codex';
  }

  // Chinese content or translation favors Qwen
  if (promptLower.includes('chinese') || promptLower.includes('中文') ||
      promptLower.includes('translate') || promptLower.includes('翻译')) {
    if (available.includes('qwen')) return 'qwen';
  }

  // Creative tasks favor Gemini
  if (promptLower.includes('creative') || promptLower.includes('story') ||
      promptLower.includes('poem') || promptLower.includes('design') ||
      promptLower.includes('brainstorm')) {
    if (available.includes('gemini')) return 'gemini';
  }

  // Default fallback order: Claude > Gemini > Qwen > Codex
  if (available.includes('claude')) return 'claude';
  if (available.includes('gemini')) return 'gemini';
  if (available.includes('qwen')) return 'qwen';
  if (available.includes('codex')) return 'codex';

  return available[0]; // Fallback to first available
}

// Forward request to specific provider
async function forwardToProvider(provider: AIProvider, request: any, originalRequest: NextRequest): Promise<Response> {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  const baseUrl = new URL(originalRequest.url).origin;
  const forwardUrl = `${baseUrl}${endpoint}`;

  const response = await fetch(forwardUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Forward any relevant headers
      ...(originalRequest.headers.get('Authorization') && {
        'Authorization': originalRequest.headers.get('Authorization')!
      }),
    },
    body: JSON.stringify(request),
  });

  // Return the response as-is to maintain streaming
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, provider: requestedProvider, options = {} } = AIRequestSchema.parse(body);

    const verbose = options?.verbose ?? envVerbose();
    const logHeader = (title: string) => { if (!verbose) return; console.log(`\n====== ${title} ======`); };
    const logLine = (prefix: string, message?: any) => { if (!verbose) return; console.log(prefix, message ?? ''); };

    logHeader('AI Router');
    logLine('🎯 AI Router: User request:', prompt);
    logLine('🎯 AI Router: Requested provider:', requestedProvider || 'auto');
    logLine('🎯 AI Router: Options:', pretty(options));

    // Check available providers
    const availableProviders = getAvailableProviders();
    logLine('📋 Available providers:', availableProviders.join(', '));

    if (availableProviders.length === 0) {
      throw new Error('No AI providers are configured. Please set up API keys for at least one provider (ANTHROPIC_API_KEY, OPENAI_API_KEY, DASHSCOPE_API_KEY, or GOOGLE_API_KEY).');
    }

    // Select the best provider
    const selectedProvider = selectProvider(prompt, requestedProvider);
    logLine('🎯 Selected provider:', selectedProvider);

    // Prepare provider-specific request
    const providerRequest = {
      prompt,
      options: {
        ...options,
        verbose, // Forward verbosity setting
      }
    };

    // Forward to the selected provider
    logLine(`🚀 Forwarding to ${selectedProvider} provider...`);
    const response = await forwardToProvider(selectedProvider, providerRequest, req);

    // Add provider information to response headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-AI-Provider', selectedProvider);
    newHeaders.set('X-Available-Providers', availableProviders.join(','));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });

  } catch (error: any) {
    console.error('AI Router error:', error);

    // Return structured error response
    const errorResponse = {
      error: error?.message || String(error),
      available_providers: getAvailableProviders(),
      suggestion: 'Please check your API key configuration and try again.'
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// GET endpoint to check provider status
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') as AIProvider | null;

    if (provider) {
      // Check specific provider
      const available = isProviderAvailable(provider);
      return Response.json({
        provider,
        available,
        endpoint: PROVIDER_ENDPOINTS[provider] || null,
      });
    } else {
      // List all providers
      const providers = Object.keys(PROVIDER_ENDPOINTS).map(p => ({
        name: p,
        available: isProviderAvailable(p as AIProvider),
        endpoint: PROVIDER_ENDPOINTS[p as AIProvider],
      }));

      return Response.json({
        providers,
        available_count: providers.filter(p => p.available).length,
        default_provider: selectProvider('general task'),
      });
    }
  } catch (error: any) {
    return Response.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
}