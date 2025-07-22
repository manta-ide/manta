import { promises as fs } from 'fs';
import path from 'path';

export async function getTemplate(templateName: string): Promise<string> {
  const filePath = path.join(process.cwd(), 'src', 'lib', 'prompts', `${templateName}.txt`);
  return fs.readFile(filePath, 'utf-8');
}

export function parseTemplate(template: string, variables: Record<string, string>): string {
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
    result = result.replace(new RegExp(placeholder, 'g'), value);
  });
  
  return result;
}

export function parseMessageWithTemplate(template: string, variables: Record<string, string>): string {
  return parseTemplate(template, variables);
} 