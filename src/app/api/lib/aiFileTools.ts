import { tool } from 'ai';
import { exec } from 'child_process';
import * as z from 'zod';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getLastError, clearLastError } from '@/lib/runtimeErrorStore';
import path from 'node:path';

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

async function findTsConfig(start: string): Promise<string | null> {
  const { promises: fs } = await import("node:fs");
  let dir = path.resolve(start);

  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* not here – go up one folder */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the root
    dir = parent;
  }
  return null;
}

export async function buildProject(filePath?: string) {
  const { exec } = await import("child_process");
  const run = (cmd: string) =>
    new Promise<{ ok: boolean; out: string }>((res) =>
      exec(
        cmd,
        { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
        (e, so, se) => res({ ok: !e, out: `${so}\n${se}` }),
      ),
    );

  // If no file path provided, do full build
  if (!filePath) {
    const { ok, out } = await run('npx tsc --noEmit --pretty false');
    
    if (ok) return { success: true };

    // strip ANSI colour codes
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    const lines = plain.split('\n').filter((l) => l.trim());
    const firstErr = lines.findIndex((l) => /error\s+TS\d+:/i.test(l));
    const errorLines =
      (firstErr >= 0 ? lines.slice(firstErr) : lines).slice(0, 30);

    return { success: false, errorLines };
  }

  const ext = (filePath.split(".").pop() || "").toLowerCase();
  if (!["ts", "tsx"].includes(ext)) return { success: true };

  /* ─── 1 ▪ syntax-only guard (cheap) ─── */
  const tsNodeCmd =
    `npx ts-node --transpile-only ` +
    `--compiler-options '${JSON.stringify({
      jsx: "react-jsx",
      esModuleInterop: true,
      module: "ESNext",
    })}' ${filePath}`;
  let { ok, out } = await run(tsNodeCmd);
  if (ok) return { success: true };

  /* ─── 2 ▪ project-aware tsc (resolves @/ aliases) ─── */
  const tsConfig = await findTsConfig(path.dirname(filePath));
  const tscCmd = tsConfig
    ? // respect baseUrl / paths / strictness the project already defines
      `npx tsc --noEmit --pretty false -p ${tsConfig}`
    : // fall back to the relaxed per-file compile we used before
      `npx tsc --noEmit --pretty false --jsx react-jsx --esModuleInterop --skipLibCheck ${filePath}`;

  ({ ok, out } = await run(tscCmd));
  if (ok) return { success: true };

  /* ─── 3 ▪ diagnostic filter ─── */
  const IGNORE = new Set(["1259", "17004"]);
  // if we *didn’t* find a tsconfig we also ignore TS2307 that starts with '@/'
  if (!tsConfig) IGNORE.add("2307");

  const plain = out.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = plain.split("\n").filter(Boolean);
  const keep = lines.filter((l) => {
    const m = l.match(/TS(\d+):/);
    return !m || !IGNORE.has(m[1]);
  });

  return keep.length
    ? { success: false, errorLines: keep.slice(0, 30) }
    : { success: true };
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
      explanation: z.string().describe('Short explanation of why you want to read this file'),
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
      explanation: z.string().describe('Short explanation of why you want to create this file'),
      path: z.string().describe('The file path relative to the project root'),
      content: z.string().describe('The content to write to the file'),
    }),
    execute: async ({ path, content, explanation }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        const dir = dirname(fullPath);
        
        // Create directory if it doesn't exist
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        
        writeFileSync(fullPath, content, 'utf-8');
        const runtimeError = await buildProject(fullPath);
        console.log(">>>>>>>>>>createFile buildProject", runtimeError);
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
      explanation: z.string().describe('Short explanation of why you want to update this file'),
      path: z.string().describe('The file path relative to the project root'),
      content: z.string().describe('The new content for the file'),
    }),
    execute: async ({ path, content, explanation }) => {
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
    description: 'Apply contextual edits to an existing file using edit_file-style format with // ... existing code ... markers',
    parameters: z.object({
      explanation: z.string().describe('Short explanation of why you want to patch this file'),
      path: z.string().describe('The file path relative to the project root'),
      patchDescription: z.string().describe('Edit specification using minimal contextual snippets separated by // ... existing code ...'),
    }),
    execute: async ({ path, patchDescription, explanation }) => {
      try {
        const fullPath = join(PROJECT_ROOT, path);
        
        if (!existsSync(fullPath)) {
          return { 
            success: false, 
            message: `File does not exist: ${path}`,
            operation: { type: 'patch', path, patchDescription }
          };
        }
        
        // Read current content
        const currentContent = readFileSync(fullPath, 'utf-8');
        
        // Call the quick patch API
        const response = await fetch('http://localhost:3000/api/agent-orchestrator/quick-patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileContent: currentContent,
            patchDescription: patchDescription,
          }),
        });

        if (!response.ok) {
          return { 
            success: false, 
            message: `Patch API failed: ${response.statusText}`,
            operation: { type: 'patch', path, patchDescription }
          };
        }

        const result = await response.json();
        
        if (!result.success) {
          return { 
            success: false, 
            message: `Patch failed: ${result.error}`,
            operation: { type: 'patch', path, patchDescription }
          };
        }
        console.log(">>>>>>>>>>patchFile result", result);

        // Helper: strip surrounding markdown code fences if present
        const stripFences = (s: string): string => {
          if (!s) return s;
          const fenceMatch = s.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
          if (fenceMatch) return fenceMatch[1];
          const fenceMatchNoLang = s.match(/^```\n([\s\S]*?)\n```\s*$/);
          return fenceMatchNoLang ? fenceMatchNoLang[1] : s;
        };

        // Helper: preserve quoted top-of-file directives from the original file
        const preserveTopDirective = (original: string, patched: string): string => {
          const isCommentOrEmpty = (line: string) =>
            /^\s*$/.test(line) || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line);

          const originalLines = original.split('\n');
          const patchedLines = patched.split('\n');

          // Find first non-empty, non-comment line in original
          let origIdx = 0;
          while (origIdx < originalLines.length && isCommentOrEmpty(originalLines[origIdx])) origIdx++;
          const originalFirst = originalLines[origIdx] ?? '';

          // Regex for quoted directive like 'use client' or "use server"
          const quotedDirectiveRe = /^\s*(["'])use\s+[a-zA-Z-]+\1;?\s*$/;
          const hasQuotedDirective = quotedDirectiveRe.test(originalFirst);

          if (!hasQuotedDirective) return patched; // nothing to enforce

          const directiveLine = originalFirst; // preserve exactly as-is

          // Find first non-empty, non-comment line in patched
          let patIdx = 0;
          while (patIdx < patchedLines.length && isCommentOrEmpty(patchedLines[patIdx])) patIdx++;
          const patchedFirst = patchedLines[patIdx] ?? '';

          // Bare directive (missing quotes) like: use client
          const bareDirectiveRe = /^\s*use\s+[a-zA-Z-]+;?\s*$/;
          const patchedHasBareDirective = bareDirectiveRe.test(patchedFirst);
          const patchedHasQuotedDirective = quotedDirectiveRe.test(patchedFirst);

          if (patchedHasQuotedDirective) {
            // Already fine
            return patched;
          }

          if (patchedHasBareDirective) {
            // Replace bare with original quoted directive
            patchedLines[patIdx] = directiveLine;
            return patchedLines.join('\n');
          }

          // If original had a quoted directive but patched lost it, insert it at the very top
          // Ensure it becomes the first meaningful statement
          return [directiveLine, '', ...patchedLines].join('\n');
        };

        // Prepare final content with safety adjustments
        const rawPatched = String(result.patchedContent ?? '');
        const noFences = stripFences(rawPatched);
        const adjusted = preserveTopDirective(currentContent, noFences);

        // Write the patched content
        writeFileSync(fullPath, adjusted, 'utf-8');
        writeFileSync("patchlog.txt", adjusted, 'utf-8');
        const runtimeError = await buildProject(fullPath);
        
        if(runtimeError.success === true) {
          return { 
            success: true, 
            message: `Patch applied successfully to: ${path}`,
            operation: { type: 'patch', path, patchDescription }
          };
        } else {
          return {
            success: false, 
            message: "Error in patch: " + JSON.stringify(runtimeError), 
            operation: { type: 'patch', path, patchDescription }
          };
        }
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to patch file: ${error}`,
          operation: { type: 'patch', path, patchDescription }
        };
      }
    },
  }),

  deleteFile: tool({
    description: 'Delete an existing file',
    parameters: z.object({
      explanation: z.string().describe('Short explanation of why you want to delete this file'),
      path: z.string().describe('The file path relative to the project root'),
    }),
    execute: async ({ path, explanation }) => {
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

  /* buildProject: tool({
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
  }), */
 
  /* getRuntimeError: tool({
    description:
      'Return the latest React runtime/rendering error captured by the global ErrorBoundary. ' +
      'If none captured since last call, success:true.',
    parameters: z.object({}), // no args
    execute: async () => {
      return getRuntimeError();
    },
  }), */
}; 