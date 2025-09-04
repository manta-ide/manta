import { ToolSet, tool } from 'ai';
import * as z from 'zod';
// Avoid direct filesystem; rely on unified files API and Node path for tsconfig search only
import path from 'node:path';

// Headers injected by the LLM agent route for server-to-server calls
let codeEditorAuthHeaders: Record<string, string> = {};
export function setCodeEditorAuthHeaders(headers: Record<string, string>) {
  codeEditorAuthHeaders = headers || {};
}


// Hard caps to prevent context bloat
const DEFAULT_WINDOW_LINES = 400; // default slice size for reads
const MAX_READ_CHARS = 6000; // hard cap for readFile return payload
const PREVIEW_CHARS = 300; // preview size for write operations

// Unified file API functions
async function callFilesApi(method: string, path: string, body?: any) {
  try {
    // Constrain to app directory: strip known prefixes and send relative
    const rel = (path || '').replace(/^\/?(?:blaxel\/app\/)?/i, '');
    const url = rel ? `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/files?path=${encodeURIComponent(rel)}` : `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/files`;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...codeEditorAuthHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      throw new Error(`Files API failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Files API call failed:', error);
    throw error;
  }
}

async function readFileFromUnifiedApi(filePath: string): Promise<{ content: string; source: string } | null> {
  try {
    const result = await callFilesApi('GET', filePath);
    if (result && result.success === false && result.error === 'FILE_NOT_FOUND') {
      return null;
    }
    if (result && result.content !== undefined) {
      return { content: result.content, source: result.source || 'unknown' };
    }
    return null;
  } catch (error) {
    console.log(`Failed to read file from unified API: ${filePath}`, error);
    return null;
  }
}

async function writeFileToUnifiedApi(filePath: string, content: string, isUpdate: boolean = false): Promise<{ success: boolean }> {
  try {
    const method = isUpdate ? 'PUT' : 'POST';
    const body = isUpdate ? { filePath, content } : { filePath, content };
    const result = await callFilesApi(method, '', body);
    return { success: !!result?.success };
  } catch (error) {
    console.log(`Failed to write file to unified API: ${filePath}`, error);
    return { success: false };
  }
}

async function deleteFileFromUnifiedApi(filePath: string): Promise<{ success: boolean }> {
  try {
    const result = await callFilesApi('DELETE', '', { filePath });
    return { success: !!result?.success };
  } catch (error) {
    console.log(`Failed to delete file from unified API: ${filePath}`, error);
    return { success: false };
  }
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

  // Load existing variables from vars.json using unified API
  let existingVars: Record<string, any> = {};
  try {
    const varsResult = await readFileFromUnifiedApi('blaxel/app/_graph/vars.json');
    if (varsResult) {
      existingVars = JSON.parse(varsResult.content);
      console.log(`Loaded vars.json from ${varsResult.source}`);
    } 
  } catch (error) {
    console.warn('Failed to load vars.json:', error);
  }

  // Check getVar calls in the file if provided
  const getVarErrors: string[] = [];
  if (filePath) {
    try {
      // Read via unified API when we need to inspect getVar usages
      const fileResult = await readFileFromUnifiedApi(filePath);
      const fileContent = fileResult?.content ?? '';
      // More robust regex to capture getVar calls with different quote types and multiline
      const getVarRegex = /getVar\s*\(\s*['"`]([^'"`]+)['"`]/g;
      let match;
      const usedVars = new Set<string>();
      
      while ((match = getVarRegex.exec(fileContent)) !== null) {
        const varName = match[1];
        usedVars.add(varName);
        
        if (!(varName in existingVars)) {
          getVarErrors.push(`getVar("${varName}") references undefined variable`);
        }
      }
      console.log("usedVars", Array.from(usedVars));
      console.log("existingVars keys", Object.keys(existingVars));
    } catch (error) {
      console.warn('Failed to check getVar calls:', error);
    }
  }

  // If no file path provided, do full build
  if (!filePath) {
    const { ok, out } = await run('npx tsc --noEmit --pretty false');
    
    if (ok && getVarErrors.length === 0) return { success: true };

    // strip ANSI colour codes
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    const lines = plain.split('\n').filter((l) => l.trim());
    const firstErr = lines.findIndex((l) => /error\s+TS\d+:/i.test(l));
    const errorLines =
      (firstErr >= 0 ? lines.slice(firstErr) : lines).slice(0, 30);

    // Combine TypeScript errors with getVar errors
    const allErrors = [...errorLines, ...getVarErrors];

    return { success: false, errorLines: allErrors };
  }

  const ext = (filePath.split(".").pop() || "").toLowerCase();
  if (!["ts", "tsx"].includes(ext)) {
    return getVarErrors.length > 0 
      ? { success: false, errorLines: getVarErrors }
      : { success: true };
  }

  /* ─── 1 ▪ syntax-only guard (cheap) ─── */
  const tsNodeCmd =
    `npx ts-node --transpile-only ` +
    `--compiler-options '${JSON.stringify({
      jsx: "react-jsx",
      esModuleInterop: true,
      module: "ESNext",
    })}' ${filePath}`;
  let { ok, out } = await run(tsNodeCmd);
  if (ok && getVarErrors.length === 0) return { success: true };

  /* ─── 2 ▪ project-aware tsc (resolves @/ aliases) ─── */
  const tsConfig = await findTsConfig(path.dirname(filePath));
  const tscCmd = tsConfig
    ? // respect baseUrl / paths / strictness the project already defines
      `npx tsc --noEmit --pretty false -p ${tsConfig}`
    : // fall back to the relaxed per-file compile we used before
      `npx tsc --noEmit --pretty false --jsx react-jsx --esModuleInterop --skipLibCheck ${filePath}`;

  ({ ok, out } = await run(tscCmd));
  if (ok && getVarErrors.length === 0) return { success: true };

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

  // Combine TypeScript errors with getVar errors
  const allErrors = [...keep, ...getVarErrors];

  return allErrors.length
    ? { success: false, errorLines: allErrors.slice(0, 30) }
    : { success: true };
}


// Unused function - keeping for potential future use
// function getRuntimeError() {
//   const err = getLastError();
//   if (!err) {
//     return { success: true };
//   }
// 
//   // Immediately clear so the same error isn't reported twice.
//   clearLastError();
// 
//   // Truncate to keep the payload modest
//   const stack = (err.componentStack ?? '').split('\n').slice(0, 6).join('\n');
// 
//   return {
//     success: false,
//     message: err.message,
//     componentStack: stack,
//     ts: err.ts,
//   };
// }
export const codeEditorTools: ToolSet = {
  readFile: tool({
    description: 'Read a slice of a file. Provide optional offset and limit.',
    parameters: z.object({
      path: z.string().describe('File path relative to project root'),
      offset: z.number().int().min(0).optional().describe('Line offset (0-based). Defaults to 0'),
      limit: z.number().int().min(1).optional().describe('Lines to read after offset. Defaults to 400'),
    }).strict(),
    // readFile.execute (drop-in)
execute: async ({ path, offset, limit }) => {
  try {
    const result = await readFileFromUnifiedApi(path);
    if (!result) {
      return { success: false, message: `File not found: ${path}` };
    }

    const { content } = result;
    const allLines = content.split('\n');
    const totalLines = allLines.length;

    const start = Math.max(0, Number.isFinite(offset as number) ? (offset as number) : 0);
    const requestedLimit = Math.max(1, Number.isFinite(limit as number) ? (limit as number) : DEFAULT_WINDOW_LINES);

    if (start >= totalLines) {
      return {
        success: false,
        message: `Offset ${start} is beyond end of file (${totalLines} lines).`,
        totalLines,
      };
    }

    // Compute a line window, then shrink it to respect MAX_READ_CHARS **by lines**, not by raw char slice
    let end = Math.min(totalLines, start + requestedLimit);
    let joined = allLines.slice(start, end).join('\n');

    if (joined.length > MAX_READ_CHARS) {
      // shrink window until it fits; do it quickly by ratio, then fine-tune
      let low = start + 1;
      let high = end;
      // binary search for maximum end that fits into MAX_READ_CHARS
      while (low < high) {
        const mid = Math.max(low, Math.floor((low + high + 1) / 2));
        const probe = allLines.slice(start, mid).join('\n');
        if (probe.length <= MAX_READ_CHARS) {
          low = mid;
          joined = probe;
        } else {
          high = mid - 1;
        }
      }
      end = low;
    }

    const actualLines = end - start;
    const hasMoreBefore = start > 0;
    const hasMoreAfter = end < totalLines;

    return {
      success: true,
      content: joined,
      // New helpful metadata
      startLine: start,
      endLineExclusive: end,
      actualLines,
      totalLines,
      hasMoreBefore,
      hasMoreAfter,
      nextOffset: end,  // agent can chain windows deterministically
    };
  } catch (error) {
    return { success: false, message: `Failed to read file: ${error}` };
  }
},
  }),

  createFile: tool({
    description: 'Create a new file with the given content.',
    parameters: z.object({
      path: z.string().describe('File path relative to project root'),
      content: z.string().describe('Content to write to the file'),
    }).strict(),
    execute: async ({ path, content }) => {
      try {
        // Use unified API to create file
        const result = await writeFileToUnifiedApi(path, content, false);
        
        if (!result.success) {
          return { success: false, message: `Failed to create file: ${path}` };
        }
        // Prevent echoing entire file content back into the context
        const preview = String(content || '').slice(0, PREVIEW_CHARS);
        return { success: true, message: `Created file: ${path}`, preview, length: String(content || '').length };
      } catch (error) {
        return { success: false, message: `Failed to create file: ${error}` };
      }
    },
  }),

  updateFile: tool({
    description: 'Replace an existing file with new content.',
    parameters: z.object({
      path: z.string().describe('File path relative to project root'),
      content: z.string().describe('New content for the file'),
    }).strict(),
    execute: async ({ path, content }) => {
      try {
        // Use unified API to update file
        const result = await writeFileToUnifiedApi(path, content, true);
        
        if (!result.success) {
          return { success: false, message: `Failed to update file: ${path}` };
        }
        return { success: true, message: `Updated file: ${path}` };
      } catch (error) {
        return { success: false, message: `Failed to update file: ${error}` };
      }
    },
  }),

  patchFile: tool({
    description: 'Apply precise code edits to existing files. REQUIRES exact code context with BEFORE/AFTER format. DO NOT provide natural language instructions.',
    parameters: z.object({
      /* explanation: z.string().describe('Short explanation of why you want to patch this file'), */
      path: z.string().describe('The file path relative to the project root'),
      patchDescription: z.string().describe('EXACT code replacement format: "// Original code:\n[exact lines from file]\n\n// Updated code:\n[new lines with changes]" - Must include verbatim context from the target file'),
    }).strict(),
    execute: async ({ path, patchDescription }) => {
      try {
        // Check if file exists using unified API instead of local filesystem
        const fileCheck = await readFileFromUnifiedApi(path);
        if (!fileCheck) {
          return { success: false, message: `File does not exist: ${path}` };
        }
        
        // Read current content using unified API
        const fileResult = await readFileFromUnifiedApi(path);
        if (!fileResult) {
          return { success: false, message: `File does not exist: ${path}` };
        }
        
        const currentContent = fileResult.content;
        const contentSource = fileResult.source;

        // Validate patchDescription is edit_file-style with contextual code (be permissive but guard against pure instructions)
        const description = patchDescription || '';
        const hasEditMarker = description.includes('// ... existing code ...');
        const lines = description.split('\n');
        const normalizedCandidates = lines
          .map((raw) => raw.replace(/^\s*[+\-]/, '').trimEnd()) // strip diff-like prefixes
          .filter((l) => l.trim().length > 0 && !l.includes('// ... existing code ...'));
        const anchorCount = normalizedCandidates.reduce((acc, line) => acc + (line.length >= 3 && currentContent.includes(line) ? 1 : 0), 0);
        const isLikelyInstruction = anchorCount === 0 && !hasEditMarker;

        if (isLikelyInstruction) {
          return {
            success: false,
            message:
              'PATCH_DESCRIPTION_INVALID: You must provide EXACT code in this format:\n\n// Original code:\n[copy exact lines from the file here]\n\n// Updated code:\n[your modified version here]\n\nExample:\n// Original code:\n<section id="projects-section" className="relative">\n\n// Updated code:\n<section id="projects-section" className="relative m-4">\n\nDO NOT use natural language descriptions. Copy actual code from the file.',
          };
        }
        
        // Call the quick patch API to get the patched content
        const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/agents/quick-patch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileContent: currentContent,
            patchDescription: patchDescription,
            filePath: path, // hints model about file context if useful
          }),
        });

        if (!response.ok) {
          return { success: false, message: `Patch API failed: ${response.statusText}` };
        }

        const patchResult = await response.json();
        
        if (!patchResult.success) {
          return { success: false, message: `Patch failed: ${patchResult.error}` };
        }
        console.log(">>>>>>>>>>patchFile patchResult", patchResult);

        // Helper: strip surrounding markdown code fences if present
        const stripFences = (s: string): string => {
          if (!s) return s;
          const fenceMatch = s.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
          if (fenceMatch) return fenceMatch[1];
          const fenceMatchNoLang = s.match(/^```\n([\s\S]*?)\n```\s*$/);
          return fenceMatchNoLang ? fenceMatchNoLang[1] : s;
        };

        // Helper: preserve and normalize top-of-file directives.
        // Guarantees exactly one directive at the very top (first meaningful line),
        // preserves the original quoted directive if it existed, and removes any
        // duplicate or malformed directive lines elsewhere (e.g., `use client"`).
        const preserveTopDirective = (original: string, patched: string): string => {
          const isCommentOrEmpty = (line: string) =>
            /^\s*$/.test(line) || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line);

          const originalLines = original.split('\n');
          const patchedLines = patched.split('\n');

          // Find first non-empty, non-comment line in original
          let origIdx = 0;
          while (origIdx < originalLines.length && isCommentOrEmpty(originalLines[origIdx])) origIdx++;
          const originalFirst = originalLines[origIdx] ?? '';

          // Patterns for directives
          const quotedDirectiveRe = /^\s*(["'])use\s+([a-zA-Z-]+)\1;?\s*$/; // 'use client' or "use server"
          const bareDirectiveRe = /^\s*use\s+([a-zA-Z-]+);?\s*$/;             // use client
          const looseDirectiveRe = /^\s*["']?use\s+([a-zA-Z-]+)["']?;?\s*$/; // includes broken forms like: use client"

          const hasQuotedDirectiveInOriginal = quotedDirectiveRe.test(originalFirst);

          // Collect directive candidate line indices from the first few lines of patched
          const directiveCandidateIdxs: number[] = [];
          for (let i = 0; i < Math.min(patchedLines.length, 20); i++) {
            const line = patchedLines[i];
            if (isCommentOrEmpty(line)) continue;
            if (looseDirectiveRe.test(line)) directiveCandidateIdxs.push(i);
          }

          if (hasQuotedDirectiveInOriginal) {
            const directiveLine = originalFirst; // preserve exactly as-is

            if (directiveCandidateIdxs.length === 0) {
              // Insert original directive at top if missing
              return [directiveLine, '', ...patchedLines].join('\n');
            }

            // Remove all directive candidates, then insert preserved directive at top
            const cleaned: string[] = [];
            for (let i = 0; i < patchedLines.length; i++) {
              if (directiveCandidateIdxs.includes(i)) continue; // drop duplicates/malformed
              cleaned.push(patchedLines[i]);
            }
            return [directiveLine, '', ...cleaned].join('\n');
          }

          // Original had no quoted directive. If patched has candidates, normalize the first and drop the rest.
          if (directiveCandidateIdxs.length > 0) {
            const firstIdx = directiveCandidateIdxs[0];
            const firstLine = patchedLines[firstIdx];
            const match = firstLine.match(quotedDirectiveRe) || firstLine.match(bareDirectiveRe) || firstLine.match(looseDirectiveRe);
            const directiveKeyword = (match && (match[2] || match[1])) || 'client';
            const normalizedDirective = `"use ${directiveKeyword}"`;

            const cleaned: string[] = [];
            for (let i = 0; i < patchedLines.length; i++) {
              if (directiveCandidateIdxs.includes(i)) continue;
              cleaned.push(patchedLines[i]);
            }
            return [normalizedDirective, '', ...cleaned].join('\n');
          }

          // No directives to normalize
          return patched;
        };

        // Prepare final content with safety adjustments
        const rawPatched = String(patchResult.patchedContent ?? '');
        const noFences = stripFences(rawPatched);

        // Full-file replacement: preserve/normalize top-of-file directives
        const adjusted: string = preserveTopDirective(currentContent, noFences);

        // If nothing changed, treat as a failure so the caller can try a different strategy
        if (adjusted === currentContent) {
          return { success: false, message: 'No changes were applied to the file.' };
        }

        // Write the patched content using unified API
        const writeResult = await writeFileToUnifiedApi(path, adjusted, true);

        return { success: writeResult.success, message: `Patched file: ${path}` };
      } catch (error) {
        return { success: false, message: `Failed to patch file: ${error}` };
      }
    },
  }),

  deleteFile: tool({
    description: 'Delete an existing file.',
    parameters: z.object({
      path: z.string().describe('File path relative to project root'),
    }).strict(),
    execute: async ({ path }) => {
      try {
        // Use unified API to delete file
        const result = await deleteFileFromUnifiedApi(path);
        
        if (!result.success) {
          return { success: false, message: `Failed to delete file: ${path}` };
        }
        
        return { success: true, message: `Deleted file: ${path}` };
      } catch (error) {
        return { success: false, message: `Failed to delete file: ${error}` };
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
