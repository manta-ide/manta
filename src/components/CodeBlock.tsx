import React, { useState } from 'react';
import Editor from '@monaco-editor/react';

// Simple syntax highlighting function
function highlightSyntax(code: string): string {
  return code
    // Keywords
    .replace(/\b(import|export|default|function|const|let|var|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|class|extends|super|new|this|typeof|instanceof|void|delete|in|of|with|yield|async|await|static|public|private|protected|interface|type|enum|namespace|module|require|from|as)\b/g, '<span class="text-blue-400">$1</span>')
    // Strings
    .replace(/(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g, '<span class="text-green-400">$1$2$1</span>')
    // Numbers
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-yellow-400">$1</span>')
    // Comments
    .replace(/(\/\/.*$)/gm, '<span class="text-zinc-500">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-zinc-500">$1</span>')
    // JSX/HTML tags
    .replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g, '<span class="text-purple-400">$1</span><span class="text-orange-400">$2</span><span class="text-purple-400">$3$4</span>')
    // CSS classes
    .replace(/(className|class)=["']([^"']+)["']/g, '<span class="text-blue-300">$1</span>=<span class="text-green-400">"$2"</span>')
    // Template literals
    .replace(/\$\{([^}]+)\}/g, '<span class="text-yellow-300">${$1}</span>')
    // Operators
    .replace(/([=!<>+\-*/%&|^~]+)/g, '<span class="text-pink-400">$1</span>')
    // Function calls
    .replace(/(\w+)\s*\(/g, '<span class="text-cyan-400">$1</span>(');
}

interface CodeBlockProps {
  code: string;
  language: string;
  theme?: 'vs-dark' | 'vs';
}

