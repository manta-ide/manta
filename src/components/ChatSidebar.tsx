'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/lib/store';
import { Message } from '@/app/api/chat/route';
import SelectionBadges from './SelectionBadge';

interface DisplayMessage extends Message {
  content?: string; // For display purposes only
  operations?: any; // For file operations
}

/** Typing speed: characters appended per animation frame. */
const CHARS_PER_FRAME = 2;

export default function ChatSidebar() {
  const { getAllFiles, currentFile, selection, setSelection, setCurrentFile, createFile, setFileContent, deleteFile } = useProjectStore();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // scroll container
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Streaming refs
  const charQueueRef = useRef<string[]>([]);
  const animatingRef = useRef(false);
  const streamIdxRef = useRef<number | null>(null);
  const typedLenRef = useRef(0); // # chars typed so far

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  /** Scroll to bottom helper */
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    // No smooth each frame; cheap immediate pin
    el.scrollTop = el.scrollHeight;
  };

  /** rAF typewriter drain */
  const kickAnimation = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const step = () => {
      if (charQueueRef.current.length > 0 && streamIdxRef.current !== null) {
        const chunk = charQueueRef.current.splice(0, CHARS_PER_FRAME).join('');
        typedLenRef.current += chunk.length;
        setMessages((prev) => {
          const updated = [...prev];
          const idx = streamIdxRef.current!;
          const m = updated[idx];
          updated[idx] = {
            ...m,
            content: (m?.content ?? '') + chunk,
          };
          return updated;
        });
        scrollToBottom(); // keep view pinned
        requestAnimationFrame(step);
      } else {
        animatingRef.current = false;
      }
    };

    requestAnimationFrame(step);
  };

  const applyFileOperations = async (operations: any[]) => {
    if (!operations || !Array.isArray(operations)) return;
    
    for (const op of operations) {
      try {
        switch (op.type) {
          case 'create':
            await createFile(op.path, op.content || '');
            break;
          case 'update':
            await setFileContent(op.path, op.content || '');
            break;
          case 'delete':
            await deleteFile(op.path);
            break;
        }
      } catch (error) {
        console.error('Error applying file operation:', error);
      }
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: DisplayMessage = { 
      role: 'user', 
      variables: { USER_REQUEST: input },
      content: input 
    };

    // append user message + scroll
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      queueMicrotask(scrollToBottom);
      return updated;
    });

    setInput('');
    setLoading(true);

    try {
      // Convert display messages to API messages
      const apiMessages: Message[] = [...messages, userMessage].map(msg => ({
        role: msg.role,
        variables: msg.variables
      }));

      // Get all files and serialize them
      const allFiles = getAllFiles();
      const projectStructure = JSON.stringify(Object.fromEntries(allFiles), null, 2);

      // Add system message with current project state
      const systemMessage: Message = {
        role: 'system',
        variables: { 
          PROJECT_FILES: projectStructure,
          CURRENT_FILE: currentFile || '',
          CURRENT_FILE_CONTENT: currentFile ? allFiles.get(currentFile) || '' : ''
        }
      };

      // Add selection variables to user message if selection exists
      if (selection) {
        userMessage.variables = {
          ...userMessage.variables,
          SELECTION: 'true',
          SELECTION_X: selection.x.toString(),
          SELECTION_Y: selection.y.toString(),
          SELECTION_WIDTH: selection.width.toString(),
          SELECTION_HEIGHT: selection.height.toString()
        };
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [systemMessage, ...apiMessages],
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      // create streaming placeholder assistant msg
      setMessages((prev) => {
        const idx = prev.length;
        streamIdxRef.current = idx;
        queueMicrotask(scrollToBottom);
        return [...prev, { role: 'assistant', content: '' }];
      });

      // reset streaming state
      charQueueRef.current = [];
      typedLenRef.current = 0;
      animatingRef.current = false;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) {
          done = true;
          if (buffered.length) processLine(buffered); // last line (no newline)
          break;
        }
        buffered += decoder.decode(value, { stream: true });

        // split NDJSON
        let nl;
        while ((nl = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, nl);
          buffered = buffered.slice(nl + 1);
          if (line.length) processLine(line);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /** Parse & handle one NDJSON event */
  function processLine(line: string) {
    try {
      const evt = JSON.parse(line) as
        | { t: 'token'; d: string }
        | { t: 'final'; reply: string; operations: any }
        | { t: 'error'; error: string };

      if (evt.t === 'token') {
        if (evt.d) {
          charQueueRef.current.push(...evt.d.split(''));
          kickAnimation();
        }
      } else if (evt.t === 'final') {
        // no content overwrite; trust streamed tokens
        if (process.env.NODE_ENV !== 'production') {
          const diff = evt.reply.length - typedLenRef.current;
          if (diff !== 0) {
            console.warn(
              `Typewriter: final reply length (${evt.reply.length}) != typed (${typedLenRef.current}). diff=${diff}`
            );
          }
        }

        // attach operations once typing done
        const waitUntilDone = async () => {
          if (animatingRef.current || charQueueRef.current.length > 0) {
            requestAnimationFrame(waitUntilDone);
            return;
          }
          setMessages((prev) => {
            const updated = [...prev];
            const idx = streamIdxRef.current ?? updated.length - 1;
            updated[idx] = {
              ...updated[idx],
              operations: evt.operations,
              variables: { ASSISTANT_RESPONSE: evt.reply }
            };
            return updated;
          });
          
          // Apply file operations to the project
          await applyFileOperations(evt.operations);
          
          setSelection(null);
          streamIdxRef.current = null;
          queueMicrotask(scrollToBottom);
        };
        waitUntilDone();
      } else if (evt.t === 'error') {
        console.error('Model error:', evt.error);
      }
    } catch (err) {
      console.error('Bad stream line', line, err);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  return (
    <div className="w-80 flex flex-col h-full bg-background border-l">
      {/* scroll container ref */}
      <div className="flex-1 overflow-y-auto p-3" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}
            >
              <div
                className={`whitespace-pre-wrap break-words p-3 rounded-lg max-w-[80%] text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && streamIdxRef.current === null && (
            <div className="flex">
              <div className="p-3 rounded-lg bg-muted text-sm">thinking...</div>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-3 border-t">
        <form onSubmit={sendMessage} className="space-y-3">
          {/* Selection badges inside input area */}
          <SelectionBadges
            currentFile={currentFile}
            selection={selection}
            onRemoveFile={() => setCurrentFile(null)}
            onRemoveSelection={() => setSelection(null)}
          />
          
          <div className="flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to help with your project..."
              className="flex-1 resize-none text-sm min-h-[38px] max-h-[120px]"
              rows={1}
            />
            <Button type="submit" size="icon" disabled={loading} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
