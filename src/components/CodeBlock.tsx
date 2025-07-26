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

function DeleteBlock({ code, filename, isLoading }: { code: string; filename: string; isLoading: boolean }) {
  const displayName = filename.split('/').pop() || filename;
  
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
      <div className="bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 px-4 py-2 flex items-center justify-between hover:from-zinc-700/80 hover:to-zinc-600/80 transition-all duration-200">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-400/80"></div>
          <span className="text-sm font-medium text-zinc-200">{displayName}</span>
          {isLoading ? (
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.5s' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms', animationDuration: '1.5s' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '600ms', animationDuration: '1.5s' }}></div>
            </div>
          ) : (
            <span className="text-red-400/70 text-xs bg-red-500/10 px-1.5 py-0.5 rounded">deleted</span>
          )}
        </div>
      </div>
      {!isLoading && (
        <div className="bg-zinc-900/95 px-4 py-3 text-sm text-zinc-300">
          <div className="flex items-center gap-2 text-red-300">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>File has been deleted from the project</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FileOperationBlock({ code, filename, operation, isLoading, theme }: { 
  code: string; filename: string; operation: string; isLoading: boolean; theme: 'vs-dark' | 'vs'; 
}) {
  const displayName = filename.split('/').pop() || filename;
  const isCreate = operation === 'create';
  
  if (isLoading) {
    return (
      <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
        <div className="bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 px-4 py-2 flex items-center justify-between hover:from-zinc-700/80 hover:to-zinc-600/80 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isCreate ? 'bg-emerald-400/80' : 'bg-blue-400/80'}`}></div>
            <span className="text-sm font-medium text-zinc-200">{displayName}</span>
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.5s' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms', animationDuration: '1.5s' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '600ms', animationDuration: '1.5s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate height based on number of lines for completed state
  const lineCount = code.split('\n').length;
  const lineHeight = 18;
  const minHeight = 40;
  const maxHeight = 400;
  const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, lineCount * lineHeight + 20));

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
      <div className="bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 px-4 py-2 flex items-center justify-between hover:from-zinc-700/80 hover:to-zinc-600/80 transition-all duration-200">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isCreate ? 'bg-emerald-400/80' : 'bg-blue-400/80'}`}></div>
          <span className="text-sm font-medium text-zinc-200">{displayName}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            isCreate 
              ? 'text-emerald-400/70 bg-emerald-500/10' 
              : 'text-blue-400/70 bg-blue-500/10'
          }`}>
            {isCreate ? 'new' : 'updated'}
          </span>
        </div>
      </div>
      <div style={{ height: `${calculatedHeight}px` }}>
        <Editor
          value={code}
          language={getMonacoLanguage(filename.split('.').pop() || 'txt')}
          theme={theme}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
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
              horizontal: 'auto',
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

function PatchBlock({ code, filename, isLoading }: { code: string; filename: string; isLoading?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const lines = code.split('\n').filter(line => line !== ''); // Remove empty lines
  
  // Extract just the filename from the path
  const displayName = filename.split('/').pop() || filename;
  
  if (isLoading) {
    return (
      <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
        <div className="bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 px-4 py-2 flex items-center justify-between transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400/80"></div>
            <span className="text-sm font-medium text-zinc-200">{displayName}</span>
            <div className="flex items-center gap-1">
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.5s' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms', animationDuration: '1.5s' }}></div>
              <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '600ms', animationDuration: '1.5s' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
      <div 
        className="bg-gradient-to-r from-zinc-800/80 to-zinc-700/80 px-4 py-2 flex items-center justify-between cursor-pointer hover:from-zinc-700/80 hover:to-zinc-600/80 transition-all duration-200"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400/80"></div>
          <span className="text-sm font-medium text-zinc-200">{displayName}</span>
          {(() => {
            // Calculate total additions and deletions from the patch
            let totalAdditions = 0;
            let totalDeletions = 0;
            
            lines.forEach(line => {
              if (line.startsWith('+') && !line.startsWith('@@')) {
                totalAdditions++;
              } else if (line.startsWith('-') && !line.startsWith('@@')) {
                totalDeletions++;
              }
            });
            
            return (
              <div className="flex items-center gap-1">
                {totalDeletions > 0 && (
                  <span className="text-red-400/70 text-xs bg-red-500/10 px-1.5 py-0.5 rounded">
                    -{totalDeletions}
                  </span>
                )}
                {totalAdditions > 0 && (
                  <span className="text-emerald-400/70 text-xs bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    +{totalAdditions}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
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
                  <div key={index} className="px-4 py-1.5 bg-zinc-800/60 text-zinc-300 border-y border-zinc-700/30">
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

function ToolStatusBlock({ code, language }: { code: string; language: string }) {
  const parts = language.split(':');
  const toolName = parts[1] || 'tool';
  const status = parts[2] || 'calling';
  
  const isCompleted = status === 'completed';
  const icon = isCompleted ? '✅' : '🔧';
  const statusText = isCompleted ? `${toolName} completed` : `Calling ${toolName}`;
  
  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800/50 bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 shadow-sm">
      <div className={`px-4 py-2 flex items-center gap-3 transition-all duration-200 ${
        isCompleted 
          ? 'bg-gradient-to-r from-emerald-800/80 to-emerald-700/80 hover:from-emerald-700/80 hover:to-emerald-600/80' 
          : 'bg-gradient-to-r from-blue-800/80 to-blue-700/80 hover:from-blue-700/80 hover:to-blue-600/80'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          isCompleted ? 'bg-emerald-400/80' : 'bg-blue-400/80'
        }`}></div>
        <span className="text-base">{icon}</span>
        <span className="text-sm font-medium text-zinc-200">{statusText}</span>
        {!isCompleted ? (
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.5s' }}></div>
            <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '300ms', animationDuration: '1.5s' }}></div>
            <div className="w-1 h-1 bg-current rounded-full animate-pulse" style={{ animationDelay: '600ms', animationDuration: '1.5s' }}></div>
          </div>
        ) : (
          <div className="w-2 h-2 rounded-full bg-emerald-400/60 ml-auto"></div>
        )}
      </div>
    </div>
  );
}

export function CodeBlock({ code, language, theme = 'vs-dark' }: CodeBlockProps) {
  // Handle tool status blocks
  if (language && language.startsWith('tool-status:')) {
    return <ToolStatusBlock code={code} language={language} />;
  }

  // Handle file operations with calling/loading states
  if (language && (language.includes(':calling') || language.includes(':completed'))) {
    const parts = language.split(':');
    const operation = parts[0];
    const filename = parts[1] || 'file';
    const status = parts[2] || 'completed';
    
    const isLoading = status === 'calling';
    
    if (operation === 'delete') {
      return <DeleteBlock code={code} filename={filename} isLoading={isLoading} />;
    } else if (operation === 'create' || operation === 'update') {
      return <FileOperationBlock code={code} filename={filename} operation={operation} isLoading={isLoading} theme={theme} />;
    } else if (operation === 'patch') {
      return <PatchBlock code={code} filename={filename} isLoading={isLoading} />;
    }
  }

  // Handle file operations without status (for direct create/update/delete/patch blocks)
  if (language && (language.startsWith('create:') || language.startsWith('update:') || language.startsWith('delete:') || language.startsWith('patch:'))) {
    const parts = language.split(':');
    const operation = parts[0];
    const filename = parts[1] || 'file';
    
    if (operation === 'delete') {
      return <DeleteBlock code={code} filename={filename} isLoading={false} />;
    } else if (operation === 'create' || operation === 'update') {
      return <FileOperationBlock code={code} filename={filename} operation={operation} isLoading={false} theme={theme} />;
    } else if (operation === 'patch') {
      return <PatchBlock code={code} filename={filename} isLoading={false} />;
    }
  }

  // Handle patch blocks specially - check multiple conditions to ensure detection
  const isPatchBlock = language && (
    language.startsWith('patch:') || 
    (language.toLowerCase().includes('patch') && code.includes('@@'))
  );
  
  if (isPatchBlock) {
    const filename = language.includes(':') ? language.split(':')[1] || 'file' : 'file';
    return <PatchBlock code={code} filename={filename} isLoading={false} />;
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