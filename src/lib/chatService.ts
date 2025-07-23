import { useState, useRef, useCallback } from 'react';
import { useProjectStore } from '@/lib/store';
import { applyFileOperations, ProjectStore } from '@/lib/fileOperationHelpers';
import { 
  ChatMessage, 
  StreamingState, 
  scrollToBottom, 
  processStreamLine, 
  createMessageContext 
} from '@/lib/chatHelpers';
import { 
  DisplayMessage, 
  createSystemMessage, 
  createUserMessage, 
  convertToApiMessages 
} from '@/lib/contextHelpers';
import { Selection, isValidSelection } from '@/lib/selectionHelpers';

export interface ChatServiceState {
  messages: DisplayMessage[];
  loading: boolean;
}

export interface ChatServiceActions {
  sendMessage: (input: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChatService(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const { getAllFiles, currentFile, selection, setSelection, createFile, setFileContent, deleteFile, getFileContent } = useProjectStore();
  
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Streaming refs
  const charQueueRef = useRef<string[]>([]);
  const animatingRef = useRef(false);
  const streamIdxRef = useRef<number | null>(null);
  const typedLenRef = useRef(0);

  const streamingState: StreamingState = {
    charQueueRef,
    animatingRef,
    streamIdxRef,
    typedLenRef
  };

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

    // Store current selection context and create user message
    const messageContext = createMessageContext(currentFile, roundedSelection);
    const userMessage = createUserMessage(input, messageContext, roundedSelection);

    // Add user message to UI
    setMessages((prev) => {
      const updated = [...prev, userMessage];
      queueMicrotask(() => scrollToBottom(scrollRef));
      return updated;
    });

    setLoading(true);

    try {
      // Convert messages for API and create system message
      const apiMessages = convertToApiMessages([...messages, userMessage]);
      const allFiles = getAllFiles();
      const systemMessage = createSystemMessage(allFiles, currentFile);

      const requestPayload = {
        messages: [systemMessage, ...apiMessages],
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
        queueMicrotask(() => scrollToBottom(scrollRef));
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
            processStreamLine(
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
            processStreamLine(
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
    streamIdxRef
  };
} 