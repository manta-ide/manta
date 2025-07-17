/* ------------------------------------------------------------------ *
 * diffHelpers.ts
 * Robust extraction + application of LLM-friendly mini diff blocks using diff-match-patch.
 * ------------------------------------------------------------------ */

import { diff_match_patch } from 'diff-match-patch';

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
    if (body) {
      // Validate that this looks like a proper diff
      const hasProperDiffMarkers = body.includes('\n+') || body.includes('\n-') || 
                                  body.startsWith('+') || body.startsWith('-');
      
      if (hasProperDiffMarkers) {
        blocks.push(body);
      } else {
        // This looks like a code block masquerading as a diff - skip it
        console.warn('Skipping improperly formatted diff block (missing +/- markers)');
      }
    }
  }
  return blocks;
}

/* ---------- Diff Application using diff-match-patch ---------- */

/**
 * Parse a unified diff block and convert it to the format needed by diff-match-patch.
 * This extracts the actual changes from the diff markers.
 */
function parseDiffBlock(diffText: string): { oldText: string; newText: string } {
  const lines = diffText.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Skip hunk headers
      continue;
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      // Skip file headers
      continue;
    } else if (line.startsWith('-')) {
      // Line removed from old
      oldLines.push(line.substring(1));
    } else if (line.startsWith('+')) {
      // Line added to new
      newLines.push(line.substring(1));
    } else if (line.startsWith(' ') || (!line.startsWith('-') && !line.startsWith('+'))) {
      // Context line (appears in both)
      const contextLine = line.startsWith(' ') ? line.substring(1) : line;
      oldLines.push(contextLine);
      newLines.push(contextLine);
    }
  }
  
  return {
    oldText: oldLines.join('\n'),
    newText: newLines.join('\n')
  };
}

/**
 * Apply a single diff block using diff-match-patch.
 * Much more reliable than custom parsing.
 */
function applyDiffBlock(original: string, diffText: string): string {
  try {
    const dmp = new diff_match_patch();
    
    // Parse the diff block to extract old and new text
    const { oldText, newText } = parseDiffBlock(diffText);
    
    // If we have specific old and new text, create patches
    if (oldText && newText) {
      const diffs = dmp.diff_main(oldText, newText);
      dmp.diff_cleanupSemantic(diffs);
      
      const patches = dmp.patch_make(oldText, diffs);
      
      if (patches.length === 0) {
        console.warn('No patches created from diff block');
        return original;
      }
      
      // Apply patches to the original text
      const results = dmp.patch_apply(patches, original);
      
      // results[0] is the patched text, results[1] is array of success booleans
      if (results[1].some(success => !success)) {
        console.warn('Some patches failed to apply cleanly');
      }
      
      return results[0];
    } else {
      // Fallback: try to apply the diff directly by finding context
      return applyDiffBlockFallback(original, diffText, dmp);
    }
  } catch (error) {
    console.error('Error applying diff block:', error);
    return original;
  }
}

/**
 * Fallback method for applying diffs when we can't parse them cleanly.
 */
function applyDiffBlockFallback(original: string, diffText: string, dmp: InstanceType<typeof diff_match_patch>): string {
  try {
    // Extract context lines and changes
    const lines = diffText.split('\n');
    const contextLines: string[] = [];
    const removedLines: string[] = [];
    const addedLines: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('-')) {
        removedLines.push(line.substring(1));
      } else if (line.startsWith('+')) {
        addedLines.push(line.substring(1));
      } else if (line.startsWith(' ') || (!line.startsWith('-') && !line.startsWith('+'))) {
        const contextLine = line.startsWith(' ') ? line.substring(1) : line;
        contextLines.push(contextLine);
      }
    }
    
    // If we have context, try to find it in the original and replace
    if (contextLines.length > 0) {
      const contextText = contextLines.join('\n');
      const oldText = contextLines.concat(removedLines).join('\n');
      const newText = contextLines.concat(addedLines).join('\n');
      
      if (original.includes(contextText)) {
        // Simple string replacement for now
        if (removedLines.length > 0) {
          const textToReplace = removedLines.join('\n');
          const replacement = addedLines.join('\n');
          return original.replace(textToReplace, replacement);
        } else if (addedLines.length > 0) {
          // Insert after context
          const insertion = addedLines.join('\n');
          return original.replace(contextText, contextText + '\n' + insertion);
        }
      }
    }
    
    return original;
  } catch (error) {
    console.error('Error in fallback diff application:', error);
    return original;
  }
}

/* ---------- Applying Multiple Blocks ---------- */

/** Apply multiple diff blocks sequentially using diff-match-patch; each block sees the result of the previous. */
export function applyAllDiffBlocks(original: string, blocks: string[]): string {
  return blocks.reduce((acc, block) => applyDiffBlock(acc, block), original);
}

/* ------------------------------------------------------------------ *
 * Exports (keep same API surface used elsewhere)
 * ------------------------------------------------------------------ */
export { /* re-exported above */ };
