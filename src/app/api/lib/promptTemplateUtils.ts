/**
 * Prompt Template Processing Utilities
 * 
 * Backend utilities for loading and parsing prompt templates with variable substitution.
 * Handles conditional sections and variable replacement for system/user/assistant prompts.
 * 
 * This is a backend-only utility that operates on file system and string processing.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Loads a prompt template file from the prompts directory
 */
export async function getTemplate(templateName: string): Promise<string> {
  const filePath = path.join(process.cwd(), 'src', 'app', 'api', 'lib', 'prompts', `${templateName}.txt`);
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Parses a template string by replacing variables and handling conditional sections
 *
 * Supported syntax
 *  - {{variable}}                         – simple replacement
 *  - {{#variable}} ... {{/variable}}      – section shown only when `variables[variable]` is truthy
 *  - Special handling for PROJECT_FILES   – pretty prints array of {route, lines}
 */
export function parseTemplate(
  template: string,
  variables: Record<string, any>
): string {
  // 1) Resolve conditional sections first
  let result = template.replace(
    /{{#(\w+)}}([\s\S]*?){{\/\1}}/g,
    (_, key: string, content: string) => {
      const value = variables[key];
      return value ? content : ''; // hides block if key is missing or value is falsy
    }
  );

  // 2) Replace simple placeholders
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = new RegExp(`{{${key}}}`, 'g');

    if (key === 'PROJECT_FILES' && Array.isArray(value)) {
      const fileList = value
        .map((file) => `${file.route} (${file.lines} lines)`)
        .join('\n');
      result = result.replace(placeholder, fileList);
    } else {
      result = result.replace(placeholder, value ? String(value) : '');
    }
  });

  return result;
}


/**
 * Convenience function for parsing message templates with variables
 */
export function parseMessageWithTemplate(template: string, variables: Record<string, any>): string {
  return parseTemplate(template, variables);
} 