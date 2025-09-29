'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Send, Trash2, Move, Minimize2, MessageCircle, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/lib/store';
import SelectionBadges from './SelectionBadge';
import { MessageBadges } from './SelectionBadge';
import { useChatService } from '@/lib/chatService';
import { MessageRenderer } from './MessageRenderer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore - remark-breaks doesn't have type definitions
import remarkBreaks from 'remark-breaks';
import { ShimmeringText } from '@/components/ui/shadcn-io/shimmering-text';

interface Position {
  x: number;
  y: number;
}

export default function FloatingChat() {
  const { currentFile, selection, selectedNodeId, selectedNode, selectedNodeIds, graph, setSelectedNode, setSelectedNodeIds } = useProjectStore();
  const [input, setInput] = useState('');
  const [clearing, setClearing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [typedTick, setTypedTick] = useState(0);
  const [positionInitialized, setPositionInitialized] = useState(false);
  // Mention state (single mention at a time)
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionedNodeId, setMentionedNodeId] = useState<string | null>(null);
  const textareaDomId = 'floating-chat-input';
  
  // Local state to track what context should be included in the next message
  const [includeFile, setIncludeFile] = useState(false);
  const [includeSelection, setIncludeSelection] = useState(false);
  const [includeNodes, setIncludeNodes] = useState(false);

  // Use simplified chat service
  const { state, actions } = useChatService();
  const { messages, loading, loadingHistory } = state;
  const { sendMessage, clearMessages } = actions;

  // No longer using job system - simplified logic

  // Reset context flags when actual selections change
  useEffect(() => {
    if (currentFile) setIncludeFile(true);
  }, [currentFile]);

  useEffect(() => {
    if (selection) setIncludeSelection(true);
  }, [selection]);

  useEffect(() => {
    if (selectedNodeIds.length > 0) setIncludeNodes(true);
  }, [selectedNodeIds]);

  // Compute mention candidates when active
  const mentionCandidates = useMemo(() => {
    if (!mentionActive || !graph?.nodes) return [] as Array<{ id: string; title: string; prompt?: string }>;
    const q = mentionQuery.trim().toLowerCase();
    const list = graph.nodes
      .map(n => ({ id: n.id, title: String(n.title ?? n.id), prompt: (n as any).prompt }))
      .filter(n => !q || n.title.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    // Prioritize startsWith matches, then title length
    const starts = list.filter(n => n.title.toLowerCase().startsWith(q));
    const contains = list.filter(n => !n.title.toLowerCase().startsWith(q));
    const sorted = [...starts.sort((a,b)=>a.title.localeCompare(b.title)), ...contains.sort((a,b)=>a.title.localeCompare(b.title))];
    return sorted.slice(0, 8);
  }, [mentionActive, mentionQuery, graph]);

  // Get only the last 2 messages
  const lastTwoMessages = messages.slice(-2);

  // Get selected nodes from graph
  const selectedNodes = graph?.nodes?.filter(node => selectedNodeIds.includes(node.id)) || [];

  // Position near bottom-left of GraphView on first mount (robust to late mount)
  useEffect(() => {
    if (positionInitialized) return;

    let cancelled = false;

    const place = () => {
      try {
        const container = document.getElementById('graph-view-container');
        if (!container) return false;

        const rect = container.getBoundingClientRect();
        const margin = 16; // small inset from edges

        // Approximate chat box size for initial placement
        const approxWidth = 288; // ~w-72
        const approxHeight = 340; // allow taller messages area

        // Place near left-bottom area of the graph container
        let x = rect.left + margin;
        let y = rect.bottom - approxHeight - margin;

        // Ensure stays within viewport bounds
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        x = Math.max(-approxWidth + 50, Math.min(x, vw - 50));
        y = Math.max(-approxHeight + 50, Math.min(y, vh - 50));

        if (!cancelled) {
          setPosition({ x, y });
          setPositionInitialized(true);
        }
        return true;
      } catch {
        return false;
      }
    };

    // Try immediately, then poll briefly if the container isn't ready yet
    if (!place()) {
      let tries = 0;
      const maxTries = 40; // ~4s total
      const interval = setInterval(() => {
        if (cancelled) { clearInterval(interval); return; }
        if (place() || ++tries >= maxTries) {
          clearInterval(interval);
        }
      }, 100);
      return () => { cancelled = true; clearInterval(interval); };
    }

    return () => { cancelled = true; };
  }, [positionInitialized]);

  // Memoize markdown components to prevent re-rendering
  const markdownComponents = useMemo(() => ({
    // Custom components for markdown elements
    h1: ({ children }: any) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-base font-bold text-white mb-2">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-bold text-white mb-1">{children}</h3>,
    p: ({ children }: any) => <p className="text-zinc-200 mb-2 whitespace-pre-wrap">{children}</p>,
    // Use outside markers with padding to avoid numbering issues
    ul: ({ children }: any) => (
      <ul className="list-disc pl-4 text-zinc-200 mb-2 space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal pl-4 text-zinc-200 mb-2 space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => <li className="text-zinc-200 break-words">{children}</li>,
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
      return <code className="bg-zinc-800 text-zinc-200 px-1 py-0.5 rounded font-mono">{children}</code>;
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
    setIncludeNodes(false);
    setMentionedNodeId(null); // allow fresh mention for next message
    setMentionActive(false);

    await sendMessage(messageToSend, {
      includeFile,
      includeSelection,
      includeNodes
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
    // Start mention on '@' (allow starting even if a previous node was mentioned)
    if (e.key === '@' && !mentionActive) {
      // Start a mention token at the current caret position - the '@' will be inserted by the browser
      // Compute start as position before the '@' character
      const pos = (e.currentTarget.selectionStart ?? 0);
      setMentionActive(true);
      setMentionStart(pos);
      setMentionQuery('');
      setMentionIndex(0);
      return; // let it type '@'
    }

    if (mentionActive) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % Math.max(1, mentionCandidates.length || 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + Math.max(1, mentionCandidates.length || 1)) % Math.max(1, mentionCandidates.length || 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionActive(false);
        setMentionStart(null);
        setMentionQuery('');
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (mentionCandidates.length > 0) {
          e.preventDefault();
          const idx = Math.min(Math.max(0, mentionIndex), mentionCandidates.length - 1);
          const candidate = mentionCandidates[idx];
          handleSelectMention(candidate.id);
          return;
        }
        // fall through to submit if no candidates
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Track input changes to update mention query
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // If user removed previous mention token, allow a new one
    if (mentionedNodeId) {
      const node = graph?.nodes?.find(n => n.id === mentionedNodeId);
      const title = node ? String((node as any).title ?? node.id) : '';
      const tokenPresent = title ? val.includes(`@${title}`) : false;
      if (!tokenPresent) {
        setMentionedNodeId(null);
      }
    }
    if (mentionActive && mentionStart !== null) {
      const caret = e.target.selectionStart ?? val.length;
      // If caret moved before mention start, cancel
      if (caret < mentionStart) {
        setMentionActive(false);
        setMentionStart(null);
        setMentionQuery('');
        return;
      }
      // Extract typed query from after '@' up to caret
      const q = val.slice(mentionStart + 1, caret);
      setMentionQuery(q);
      setMentionIndex(0);
    }
  };

  // Replace the mention token with selected node title, update store selection
  const handleSelectMention = (nodeId: string) => {
    const node = graph?.nodes?.find(n => n.id === nodeId);
    if (!node) return;

    // Enforce single selection globally
    setSelectedNode(node.id, node as any);
    setSelectedNodeIds([node.id]);
    setIncludeNodes(true);
    setMentionedNodeId(node.id);

    const el = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
    const val = input;
    const caret = el?.selectionStart ?? val.length;
    const start = Math.min(mentionStart ?? 0, val.length);
    const end = Math.min(caret, val.length);
    const mentionText = `@${String((node as any).title ?? node.id)} `;
    const next = val.slice(0, start) + mentionText + val.slice(end);
    setInput(next);

    // Close mention UI
    setMentionActive(false);
    setMentionStart(null);
    setMentionQuery('');
    setMentionIndex(0);

    // Restore caret just after inserted mention
    requestAnimationFrame(() => {
      const el2 = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
      if (el2) {
        const pos = start + mentionText.length;
        el2.focus();
        el2.setSelectionRange(pos, pos);
      }
    });
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
       className="fixed w-72 bg-zinc-900 border border-zinc-600 rounded-md shadow-2xl"
       style={{ 
         left: position.x, 
         top: position.y,
         zIndex: isDragging ? 9999 : 50 
       }}
     >
       {/* Header */}
       <div 
         className={`flex items-center justify-between px-2.5 py-2 border-b border-zinc-700 bg-zinc-800 rounded-t-md ${isDragging ? 'cursor-grabbing' : 'cursor-move'}`}
         onMouseDown={handleMouseDown}
       >
        <div className="flex items-center gap-1.5">
          <Move className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-medium text-white">AI Chat</span>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 h-5 w-5 p-0"
              title="Clear conversation"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(true)}
            className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 h-5 w-5 p-0"
            title="Minimize"
          >
            <Minimize2 className="h-2.5 w-2.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="max-h-[60vh] overflow-y-auto p-3 pb-2 space-y-2">
        {loadingHistory && messages.length > 0 && (
          <div className="w-full">
            <div className="rounded-lg w-full text-xs px-2 bg-zinc-900 text-zinc-200">
              <ShimmeringText
                text="Loading chat history..."
                duration={0.8}
                wave={true}
                color="var(--color-zinc-400)"
                shimmeringColor="#FFFFFF"
                className="text-sm"
              />
            </div>
          </div>
        )}
        {!loadingHistory && lastTwoMessages.length === 0 && loading && (
          <div className="w-full">
            <div className="rounded-lg w-full text-xs px-2 bg-zinc-900 text-zinc-200">
              <ShimmeringText
                text="Thinking..."
                duration={1.0}
                wave={true}
                transition={{ repeatDelay: 0 }}
                color="hsla(var(--color-zinc-500))" /* zinc-500 */
                shimmeringColor="hsla(var(--color-white))" /* white */
              />
            </div>
          </div>
        )}
        {!loadingHistory && lastTwoMessages.map((m, idx) => {
          const isStreamingAssistant = m.role === 'assistant' && loading && idx === lastTwoMessages.length - 1;
          const isJobStatusMessage = false; // No longer using job system
          const hasStreaming = (m as any)?.variables?.HAD_STREAMING === '1';
          const isStreamComplete = (m as any)?.variables?.STREAM_COMPLETE === '1';

          // For streaming responses, don't use typing animation - show content directly
          const typedCacheRef = (FloatingChat as any)._typedCache || ((FloatingChat as any)._typedCache = new Set<string>());
          // Consider only fenced code blocks as risky for typing animation.
          // Lists, headings, and quotes are fine to animate as a full chunk.
          const hasCodeFence = !!m.content && /```|~~~/.test(m.content);
          const shouldTypeFinal = (
            m.role === 'assistant' &&
            !loading &&
            idx === lastTwoMessages.length - 1 &&
            !!m.content &&
            !typedCacheRef.has(m.content) &&
            !hasCodeFence &&
            m.content.length < 1500 &&
            // Do not animate if we already revealed streaming chunks or if it's streaming
            !hasStreaming &&
            !isStreamComplete &&
            // Don't animate job status messages
            !isJobStatusMessage
          );

          function AnimatedTyping({ text, onDone, speed = 1 }: { text: string; onDone?: () => void; speed?: number }) {
            const [shown, setShown] = useState('');
            const raf = useRef<number | null>(null);
            const idxRef = useRef(0);
            useEffect(() => {
              idxRef.current = 0;
              setShown('');
              // Base typing speed (ms per character). Apply multiplier: higher speed => faster typing.
              const basePerChar = Math.max(8, Math.min(20, 1200 / Math.max(20, text.length)));
              const multiplier = Math.max(0.1, speed);
              const perChar = basePerChar / multiplier;
              let last = performance.now();
              const step = (now: number) => {
                const elapsed = now - last;
                const add = Math.floor(elapsed / perChar);
                if (add > 0) {
                  last += add * perChar;
                  idxRef.current = Math.min(text.length, idxRef.current + add);
                  setShown(text.slice(0, idxRef.current));
                }
                if (idxRef.current < text.length) {
                  raf.current = requestAnimationFrame(step);
                } else {
                  onDone?.();
                }
              };
              raf.current = requestAnimationFrame(step);
              return () => { if (raf.current) cancelAnimationFrame(raf.current); };
            }, [text, onDone, speed]);
            return (
                <div className="text-zinc-200">
                  <div className="md-ol-continue">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                      {shown}
                    </ReactMarkdown>
                  </div>
                </div>
            );
          }
          return (
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
                {isStreamingAssistant ? (
                  <div className="mb-2">
                    {m.content && m.content.trim().length > 0 ? (
                      <div className="md-ol-continue">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : isJobStatusMessage ? (
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-3 w-3 border border-zinc-400 border-t-transparent"></div>
                        <span className="text-zinc-300">Processing...</span>
                      </div>
                    ) : (
                      <ShimmeringText
                        text={'Thinking...'}
                        duration={1.0}
                        wave={false}
                        transition={{ repeatDelay: 0 }}
                        shimmeringColor="#FFFFFF" /* white */
                        color="#71717A" /* zinc-500 */
                      />
                    )}
                  </div>
                ) : hasStreaming ? (
                  // Streaming response - show content directly without animation
                  <div className="md-ol-continue">
                    {m.content && m.content.trim() ? (
                      <>
                        {console.log('🎨 FloatingChat: Rendering streaming content, length:', m.content.length, 'preview:', m.content.slice(0, 100) + '...')}
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={markdownComponents}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </>
                    ) : (
                      <>
                        {console.log('💭 FloatingChat: Showing thinking indicator')}
                        <ShimmeringText
                          text={'Thinking...'}
                          duration={1.0}
                          wave={false}
                          transition={{ repeatDelay: 0 }}
                          shimmeringColor="#FFFFFF" /* white */
                          color="#71717A" /* zinc-500 */
                        />
                      </>
                    )}
                  </div>
                ) : shouldTypeFinal ? (
                  <AnimatedTyping
                    text={m.content!}
                    onDone={() => { typedCacheRef.add(m.content!); setTypedTick((n) => n + 1); }}
                    // Speed multiplier: 1 = base speed, larger = faster
                    speed={1.5}
                  />
                ) : (
                  <div className="md-ol-continue">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={markdownComponents}
                    >
                      {m.content || ''}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className={`px-3 pb-3 ${messages.length > 0 ? 'pt-3 border-t border-zinc-700' : 'pt-0'}`}>
        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Show current selection badges above input for context */}
          <SelectionBadges
            currentFile={includeFile ? currentFile : null}
            selection={includeSelection ? selection : null}
            selectedNodeIds={includeNodes ? selectedNodeIds : []}
            selectedNodes={includeNodes ? selectedNodes : []}
            onRemoveFile={() => setIncludeFile(false)}
            onRemoveSelection={() => setIncludeSelection(false)}
            onRemoveNodes={() => { setIncludeNodes(false); setMentionedNodeId(null); }}
          />
          
          <div className="flex gap-2 items-end relative">
            <Textarea
              id={textareaDomId}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI... Use @ to target a node"
              disabled={false}
              className="flex-1 resize-none text-xs field-sizing-content max-h-20 min-h-0 py-1.5 bg-zinc-800 border-zinc-600 text-white placeholder-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {/* Mention dropdown */}
            {mentionActive && mentionCandidates.length > 0 && (
              <div className="absolute bottom-10 left-0 w-full max-w-[18rem] bg-zinc-900 border border-zinc-700 rounded-md shadow-xl overflow-hidden z-50">
                {mentionCandidates.map((n, i) => (
                  <button
                    type="button"
                    key={n.id}
                    onMouseDown={(ev) => { ev.preventDefault(); }}
                    onClick={() => handleSelectMention(n.id)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 hover:bg-zinc-800 ${i === mentionIndex ? 'bg-zinc-800' : ''}`}
                  >
                    <GitBranch className="w-3.5 h-3.5 text-zinc-300" />
                    <div className="flex flex-col">
                      <span className="text-xs text-white leading-tight">{n.title}</span>
                      <span className="text-[10px] text-zinc-400 leading-tight">{n.id}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || loading}
              className="shrink-0 bg-zinc-700 hover:bg-zinc-600 h-8 w-8 disabled:opacity-50"
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
