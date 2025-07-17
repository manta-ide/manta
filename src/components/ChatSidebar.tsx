'use client';

import { useChat } from 'ai/react';

export default function ChatSidebar() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  return (
    <div style={{ 
      width: '300px',
      height: '100vh',
      borderRight: '1px solid #ccc',
      padding: '16px',
      backgroundColor: '#f9f9f9',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
        AI Chat
      </h2>
      
      <div style={{ 
        flex: 1,
        overflowY: 'auto',
        marginBottom: '16px',
        padding: '8px',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px'
      }}>
        {messages.map((message) => (
          <div key={message.id} style={{ 
            marginBottom: '12px',
            padding: '8px',
            backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f5f5f5',
            borderRadius: '4px'
          }}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}:</strong>
            <div style={{ marginTop: '4px' }}>{message.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          style={{
            flex: 1,
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
} 