#!/usr/bin/env node
// MCP bootstrap logging
// eslint-disable-next-line no-console
console.error(`[manta-mcp] starting at ${new Date().toISOString()}`);
import fs from 'node:fs';
import path from 'node:path';
try {
  const logPath = path.join(process.cwd(), '_graph', 'mcp.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `[start] ${new Date().toISOString()}\n`);
} catch {}
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerGraphTools } from './tools/graph-tools.js';

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
try {
  const logPath = path.join(process.cwd(), '_graph', 'mcp.log');
  fs.appendFileSync(logPath, `[server_created] ${new Date().toISOString()}\n`);
} catch {}

// Dynamic permissions:
// The CLI writes a perms file per job at CWD/_graph/mcp-perms.json, e.g., { "toolset": "graph-editor" | "read-only" }
// We consult it at call time so different jobs can change capabilities without process restarts.
// (fs/path already imported above)

type Toolset = 'graph-editor' | 'read-only' | 'write' | 'rw' | 'read-write';
function readPerms(): Toolset | null {
  try {
    const p = path.join(process.cwd(), '_graph', 'mcp-perms.json');
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as { toolset?: string };
    return (data.toolset as Toolset) || null;
  } catch {
    return null;
  }
}
function canWrite(): boolean {
  const t = (readPerms() || 'read-only').toLowerCase();
  return t === 'graph-editor' || t === 'write' || t === 'rw' || t === 'read-write';
}

// Register graph tools (includes resource and state updates)
try {
  registerGraphTools(server);
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] graph tools registered');
  try {
    const logPath = path.join(process.cwd(), '_graph', 'mcp.log');
    fs.appendFileSync(logPath, `[tools_registered] ${new Date().toISOString()}\n`);
  } catch {}
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] ERROR registering tools:', (e as any)?.message || e);
  try {
    const logPath = path.join(process.cwd(), '_graph', 'mcp.log');
    fs.appendFileSync(logPath, `[tools_error] ${(e as any)?.message || String(e)}\n`);
  } catch {}
}


// Connect via stdio
(async () => {
  const transport = new StdioServerTransport();
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] connecting via stdio');
  try {
    const logPath = path.join(process.cwd(), '_graph', 'mcp.log');
    fs.appendFileSync(logPath, `[connecting] ${new Date().toISOString()}\n`);
  } catch {}
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('[manta-mcp] connected');
  try {
    const logPath = path.join(process.cwd(), '_graph', 'mcp.log');
    fs.appendFileSync(logPath, `[connected] ${new Date().toISOString()}\n`);
  } catch {}
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
