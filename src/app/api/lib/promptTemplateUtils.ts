/**
 * Prompt Template Processing Utilities
 * 
 * Backend utilities for loading and parsing prompt templates with variable substitution.
 * Handles conditional sections and variable replacement for system/user/assistant prompts.
 * 
 * Packaged-only: templates must be pre-registered into memory. No FS fallbacks.
 */

// Simple in-memory registry to allow bundling/registration at build time
const inMemoryTemplates: Record<string, string> = {};

/**
 * Optionally register a template at runtime/build-time so it doesn't need FS access.
 */
export function registerTemplate(name: string, content: string) {
  inMemoryTemplates[name] = content;
}

/**
 * Loads a prompt template file from the prompts directory
 */
export async function getTemplate(templateName: string): Promise<string> {
  const content = inMemoryTemplates[templateName];
  if (!content) {
    throw new Error(`Prompt template not registered: ${templateName}`);
  }
  return content;
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
        .map((file) => {
          if (typeof file === 'string') return file;
          if (file && typeof file.route === 'string') return file.route;
          return String(file ?? '');
        })
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
