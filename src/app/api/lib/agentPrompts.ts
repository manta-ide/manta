/**
 * Agent Prompts Utility
 *
 * Contains all agent prompts loaded from MD files for use across the application.
 * These prompts are used by various agents in the Claude Code execution pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reads a prompt template from the agent-prompts directory
 */
function readPromptFile(filename: string): string {
  try {
    const filePath = path.join(__dirname, 'agent-prompts', filename);
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read prompt file '${filename}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generates a code builder agent prompt based on project analysis
 */
export function generateCodeBuilderAgent(analysis: any): string {
  return readPromptFile('code-builder-agent.md');
}

/**
 * Generates a graph editor agent prompt based on project analysis
 */
export function generateGraphEditorAgent(analysis: any): string {
  return readPromptFile('graph-editor-agent.md');
}

/**
 * Orchestrator system prompt for coordinating Claude Code execution
 */
export const orchestratorSystemPrompt = readPromptFile('orchestrator-system-prompt.md');
