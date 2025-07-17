'use client';

import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCodeStore } from '@/lib/store';
import { Message } from '@/app/api/chat/route';

interface DisplayMessage extends Message {
  content?: string; // For display purposes only
  code?: string;
}

/** Typing speed: characters appended per animation frame. */
const CHARS_PER_FRAME = 2;

export default function ChatSidebar() {
  const { code, setCode, selection, setSelection } = useCodeStore();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  // Streaming refs
  const charQueueRef = useRef<string[]>([]);
  const animatingRef = useRef(false);
  const streamIdxRef = useRef<number | null>(null);
  const typedLenRef = useRef(0); // # chars typed so far

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

      // Add system message with current code
      const systemMessage: Message = {
        role: 'system',
        variables: { CURRENT_CODE: code || '' }
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
        | { t: 'final'; reply: string; code: string }
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

        // attach code once typing done
        const waitUntilDone = () => {
          if (animatingRef.current || charQueueRef.current.length > 0) {
            requestAnimationFrame(waitUntilDone);
            return;
          }
          setMessages((prev) => {
            const updated = [...prev];
            const idx = streamIdxRef.current ?? updated.length - 1;
            updated[idx] = {
              ...updated[idx],
              code: evt.code,
              variables: { ASSISTANT_RESPONSE: evt.reply }
            };
            return updated;
          });
          setCode(evt.code);
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

  return (
    <Card className="w-[350px] flex flex-col h-full transition-none">
      <CardHeader>
        <CardTitle>AI Chat</CardTitle>
      </CardHeader>
      {/* scroll container ref */}
      <CardContent className="flex-1 overflow-y-auto transition-none" ref={scrollRef}>
        <div className="space-y-4 transition-none">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex ${m.role === 'user' ? 'justify-end' : ''} transition-none`}
            >
              <div
                className={`whitespace-pre-wrap break-words p-2 rounded-lg transition-none ${
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
              <div className="p-2 rounded-lg bg-muted">thinking...</div>
            </div>
          )}
        </div>
      </CardContent>
      <div className="p-4 border-t">
        {selection && (
          <div className="text-xs text-muted-foreground mb-2">
            Selected: x: {Math.round(selection.x)}, y: {Math.round(selection.y)}, w:{' '}
            {Math.round(selection.width)}, h: {Math.round(selection.height)}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say something..."
          />
          <Button type="submit" size="icon" disabled={loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
