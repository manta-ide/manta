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
  activelyReceiving: boolean;
}

export interface ChatServiceActions {
  sendMessage: (input: string) => Promise<void>;
  clearMessages: () => void;
  stopStream: () => void;
}

/**
 * Custom React hook for managing chat streaming functionality
 * Handles message sending, response streaming, and file operations
 */
export function useChatService(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const { getAllFiles, currentFile, selection, setSelection, loadProject: loadProjectFromFileSystem, triggerRefresh } = useProjectStore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [activelyReceiving, setActivelyReceiving] = useState(false);

  // Timer for managing actively receiving state
  const activityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // AbortController for cancelling streams
  const abortControllerRef = useRef<AbortController | null>(null);

  // Function to mark activity and reset timer
  const markStreamActivity = useCallback(() => {
    setActivelyReceiving(true);
    
    // Clear existing timer
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
    }
    
    // Set new timer to mark as not actively receiving after delay
    activityTimerRef.current = setTimeout(() => {
      setActivelyReceiving(false);
    }, 2000); // 800ms delay - only show thinking during longer waits
  }, []);

  // Function to stop the current stream
  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('🛑 Stopping stream...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Immediately stop typewriter animation and clear character queue
    charQueueRef.current = [];
    animatingRef.current = false;
    streamIdxRef.current = null;
    
    setLoading(false);
    setActivelyReceiving(false);
    
    // Clear any pending activity timer
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
  }, []);

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

  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim()) return;

    // Only use selection if it's valid
    const validSelection = isValidSelection(selection) ? selection : null;
    
    const roundedSelection = validSelection ? {
        x: Math.round(validSelection.x),
        y: Math.round(validSelection.y),
        width: Math.round(validSelection.width),
        height: Math.round(validSelection.height),
        selectedElements: validSelection.selectedElements
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
    console.log("USER MESSAGE");
    console.log(JSON.stringify(userMessage, null, 2));
    // Add selection variables if selection is valid
    if (roundedSelection) {
      userMessage.variables = {
        ...userMessage.variables,
        SELECTION: 'true',
        SELECTION_X: roundedSelection.x.toString(),
        SELECTION_Y: roundedSelection.y.toString(),
        SELECTION_WIDTH: roundedSelection.width.toString(),
        SELECTION_HEIGHT: roundedSelection.height.toString(),
        SELECTION_ELEMENTS: roundedSelection.selectedElements
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
      // Create AbortController for this request
      abortControllerRef.current = new AbortController();

      // Prepare API messages (system + conversation history)
      const requestPayload = {
        userMessage: userMessage,
        sessionId: 'default'
      };

      // Call API
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: abortControllerRef.current.signal // Add abort signal to fetch
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

      try {
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
                async () => {}, // No file operations - handled by backend
                async () => {
                  // Clear selection only if it was valid and used
                  if (validSelection) {
                    setSelection(null);
                  }
                },
                markStreamActivity,
                logResponse,
                async () => {
                  // Refresh project store when file operations complete
                  console.log('🔄 Refreshing project store after file operation');
                  await loadProjectFromFileSystem();
                  
                  // Trigger iframe refresh after file operations
                  console.log('🔄 Triggering iframe refresh after file operations');
                  triggerRefresh();
                }
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
                async () => {}, // No file operations - handled by backend
                async () => {
                  // Clear selection only if it was valid and used
                  if (validSelection) {
                    setSelection(null);
                  }
                },
                markStreamActivity,
                logResponse,
                async () => {
                  // Refresh project store when file operations complete
                  console.log('🔄 Refreshing project store after file operation');
                  await loadProjectFromFileSystem();
                  
                  // Trigger iframe refresh after file operations
                  console.log('🔄 Triggering iframe refresh after file operations');
                  triggerRefresh();
                }
              );
            }
          }
        }
      } catch (streamErr) {
        // Handle AbortError during stream reading
        if (streamErr instanceof Error && streamErr.name === 'AbortError') {
          console.log('🛑 Stream reading was cancelled');
          return; // Exit early for aborted stream reading
        }
        throw streamErr; // Re-throw other errors
      }
    } catch (err) {
      // Check if the error is due to abortion - don't treat as error
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('🛑 Stream was cancelled by user');
        return; // Exit early for aborted requests
      }
      
      console.error('❌ Chat service error:', err);
    } finally {
      setLoading(false);
      setActivelyReceiving(false);
      
      // Clear any pending activity timer
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
        activityTimerRef.current = null;
      }
      
      // Clean up abort controller
      abortControllerRef.current = null;
    }
  }, [messages, currentFile, selection, getAllFiles, scrollRef, setSelection, loadProjectFromFileSystem, triggerRefresh]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLoading(false);
    setActivelyReceiving(false);
    
    // Clear any pending activity timer
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
      activityTimerRef.current = null;
    }
  }, []);

  return {
    state: { messages, loading, activelyReceiving },
    actions: { sendMessage, clearMessages, stopStream },
    streamIdxRef,
    streamingState
  };
} 