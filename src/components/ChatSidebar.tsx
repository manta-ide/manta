'use client';

import { useState, useRef } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/lib/store';
import SelectionBadges from './SelectionBadge';
import { MessageBadges } from './SelectionBadge';
import { useChatService } from '@/lib/chatService';

export default function ChatSidebar() {
  const { currentFile, selection, setSelection, setCurrentFile } = useProjectStore();
  const [input, setInput] = useState('');

  // scroll container
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use chat service for all chat logic
  const { state, actions, streamIdxRef } = useChatService(scrollRef);
  const { messages, loading } = state;
  const { sendMessage } = actions;

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
    <div className="w-96 flex flex-col h-full bg-background border-l">
      {/* scroll container ref */}
      <div 
        className="flex-1 overflow-y-auto p-3 chat-scrollbar" 
        ref={scrollRef}
      >
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className="w-full">
              <div
                className={`whitespace-pre-wrap break-words p-3 rounded-lg w-full text-sm ${
                  m.role === 'user'
                    ? 'bg-muted text-black'
                    : 'bg-primary text-primary-foreground'
                }`}
              >
                {/* Display badges for context */}
                <MessageBadges
                  currentFile={m.messageContext?.currentFile}
                  selection={m.messageContext?.selection}
                  variant={m.role === 'user' ? 'light' : 'dark'}
                />
                {m.content}
              </div>
            </div>
          ))}
          {loading && streamIdxRef.current === null && (
            <div className="w-full">
              <div className="p-3 rounded-lg bg-primary text-primary-foreground text-sm w-full">thinking...</div>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-3 border-t">
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
              className="flex-1 resize-none text-sm field-sizing-content max-h-29.5 min-h-0 py-1.75"
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
