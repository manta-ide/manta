/**
 * Chat Streaming Service
 * 
 * React hook that manages real-time chat streaming with AI, including message state,
 * streaming animations, and file operations integration.
 * 
 * This is a frontend-only service that handles UI state and streaming responses.
 */

import { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/lib/store';
import { applyFileOperations, ProjectStore } from '@/app/api/lib/fileOperationUtils';
import { 
  StreamingState, 
  conditionalScrollToBottom,
  processStreamLine
} from '@/lib/chatAnimationUtils';
import { isValidSelection } from '@/app/api/lib/messageContextUtils';
import { 
  Message, 
  MessageContext
} from '@/app/api/lib/schemas';

export interface ChatServiceState {
  messages: Message[];
  loading: boolean;
}

export interface ChatServiceActions {
  sendMessage: (input: string) => Promise<void>;
  clearMessages: () => void;
}

/**
 * Custom React hook for managing chat streaming functionality
 * Handles message sending, response streaming, and file operations
 */
export function useChatService(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const { getAllFiles, currentFile, selection, setSelection, createFile, setFileContent, deleteFile, getFileContent } = useProjectStore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Streaming refs for animation state
  const charQueueRef = useRef<string[]>([]);
  const animatingRef = useRef(false);
  const streamIdxRef = useRef<number | null>(null);
  const typedLenRef = useRef(0);
  const autoScrollRef = useRef(true); // Start in auto-scroll mode

  const streamingState: StreamingState = {
    charQueueRef,
    animatingRef,
    streamIdxRef,
    typedLenRef,
    autoScrollRef
  };

  // Project store adapter for file operations
  const projectStore: ProjectStore = {
    createFile,
    setFileContent,
    deleteFile,
    getFileContent
  };

  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim()) return;

    // Only use selection if it's valid
    const validSelection = isValidSelection(selection) ? selection : null;
    
    const roundedSelection = validSelection ? {
        x: Math.round(validSelection.x),
        y: Math.round(validSelection.y),
        width: Math.round(validSelection.width),
        height: Math.round(validSelection.height)
      } : null;

    // Store current selection context
    const messageContext: MessageContext = {
      currentFile,
      selection: roundedSelection
    };

    // Create base user message for UI
    const userMessage: Message = { 
      role: 'user',
      variables: {
        USER_REQUEST: input
      },
      content: input,
      messageContext
    };

    // Add selection variables if selection is valid
    if (roundedSelection) {
      userMessage.variables = {
        ...userMessage.variables,
        SELECTION: 'true',
        SELECTION_X: roundedSelection.x.toString(),
        SELECTION_Y: roundedSelection.y.toString(),
        SELECTION_WIDTH: roundedSelection.width.toString(),
        SELECTION_HEIGHT: roundedSelection.height.toString()
      };
    }

    // Add user message to UI
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      queueMicrotask(() => conditionalScrollToBottom(scrollRef, streamingState));
      return updated;
    });

    setLoading(true);

    try {
      // Prepare API request with all files and current context
      const allFiles = getAllFiles();
      
      // Create system message with project context
      const systemMessage = {
        role: 'system' as const,
        variables: {
          PROJECT_FILES: JSON.stringify(Object.fromEntries(allFiles), null, 2),
          CURRENT_FILE: currentFile || '',
          CURRENT_FILE_CONTENT: currentFile ? allFiles.get(currentFile) || '' : ''
        }
      };

      // Prepare API messages (system + conversation history)
      const requestPayload = {
        messages: [systemMessage, ...messages, userMessage],
      };

      console.log('📤 SENT TO MODEL:');
      console.log(JSON.stringify(requestPayload, null, 2));

      // Call API
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (!res.ok || !res.body) throw new Error(await res.text());

      // Create placeholder for streaming response
      setMessages((prev) => {
        const idx = prev.length;
        streamIdxRef.current = idx;
        queueMicrotask(() => conditionalScrollToBottom(scrollRef, streamingState));
        return [...prev, { role: 'assistant', content: '' }];
      });

      // Reset streaming state
      charQueueRef.current = [];
      typedLenRef.current = 0;
      animatingRef.current = false;

      // Logging callback for responses
      const logResponse = (fullResponse: string) => {
        console.log('📥 RECEIVED FROM MODEL:');
        console.log(fullResponse);
      };

      // Process streaming response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) {
          done = true;
          if (buffered.length) {
            await processStreamLine(
              buffered,
              streamingState,
              setMessages,
              scrollRef,
              (ops) => applyFileOperations(ops, projectStore),
              () => {
                // Clear selection only if it was valid and used
                if (validSelection) {
                  setSelection(null);
                }
              },
              logResponse
            );
          }
          break;
        }

        buffered += decoder.decode(value, { stream: true });

        // Process NDJSON lines
        let nl;
        while ((nl = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, nl);
          buffered = buffered.slice(nl + 1);
          if (line.length) {
            await processStreamLine(
              line,
              streamingState,
              setMessages,
              scrollRef,
              (ops) => applyFileOperations(ops, projectStore),
              () => {
                // Clear selection only if it was valid and used
                if (validSelection) {
                  setSelection(null);
                }
              },
              logResponse
            );
          }
        }
      }
    } catch (err) {
      console.error('❌ Chat service error:', err);
    } finally {
      setLoading(false);
    }
  }, [messages, currentFile, selection, getAllFiles, scrollRef, setSelection, createFile, setFileContent, deleteFile, getFileContent]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLoading(false);
  }, []);

  return {
    state: { messages, loading },
    actions: { sendMessage, clearMessages },
    streamIdxRef,
    streamingState
  };
} 