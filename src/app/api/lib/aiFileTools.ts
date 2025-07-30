import { tool } from 'ai';
import { z } from 'zod';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { applyAllDiffBlocks } from '@/app/diffHelpers';

// Project root for file operations (base-template directory)
const PROJECT_ROOT = join(process.cwd(), 'base-template');

// Maximum file size to read (in lines) to prevent memory issues
const MAX_FILE_LINES = 1000;

export const fileTools = {
  readFile: tool({
    description: 'Read a file and return its content. Returns error if file not found or too long.',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
    }),
    execute: async ({ path }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File not found: ${path}`,
            error: 'FILE_NOT_FOUND'
          };
        }
        
        // Read file content
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        if (lines.length > MAX_FILE_LINES) {
          return { 
            success: false, 
            message: `File too long: ${path} has ${lines.length} lines (max: ${MAX_FILE_LINES})`,
            error: 'FILE_TOO_LONG',
            lines: lines.length,
            maxLines: MAX_FILE_LINES
          };
        }
        
        return { 
          success: true, 
          message: `Successfully read file: ${path}`,
          content: content,
          lines: lines.length,
          path: path
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to read file: ${error}`,
          error: 'READ_ERROR'
        };
      }
    },
  }),

  createFile: tool({
    description: 'Create a new file with the given content',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
      content: z.string().describe('The content to write to the file'),
    }),
    execute: async ({ path, content }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        const dir = dirname(fullPath);
        
        // Create directory if it doesn't exist
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        
        writeFileSync(fullPath, content, 'utf-8');
        return { 
          success: true, 
          message: `Created file: ${path}`,
          operation: { type: 'create', path, content }
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to create file: ${error}`,
          operation: { type: 'create', path, content }
        };
      }
    },
  }),

  updateFile: tool({
    description: 'Update an existing file with new content',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
      content: z.string().describe('The new content for the file'),
    }),
    execute: async ({ path, content }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'update', path, content }
          };
        }
        
        writeFileSync(fullPath, content, 'utf-8');
        return { 
          success: true, 
          message: `Updated file: ${path}`,
          operation: { type: 'update', path, content }
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to update file: ${error}`,
          operation: { type: 'update', path, content }
        };
      }
    },
  }),

  patchFile: tool({
    description: 'Apply a patch to an existing file using unified diff format',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
      patch: z.string().describe('The unified diff patch to apply'),
    }),
    execute: async ({ path, patch }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'patch', path, content: patch }
          };
        }
        
        // Read current content and apply patch
        const currentContent = readFileSync(fullPath, 'utf-8');
        const newContent = applyAllDiffBlocks(currentContent, [patch]);
        
        if (newContent !== currentContent) {
          writeFileSync(fullPath, newContent, 'utf-8');
          return { 
            success: true, 
            message: `Patch applied successfully to: ${path}`,
            operation: { type: 'patch', path, content: patch }
          };
        } else {
          return { 
            success: false, 
            message: `Patch application failed - no changes made to: ${path}`,
            operation: { type: 'patch', path, content: patch }
          };
        }
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to patch file: ${error}`,
          operation: { type: 'patch', path, content: patch }
        };
      }
    },
  }),

  deleteFile: tool({
    description: 'Delete an existing file',
    parameters: z.object({
      path: z.string().describe('The file path relative to the project root'),
    }),
    execute: async ({ path }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'delete', path }
          };
        }
        
        unlinkSync(fullPath);
        return { 
          success: true, 
          message: `Deleted file: ${path}`,
          operation: { type: 'delete', path }
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to delete file: ${error}`,
          operation: { type: 'delete', path }
        };
      }
    },
  }),
}; 