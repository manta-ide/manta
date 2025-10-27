import { NextRequest } from 'next/server';
import { z } from 'zod';
import { graphToXml } from '@/lib/graph-xml';
import { MessageSchema, Graph } from '@/app/api/lib/schemas';
import { auth } from '@clerk/nextjs/server';

/* =========================
   Graph Editor Config
   ========================= */
let defaultAuthHeaders: Record<string, string> | undefined;
let overrideBaseUrl: string | undefined;
let overrideSaveGraphFn: ((graph: Graph) => Promise<boolean>) | undefined;

function setGraphEditorAuthHeaders(headers?: Record<string, string>) {
  defaultAuthHeaders = headers;
}

function getBaseUrl(): string {
  const envUrl = overrideBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  return envUrl || vercelUrl || 'http://localhost:3000';
}

function setGraphEditorBaseUrl(url?: string) {
  overrideBaseUrl = url;
}

function setGraphEditorSaveFn(fn?: (graph: Graph) => Promise<boolean>) {
  overrideSaveGraphFn = fn;
}

// Graph state management
let pendingGraph: Graph | null = null;
let originalGraph: Graph | null = null;

async function setCurrentGraph(graph?: Graph): Promise<void> {
  if (graph) {
    pendingGraph = graph;
    originalGraph = JSON.parse(JSON.stringify(graph));
  } else {
    // Try to fetch from API
    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/graph-api`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...defaultAuthHeaders,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.graph) {
          pendingGraph = data.graph;
          originalGraph = JSON.parse(JSON.stringify(data.graph));
        }
      }
    } catch (error) {
      console.warn('Failed to fetch graph from API:', error);
    }
  }
}

function resetPendingChanges() {
  pendingGraph = null;
  originalGraph = null;
}

/* =========================
   Request Schema
   ========================= */
const RequestSchema = z.object({
  userMessage: MessageSchema,
  selectedNodeId: z.string().optional(),
  selectedNodeTitle: z.string().optional(),
  selectedNodePrompt: z.string().optional(),
  // Build-nodes compatibility fields
  nodeId: z.string().optional(),
  selectedNodeIds: z.array(z.string()).optional(),
  rebuildAll: z.boolean().optional().default(false),
  // Build-graph specific fields
  graphDiff: z.any().optional(),
  currentGraph: z.any().optional(),
});

// Removed buildParsedMessages - now using system prompt approach in Claude Code

// Removed createSystemMessage - now using system prompt in Claude Code


export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.log('Agent req schema error:', parsed.error.flatten());
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const {
      userMessage,
      selectedNodeId,
      selectedNodeTitle,
      selectedNodePrompt,
      nodeId,
      selectedNodeIds,
      rebuildAll,
      graphDiff,
      currentGraph
    } = parsed.data;
    // forward auth headers for downstream API calls
    setGraphEditorAuthHeaders({
      ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
      ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
    });
    // ensure absolute base url is used
    setGraphEditorBaseUrl(req.nextUrl.origin);
    // As a fallback for environments where headers may be dropped, use a direct save function
    setGraphEditorSaveFn(async (graph) => {
      const res = await fetch(`${req.nextUrl.origin}/api/graph-api?graphType=current`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/xml',
          'X-Agent-Initiated': 'true', // Mark this as req-initiated to trigger SSE broadcasts
          ...(req.headers.get('cookie') ? { cookie: req.headers.get('cookie') as string } : {}),
          ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization') as string } : {}),
        },
        body: graphToXml(graph)
      });
      if (!res.ok) return false;
      let ok = true;
      try { const data = await res.json(); ok = !!data.success; } catch { ok = true; }
      return ok;
    });

    // Build prompt with context - subreqs will be chosen automatically based on content
    let prompt = userMessage.content;

    // Add selected node info if available
    if (selectedNodeId) {
      prompt += `\n\nSelected Node: ${selectedNodeTitle} (ID: ${selectedNodeId})`;
      if (selectedNodePrompt) {
        prompt += `\nPrompt: ${selectedNodePrompt}`;
      }
    }

    // Call Claude Code API endpoint with the prompt - subreqs chosen automatically
    const response = await fetch(`${req.nextUrl.origin}/api/claude-code/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        userId,
        options: {
          verbose: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Claude Code API failed: ${response.status} ${response.statusText}`);
    }

    // Pass through the streaming response from execute
    // Create a new Response to avoid NextResponse.rewrite() issues
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error(err);
    // Reset pending changes on error
    resetPendingChanges();
    return new Response(JSON.stringify({
      error: err?.message || 'Server error',
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
