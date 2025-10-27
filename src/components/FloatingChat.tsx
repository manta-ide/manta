'use client';

import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { Send, Trash2, Move, Minimize2, MessageCircle, GitBranch, Wand2 } from 'lucide-react';
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

const formatSlashUserRequest = (userText: string) => {
  const cleaned = userText.trim();
  if (!cleaned) {
    return 'No additional user request provided.';
  }
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
};

const SLASH_AGENT_MESSAGES: Record<string, (userText: string) => string> = {
  join: (userText) => `Join Command: Join several nodes based on user request, choose relevant properties and description, remove previous nodes, maintain connections and whether it is synced to base. Make sure that positions are in the middle of the previous nodes. Here is the user request: ${formatSlashUserRequest(userText)}`,
  split: (userText) => `Split Command: Split nodes based on user request, create focused nodes with the right properties and descriptions, preserve relevant connections, and reflect whether each node stays synced to base. Make sure that positions are around the position of the split node. Here is the user request: ${formatSlashUserRequest(userText)}`,
  index: (userText) => `Index Command: Index the solution. Here is the user request: ${formatSlashUserRequest(userText)}`,
  eval: (userText) => `Eval Command: Run evaluation scenario with parameters. Here is the user request: ${formatSlashUserRequest(userText)}`
};

