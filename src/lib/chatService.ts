/**
 * Simple Chat Service
 * 
 * React hook that manages chat state and makes requests to the agent-request API.
 * No streaming complexity - just basic message management.
 */

import { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '@/lib/store';
import { isValidSelection } from '@/app/api/lib/selectionUtils';
import { 
  Message, 
  MessageContext
} from '@/app/api/lib/schemas';

/**
 * Custom React hook for managing chat functionality
 * Handles message sending and basic state management
 */
export function useChatService() {
  const { currentFile, selection, setSelection, selectedNodeId, selectedNode } = useProjectStore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load chat history (no user check anymore)
useEffect(() => {
  loadChatHistory();
}, []);


  // Function to load chat history from database
  const loadChatHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const { chatHistory } = await response.json();
        setMessages(chatHistory || []);
      } else {
        // Only log error if it's not a 404 (no chat history yet)
        if (response.status !== 404) {
          console.error('Failed to load chat history:', response.status, response.statusText);
        }
        // Set empty array for new sessions
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Function to save chat history to database
  const saveChatHistory = useCallback(async (newMessages: Message[]) => {
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatHistory: newMessages }),
      });
    } catch (error) {
      console.error('Error saving chat history:', error);
    }
  }, []);

  const sendMessage = useCallback(async (input: string, contextFlags?: { includeFile?: boolean, includeSelection?: boolean, includeNode?: boolean }) => {
    console.log('🚀 Chat Service: sendMessage called with input:', input.slice(0, 100) + (input.length > 100 ? '...' : ''));

    if (!input.trim()) return;

    // Use context flags if provided, otherwise include everything
    const shouldIncludeFile = contextFlags?.includeFile !== false;
    const shouldIncludeSelection = contextFlags?.includeSelection !== false;
    const shouldIncludeNode = contextFlags?.includeNode !== false;

    // Only use selection if it's valid and should be included
    const validSelection = (shouldIncludeSelection && isValidSelection(selection)) ? selection : null;
    
    const roundedSelection = validSelection ? {
        x: Math.round(validSelection.x),
        y: Math.round(validSelection.y),
        width: Math.round(validSelection.width),
        height: Math.round(validSelection.height),
        selectedElements: validSelection.selectedElements
      } : null;

    // Store current selection context
    const messageContext: MessageContext = {
      currentFile: (shouldIncludeFile && currentFile) || undefined,
      selection: roundedSelection || undefined
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
        SELECTION: '1',
        SELECTION_X: roundedSelection.x.toString(),
        SELECTION_Y: roundedSelection.y.toString(),
        SELECTION_WIDTH: roundedSelection.width.toString(),
        SELECTION_HEIGHT: roundedSelection.height.toString(),
        SELECTION_ELEMENTS: roundedSelection.selectedElements
      };
    }

    // Add selected node variables if a node is selected and should be included
    if (shouldIncludeNode && selectedNodeId && selectedNode) {
      userMessage.variables = {
        ...userMessage.variables,
        SELECTED_NODE_ID: selectedNodeId,
        SELECTED_NODE_TITLE: selectedNode.title,
        SELECTED_NODE_PROMPT: selectedNode.prompt,
        SELECTED_NODE_IDS: selectedNodeId // For backward compatibility
      };
    }

    // Add user message to UI and save to database
    const newMessagesWithUser = [...messages, userMessage];
    setMessages(newMessagesWithUser);
    await saveChatHistory(newMessagesWithUser);

    setLoading(true);

    // Create assistant message placeholder with empty content so the UI
    // can render the shimmering "Thinking..." indicator instead of plain text
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      messageContext
    };
    
    const newMessagesWithAssistant = [...newMessagesWithUser, assistantMessage];

    try {
      setMessages(newMessagesWithAssistant);

    // Route: simple Q&A vs graph editing
    // Always use the full graph agent. It will decide whether to answer, read, or edit.
    console.log('📡 Chat Service: Making request to /api/agent-request/edit-graph');

    const response = await fetch('/api/agent-request/edit-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage }),
    });

    console.log('📡 Chat Service: Response status:', response.status, 'Content-Type:', response.headers.get('Content-Type'));

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    console.log('📡 Chat Service: Content type detected:', contentType);

      if (contentType.includes('text/plain') || contentType.includes('text/event-stream')) {
        console.log('🎯 Chat Service: Starting streaming response handling');
        console.log('🎯 Chat Service: Response headers:', Object.fromEntries(response.headers.entries()));

        // Handle streaming LLM response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';

        if (reader) {
          let buffer = '';
          let chunkCount = 0;

          console.log('📖 Chat Service: Reader available, starting to read');

          try {

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.log('🏁 Chat Service: Reader done, final accumulated content length:', accumulatedContent.length);
              break;
            }

            const chunkSize = value.length;
            console.log(`📦 Chat Service: Received chunk of ${chunkSize} bytes`);

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            console.log(`📦 Chat Service: Buffer now ${buffer.length} chars, split into ${lines.length} lines`);

            // Keep the last incomplete line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                chunkCount++;
                // Accumulate the content (handle both plain text and potential JSON)
                let chunkContent = line;

                // Check if this is SSE format (data: prefix)
                if (line.startsWith('data: ')) {
                  const dataPart = line.substring(6).trim(); // Remove 'data: ' prefix
                  try {
                    const parsed = JSON.parse(dataPart);
                    if (parsed.content) {
                      chunkContent = parsed.content;
                    } else if (parsed.error) {
                      chunkContent = `Error: ${parsed.error}`;
                    } else {
                      // Handle control messages like [STREAM_START], [STREAM_END]
                      chunkContent = '';
                    }
                  } catch {
                    // Not JSON, use as plain text
                    chunkContent = dataPart;
                  }
                } else {
                  // Handle plain text (non-SSE format)
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.content) {
                      chunkContent = parsed.content;
                    } else if (parsed.error) {
                      chunkContent = `Error: ${parsed.error}`;
                    }
                  } catch {
                    // Not JSON, use as plain text
                    chunkContent = line;
                  }
                }

                // Only accumulate actual content, skip empty chunks
                if (chunkContent.trim()) {
                  accumulatedContent += chunkContent;
                }

                console.log(`📝 Chat Service: Chunk ${chunkCount}, raw: "${line.slice(0, 50)}${line.length > 50 ? '...' : ''}", processed: "${chunkContent.slice(0, 50)}${chunkContent.length > 50 ? '...' : ''}", total: ${accumulatedContent.length}`);

                // Update the UI with the accumulated content (throttled to reduce updates)
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: accumulatedContent,
                      variables: {
                        ...(last as any).variables,
                        HAD_STREAMING: '1',
                        ASSISTANT_RESPONSE: accumulatedContent
                      }
                    } as any;
                  }
                  return updated;
                });
              }
            }
          }
          // Process any leftover buffer content that didn't end with a newline
          if (buffer && buffer.trim().length > 0) {
            let finalChunk = buffer;
            if (buffer.startsWith('data: ')) {
              const dataPart = buffer.substring(6).trim();
              try {
                const parsed = JSON.parse(dataPart);
                if (parsed.content) {
                  finalChunk = parsed.content;
                } else if (parsed.error) {
                  finalChunk = `Error: ${parsed.error}`;
                } else {
                  finalChunk = '';
                }
              } catch {
                finalChunk = dataPart;
              }
            } else {
              try {
                const parsed = JSON.parse(buffer);
                if (parsed.content) {
                  finalChunk = parsed.content;
                } else if (parsed.error) {
                  finalChunk = `Error: ${parsed.error}`;
                }
              } catch {
                finalChunk = buffer;
              }
            }
            if (finalChunk.trim().length > 0) {
              accumulatedContent += finalChunk;
              // Push a final UI update with leftover content
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: accumulatedContent,
                    variables: {
                      ...(last as any).variables,
                      HAD_STREAMING: '1',
                      ASSISTANT_RESPONSE: accumulatedContent
                    }
                  } as any;
                }
                return updated;
              });
            }
          }
          } catch (streamError) {
            console.error('❌ Chat Service: Streaming error:', streamError);
            // Fallback: try to read the entire response as text
            try {
              console.log('🔄 Chat Service: Attempting fallback to read entire response');
              const fullResponse = await response.text();
              console.log('📄 Chat Service: Fallback response length:', fullResponse.length);
              accumulatedContent = fullResponse;
            } catch (fallbackError) {
              console.error('❌ Chat Service: Fallback also failed:', fallbackError);
              accumulatedContent = 'Error: Failed to read response';
            }
          }
        } else {
          console.log('❌ Chat Service: No reader available for streaming');
          // Fallback: try to read the entire response as text
          try {
            console.log('🔄 Chat Service: Attempting fallback to read entire response');
            const fullResponse = await response.text();
            console.log('📄 Chat Service: Fallback response length:', fullResponse.length);
            accumulatedContent = fullResponse;
          } catch (fallbackError) {
            console.error('❌ Chat Service: Fallback also failed:', fallbackError);
            accumulatedContent = 'Error: Failed to read response';
          }
        }

        // Final update with completion status
        console.log('✅ Chat Service: Final update - accumulated content length:', accumulatedContent.length);
        console.log('📄 Chat Service: Final content preview:', accumulatedContent.slice(0, 200) + (accumulatedContent.length > 200 ? '...' : ''));

        // Check if content is empty and provide a meaningful fallback
        if (!accumulatedContent || accumulatedContent.trim().length === 0) {
          console.log('⚠️ Chat Service: Accumulated content is empty, using fallback');
          accumulatedContent = 'I processed your request but received no response content.';
        }

        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: accumulatedContent,
              variables: {
                ...(last as any).variables,
                HAD_STREAMING: '1',
                STREAM_COMPLETE: '1',
                ASSISTANT_RESPONSE: accumulatedContent
              }
            } as any;
          }
          // Persist the complete final message
          console.log('💾 Chat Service: Saving to database');
          saveChatHistory(updated);
          return updated;
        });

        // Set loading to false to hide "Thinking..." indicator
        setLoading(false);
      } else {
        // Non-streaming JSON response
        console.log('📄 Chat Service: Handling non-streaming JSON response');
        const result = await response.json();
        console.log('📄 Chat Service: JSON result:', result);

        const content = result.message || result.result?.content || 'Processing completed.';
        console.log('📄 Chat Service: Using content:', content);

        const updatedMessages = [...newMessagesWithAssistant];
        const lastMessage = updatedMessages[updatedMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: content,
            variables: { ASSISTANT_RESPONSE: content }
          } as any;
        }
        setMessages(updatedMessages);
        await saveChatHistory(updatedMessages);
        setLoading(false);
      }

      // Clear selection if it was valid and used
      if (validSelection) {
        setSelection(null);
      }
      console.log("Skipping graph refresh");
      // Only refresh if the graph was actually modified
      /* if (result.graphModified) {
        await loadProjectFromFileSystem();
        triggerRefresh();
      } */

    } catch (error) {
      console.error('Chat service error:', error);
      
      // Update the assistant message with error
      const errorMessages = [...newMessagesWithAssistant];
      const lastMessage = errorMessages[errorMessages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        errorMessages[errorMessages.length - 1] = {
          ...lastMessage,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
        };
      }
      setMessages(errorMessages);
      // Save the error state to database
      await saveChatHistory(errorMessages);
    } finally {
      setLoading(false);
    }
  }, [currentFile, selection, selectedNodeId, selectedNode, setSelection, messages, saveChatHistory]);

  // Function to clear chat history
  const clearMessages = useCallback(async () => {
    try {
      // Clear frontend state immediately
      setMessages([]);
      setLoading(false);
      
      // Clear chat history from database
      const response = await fetch('/api/chat', {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.error('Failed to clear chat history from database');
      }
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  }, []);

  return {
    state: { messages, loading, loadingHistory },
    actions: { sendMessage, clearMessages, loadChatHistory }
  };
} 
