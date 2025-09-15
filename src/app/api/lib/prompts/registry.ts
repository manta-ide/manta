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

registerTemplate('user-prompt-template', `{{#SELECTION}}
User selected an area: {{SELECTION_WIDTH}}×{{SELECTION_HEIGHT}} at position ({{SELECTION_X}}, {{SELECTION_Y}}).
Selected elements are: {{SELECTION_ELEMENTS}}
Use coverage as weight, so try to understand which element was truly selected and edit only it.

{{/SELECTION}}

{{#CURRENT_FILE}}
- Currently selected file: {{CURRENT_FILE}}
{{/CURRENT_FILE}}
{{USER_REQUEST}}`);

registerTemplate('assistant-prompt-template', `{{#ASSISTANT_RESPONSE}}
{{ASSISTANT_RESPONSE}}
{{/ASSISTANT_RESPONSE}}
`);

// Graph editor template is now handled via system prompt in Claude Code, not template
console.log('📝 Graph editor uses system prompt in Claude Code, not template file');

registerTemplate('build-graph-template', load('build-graph-template.txt'));
registerTemplate('build-nodes-template', load('build-nodes-template.txt'));

console.log('📝 Template registration complete');
