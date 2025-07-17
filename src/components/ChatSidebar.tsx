'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCodeStore } from '@/lib/store';


interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatSidebar() {
  const { code, setCode, selection, setSelection } = useCodeStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [...messages, userMessage], code, selection }),
      });

      if (!res.ok) throw new Error(await res.text());

      const data = (await res.json()) as { reply: string, code: string };
      const assistantMessage: Message = { role: 'assistant', content: data.reply };
      setMessages((prev) => [...prev, assistantMessage]);
      setCode(data.code);
      setSelection(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-[350px] flex flex-col h-full">
      <CardHeader>
        <CardTitle>AI Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
              <div className={`p-2 rounded-lg ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex">
              <div className="p-2 rounded-lg bg-muted">
                thinking...
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <div className="p-4 border-t">
        {selection && (
            <div className="text-xs text-muted-foreground mb-2">
                Selected: x: {Math.round(selection.x)}, y: {Math.round(selection.y)}, w: {Math.round(selection.width)}, h: {Math.round(selection.height)}
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