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
registerTemplate('user-prompt-template', load('user-prompt-template.txt'));
registerTemplate('assistant-prompt-template', load('assistant-prompt-template.txt'));
registerTemplate('graph-editor-template', load('graph-editor-template.txt'));
registerTemplate('build-nodes-template', load('build-nodes-template.txt'));
