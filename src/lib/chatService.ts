/**
 * Simple Chat Service
 * 
 * React hook that manages chat state and makes requests to the agent-request API.
 * No streaming complexity - just basic message management.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '@/lib/store';
import {
  Message,
  MessageContext
} from '@/app/api/lib/schemas';

/**
 * Custom React hook for managing chat functionality
 * Handles message sending and basic state management
 */
interface SendMessageOptions {
  includeFile?: boolean;
  includeNodes?: boolean;
  displayContent?: string;
  resume?: string;
  onSessionId?: (sessionId: string) => void;
}

export function useChatService() {
  const { currentFile, selectedNodeId, selectedNode, selectedNodeIds } = useProjectStore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load chat history (no persistence - empty on load)
useEffect(() => {
  loadChatHistory();
}, []);


  // Function to load chat history (no persistence - empty on load)
  const loadChatHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      // Chat history is not persisted - always start with empty array
      setMessages([]);
    } catch (error) {
      console.error('Error initializing chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Function to save chat history (no persistence - messages are not saved)
  const saveChatHistory = useCallback(async (newMessages: Message[]) => {
    // Chat history is not persisted - this is a no-op
  }, []);

  const sendMessage = useCallback(async (input: string, options?: SendMessageOptions) => {
    const onSessionId = options?.onSessionId;
    let receivedSessionId: string | null = null;
    console.log('🚀 Chat Service: sendMessage called with input:', input.slice(0, 100) + (input.length > 100 ? '...' : ''));

    const agentContent = input;
    const displayContent = options?.displayContent ?? agentContent;

    if (!agentContent.trim()) return;

    // Use context flags if provided, otherwise include everything
    const shouldIncludeFile = options?.includeFile !== false;
    const shouldIncludeNodes = options?.includeNodes !== false;

    // Store current context
    const messageContext: MessageContext = {
      currentFile: (shouldIncludeFile && currentFile) || undefined
    };

    // Create base user message for UI
    const userMessage: Message = {
      role: 'user',
      variables: {
        USER_REQUEST: agentContent
      },
      content: displayContent,
      messageContext
    };

    // Add selected node variables if nodes are selected and should be included
    if (shouldIncludeNodes && selectedNodeIds.length > 0) {
      userMessage.variables = {
        ...userMessage.variables,
        SELECTED_NODE_IDS: selectedNodeIds.join(','),
        SELECTED_NODE_COUNT: selectedNodeIds.length.toString()
      };

      // For single node selection, also include the individual node data for backward compatibility
      if (selectedNodeIds.length === 1 && selectedNodeId && selectedNode) {
        userMessage.variables = {
          ...userMessage.variables,
          SELECTED_NODE_ID: selectedNodeId,
          SELECTED_NODE_TITLE: selectedNode.title,
          SELECTED_NODE_PROMPT: selectedNode.description
        };
      }
    }

    // Add user message to UI and save to database
    const agentUserMessage: Message = {
      ...userMessage,
      content: agentContent
    };

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
    console.log('📡 Chat Service: Making request to /api/agent-request');

    const response = await fetch('/api/agent-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: agentUserMessage,
        ...(options?.resume && { resume: options.resume })
      }),
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
                  const dataPart = line.substring(6).trim();
                  console.log('🎯 Chat Service: Processing SSE data:', dataPart.substring(0, 100) + (dataPart.length > 100 ? '...' : '')); // Remove 'data: ' prefix

                  // Skip control messages entirely
                  if (dataPart === '[STREAM_START]' || dataPart === '[STREAM_END]') {
                    chunkContent = '';
                  } else {
                    try {
                      const parsed = JSON.parse(dataPart);
                      console.log('🎯 Chat Service: Parsed SSE data:', { type: parsed.type, hasContent: !!parsed.content, hasSessionId: !!parsed.session_id });
                      if (parsed.content && parsed.type === 'result') {
                        // This is a final result - replace all accumulated content
                        accumulatedContent = parsed.content;
                        // Store session_id if available
                        if (parsed.session_id) {
                          console.log('🎯 Chat Service: Received session_id:', parsed.session_id);
                          receivedSessionId = parsed.session_id;
                          onSessionId?.(parsed.session_id);
                        } else {
                          console.log('🎯 Chat Service: No session_id in result data');
                        }
                        chunkContent = '';
                      } else if (parsed.content) {
                        chunkContent = parsed.content;
                      } else if (parsed.error) {
                        chunkContent = `Error: ${parsed.error}`;
                      } else if (parsed.type === 'trace') {
                        // Handle trace messages - these are separate from final content
                        chunkContent = formatTraceMessage(parsed.trace);
                      } else {
                        // Any other JSON without content/error/trace - skip it
                        chunkContent = '';
                      }
                    } catch {
                      // Not JSON, use as plain text
                      chunkContent = dataPart;
                    }
                  }
                } else {
                  // Handle plain text (non-SSE format)
                  try {
                    const parsed = JSON.parse(line);
                    console.log('🎯 Chat Service: Parsed plain data:', { type: parsed.type, hasContent: !!parsed.content, hasSessionId: !!parsed.session_id });
                    if (parsed.content && parsed.type === 'result') {
                      // This is a final result - replace all accumulated content
                      accumulatedContent = parsed.content;
                      // Store session_id if available
                      if (parsed.session_id) {
                        console.log('🎯 Chat Service: Received session_id from plain:', parsed.session_id);
                        receivedSessionId = parsed.session_id;
                        onSessionId?.(parsed.session_id);
                      } else {
                        console.log('🎯 Chat Service: No session_id in plain result data');
                      }
                      chunkContent = '';
                    } else if (parsed.content) {
                      // Final result - clear any previous trace content and show only the final result
                      chunkContent = parsed.content;
                    } else if (parsed.error) {
                      chunkContent = `Error: ${parsed.error}`;
                    } else if (parsed.type === 'trace') {
                      // Handle trace messages - these are separate from final content
                      chunkContent = formatTraceMessage(parsed.trace);
                    } else {
                      // Skip any other JSON without content/error/trace
                      chunkContent = '';
                    }
                  } catch {
                    // Not JSON, use as plain text
                    chunkContent = line;
                  }
                }

                // Handle content accumulation
                if (chunkContent.trim()) {
                  // For result messages, content is already handled above, so just accumulate other content
                  if (accumulatedContent.length > 0 && !accumulatedContent.endsWith('\n')) {
                    accumulatedContent += '\n';
                  }
                  accumulatedContent += chunkContent;
                }

                console.log(`📝 Chat Service: Chunk ${chunkCount}, total: ${accumulatedContent.length}`);

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

              // Skip control messages entirely
              if (dataPart === '[STREAM_START]' || dataPart === '[STREAM_END]') {
                finalChunk = '';
              } else {
                try {
                  const parsed = JSON.parse(dataPart);
                  if (parsed.content) {
                    finalChunk = parsed.content;
                  } else if (parsed.error) {
                    finalChunk = `Error: ${parsed.error}`;
                  } else if (parsed.type === 'trace') {
                    finalChunk = formatTraceMessage(parsed.trace);
                  } else {
                    finalChunk = '';
                  }
                } catch {
                  finalChunk = dataPart;
                }
              }
            } else {
              // Skip plain text control messages
              if (buffer.trim() === '[STREAM_START]' || buffer.trim() === '[STREAM_END]') {
                finalChunk = '';
              } else {
                try {
                  const parsed = JSON.parse(buffer);
                  if (parsed.content) {
                    finalChunk = parsed.content;
                  } else if (parsed.error) {
                    finalChunk = `Error: ${parsed.error}`;
                  } else if (parsed.type === 'trace') {
                    finalChunk = formatTraceMessage(parsed.trace);
                  } else {
                    finalChunk = '';
                  }
                } catch {
                  finalChunk = buffer;
                }
              }
            }
            if (finalChunk.trim().length > 0) {
              if (accumulatedContent.length > 0 && !accumulatedContent.endsWith('\n')) {
                accumulatedContent += '\n';
              }
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

              // Filter out control messages from fallback response
              accumulatedContent = fullResponse
                .split('\n')
                .filter(line => {
                  const trimmed = line.trim();
                  return trimmed !== 'data: [STREAM_START]' &&
                         trimmed !== 'data: [STREAM_END]' &&
                         trimmed !== '[STREAM_START]' &&
                         trimmed !== '[STREAM_END]';
                })
                .join('\n');
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

            // Filter out control messages from fallback response
            accumulatedContent = fullResponse
              .split('\n')
              .filter(line => {
                const trimmed = line.trim();
                return trimmed !== 'data: [STREAM_START]' &&
                       trimmed !== 'data: [STREAM_END]' &&
                       trimmed !== '[STREAM_START]' &&
                       trimmed !== '[STREAM_END]';
              })
              .join('\n');
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

        // Ensure line breaks are preserved - convert escaped newlines and ensure proper formatting
        accumulatedContent = accumulatedContent.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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
                ASSISTANT_RESPONSE: accumulatedContent,
                // Include session_id if received
                ...(receivedSessionId && { SESSION_ID: receivedSessionId })
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

      console.log("Skipping graph refresh");

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
  }, [currentFile, selectedNodeId, selectedNode, selectedNodeIds, messages, saveChatHistory]);

  // Function to clear chat history
  const clearMessages = useCallback(async () => {
    try {
      // Clear frontend state immediately
      setMessages([]);
      setLoading(false);
      // Chat history is not persisted - no database to clear
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  }, []);

  return {
    state: { messages, loading, loadingHistory },
    actions: { sendMessage, clearMessages, loadChatHistory }
  };
}

/**
 * Format trace messages for display in the chat
 * Returns empty strings for most traces to keep UI clean, but keeps streaming active
 */
export function formatTraceMessage(trace: any): string {
  if (!trace) return '';

  switch (trace.type) {
    case 'system':
      // Don't show system messages - let chat handle its own thinking indicator
      return '';

    case 'tool_call': {
      // Show tool calls in UI with clean formatting
      const toolName = trace.tool?.replace('mcp__graph-tools__', '');
      const args = trace.arguments ? Object.keys(trace.arguments) : [];
      const argsText = args.length > 0 ? ` (${args.slice(0, 3).join(', ')}${args.length > 3 ? '...' : ''})` : '';
      return `🔧 ${toolName}${argsText}\n`;
    }

    case 'thinking':
      // Don't show thinking content - let chat handle its own thinking animation
      return '';

    case 'user_message':
    case 'message':
      // Return empty string to hide these traces from UI but keep streaming active
      return '';

    default:
      // Hide all other traces from UI
      return '';
  }
} 
