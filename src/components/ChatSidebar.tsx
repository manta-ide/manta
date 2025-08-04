'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { Send, Brain, Square, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useProjectStore } from '@/lib/store';
import SelectionBadges from './SelectionBadge';
import { MessageBadges } from './SelectionBadge';
import { useChatService } from '@/lib/chatStreamingService';
import { updateAutoScrollState } from '@/lib/chatAnimationUtils';
import { MessageRenderer } from './CodeBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ThinkingIndicator() {
  return (
    <div className="w-full">
      <div className="whitespace-pre-wrap break-words p-3 rounded-lg w-full text-sm bg-zinc-800 text-zinc-200">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-zinc-400 animate-pulse" style={{ animationDuration: '1.5s' }} />
          <div className="text-sm text-zinc-300 font-medium">
            <span className="inline-block animate-pulse" style={{ animationDelay: '0ms', animationDuration: '0.8s' }}>t</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '80ms', animationDuration: '0.8s' }}>h</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '160ms', animationDuration: '0.8s' }}>i</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '240ms', animationDuration: '0.8s' }}>n</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '320ms', animationDuration: '0.8s' }}>k</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '400ms', animationDuration: '0.8s' }}>i</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '480ms', animationDuration: '0.8s' }}>n</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '560ms', animationDuration: '0.8s' }}>g</span>
            <span className="inline-block animate-pulse ml-1" style={{ animationDelay: '640ms', animationDuration: '0.8s' }}>.</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '720ms', animationDuration: '0.8s' }}>.</span>
            <span className="inline-block animate-pulse" style={{ animationDelay: '800ms', animationDuration: '0.8s' }}>.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatSidebar() {
  const { currentFile, selection, setSelection, setCurrentFile } = useProjectStore();
  const [input, setInput] = useState('');

  // scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use chat service for all chat logic
  const { state, actions, setUseGraphGeneration, streamIdxRef, streamingState } = useChatService(scrollRef);
  const { messages, loading, activelyReceiving, useGraphGeneration } = state;
  const { sendMessage, stopStream } = actions;

  // Set up scroll event listener to track auto-scroll state
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      // Always update auto-scroll state based on user's scroll position
      // This allows users to scroll up during streaming to disable auto-scroll
      updateAutoScrollState(scrollRef, streamingState);
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [scrollRef, streamingState]);

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
    await sendMessage(messageToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-96 flex flex-col h-full bg-zinc-900 border-l border-zinc-700">
      {/* scroll container ref */}
      <div 
        className="flex-1 overflow-y-auto p-3 chat-scrollbar" 
        ref={scrollRef}
      >
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className="w-full">
              <div
                className={`rounded-lg w-full text-sm ${
                  m.role === 'user'
                    ? 'p-3 bg-zinc-800 text-zinc-200'
                    : 'px-3 bg-zinc-900 text-zinc-200'
                }`}
              >
                {/* Display badges for context */}
                <MessageBadges
                  currentFile={m.messageContext?.currentFile}
                  selection={m.messageContext?.selection}
                  variant={m.role === 'user' ? 'light' : 'dark'}
                />
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {m.content || ''}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          
          {/* Show animated thinking indicator when loading and no stream started */}
          {loading && streamIdxRef.current === null && <ThinkingIndicator />}
          
          {/* Show thinking indicator during waiting periods between stream events */}
          {loading && streamIdxRef.current !== null && !activelyReceiving && <ThinkingIndicator />}
        </div>
      </div>
      
      <div className="p-3 border-t border-zinc-700">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Show current selection badges above input for context */}
          <SelectionBadges
            currentFile={currentFile}
            selection={selection}
            onRemoveFile={() => setCurrentFile(null)}
            onRemoveSelection={() => setSelection(null)}
          />
          
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to help with your project..."
              className="flex-1 resize-none text-sm field-sizing-content max-h-29.5 min-h-0 py-1.75 bg-zinc-800 border-zinc-600 text-white placeholder-zinc-400"
            />
          </div>
          
          {/* Graph generation toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Network className="h-4 w-4 text-zinc-400" />
              <Label htmlFor="graph-mode" className="text-xs text-zinc-400">
                Use Graph Generation
              </Label>
            </div>
            <Switch
              id="graph-mode"
              checked={useGraphGeneration}
              onCheckedChange={setUseGraphGeneration}
              className="data-[state=checked]:bg-zinc-600"
            />
          </div>
          
          <div className="flex gap-2 items-end">
            {loading ? (
              <Button 
                type="button" 
                size="icon" 
                onClick={stopStream}
                className="shrink-0 bg-zinc-700 hover:bg-zinc-600"
                title="Stop generation"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                type="submit" 
                size="icon" 
                disabled={!input.trim()}
                className="shrink-0 bg-zinc-700 hover:bg-zinc-600"
                title="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
