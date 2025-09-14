#!/usr/bin/env node
// MCP bootstrap logging
// eslint-disable-next-line no-console
console.error(`[manta-mcp] starting at ${new Date().toISOString()}`);
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGraphTools, type Toolset } from './tools/graph-tools.js';

// Utility to resolve base URL for API calls
function resolveBaseUrl(): string {
  const url = process.env.MANTA_API_URL || process.env.BACKEND_URL || 'http://localhost:3000';
  // Normalize and validate
  const trimmed = url.replace(/\/$/, '');
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
  } catch {
    // Fallback to localhost if invalid
    return 'http://localhost:3000';
  }
  return trimmed;
}

// Resolve access token from env
function resolveAccessToken(): string | undefined {
  return (
    process.env.MANTA_API_KEY ||
    process.env.MCP_ACCESS_TOKEN ||
    process.env.MCP_BEARER_TOKEN ||
    undefined
  );
}

function buildAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// Simple HTTP helpers that send Bearer on every request
async function httpGet(url: string, token?: string) {
  const res = await fetch(url, { method: 'GET', headers: buildAuthHeaders(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json() as any;
}

async function httpPost(url: string, body: any, token?: string) {
  const res = await fetch(url, { method: 'POST', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`POST ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json() as any;
}

async function httpPut(url: string, body: any, token?: string) {
  const res = await fetch(url, { method: 'PUT', headers: buildAuthHeaders(token), body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`PUT ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json() as any;
}

// Create an MCP server focused on graph reads
const server = new McpServer({ name: "manta-mcp", version: "0.1.0" });
// eslint-disable-next-line no-console
console.error('[manta-mcp] server created');

// Toolset selection is decided at startup based on env (provided by the CLI per job)
function resolveToolset(): Toolset {
  const raw = (process.env.MANTA_MCP_TOOLSET || '').toLowerCase();
  if (raw === 'graph-builder') return 'graph-builder';
  if (raw === 'graph-editor') return 'graph-editor';
  return 'read-only';
}

// Register graph tools (includes resource and state updates)
try {
  const toolset = resolveToolset();
  console.error(`[manta-mcp] Resolving toolset: ${toolset}`);
  console.error(`[manta-mcp] Environment variables: MANTA_MCP_TOOLSET=${process.env.MANTA_MCP_TOOLSET}`);
  registerGraphTools(server, toolset);
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] graph tools registered');
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] ERROR registering tools:', (e as any)?.message || e);
  console.error('[manta-mcp] Error stack:', (e as any)?.stack);
}


// Connect via stdio
(async () => {
  const transport = new StdioServerTransport();
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] connecting via stdio');
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] connected');
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
