import { tool } from 'ai';
import { exec } from 'child_process';
import * as z from 'zod';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { applyAllDiffBlocks } from '@/app/diffHelpers';
import { getLastError, clearLastError } from '@/lib/runtimeErrorStore';

// Project root for file operations (base-template directory)
const PROJECT_ROOT = join(process.cwd(), 'base-template');

// Maximum file size to read (in lines) to prevent memory issues
const MAX_FILE_LINES = 1000;

function run(cmd: string) {
  return new Promise<{ ok: boolean; out: string }>((res) =>
    exec(
      cmd,
      { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
      (e, so, se) => res({ ok: !e, out: `${so}\n${se}` }),
    ),
  );
}

async function buildProject(filePath: string) {

  const { exec } = await import('child_process');
      const run = (cmd: string) =>
        new Promise<{ ok: boolean; out: string }>((res) =>
          exec(
            cmd,
            { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
            (e, so, se) => res({ ok: !e, out: `${so}\n${se}` }),
          ),
        );
        const ext = (filePath.split('.').pop() || '').toLowerCase();
        if (!['ts', 'tsx'].includes(ext)) {return { success: true };}
      const { ok, out } = await run('npx tsc --noEmit --pretty false ' + filePath);

      if (ok) return { success: true };

      // strip ANSI colour codes
      const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
      const lines = plain.split('\n').filter((l) => l.trim());
      const firstErr = lines.findIndex((l) => /error\s+TS\d+:/i.test(l));
      const errorLines =
        (firstErr >= 0 ? lines.slice(firstErr) : lines).slice(0, 30);

      return { success: false, errorLines };
}

function getRuntimeError() {

  const err = getLastError();
  if (!err) {
    return { success: true };
  }

  // Immediately clear so the same error isn’t reported twice.
  clearLastError();

  // Truncate to keep the payload modest
  const stack = (err.componentStack ?? '').split('\n').slice(0, 6).join('\n');

  return {
    success: false,
    message: err.message,
    componentStack: stack,
    ts: err.ts,
  };
}
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
        
        const runtimeError = await buildProject(fullPath);
          if(runtimeError.success === true) {
            return { 
              success: true, 
              message: `Successfully read file: ${path}`,
              content: content,
              lines: lines.length,
              path: path
            };
          }
          else {
            return {success: true, message: "Error in file " + JSON.stringify(runtimeError) + "\n" + content, lines: lines.length, path: path};
          }
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
        const runtimeError = await buildProject(fullPath);
          if(runtimeError.success === true) {
            return { 
              success: true, 
              message: `Created file: ${path}`,
              operation: { type: 'create', path, content }
            };
          }
          else {
            return {success: false, message: "Error in create" + JSON.stringify(runtimeError), operation: { type: 'create', path, content }};
          }
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
        const runtimeError = await buildProject(fullPath);
          if(runtimeError.success === true) {
            return { 
              success: true, 
              message: `Updated file: ${path}`,
              operation: { type: 'update', path, content }
            };
          }
          else {
            return {success: false, message: "Error in update" + JSON.stringify(runtimeError), operation: { type: 'update', path, content }};
          }
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
          const runtimeError = await buildProject(fullPath);
          if(runtimeError.success === true) {
            return { 
              success: true, 
              message: `Patch applied successfully to: ${path}`,
              operation: { type: 'patch', path, content: patch }
            };
          }
          else {
            return {success: false, message: "Error in patch" + JSON.stringify(runtimeError), operation: { type: 'patch', path, content: patch }};
          }
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

  buildProject: tool({
    description:
      'ALWAYS call this first when the user says “fix”, “debug” or similar but has not ' +
      'pasted an error.  Runs `tsc --noEmit --pretty false` to surface syntax & type ' +
      'errors (those are what show up in the red overlay). If it returns success:false, ' +
      'inspect `errorLines`, patch the offending file, and call again until success:true.',
    parameters: z.object({}), // no arguments
    execute: async () => {
      const { exec } = await import('child_process');
      const run = (cmd: string) =>
        new Promise<{ ok: boolean; out: string }>((res) =>
          exec(
            cmd,
            { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
            (e, so, se) => res({ ok: !e, out: `${so}\n${se}` }),
          ),
        );

      const { ok, out } = await run('npx tsc --noEmit --pretty false');

      if (ok) return { success: true };

      // strip ANSI colour codes
      const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
      const lines = plain.split('\n').filter((l) => l.trim());
      const firstErr = lines.findIndex((l) => /error\s+TS\d+:/i.test(l));
      const errorLines =
        (firstErr >= 0 ? lines.slice(firstErr) : lines).slice(0, 30);

      return { success: false, errorLines };
    },
  }),
 
  getRuntimeError: tool({
    description:
      'Return the latest React runtime/rendering error captured by the global ErrorBoundary. ' +
      'If none captured since last call, success:true.',
    parameters: z.object({}), // no args
    execute: async () => {
      return getRuntimeError();
    },
  }),
}; 