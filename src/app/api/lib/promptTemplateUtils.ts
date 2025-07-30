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
 * Supports:
 * - {{variable}} - Simple variable replacement
 * - {{#variable}}content{{/variable}} - Conditional sections (show if variable has value)
 * - Special handling for PROJECT_FILES array
 */
export function parseTemplate(template: string, variables: Record<string, any>): string {
  let result = template;
  
  // Handle conditional sections first
  Object.entries(variables).forEach(([key, value]) => {
    // Find conditional sections for this variable
    const sectionRegex = new RegExp(
      `\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, 
      'g'
    );
    
    result = result.replace(sectionRegex, (match, content) => {
      // If variable has a value, include the section content, otherwise remove it
      return value ? content : '';
    });
  });
  // Replace regular variables
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    // Special handling for PROJECT_FILES array
    if (key === 'PROJECT_FILES' && Array.isArray(value)) {
      const fileList = value.map(file => `${file.route} (${file.lines} lines)`).join('\n');
      result = result.replace(new RegExp(placeholder, 'g'), fileList);
    } else {
      // Convert any value to string for regular variables
      const stringValue = value ? String(value) : '';
      result = result.replace(new RegExp(placeholder, 'g'), stringValue);
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