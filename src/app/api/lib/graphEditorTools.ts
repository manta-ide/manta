import {
  GraphSchema,
  Graph,
} from './schemas';

/* =========================
   API Fetch/Save (typed)
   ========================= */
let defaultAuthHeaders: Record<string, string> | undefined;
let overrideBaseUrl: string | undefined;
let overrideSaveGraphFn: ((graph: Graph) => Promise<boolean>) | undefined;

export function setGraphEditorAuthHeaders(headers?: Record<string, string>) {
  defaultAuthHeaders = headers;
}

function getBaseUrl(): string {
  const envUrl = overrideBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  return envUrl || vercelUrl || 'http://localhost:3000';
}

export function setGraphEditorBaseUrl(url?: string) {
  overrideBaseUrl = url;
}

export function setGraphEditorSaveFn(fn?: (graph: Graph) => Promise<boolean>) {
  overrideSaveGraphFn = fn;
}

// Graph state management
let pendingGraph: Graph | null = null;
let originalGraph: Graph | null = null;

export async function setCurrentGraph(graph?: Graph): Promise<void> {
  // Stub implementation - this was used for the old tool system
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

export function resetPendingChanges() {
  pendingGraph = null;
  originalGraph = null;
}