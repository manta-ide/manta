import { NextRequest } from 'next/server';
import { generateText } from 'ai';
import { azure } from '@ai-sdk/azure';
import { promises as fs } from 'fs';
import path from 'path';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function getSystemPrompt() {
  const filePath = path.join(process.cwd(), 'src', 'lib', 'prompts', 'system-prompt.txt');
  return fs.readFile(filePath, 'utf-8');
}

/* ---------- Block Extraction Helpers ---------- */

function extractFirstJsx(text: string): string | null {
  const re = /```(?:jsx|tsx|javascript|js)\s*\n([\s\S]*?)```/i;
  const m = text.match(re);
  return m ? m[1].trimEnd() : null;
}

function extractAllDiffBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```diff\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push(m[1].trimEnd());
  }
  return blocks;
}

/* ---------- Diff Application ---------- */

/**
 * Apply an LLM-friendly diff block against `original`.
 * Supports:
 *   +added line
 *   -removed line
 *   (space)|unchanged context line  (leading single space recommended but tolerated if none)
 * Ignores @@ hunk headers and file headers.
 * Attempts naive resync when context mismatch: scans forward up to RESYNC_WINDOW lines.
 */
function applyDiffBlock(original: string, diffText: string, opts?: { resyncWindow?: number }): string {
  const RESYNC_WINDOW = opts?.resyncWindow ?? 20;

  const origLines = original.split(/\r?\n/);
  const out: string[] = [];
  let oIdx = 0;

  const diffLines = diffText.split(/\r?\n/);

  const pushContext = (ctx: string) => {
    // We expect origLines[oIdx] === ctx; if not, try to find ctx ahead (resync).
    if (origLines[oIdx] !== ctx) {
      const foundAt = origLines.slice(oIdx, oIdx + RESYNC_WINDOW).indexOf(ctx);
      if (foundAt >= 0) {
        // copy skipped lines (unchanged) through foundAt-1
        out.push(...origLines.slice(oIdx, oIdx + foundAt));
        oIdx += foundAt;
      }
    }
    // push from original if matches; else take ctx literally (LLM may have reflowed whitespace)
    if (origLines[oIdx] === ctx) {
      out.push(origLines[oIdx]);
      oIdx++;
    } else {
      out.push(ctx);
      // do not advance oIdx if we didn't match; heuristic: assume insertion of context
    }
  };

  for (const rawLine of diffLines) {
    if (!rawLine.length) {
      // blank line is context (empty)
      pushContext('');
      continue;
    }

    const ch = rawLine[0];

    if (ch === '+' && rawLine !== '+++') {
      out.push(rawLine.slice(1));
      continue;
    }
    if (ch === '-' && rawLine !== '---') {
      // deletion: advance original if it matches (best effort)
      const del = rawLine.slice(1);
      if (origLines[oIdx] === del) {
        oIdx++;
      } else {
        // Try to locate del ahead; if found, skip to after it; else ignore.
        const foundAt = origLines.slice(oIdx, oIdx + RESYNC_WINDOW).indexOf(del);
        if (foundAt >= 0) {
          oIdx += foundAt + 1;
        }
      }
      continue;
    }

    // Metadata lines: @@, +++, ---  (ignore, no output, no advance)
    if (rawLine.startsWith('@@') || rawLine.startsWith('+++') || rawLine.startsWith('---')) {
      continue;
    }

    // Context line: can start with space OR no prefix (LLM often omits)
    const ctx = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
    pushContext(ctx);
  }

  // append any remaining original lines
  if (oIdx < origLines.length) out.push(...origLines.slice(oIdx));

  return out.join('\n');
}

/**
 * Apply multiple diff blocks sequentially.
 * Each block is assumed to patch the *current* code from the previous step.
 * Change reduce start if you want all blocks applied against the *initial* original instead.
 */
function applyAllDiffBlocks(original: string, blocks: string[]): string {
  return blocks.reduce((acc, block) => applyDiffBlock(acc, block), original);
}

/* ---------- Route Handler ---------- */

export async function POST(req: NextRequest) {
  try {
    const { messages, currentCode, selection } = (await req.json()) as {
      messages: Message[];
      selection: { x: number; y: number; width: number; height: number } | null;
      currentCode?: string;
    };

    const lastUserMessage = messages[messages.length - 1]?.content ?? '';
    const systemPrompt = await getSystemPrompt();

    let prompt = '';

    if (currentCode) {
      prompt += `\n\nCurrent component code:\n\`\`\`jsx\n${currentCode}\n\`\`\`\n`;
    }

    if (selection) {
      prompt += `\n\nThe user has selected an area (x:${Math.round(selection.x)}, y:${Math.round(selection.y)}, w:${Math.round(selection.width)}, h:${Math.round(selection.height)}).`;
    }

    prompt += `\n\nUser request: "${lastUserMessage}"`;

    const { text: aiResponse } = await generateText({
      model: azure('gpt-4o'),
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
        {
          role: 'user',
          content: prompt,
        },
      ]
    });

    let newCode = currentCode ?? '';

    // Full replacement takes precedence
    const jsxBlock = extractFirstJsx(aiResponse);
    if (jsxBlock) {
      newCode = jsxBlock;
    } else if (currentCode) {
      // Patch mode
      const diffBlocks = extractAllDiffBlocks(aiResponse);
      if (diffBlocks.length > 0) {
        newCode = applyAllDiffBlocks(currentCode, diffBlocks);
      }
    }

    return new Response(
      JSON.stringify({ reply: aiResponse, code: newCode }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error(err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
}
