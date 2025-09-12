import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { xmlToGraph, graphToXml } from '../../../../packages/shared-schemas/dist/xml-utils.js';

type Listener = (updates: Record<string, any>) => void;

const listeners = new Set<Listener>();

export function subscribeVars(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishVarsUpdate(updates: Record<string, any>) {
  // Merge updates into current vars
  const currentVars = loadVarsSnapshot();
  const updatedVars = { ...currentVars, ...updates };

  // Save to XML if we can
  saveVarsToXml(updatedVars);

  // Notify listeners
  for (const l of Array.from(listeners)) {
    try { l(updates); } catch {}
  }
}

function flattenProperties(properties: any[], prefix: string = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const prop of properties || []) {
    const key = prefix ? `${prefix}.${prop.id}` : prop.id;
    const value = prop.value;

    if (prop.type === 'object' && prop.fields) {
      // Flatten nested object properties
      Object.assign(result, flattenProperties(prop.fields, key));
    } else if (prop.type === 'object-list' && Array.isArray(value)) {
      // Handle object lists by flattening each item
      for (let i = 0; i < value.length; i++) {
        const itemPrefix = `${key}[${i}]`;
        if (prop.itemFields) {
          // If we have itemFields schema, use it to flatten
          const itemProps = prop.itemFields.map((field: any) => ({
            ...field,
            value: value[i]?.[field.id]
          }));
          Object.assign(result, flattenProperties(itemProps, itemPrefix));
        } else {
          // Fallback: flatten object keys directly
          const itemObj = value[i];
          if (itemObj && typeof itemObj === 'object') {
            for (const [itemKey, itemValue] of Object.entries(itemObj)) {
              result[`${itemPrefix}.${itemKey}`] = itemValue;
            }
          }
        }
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

    // Extract properties from all nodes
    for (const node of graph.nodes || []) {
      if (node.properties && Array.isArray(node.properties)) {
        const nodeVars = flattenProperties(node.properties, node.id);
        Object.assign(allVars, nodeVars);
      }
    }

    return allVars;
  } catch (error) {
    console.warn('Failed to load vars from XML:', error);
    return {};
  }
}

export function loadVarsSnapshot(projectDir?: string): Record<string, any> {
  try {
    const base = projectDir || process.env.MANTA_PROJECT_DIR || process.cwd();

    // First try to load from vars.json (this is where updates are saved)
    const varsPath = path.join(base, '_graph', 'vars.json');
    if (existsSync(varsPath)) {
      const vars = JSON.parse(readFileSync(varsPath, 'utf8')) || {};
      if (Object.keys(vars).length > 0) {
        return vars;
      }
    }

    // If vars.json doesn't exist or is empty, try to load from XML files
    const graphXmlPath = path.join(base, '_graph', 'graph.xml');
    const vars = loadVarsFromXml(graphXmlPath);

    // Also check for backup XML file
    if (Object.keys(vars).length === 0) {
      const backupXmlPath = path.join(base, '_graph', 'graph_backup.xml');
      return loadVarsFromXml(backupXmlPath);
    }

    return vars;
  } catch (error) {
    console.warn('Failed to load vars snapshot:', error);
    return {};
  }
}

function saveVarsToXml(vars: Record<string, any>, projectDir?: string): void {
  try {
    const base = projectDir || process.env.MANTA_PROJECT_DIR || process.cwd();
    const varsPath = path.join(base, '_graph', 'vars.json');

    // Save to vars.json for now (simpler persistence)
    writeFileSync(varsPath, JSON.stringify(vars, null, 2), 'utf8');
    console.log('Saved variables to:', varsPath);

    // TODO: Implement XML persistence if needed
    // For now, vars.json will be used as the source of truth
    // and can be imported into XML when needed

  } catch (error) {
    console.warn('Failed to save variables:', error);
  }
}

