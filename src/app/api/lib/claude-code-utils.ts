import * as fs from 'fs';
import * as path from 'path';
import { GraphSchema } from './schemas';
import { getDevProjectDir } from '@/lib/project-config';
import { xmlToGraph } from '../../../lib/graph-xml';

// HTTP helpers
export async function httpGet(url: string) {
  try {
    const headers = { 'Accept': 'application/xml, application/json' };
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('xml')) {
      const xml = await res.text();
      const parsed = xmlToGraph(xml);
      return { graph: parsed, rawXml: xml };
    }
    return res.json();
  } catch (e) {
    throw e;
  }
}

export async function httpPut(url: string, body: any) {
  try {
    let headers: any = {};
    let payload: any;
    if (body && body.graph) {
      const { graphToXml } = await import('../../../lib/graph-xml');
      const xml = graphToXml(body.graph);
      headers = { 'Content-Type': 'application/xml; charset=utf-8', 'Accept-Charset': 'utf-8' };
      payload = xml;
    } else {
      headers = { 'Content-Type': 'application/json; charset=utf-8' };
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method: 'PUT', headers, body: payload });
    if (!res.ok) throw new Error(`PUT ${url} failed: ${res.status}`);
    return res.json();
  } catch (e) {
    throw e;
  }
}

// Property normalization functions
const normalizeProperty = (prop: any): any => {
  try {
    if (!prop || typeof prop !== 'object') return prop;
    const baseKeys = new Set([
      'id','title','type','value','options','fields','itemFields',
      'maxLength','min','max','step','itemTitle','addLabel'
    ]);

    // Collect extra keys that look like inline object fields
    const extraEntries = Object.entries(prop).filter(([k]) => !baseKeys.has(k));

    // For object-typed properties, move extra keys into value object
    if (String(prop.type) === 'object') {
      if (extraEntries.length > 0) {
        const valueObj: Record<string, any> = { ...(prop.value && typeof prop.value === 'object' ? prop.value : {}) };
        for (const [k, v] of extraEntries) valueObj[k] = v;
        const cleaned: any = { ...prop, value: valueObj };
        // Remove extras from top-level to avoid duplication
        for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
        return cleaned;
      }
      return prop;
    }

    // For object-list, prefer provided value; support alternate 'items' key
    if (String(prop.type) === 'object-list') {
      const next: any = { ...prop };
      if (!Array.isArray(next.value) && Array.isArray((next as any).items)) {
        next.value = (next as any).items;
        delete (next as any).items;
      }
      return next;
    }

    // For non-object types: if no value but extra keys exist, pack them as a value object
    if (prop.value === undefined && extraEntries.length > 0) {
      const valueObj = Object.fromEntries(extraEntries);
      const cleaned: any = { ...prop, value: valueObj };
      for (const [k] of extraEntries) delete cleaned[k as keyof typeof cleaned];
      return cleaned;
    }
  } catch (err) {
    console.error('normalizeProperty failed:', err);
  }
  return prop;
};

export const normalizeProperties = (properties?: any[]): any[] => {
  if (!Array.isArray(properties)) return [];
  return properties.map((p) => normalizeProperty(p));
};

// Filesystem helpers
export function projectDir(): string {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (fs.existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  try {
    return process.cwd();
  } catch {
    return process.cwd();
  }
}

export function graphPath(): string { return path.join(projectDir(), '_graph', 'graph.xml'); }
export function baseGraphPath(): string { return path.join(projectDir(), '_graph', 'base-graph.xml'); }

export function readLocalGraph(): any | null {
  try {
    const p = graphPath();
    if (!fs.existsSync(p)) return null;
    const rawXml = fs.readFileSync(p, 'utf8');
    const g = xmlToGraph(rawXml);
    const parsed = GraphSchema.safeParse(g);
    return parsed.success ? { graph: parsed.data, rawXml } : null;
  } catch { return null; }
}

export function readBaseGraph(): any | null {
  try {
    const p = baseGraphPath();
    if (!fs.existsSync(p)) return null;
    const rawXml = fs.readFileSync(p, 'utf8');
    const g = xmlToGraph(rawXml);
    const parsed = GraphSchema.safeParse(g);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

// Helper function to get base URL from request
export function getBaseUrl(req: any): string {
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

// Tool selection helpers
export const BUILD_GRAPH_TOOLS = [
  'mcp__graph-tools__graph_read',
  'mcp__graph-tools__graph_edge_create',
  'mcp__graph-tools__graph_node_add',
  'mcp__graph-tools__graph_node_edit',
  'mcp__graph-tools__graph_node_set_state',
  'mcp__graph-tools__graph_analyze_diff',
];

export const EDIT_GRAPH_TOOLS = [
  'mcp__graph-tools__graph_read',
  'mcp__graph-tools__graph_edge_create',
  'mcp__graph-tools__graph_node_add',
  'mcp__graph-tools__graph_node_edit',
  'mcp__graph-tools__graph_node_delete',
  'mcp__graph-tools__graph_node_set_state',
  'mcp__graph-tools__graph_analyze_diff',
];