function PatchBlock({ code, filename }: { code: string; filename: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lines = code.split('\n').filter(line => line !== ''); // Remove empty lines
  
  // Extract just the filename from the path
  const displayName = filename.split('/').pop() || filename;
  
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
      <div 
        className="bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 px-4 py-2 flex items-center justify-between cursor-pointer hover:from-zinc-700/80 hover:to-zinc-600/80 transition-all duration-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400/80"></div>
          <span className="text-sm font-medium text-zinc-200">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-mono">{lines.length} changes</span>
          <svg 
            className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      
      {isExpanded && (
        <div 
          className="bg-zinc-900/95 font-mono text-xs max-h-80 overflow-auto custom-scrollbar"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(113, 113, 122, 0.4) transparent'
          }}
        >
          {lines.map((line, index) => {
            const isHunkHeader = line.startsWith('@@');
            const isAddition = line.startsWith('+') && !isHunkHeader;
            const isDeletion = line.startsWith('-') && !isHunkHeader;
            
            if (isHunkHeader) {
              // Parse hunk header and show line count changes
              const match = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
              if (match) {
                const [, oldStart, oldCount, newStart, newCount] = match;
                const deletedLines = parseInt(oldCount || '1');
                const addedLines = parseInt(newCount || '1');
                
                return (
                  <div key={index} className="px-4 py-1.5 bg-zinc-800/60 text-zinc-300 border-y border-zinc-700/30 flex items-center gap-2">
                    <span className="text-zinc-400 text-xs">@@</span>
                    <span className="text-red-400/80 text-xs">{oldStart}{oldCount ? ',' + oldCount : ''}</span>
                    <span className="text-zinc-500">→</span>
                    <span className="text-emerald-400/80 text-xs">{newStart}{newCount ? ',' + newCount : ''}</span>
                    <span className="text-zinc-400 text-xs">@@</span>
                    <div className="flex items-center gap-1 ml-auto">
                      {deletedLines > 0 && (
                        <span className="text-red-400/70 text-xs bg-red-500/10 px-1.5 py-0.5 rounded">
                          -{deletedLines}
                        </span>
                      )}
                      {addedLines > 0 && (
                        <span className="text-emerald-400/70 text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          +{addedLines}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }
            }
            
            // Remove the +/- symbols from the beginning of lines
            const cleanLine = isAddition || isDeletion ? line.substring(1) : line;
            
            // Simple syntax highlighting
            const highlightedLine = highlightSyntax(cleanLine);
            
            return (
              <div
                key={index}
                className={`px-4 py-0.5 leading-5 ${
                  isAddition
                    ? 'bg-emerald-500/10 border-l-2 border-emerald-400/40 text-emerald-200/90'
                    : isDeletion
                    ? 'bg-red-500/10 border-l-2 border-red-400/40 text-red-200/90'
                    : 'text-zinc-300/80 hover:bg-zinc-800/30'
                } transition-colors duration-150`}
              >
                <span className="whitespace-pre font-mono text-xs" dangerouslySetInnerHTML={{ __html: highlightedLine }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CodeBlock({ code, language, theme = 'vs-dark' }: CodeBlockProps) {
  // Handle patch blocks specially - check multiple conditions to ensure detection
  const isPatchBlock = language && (
    language.startsWith('patch:') || 
    (language.toLowerCase().includes('patch') && code.includes('@@'))
  );
  
  if (isPatchBlock) {
    const filename = language.includes(':') ? language.split(':')[1] || 'file' : 'file';
    return <PatchBlock code={code} filename={filename} />;
  }

  // Calculate height based on number of lines
  const lineCount = code.split('\n').length;
  const lineHeight = 18; // Approximate line height in pixels
  const minHeight = 40; // Minimum height
  const maxHeight = 400; // Maximum height to prevent overly tall blocks
  const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, lineCount * lineHeight + 20));

  // Create a better display name for the header
  const getDisplayLanguage = (lang: string): string => {
    if (lang.startsWith('patch:')) {
      return `patch: ${lang.split(':')[1] || 'file'}`;
    }
    return lang;
  };

  return (
    <div className="my-2 rounded-md overflow-hidden border border-zinc-700 bg-zinc-900">
      <div className="bg-zinc-800 px-3 py-1 text-xs font-mono text-zinc-300 border-b border-zinc-700">
        {getDisplayLanguage(language)}
      </div>
      <div style={{ height: `${calculatedHeight}px` }}>
        <Editor
          value={code}
          language={getMonacoLanguage(language)}
          theme={theme}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off', // Disable word wrap for horizontal scrolling
            automaticLayout: true,
            fontSize: 12,
            lineNumbers: 'on',
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
            renderLineHighlight: 'none',
            scrollbar: {
              vertical: lineCount > 20 ? 'auto' : 'hidden',
              horizontal: 'auto', // Always show horizontal scrollbar when needed
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            renderWhitespace: 'none',
            contextmenu: false,
            selectOnLineNumbers: false,
            cursorStyle: 'line',
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
}

function getMonacoLanguage(lang: string): string {
  const languageMap: Record<string, string> = {
    'tsx': 'typescript',
    'jsx': 'javascript',
    'js': 'javascript',
    'ts': 'typescript',
    'css': 'css',
    'html': 'html',
    'json': 'json',
    'md': 'markdown',
    'markdown': 'markdown',
    'diff': 'diff',
    'patch': 'plaintext', // patch blocks are handled specially
    'bash': 'shell',
    'sh': 'shell',
    'shell': 'shell',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'react': 'javascript', // React components
    'vue': 'html',
    'svelte': 'html',
    'python': 'python',
    'py': 'python',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'csharp': 'csharp',
    'cs': 'csharp',
    'php': 'php',
    'ruby': 'ruby',
    'rb': 'ruby',
    'go': 'go',
    'rust': 'rust',
    'rs': 'rust',
    'sql': 'sql',
  };

  // Handle language identifiers that might have colons (like patch:filename)
  const cleanLang = lang.split(':')[0].toLowerCase();
  return languageMap[cleanLang] || 'plaintext';
}

interface MessageRendererProps {
  content: string;
  theme?: 'vs-dark' | 'vs';
}

export function MessageRenderer({ content, theme = 'vs-dark' }: MessageRendererProps) {
  // Parse the content for code blocks
  const parseContent = () => {
    const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
    // Updated regex to handle both standard format (```lang\n) and patch format (```patch:filename)
    // This regex captures the language identifier properly
    const codeBlockRegex = /```([^\n\r`]*)\r?\n?([\s\S]*?)```/g;
    
    let lastIndex = 0;
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textContent = content.slice(lastIndex, match.index).trim();
        if (textContent) {
          parts.push({ type: 'text', content: textContent });
        }
      }
      
      // Extract language from the match (keep original format)
      const language = match[1]?.trim() || 'plaintext';
      const code = match[2].trim();
      
      if (code) {
        parts.push({ type: 'code', content: code, language });
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      const textContent = content.slice(lastIndex).trim();
      if (textContent) {
        parts.push({ type: 'text', content: textContent });
      }
    }
    
    // If no code blocks found, return the entire content as text
    if (parts.length === 0) {
      parts.push({ type: 'text', content: content });
    }
    
    return parts;
  };

  const parts = parseContent();

  return (
    <div>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {part.type === 'text' ? (
            <div className="whitespace-pre-wrap">{part.content}</div>
          ) : (
            <CodeBlock 
              code={part.content} 
              language={part.language || 'plaintext'}
              theme={theme}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
} 