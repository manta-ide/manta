/**
 * Prompt Template Registry
 *
 * Registers prompt templates into an in-memory store at module load time.
 * This avoids filesystem access on every request while keeping templates
 * editable as .txt files in the repo.
 */

import { registerTemplate, getTemplate } from '@/app/api/lib/promptTemplateUtils';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function load(file: string): string {
  try {
    console.log(`📁 Loading template file: ${file}`);
    // Using new URL triggers bundlers (Webpack/Turbopack) to include the asset
    const url = new URL(`./${file}`, import.meta.url);
    const p = fileURLToPath(url);
    console.log(`📁 Template file path: ${p}`);
    const content = fs.readFileSync(p, 'utf8');
    console.log(`📁 Template file loaded, length: ${content.length}`);
    console.log(`📁 Template content preview: ${content.substring(0, 100)}...`);
    return content;
  } catch (err) {
    console.error(`❌ Failed to load prompt template '${file}':`, err);
    // Surface a clear error at startup if a template is missing
    throw new Error(`Failed to load prompt template \'${file}\': ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Register all known templates. The names must match those used by getTemplate callers.
console.log('📝 Registering templates...');

registerTemplate('graph-editor-template', load('graph-editor-template.txt'));
registerTemplate('build-graph-template', load('build-graph-template.txt'));
registerTemplate('build-nodes-template', load('build-nodes-template.txt'));

console.log('📝 Template registration complete');
