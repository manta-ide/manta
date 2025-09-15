import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { xmlToGraph, graphToXml } from '../lib/schemas';
import { getDevProjectDir } from '@/lib/project-config';

// Shared project directory resolution
function resolveProjectDir(): string {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (existsSync(devProjectDir)) {
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

type Listener = (updates: Record<string, any>) => void;

const listeners = new Set<Listener>();

// Deep merge objects for nested structures
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Deep merge nested objects
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      // Replace arrays and primitive values entirely
      result[key] = value;
    }
  }

  return result;
}

export function subscribeVars(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishVarsUpdate(updates: Record<string, any>) {
  // Merge updates into current vars (updates should be in nested format)
  const currentVars = loadVarsSnapshot();
  const updatedVars = deepMerge(currentVars, updates);

  // Update vars.json as a convenience file for child projects (save nested format)
  saveVarsConvenienceFile(updatedVars);

  // Notify listeners
  for (const l of Array.from(listeners)) {
    try { l(updates); } catch {}
  }
}

function buildNestedVars(properties: any[], prefix: string = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const prop of properties || []) {
    const key = prop.id;
    const value = prop.value;

    if (prop.type === 'object' && prop.fields) {
      // Build nested object properties
      result[key] = buildNestedVars(prop.fields);
    } else if (prop.type === 'object-list' && Array.isArray(value)) {
      // Handle object lists
      if (prop.itemFields) {
        // If we have itemFields schema, build nested objects for each item
        result[key] = value.map((item: any) =>
          prop.itemFields.reduce((acc: any, field: any) => {
            acc[field.id] = item?.[field.id];
            return acc;
          }, {})
        );
      } else {
        // Fallback: use the array directly
        result[key] = value;
      }
    } else {
      // Simple property
      result[key] = value;
    }
  }

  return result;
}

function loadVarsFromXml(xmlPath: string): Record<string, any> {
  try {
    if (!existsSync(xmlPath)) return {};

    const xmlContent = readFileSync(xmlPath, 'utf8');
    const graph = xmlToGraph(xmlContent);

    const allVars: Record<string, any> = {};

    // Extract properties from all nodes and flatten to root level
    for (const node of graph.nodes || []) {
      if (node.properties && Array.isArray(node.properties)) {
        const nodeVars = buildNestedVars(node.properties);
        // Flatten all node variables to root level
        Object.assign(allVars, nodeVars);
      }
    }

    return allVars;
  } catch (error) {
    console.warn(`Failed to load vars from ${xmlPath}:`, error);
    return {};
  }
}

export function loadVarsSnapshot(projectDir?: string): Record<string, any> {
  try {
    const base = projectDir || resolveProjectDir();
    const graphDir = path.join(base, '_graph');

    // Priority order for loading variables:
    // 1. current-graph.xml (latest working state)

    const currentGraphPath = path.join(graphDir, 'current-graph.xml');
    const backupGraphPath = path.join(graphDir, 'graph_backup.xml');

    let vars = loadVarsFromXml(currentGraphPath);
    if (Object.keys(vars).length > 0) {
      console.log('Loaded vars from current-graph.xml');
      return vars;
    }

    // Final fallback to backup
    vars = loadVarsFromXml(backupGraphPath);
    if (Object.keys(vars).length > 0) {
      console.log('Loaded vars from graph_backup.xml');
      return vars;
    }

    console.log('No vars found in any graph file');
    return {};
  } catch (error) {
    console.warn('Failed to load vars snapshot:', error);
    return {};
  }
}

function saveVarsConvenienceFile(vars: Record<string, any>, projectDir?: string): void {
  try {
    const base = projectDir || resolveProjectDir();
    const varsPath = path.join(base, '_graph', 'vars.json');

    // Save to vars.json as a convenience file for child projects to capture variables easier
    writeFileSync(varsPath, JSON.stringify(vars, null, 2), 'utf8');
    console.log('Updated vars.json convenience file:', varsPath);

  } catch (error) {
    console.warn('Failed to save variables convenience file:', error);
  }
}

