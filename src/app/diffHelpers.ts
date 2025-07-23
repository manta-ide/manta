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
  
  let inHunk = false;
  
  for (const line of lines) {
    // Handle @@ hunk headers - these mark the start of a diff section
    if (line.startsWith('@@') && line.includes('@@')) {
      inHunk = true;
      console.log('Processing hunk:', line);
      continue;
    }
    
    // Skip file headers
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ')) {
      continue;
    }
    
    // Only process lines if we're in a hunk or if there's no hunk header (simple diff)
    if (!inHunk && !diffText.includes('@@')) {
      // Simple diff format without @@ headers
      inHunk = true;
    }
    
    if (inHunk) {
      if (line.startsWith('-')) {
        // Line removed from old
        oldLines.push(line.substring(1));
      } else if (line.startsWith('+')) {
        // Line added to new
        newLines.push(line.substring(1));
      } else if (line.startsWith(' ')) {
        // Context line (appears in both)
        const contextLine = line.substring(1);
        oldLines.push(contextLine);
        newLines.push(contextLine);
      } else if (line.trim().length > 0 && !line.startsWith('@')) {
        // Non-empty line without prefix - treat as context
        oldLines.push(line);
        newLines.push(line);
      }
    }
  }
  
  return {
    oldText: oldLines.join('\n'),
    newText: newLines.join('\n')
  };
}

/**
 * Apply a single diff block using improved string replacement with whitespace tolerance.
 */
function applyDiffBlock(original: string, diffText: string): string {
  try {
    // Parse the diff block to extract old and new text
    const { oldText, newText } = parseDiffBlock(diffText);
    
    console.log('🔧 Diff block parsing:');
    console.log('  oldText:', JSON.stringify(oldText));
    console.log('  newText:', JSON.stringify(newText));
    
    // If we have both old and new text, try multiple matching strategies
    if (oldText && newText && oldText !== newText) {
      
      // Strategy 1: Exact match (fastest)
      if (original.includes(oldText)) {
        console.log('  ✅ Found exact match, applying replacement');
        return original.replace(oldText, newText);
      }
      
      // Strategy 2: Normalized line endings
      const normalizedOriginal = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normalizedOldText = oldText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      if (normalizedOriginal.includes(normalizedOldText)) {
        console.log('  ✅ Found match with normalized line endings, applying replacement');
        const normalizedNewText = newText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const result = normalizedOriginal.replace(normalizedOldText, normalizedNewText);
        
        // Restore original line endings
        if (original.includes('\r\n')) {
          return result.replace(/\n/g, '\r\n');
        } else if (original.includes('\r')) {
          return result.replace(/\n/g, '\r');
        }
        return result;
      }
      
      // Strategy 3: Whitespace-tolerant matching
      const whitespaceNormalizedOriginal = normalizeWhitespace(normalizedOriginal);
      const whitespaceNormalizedOld = normalizeWhitespace(normalizedOldText);
      
      if (whitespaceNormalizedOriginal.includes(whitespaceNormalizedOld)) {
        console.log('  ✅ Found match with whitespace normalization, applying replacement');
        
        // Find the actual text in the original that corresponds to the whitespace-normalized match
        const originalMatch = findOriginalMatch(original, oldText);
        if (originalMatch) {
          console.log('  ✅ Found original match:', JSON.stringify(originalMatch));
          return original.replace(originalMatch, newText);
        }
      }
      
      // Strategy 4: Fuzzy line-by-line matching
      const fuzzyMatch = findFuzzyMatch(original, oldText);
      if (fuzzyMatch) {
        console.log('  ✅ Found fuzzy match, applying replacement');
        return original.replace(fuzzyMatch, newText);
      }
      
      console.warn('  ❌ Could not find text to replace with any strategy');
      console.log('  Original contains old text:', original.includes(oldText));
      console.log('  First 200 chars of original:', JSON.stringify(original.substring(0, 200)));
      console.log('  Looking for text:', JSON.stringify(oldText.substring(0, 100)));
    }
    
    // Fallback to diff-match-patch for more complex cases
    return applyDiffBlockFallback(original, diffText, new diff_match_patch());
  } catch (error) {
    console.error('Error applying diff block:', error);
    return original;
  }
}

/**
 * Normalize whitespace for better matching - collapse multiple spaces, normalize indentation
 */
function normalizeWhitespace(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim()) // Remove leading/trailing whitespace
    .filter(line => line.length > 0) // Remove empty lines
    .join('\n');
}

/**
 * Find the original text that matches the pattern, preserving original whitespace
 */
function findOriginalMatch(original: string, pattern: string): string | null {
  const originalLines = original.split('\n');
  const patternLines = pattern.split('\n').filter(line => line.trim().length > 0);
  
  if (patternLines.length === 0) return null;
  
  // Look for the pattern sequence in the original
  for (let i = 0; i <= originalLines.length - patternLines.length; i++) {
    let match = true;
    const matchedLines: string[] = [];
    
    let patternIndex = 0;
    for (let j = i; j < originalLines.length && patternIndex < patternLines.length; j++) {
      const originalLine = originalLines[j];
      const patternLine = patternLines[patternIndex];
      
      // Skip empty lines in original
      if (originalLine.trim().length === 0) {
        matchedLines.push(originalLine);
        continue;
      }
      
      // Check if content matches (ignoring whitespace differences)
      if (originalLine.trim() === patternLine.trim()) {
        matchedLines.push(originalLine);
        patternIndex++;
      } else {
        match = false;
        break;
      }
    }
    
    if (match && patternIndex === patternLines.length) {
      return matchedLines.join('\n');
    }
  }
  
  return null;
}

/**
 * Find a fuzzy match by looking for similar content with different whitespace
 */
function findFuzzyMatch(original: string, pattern: string): string | null {
  const originalLines = original.split('\n');
  const patternLines = pattern.split('\n');
  
  // Try to find a sequence of lines that match the pattern content
  for (let startIdx = 0; startIdx <= originalLines.length - patternLines.length; startIdx++) {
    const candidateLines = originalLines.slice(startIdx, startIdx + patternLines.length);
    
    // Check if the content matches (ignoring whitespace)
    let matches = true;
    for (let i = 0; i < patternLines.length; i++) {
      const originalContent = candidateLines[i]?.trim() || '';
      const patternContent = patternLines[i]?.trim() || '';
      
      if (originalContent !== patternContent) {
        matches = false;
        break;
      }
    }
    
    if (matches) {
      return candidateLines.join('\n');
    }
  }
  
  return null;
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
  // Normalize line endings in the original content to avoid Windows/Unix line ending issues
  const normalizedOriginal = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  const result = blocks.reduce((acc, block) => {
    // Also normalize line endings in the diff block
    const normalizedBlock = block.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return applyDiffBlock(acc, normalizedBlock);
  }, normalizedOriginal);
  
  // Restore original line endings if the original had them
  if (original.includes('\r\n')) {
    return result.replace(/\n/g, '\r\n');
  } else if (original.includes('\r')) {
    return result.replace(/\n/g, '\r');
  }
  
  return result;
}

/* ------------------------------------------------------------------ *
 * Exports (keep same API surface used elsewhere)
 * ------------------------------------------------------------------ */
export { /* re-exported above */ };