export default function FloatingChat() {
  const { currentFile, selectedNodeId, selectedNode, selectedNodeIds, graph, setSelectedNode, setSelectedNodeIds } = useProjectStore();
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
  const [mentionedNodeIds, setMentionedNodeIds] = useState<string[]>([]);
  // Slash command state
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaDomId = 'floating-chat-input';
  const [pendingCaretPos, setPendingCaretPos] = useState<number | null>(null);
  
  // Local state to track what context should be included in the next message
  const [includeFile, setIncludeFile] = useState(false);
  const [includeNodes, setIncludeNodes] = useState(false);

  // Use simplified chat service
  const { state, actions } = useChatService();
  const { messages, loading, loadingHistory } = state;
  const { sendMessage, clearMessages } = actions;


  // No longer using job system - simplified logic

  // Reset context flags when actual selections change
  useLayoutEffect(() => {
    if (currentFile) setIncludeFile(true);
  }, [currentFile]);

  useLayoutEffect(() => {
    if (selectedNodeIds.length > 0) setIncludeNodes(true);
  }, [selectedNodeIds]);

  // Compute mention candidates when active
  const mentionCandidates = useMemo(() => {
    if (!mentionActive || !graph?.nodes) return [] as Array<{ id: string; title: string; prompt?: string }>;
    const q = mentionQuery.trim().toLowerCase();
    const list = graph.nodes
      .map(n => ({ id: n.id, title: String(n.title ?? n.id), description: (n as any).description }))
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

  // Helper to find which mention contains the current caret position
  const getMentionAtCaret = (caretPos: number, inputValue: string) => {
    // Check all positions where any mention token appears
    for (const nodeId of mentionedNodeIds) {
      const node = graph?.nodes?.find(n => n.id === nodeId);
      const rawTitle = node ? String((node as any).title ?? node.id) : '';
      if (rawTitle) {
        const token = '@' + rawTitle.replace(/\s+/g, '\u00A0');
        let start = 0;
        let index = inputValue.indexOf(token, start);
        while (index !== -1) {
          const end = index + token.length;
          if (caretPos >= index && caretPos <= end) {
            return { nodeId, start: index, end, token };
          }
          start = index + 1;
          index = inputValue.indexOf(token, start);
        }
      }
    }
    return null;
  };

  // Overlay/textarea refs to keep visual pill overlay aligned with scroll
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syncOverlayScroll = useCallback(() => {
    const st = textareaRef.current?.scrollTop ?? 0;
    if (overlayRef.current) {
      overlayRef.current.style.transform = `translateY(-${st}px)`;
    }
  }, []);

  // Build overlay HTML to visually render mentions as pill tags
  const overlayHtml = useMemo(() => {
    const escape = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    let html = escape(input || '');
    // Style all @Title tokens that match mentioned nodes
    if (graph?.nodes && mentionedNodeIds.length > 0) {
      mentionedNodeIds.forEach(nodeId => {
        const node = graph.nodes.find(n => n.id === nodeId);
        const rawTitle = node ? String((node as any).title ?? node.id) : '';
        if (rawTitle) {
          const token = '@' + rawTitle.replace(/\s+/g, '\u00A0');
          const tokenEsc = escape(token);
          const pill = `<span style="display:inline;background:#3f3f46;color:transparent;border-radius:4px;padding:0 1px;">${escape(token)}</span>`;
          html = html.split(tokenEsc).join(pill);
        }
      });
    }
    return html;
  }, [input, mentionedNodeIds, graph]);

  useLayoutEffect(() => { syncOverlayScroll(); }, [input, syncOverlayScroll]);

  // Position near bottom-left of GraphView on first mount (robust to late mount)
  useLayoutEffect(() => {
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
    const rawInput = input;
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    const contextSnapshot = {
      includeFile,
      includeNodes
    };

    const resetAfterSend = () => {
      setIncludeFile(false);
      setIncludeNodes(false);
      setMentionedNodeIds([]);
      setMentionActive(false);
    };

    if (trimmed.startsWith('/')) {
      const commandMatch = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
      if (commandMatch) {
        const commandId = commandMatch[1].toLowerCase();
        const commandText = (commandMatch[2] ?? '').trim();
        setInput('');

        if (commandId === 'beautify') {
          resetAfterSend();
          try {
            window.dispatchEvent(new CustomEvent('manta:auto-layout'));
          } catch {}
          return;
        }

        const commandTemplate = SLASH_AGENT_MESSAGES[commandId as keyof typeof SLASH_AGENT_MESSAGES];
        if (commandTemplate) {
          resetAfterSend();
          let agentMessage = commandTemplate(commandText);

          if (commandId === 'join' && selectedNodes.length >= 2) {
            const selectedSummary = selectedNodes
              .map(node => {
                const title = String(node?.title ?? node?.id ?? '').trim() || node.id;
                return `${title} (ID: ${node?.id ?? 'unknown'})`;
              })
              .join('; ');
            agentMessage += `

Selected nodes to join (${selectedNodes.length}): ${selectedSummary}.`;
          } else if (commandId === 'split' && selectedNodes.length >= 1) {
            const primaryNode = selectedNodes[0];
            const title = String(primaryNode?.title ?? primaryNode?.id ?? '').trim() || primaryNode.id;
            agentMessage += `

Selected node to split: ${title} (ID: ${primaryNode?.id ?? 'unknown'}).`;
            if (selectedNodes.length > 1) {
              const additional = selectedNodes.slice(1)
                .map(node => {
                  const extraTitle = String(node?.title ?? node?.id ?? '').trim() || node.id;
                  return `${extraTitle} (ID: ${node?.id ?? 'unknown'})`;
                })
                .join('; ');
              agentMessage += ` Additional selected nodes detected: ${additional}.`;
            }
          }

          await sendMessage(agentMessage, {
            ...contextSnapshot,
            displayContent: trimmed
          });
          return;
        }
      }
    }

    // If the user mentioned nodes (via @), append an ID-based summary
    // to the agent-facing content so the agent can reference by IDs
    // rather than searching by title.
    let agentForwardContent = rawInput;
    if (mentionedNodeIds.length > 0 && graph?.nodes) {
      const mentionedSummary = mentionedNodeIds
        .map(id => {
          const node = graph.nodes.find(n => n.id === id);
          const title = String(node?.title ?? id).trim() || id;
          return `${title} (ID: ${id})`;
        })
        .join('; ');
      agentForwardContent += `\n\nMentioned nodes (${mentionedNodeIds.length}): ${mentionedSummary}.`;
    }

    setInput('');
    resetAfterSend();

          await sendMessage(agentForwardContent, {
            includeFile: contextSnapshot.includeFile,
            includeNodes: contextSnapshot.includeNodes,
            // Preserve the original text (with @tags) for UI display
            displayContent: rawInput
          });
  };

  // Supported slash commands
  const SLASH_COMMANDS = useMemo(() => ([
    { id: 'join', label: '/join', description: 'Merge nodes into one' },
    { id: 'split', label: '/split', description: 'Split a node into parts' },
    { id: 'index', label: '/index', description: 'Index the current solution' },
    { id: 'eval', label: '/eval', description: 'Run evaluation scenario' },
    { id: 'beautify', label: '/beautify', description: 'Auto layout nodes' },
  ]), []);

  const slashCandidates = useMemo(() => {
    if (!slashActive) return [] as Array<{ id: string; label: string; description: string }>;
    const q = (slashQuery || '').toLowerCase();
    const list = SLASH_COMMANDS.filter(c =>
      !q || c.label.slice(1).toLowerCase().startsWith(q) ||
      c.label.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
    return list.slice(0, 8);
  }, [slashActive, slashQuery, SLASH_COMMANDS]);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearMessages();
    } finally {
      setClearing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command navigation & selection
    if (slashActive) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % Math.max(1, slashCandidates.length || 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + Math.max(1, slashCandidates.length || 1)) % Math.max(1, slashCandidates.length || 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashActive(false);
        setSlashQuery('');
        setSlashIndex(0);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        if (slashCandidates.length > 0) {
          e.preventDefault();
          const idx = Math.min(Math.max(0, slashIndex), slashCandidates.length - 1);
          const candidate = slashCandidates[idx];
          handleSelectSlashCommand(candidate.id);
          return;
        }
        // fall through to submit if no candidates
      }
    }
    // Arrow navigation: jump across tag instead of inside
    if (!mentionActive && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      const mention = getMentionAtCaret(pos, input);
      if (mention) {
        const { start, end } = mention;
        if (e.key === 'ArrowLeft' && pos === end) {
          e.preventDefault();
          requestAnimationFrame(() => {
            const el2 = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
            if (el2) el2.setSelectionRange(start, start);
          });
          return;
        }
        if (e.key === 'ArrowRight' && pos === start) {
          e.preventDefault();
          requestAnimationFrame(() => {
            const el2 = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
            if (el2) el2.setSelectionRange(end, end);
          });
          return;
        }
      }
    }
    // Delete whole tag when caret is just before it and Delete is pressed
    if (e.key === 'Delete' && !mentionActive) {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      const mention = getMentionAtCaret(pos, input);
      if (mention) {
        const { token, nodeId } = mention;
        if (input.slice(pos, pos + token.length) === token) {
          e.preventDefault();
          const before = input.slice(0, pos);
          const after = input.slice(pos + token.length);
          const next = before + after;
          setInput(next);
          setMentionedNodeIds(prev => prev.filter(id => id !== nodeId));
          if (mentionedNodeIds.length === 1) { // If this was the last mention
            setIncludeNodes(false);
            try { setSelectedNode(null, null); } catch {}
            try { setSelectedNodeIds([]); } catch {}
          }
          requestAnimationFrame(() => {
            const el2 = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
            if (el2) {
              const newPos = before.length;
              el2.focus();
              el2.setSelectionRange(newPos, newPos);
            }
          });
          return;
        }
      }
    }
    // Handle deleting a full mention tag @{Title} in one go when backspacing at its end
    if (e.key === 'Backspace' && !mentionActive) {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      const mention = getMentionAtCaret(pos, input);
      if (mention) {
        const { token, nodeId } = mention;
        if (pos >= token.length && input.slice(pos - token.length, pos) === token) {
          e.preventDefault();
          const before = input.slice(0, pos - token.length);
          const after = input.slice(pos);
          const next = before + after;
          setInput(next);
          setMentionedNodeIds(prev => prev.filter(id => id !== nodeId));
          if (mentionedNodeIds.length === 1) { // If this was the last mention
            setIncludeNodes(false);
            try { setSelectedNode(null, null); } catch {}
            try { setSelectedNodeIds([]); } catch {}
          }
          requestAnimationFrame(() => {
            const el2 = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
            if (el2) {
              const newPos = before.length;
              el2.focus();
              el2.setSelectionRange(newPos, newPos);
            }
          });
          return;
        }
      }
    }
    // Start mention on '@' (allow starting even if a previous node was mentioned)
    if (e.key === '@' && !mentionActive) {
      // Start a mention token at the current caret position - the '@' will be inserted by the browser
      // The mention start position should be where the '@' will be placed
      const pos = (e.currentTarget.selectionStart ?? 0);
      setMentionActive(true);
      setMentionStart(pos); // This will be the position of the '@' after it's inserted
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
    // Slash command detection (only at start)
    if (val.startsWith('/')) {
      const caret = e.target.selectionStart ?? val.length;
      const firstSpace = val.indexOf(' ');
      if (firstSpace !== -1 && caret > firstSpace) {
        if (slashActive) {
          setSlashActive(false);
          setSlashQuery('');
          setSlashIndex(0);
        }
      } else {
        setSlashActive(true);
        const after = val.slice(1, firstSpace === -1 ? undefined : firstSpace);
        const m = after.match(/^[^\s]*/);
        const q = (m ? m[0] : '') || '';
        setSlashQuery(q);
        setSlashIndex(0);
      }
    } else if (slashActive) {
      setSlashActive(false);
      setSlashQuery('');
      setSlashIndex(0);
    }
    // If user removed mention tokens, remove them from mentionedNodeIds
    setMentionedNodeIds(prev => prev.filter(nodeId => {
      const node = graph?.nodes?.find(n => n.id === nodeId);
      const rawTitle = node ? String((node as any).title ?? node.id) : '';
      const token = rawTitle ? ('@' + rawTitle.replace(/\s+/g, '\u00A0')) : '';
      return token && val.includes(token);
    }));

    if (mentionActive && mentionStart !== null) {
      const caret = e.target.selectionStart ?? val.length;

      // Check if the '@' character at mentionStart was deleted
      if (mentionStart >= val.length || val[mentionStart] !== '@') {
        setMentionActive(false);
        setMentionStart(null);
        setMentionQuery('');
        return;
      }

      // Only cancel if caret moved significantly before mention start (allow small movements)
      if (caret < mentionStart) {
        setMentionActive(false);
        setMentionStart(null);
        setMentionQuery('');
        return;
      }

      // Extract typed query from after '@' up to caret
      const q = val.slice(mentionStart + 1, caret);

      // If the query contains whitespace or other special characters that would break a mention, cancel
      if (q.includes(' ') || q.includes('\n') || q.includes('\t')) {
        setMentionActive(false);
        setMentionStart(null);
        setMentionQuery('');
        return;
      }

      setMentionQuery(q);
      setMentionIndex(0);
    }
  };

  // Replace the typed slash token with the full command label and a space
  const handleSelectSlashCommand = (cmdId: string) => {
    const cmd = SLASH_COMMANDS.find(c => c.id === cmdId);
    if (!cmd) return;
    const val = input;
    const start = 0;
    const end = Math.min(1 + (slashQuery?.length || 0), val.length);
    const insert = `${cmd.label} `;
    const next = insert + val.slice(end);
    setInput(next);
    setSlashActive(false);
    setSlashQuery('');
    setSlashIndex(0);
    setPendingCaretPos(insert.length);
  };

  // Replace the mention token with selected node title, update store selection
  const handleSelectMention = (nodeId: string) => {
    const node = graph?.nodes?.find(n => n.id === nodeId);
    if (!node) return;

    // Enforce single selection globally
    setSelectedNode(node.id, node as any);
    setSelectedNodeIds([node.id]);
    setIncludeNodes(true);
    setMentionedNodeIds(prev => [...prev.filter(id => id !== node.id), node.id]); // Add without duplicates

    const el = document.getElementById(textareaDomId) as HTMLTextAreaElement | null;
    const val = input;
    const baseStart = Math.min(mentionStart ?? 0, val.length);
    const endByQuery = baseStart + 1 + (mentionQuery?.length ?? 0);
    const end = Math.min(endByQuery, val.length);
    const start = baseStart;
    const rawTitle = String((node as any).title ?? node.id);
    const token = '@' + rawTitle.replace(/\s+/g, '\u00A0');
    const mentionText = `${token} `;
    const next = val.slice(0, start) + mentionText + val.slice(end);
    setInput(next);

    // Close mention UI
    setMentionActive(false);
    setMentionStart(null);
    setMentionQuery('');
    setMentionIndex(0);
    // Mark caret placement to finalize after re-render
    setPendingCaretPos(start + mentionText.length);
  };

  // Ensure caret lands immediately after the inserted mention
  useLayoutEffect(() => {
    if (pendingCaretPos == null) return;
    const pos = pendingCaretPos;
    const place = () => {
      try {
        const el = textareaRef.current as HTMLTextAreaElement | null;
        if (el) {
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      } catch {}
    };
    requestAnimationFrame(place);
    setTimeout(place, 0);
    setPendingCaretPos(null);
  }, [pendingCaretPos]);

  // Drag handling  // Drag handling
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

  useLayoutEffect(() => {
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
            useLayoutEffect(() => {
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
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={markdownComponents}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </>
                    ) : (
                      <>
                        {console.log('рџ’­ FloatingChat: Showing thinking indicator')}
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
            selectedNodeIds={includeNodes ? selectedNodeIds : []}
            selectedNodes={includeNodes ? selectedNodes : []}
            onRemoveFile={() => setIncludeFile(false)}
            onRemoveNodes={() => { setIncludeNodes(false); setMentionedNodeIds([]); }}
          />
          
          <div className="flex gap-2 items-end relative">
            <div className="relative flex-1 bg-zinc-800 rounded-md overflow-hidden">
              {/* Overlay that shows mentions as tags */}
              <div
                className="absolute inset-0 z-0 px-3 py-1.5 text-xs whitespace-pre-wrap pointer-events-none rounded-md"
                style={{ color: 'transparent', fontFamily: 'inherit', transform: 'translateY(0px)' }}
                ref={overlayRef}
                dangerouslySetInnerHTML={{ __html: overlayHtml }}
              />
              <Textarea
                id={textareaDomId}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                ref={textareaRef}
                onScroll={syncOverlayScroll}
                onMouseUp={(e) => {
                  const el = e.currentTarget;
                  const pos = el.selectionStart ?? 0;
                  const mention = getMentionAtCaret(pos, input);
                  if (mention) {
                    const { start, end } = mention;
                    requestAnimationFrame(() => {
                      const val = el.value;
                      let s = el.selectionStart ?? 0;
                      let epos = el.selectionEnd ?? s;
                      let changed = false;
                      if (s > start && s < end) { s = s - start < end - s ? start : end; changed = true; }
                      if (epos > start && epos < end) { epos = epos - start < end - epos ? start : end; changed = true; }
                      if (changed) el.setSelectionRange(s, epos);
                    });
                  }
                }}
                onSelect={(e) => {
                  const el = e.currentTarget;
                  const pos = el.selectionStart ?? 0;
                  const mention = getMentionAtCaret(pos, input);
                  if (mention) {
                    const { start, end } = mention;
                    requestAnimationFrame(() => {
                      const val = el.value;
                      let s = el.selectionStart ?? 0;
                      let epos = el.selectionEnd ?? s;
                      let changed = false;
                      if (s > start && s < end) { s = s - start < end - s ? start : end; changed = true; }
                      if (epos > start && epos < end) { epos = epos - start < end - epos ? start : end; changed = true; }
                      if (changed) el.setSelectionRange(s, epos);
                    });
                  }
                }}
                placeholder="Ask AI..., @ for node"
                disabled={false}
                className="relative z-10 w-full resize-none text-xs field-sizing-content max-h-20 min-h-0 px-3 py-1.5 bg-transparent border-zinc-600 caret-white placeholder-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            {/* Mention dropdown */}
            {mentionActive && mentionCandidates.length > 0 && (
              <div className="absolute bottom-10 left-0 w-full max-w-[18rem] bg-zinc-900 border border-zinc-700 rounded-md shadow-xl overflow-hidden z-50">
                {mentionCandidates.map((n, i) => (
                  <button
                    type="button"
                    key={n.id}
                    onMouseDown={(ev) => { ev.preventDefault(); }}
                    onClick={() => handleSelectMention(n.id)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 ${i === mentionIndex ? 'bg-zinc-800' : ''}`}
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
            {/* Slash command dropdown */}
            {slashActive && slashCandidates.length > 0 && (
              <div className="absolute bottom-10 left-0 w-full max-w-[18rem] bg-zinc-900 border border-zinc-700 rounded-md shadow-xl overflow-hidden z-50">
                {slashCandidates.map((c, i) => (
                  <button
                    type="button"
                    key={c.id}
                    onMouseDown={(ev) => { ev.preventDefault(); }}
                    onClick={() => handleSelectSlashCommand(c.id)}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 ${i === slashIndex ? 'bg-zinc-800' : ''}`}
                  >
                    <Wand2 className="w-3.5 h-3.5 text-zinc-300" />
                    <div className="flex flex-col">
                      <span className="text-xs text-white leading-tight">{c.label}</span>
                      <span className="text-[10px] text-zinc-400 leading-tight">{c.description}</span>
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













