'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Send, Trash2, Move, Minimize2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/lib/store';
import SelectionBadges from './SelectionBadge';
import { MessageBadges } from './SelectionBadge';
import { useChatService } from '@/lib/chatService';
import { MessageRenderer } from './CodeBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ShimmeringText } from '@/components/ui/shadcn-io/shimmering-text';

interface Position {
  x: number;
  y: number;
}

export default function FloatingChat() {
  const { currentFile, selection, selectedNodeId } = useProjectStore();
  const [input, setInput] = useState('');
  const [clearing, setClearing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  
  // Local state to track what context should be included in the next message
  const [includeFile, setIncludeFile] = useState(true);
  const [includeSelection, setIncludeSelection] = useState(true);
  const [includeNode, setIncludeNode] = useState(true);

  // Use simplified chat service
  const { state, actions } = useChatService();
  const { messages, loading } = state;
  const { sendMessage, clearMessages } = actions;

  // Reset context flags when actual selections change
  useEffect(() => {
    if (currentFile) setIncludeFile(true);
  }, [currentFile]);

  useEffect(() => {
    if (selection) setIncludeSelection(true);
  }, [selection]);

  useEffect(() => {
    if (selectedNodeId) setIncludeNode(true);
  }, [selectedNodeId]);

  // Get only the last 2 messages
  const lastTwoMessages = messages.slice(-2);

  // Memoize markdown components to prevent re-rendering
  const markdownComponents = useMemo(() => ({
    // Custom components for markdown elements
    h1: ({ children }: any) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-base font-bold text-white mb-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-bold text-white mb-1">{children}</h3>,
    p: ({ children }: any) => <p className="text-zinc-200 mb-2">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc list-inside text-zinc-200 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside text-zinc-200 mb-2 space-y-1">{children}</ol>,
    li: ({ children }: any) => <li className="text-zinc-200">{children}</li>,
    strong: ({ children }: any) => <strong className="font-bold text-white">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-zinc-300">{children}</em>,
    code: ({ children, className }: any) => {
      // Check if this is a code block (has language)
      if (className && className.startsWith('language-')) {
        const language = className.replace('language-', '');
        return (
          <MessageRenderer 
            content={`\`\`\`${language}\n${children}\n\`\`\``} 
            theme="vs-dark"
          />
        );
      }
      // Inline code
      return <code className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
    },
    pre: ({ children }: any) => <div className="mb-2">{children}</div>,
    blockquote: ({ children }: any) => <blockquote className="border-l-4 border-zinc-600 pl-4 text-zinc-300 italic mb-2">{children}</blockquote>,
    a: ({ children, href }: any) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children }: any) => <table className="w-full border-collapse border border-zinc-600 mb-2">{children}</table>,
    th: ({ children }: any) => <th className="border border-zinc-600 px-2 py-1 text-left text-white bg-zinc-800">{children}</th>,
    td: ({ children }: any) => <td className="border border-zinc-600 px-2 py-1 text-zinc-200">{children}</td>,
    tr: ({ children }: any) => <tr className="border border-zinc-600">{children}</tr>,
  }), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const messageToSend = input;
    setInput(''); // Clear input immediately

    // Clear context flags after sending
    setIncludeFile(false);
    setIncludeSelection(false);
    setIncludeNode(false);

    await sendMessage(messageToSend, {
      includeFile,
      includeSelection,
      includeNode
    });
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearMessages();
    } finally {
      setClearing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('button, textarea, input')) {
      return; // Don't start dragging if clicking on interactive elements
    }
    
    // Prevent text selection during drag
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    // Prevent default to avoid text selection
    e.preventDefault();
    
    // Mark that we've dragged
    setHasDragged(true);
    
    // Calculate new position
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Get window dimensions
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Constrain to window boundaries (keep at least 50px visible)
    const constrainedX = Math.max(-320 + 50, Math.min(newX, windowWidth - 50));
    const constrainedY = Math.max(-400 + 50, Math.min(newY, windowHeight - 50));
    
    setPosition({
      x: constrainedX,
      y: constrainedY
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    e.preventDefault();
    setIsDragging(false);
    
    // Reset hasDragged after a short delay to allow click handler to check it
    setTimeout(() => {
      setHasDragged(false);
    }, 100);
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      // Add event listeners to window to catch events even when cursor leaves the element
      const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
      const handleGlobalMouseUp = (e: MouseEvent) => handleMouseUp(e);
      
      // Use both window and document to ensure we catch all events
      window.addEventListener('mousemove', handleGlobalMouseMove, { passive: false, capture: true });
      window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });
      document.addEventListener('mousemove', handleGlobalMouseMove, { passive: false, capture: true });
      document.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });
      
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      
      // Also prevent iframe from capturing mouse events during drag
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        iframe.style.pointerEvents = 'none';
      });
      
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true });
        window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true });
        document.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true });
        document.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true });
        
        // Restore text selection
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        // Restore iframe pointer events
        iframes.forEach(iframe => {
          iframe.style.pointerEvents = '';
        });
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

        // If minimized, show just a small floating button
   if (isMinimized) {
     return (
       <div
         className="fixed cursor-pointer"
         style={{ 
           left: position.x, 
           top: position.y,
           zIndex: isDragging ? 9999 : 50
         }}
         onMouseDown={handleMouseDown}
                   onClick={() => {
            // Only expand if not dragging and haven't just dragged
            if (!isDragging && !hasDragged) {
              setIsMinimized(false);
            }
          }}
       >
        <div className={`bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg p-2 shadow-lg ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}>
          <div className="w-8 h-8 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          {messages.length > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {messages.length}
            </div>
          )}
        </div>
      </div>
     );
   }

     return (
     <div
       className="fixed w-80 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl"
       style={{ 
         left: position.x, 
         top: position.y,
         zIndex: isDragging ? 9999 : 50 
       }}
     >
       {/* Header */}
       <div 
         className={`flex items-center justify-between p-3 border-b border-zinc-700 bg-zinc-800 rounded-t-lg ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
         onMouseDown={handleMouseDown}
       >
        <div className="flex items-center gap-2">
          <Move className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-white">AI Chat</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 h-6 w-6 p-0"
              title="Clear conversation"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(true)}
            className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 h-6 w-6 p-0"
            title="Minimize"
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="max-h-64 overflow-y-auto p-3 pb-0 space-y-2">
        {lastTwoMessages.length === 0 && loading && (
          <div className="w-full">
            <div className="rounded-lg w-full text-xs px-2 bg-zinc-900 text-zinc-200">
              <ShimmeringText
                text="Processing your request..."
                duration={0.8}
                wave={true}
                color="var(--color-zinc-400)"
                shimmeringColor="var(--color-zinc-200)"
                className="text-sm"
              />
            </div>
          </div>
        )}
        {lastTwoMessages.map((m, idx) => (
          <div key={idx} className="w-full">
            <div
              className={`rounded-lg w-full text-xs ${
                m.role === 'user'
                  ? 'p-2 bg-zinc-800 text-zinc-200'
                  : 'px-2 bg-zinc-900 text-zinc-200'
              }`}
            >
              {/* Display badges for context only for actual messages */}
              {m.content && (
                <MessageBadges
                  currentFile={m.messageContext?.currentFile}
                  selection={m.messageContext?.selection}
                  selectedNodeId={m.variables?.SELECTED_NODE_ID}
                  selectedNode={m.variables?.SELECTED_NODE_TITLE ? { title: m.variables.SELECTED_NODE_TITLE } : null}
                  variant={m.role === 'user' ? 'light' : 'dark'}
                />
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {m.content || ''}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className={`px-3 pb-3 pt-0 ${messages.length > 0 ? 'border-t border-zinc-700' : ''}`}>
        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Show current selection badges above input for context */}
          <SelectionBadges
            currentFile={includeFile ? currentFile : null}
            selection={includeSelection ? selection : null}
            selectedNodeId={includeNode ? selectedNodeId : null}
            selectedNode={includeNode ? { title: 'Selected Node' } : null}
            onRemoveFile={() => setIncludeFile(false)}
            onRemoveSelection={() => setIncludeSelection(false)}
            onRemoveNode={() => setIncludeNode(false)}
          />
          
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI..."
              className="flex-1 resize-none text-xs field-sizing-content max-h-20 min-h-0 py-1.5 bg-zinc-800 border-zinc-600 text-white placeholder-zinc-400"
            />
            <Button 
              type="submit" 
              size="icon" 
              disabled={!input.trim() || loading}
              className="shrink-0 bg-zinc-700 hover:bg-zinc-600 h-8 w-8"
              title="Send message"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
