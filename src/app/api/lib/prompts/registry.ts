/**
 * Prompt Template Registry
 *
 * Registers prompt templates into an in-memory store at module load time.
 * This avoids filesystem access on every request while keeping templates
 * editable as .txt files in the repo.
 */

import { registerTemplate } from '@/app/api/lib/promptTemplateUtils';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function load(file: string): string {
  try {
    // Using new URL triggers bundlers (Webpack/Turbopack) to include the asset
    const url = new URL(`./${file}`, import.meta.url);
    const p = fileURLToPath(url);
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    // Surface a clear error at startup if a template is missing
    throw new Error(`Failed to load prompt template \'${file}\': ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Register all known templates. The names must match those used by getTemplate callers.
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
// Use unified template for both graph editing and building
registerTemplate('graph-editor-template', load('graph-editor-template.txt'));
registerTemplate('build-graph-template', load('build-graph-template.txt'));
registerTemplate('build-nodes-template', load('build-nodes-template.txt'));
