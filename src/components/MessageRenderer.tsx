import React from 'react';
import Editor from '@monaco-editor/react';

interface CodeBlockProps {
  code: string;
  language: string;
  theme?: 'vs-dark' | 'vs';
}

export function CodeBlock({ code, language, theme = 'vs-dark' }: CodeBlockProps) {
  // Calculate height based on number of lines
  const lineCount = code.split('\n').length;
  const lineHeight = 18; // Approximate line height in pixels
  const minHeight = 40; // Minimum height
  const maxHeight = 400; // Maximum height to prevent overly tall blocks
  const calculatedHeight = Math.max(minHeight, Math.min(maxHeight, lineCount * lineHeight + 20));

  return (
    <div className="my-2 rounded-md overflow-hidden border border-zinc-700 bg-zinc-900">
      <div className="bg-zinc-800 px-3 py-1 text-xs font-mono text-zinc-300 border-b border-zinc-700">
        {language}
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
    'bash': 'shell',
    'sh': 'shell',
    'shell': 'shell',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'react': 'javascript',
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

  const cleanLang = lang.toLowerCase();
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