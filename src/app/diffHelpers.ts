/* ------------------------------------------------------------------ *
 * diffHelpers.ts
 * Robust extraction + application of LLM-friendly mini diff blocks.
 * ------------------------------------------------------------------ */

/* ---------- Block Extraction Helpers ---------- */

/**
 * Return the *first* fenced code block that looks like JSX/TSX/JS.
 * Accepts ```jsx|tsx|javascript|js fences.
 */
export function extractFirstJsx(text: string): string | null {
  const re = /```(?:jsx|tsx|javascript|js)\s*\n([\s\S]*?)```/i;
  const m = text.match(re);
  return m ? m[1].trimEnd() : null;
}

/* ---------- Diff Extraction ---------- */

/** Strip common markdown noise (headings, leading bullets) before scanning diff fences. */
function stripMarkdownNoise(text: string): string {
  // Remove markdown headings-only lines; leaves fenced code intact.
  return text.replace(/^[ \t]*#{1,6}.*$/gm, '').trim();
}

/**
 * Extract raw diff bodies (contents inside ```diff fences).
 * Returned strings do NOT include the surrounding fences.
 */
export function extractAllDiffBlocks(text: string): string[] {
  const clean = stripMarkdownNoise(text);
  const blocks: string[] = [];
  const re = /```diff\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const body = m[1].trimEnd();
    if (body) blocks.push(body);
  }
  return blocks;
}

/* ---------- Diff Parsing ---------- */

type DiffOp =
  | { type: 'add'; line: string }
  | { type: 'del'; line: string }
  | { type: 'ctx'; line: string }
  | { type: 'meta'; line: string };

/**
 * Parse unified-ish diff lines (lightweight; not full GNU patch).
 * - Lines starting with '+' (except '+++') -> add.
 * - Lines starting with '-' (except '---') -> del.
 * - Lines starting with '@@' / '+++' / '---' -> meta.
 * - Anything else -> context.
 * Leading single space on context lines (common in fenced diffs) is stripped.
 */
function parseDiffLines(diffText: string): DiffOp[] {
  const ops: DiffOp[] = [];
  for (const rawLine of diffText.split(/\r?\n/)) {
    if (!rawLine.length) {
      ops.push({ type: 'ctx', line: '' });
      continue;
    }
    const ch = rawLine[0];
    if (ch === '+' && rawLine !== '+++') {
      ops.push({ type: 'add', line: rawLine.slice(1) });
      continue;
    }
    if (ch === '-' && rawLine !== '---') {
      ops.push({ type: 'del', line: rawLine.slice(1) });
      continue;
    }
    if (rawLine.startsWith('@@') || rawLine.startsWith('+++') || rawLine.startsWith('---')) {
      ops.push({ type: 'meta', line: rawLine });
      continue;
    }
    // context
    ops.push({
      type: 'ctx',
      line: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine,
    });
  }
  return ops;
}

/* ---------- Fuzzy Matching Utilities ---------- */

/**
 * Normalize for fuzzy line comparison:
 * - trim both ends
 * - collapse all internal whitespace runs to a single space
 */
function norm(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** First index >= start where norm(orig[i]) === norm(target). */
function findLineAfter(orig: string[], target: string, start: number): number {
  const t = norm(target);
  for (let i = start; i < orig.length; i++) {
    if (norm(orig[i]) === t) return i;
  }
  return -1;
}

/**
 * Anchor diff ops to the original file.
 * We try in priority:
 *   1. First context line that matches loosely.
 *   2. First delete line that matches loosely.
 *   3. If neither found, return -1 (unanchored; caller may skip block).
 */
function findAnchorIndex(ops: DiffOp[], origLines: string[]): number {
  // try context
  for (const o of ops) {
    if (o.type !== 'ctx') continue;
    const idx = findLineAfter(origLines, o.line, 0);
    if (idx >= 0) return idx;
  }
  // fallback: first del
  for (const o of ops) {
    if (o.type !== 'del') continue;
    const idx = findLineAfter(origLines, o.line, 0);
    if (idx >= 0) return idx;
  }
  return -1;
}

/* ---------- Applying A Single Diff Block ---------- */

/**
 * Safely apply one diff block to `original`.
 * Strategy (loose, conservative, idempotent):
 *   - Parse ops.
 *   - Find an anchor in the original (first ctx, else del).
 *   - Walk ops in order:
 *       del: find *next* matching line after current cursor; remove if found.
 *       add: insert at cursor+1 (i.e., immediately after the last processed line).
 *       ctx: advance cursor to the matching line (if found); else leave cursor unchanged & copy nothing (context is advisory).
 *   - meta: ignored.
 * If no anchor found → return `original` unchanged (skip block).
 */
function applyUnifiedOrSkip(original: string, diffText: string): string {
  const origLines = original.split(/\r?\n/);
  const ops = parseDiffLines(diffText);

  const anchorIdx = findAnchorIndex(ops, origLines);
  if (anchorIdx < 0) {
    // Can't confidently place this diff → skip
    return original;
  }

  // We'll mutate a working array
  const lines = [...origLines];
  // Cursor is the last index we've meaningfully touched/seen. Start at anchor-1
  // so first findLineAfter search (>= cursor+1) can find the anchor itself.
  let cursor = anchorIdx - 1;

  for (const op of ops) {
    if (op.type === 'meta') continue;

    if (op.type === 'ctx') {
      const idx = findLineAfter(lines, op.line, cursor + 1);
      if (idx >= 0) {
        cursor = idx;
      }
      // else ignore; context just used to assist matching
      continue;
    }

    if (op.type === 'del') {
      const idx = findLineAfter(lines, op.line, cursor + 1);
      if (idx >= 0) {
        lines.splice(idx, 1);
        cursor = idx - 1; // after removal, cursor sits at prior line
      }
      continue;
    }

    if (op.type === 'add') {
      const insertAt = cursor + 1;
      lines.splice(insertAt, 0, op.line);
      cursor = insertAt; // cursor now at inserted line
      continue;
    }
  }

  return lines.join('\n');
}

/* ---------- Applying Multiple Blocks ---------- */

/** Apply multiple diff blocks sequentially; each block sees the result of the previous. */
export function applyAllDiffBlocks(original: string, blocks: string[]): string {
  return blocks.reduce((acc, block) => applyUnifiedOrSkip(acc, block), original);
}

/* ------------------------------------------------------------------ *
 * Exports (keep same API surface used elsewhere)
 * ------------------------------------------------------------------ */
export { /* re-exported above */ };
