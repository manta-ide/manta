/**
 * Simple Chat Service
 * 
 * React hook that manages chat state and makes requests to the agent-request API.
 * No streaming complexity - just basic message management.
 */

import { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '@/lib/store';
import { isValidSelection } from '@/app/api/lib/selectionUtils';
import { useAuth } from '@/lib/auth-context';
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
  const { user } = useAuth();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load chat history when user becomes available
  useEffect(() => {
    if (user?.id) {
      loadChatHistory();
    }
  }, [user?.id]);

  // Function to load chat history from database
  const loadChatHistory = useCallback(async () => {
    if (!user?.id) return;

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
        // Only log error if it's not a 404 (user has no chat history yet)
        if (response.status !== 404) {
          console.error('Failed to load chat history:', response.status, response.statusText);
        }
        // Set empty array for new users
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.id]);

  // Function to save chat history to database
  const saveChatHistory = useCallback(async (newMessages: Message[]) => {
    if (!user?.id) return;

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
  }, [user?.id]);

  const sendMessage = useCallback(async (input: string, contextFlags?: { includeFile?: boolean, includeSelection?: boolean, includeNode?: boolean }) => {
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
    const response = await fetch('/api/backend/agent-request/edit-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage }),
    });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('text/plain') || contentType.includes('text/event-stream')) {
        // Streaming mode: accumulate raw chunks without per-line trimming to avoid accidental loss.
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        // We want to wait a bit before revealing the first chunks
        // so the UI can animate the whole message when generation is quick.
        const streamStart = Date.now();
        const revealDelayMs = 900; // small delay to favor full-animation on short responses
        const minCharsBeforeReveal = 400; // wait until we have a decent chunk
        let revealed = false; // whether we've started showing partial content

        const sanitizeAssistant = (text: string) => {
          return text
            .replace(/\{\{#ASSISTANT_RESPONSE\}\}/g, '')
            .replace(/\{\{\/ASSISTANT_RESPONSE\}\}/g, '');
        };

        const normalizeMarkdownLists = (text: string) => {
          const lines = text.split(/\r?\n/);
          let insideOl = false;
          let sawOlItemOnPrevNonEmptyLine = false;
          const out: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const isOl = /^\s*\d+\.\s+/.test(raw);
            const isUlTop = /^\s*[-*+]\s+/.test(raw);
            const isEmpty = /^\s*$/.test(raw);

            if (isOl) {
              insideOl = true;
              sawOlItemOnPrevNonEmptyLine = true;
              out.push(raw);
              continue;
            }

            if (isUlTop && insideOl && sawOlItemOnPrevNonEmptyLine) {
              // Ensure nested UL is actually nested inside the preceding OL item by indenting
              const indented = '    ' + raw.trimStart();
              out.push(indented);
              continue;
            }

            if (!isEmpty) {
              // Any non-list, non-empty line breaks the OL context
              insideOl = false;
              sawOlItemOnPrevNonEmptyLine = false;
            } else {
              // Keep empty line but don't break OL context; next UL may still belong to current li
              sawOlItemOnPrevNonEmptyLine = false;
            }

            out.push(raw);
          }
          return out.join('\n');
        };

        if (reader) {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            // Append chunk as-is to avoid losing large content due to line splitting edge cases
            fullText += chunk;

            // Decide whether to reveal streaming content yet, or keep showing Thinking...
            const now = Date.now();
            if (!revealed) {
              const waitedLongEnough = now - streamStart >= revealDelayMs;
              const hasEnoughContent = fullText.length >= minCharsBeforeReveal;
              // Reveal only if generation is taking longer AND we have some meaningful text
              if (waitedLongEnough && hasEnoughContent) {
                revealed = true;
                const nextText = normalizeMarkdownLists(sanitizeAssistant(fullText));
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: nextText,
                      // Mark that this message began streaming in the UI
                      variables: { ...(last as any).variables, HAD_STREAMING: '1' }
                    } as any;
                  }
                  return updated;
                });
              }
            } else {
              // Already revealing; keep updating progressively
              const nextText = normalizeMarkdownLists(sanitizeAssistant(fullText));
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: nextText } as any;
                }
                return updated;
              });
            }
          }
        }

        const finalContentRaw = sanitizeAssistant(fullText).trim();
        const finalContent = normalizeMarkdownLists(finalContentRaw);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: finalContent,
              // Preserve HAD_STREAMING if it was set; set final response for persistence
              variables: finalContent
                ? { ...(last as any).variables, ASSISTANT_RESPONSE: finalContent }
                : (last as any).variables
            } as any;
          }
          // Persist the complete final message
          saveChatHistory(updated);
          return updated;
        });
      } else {
        // Non-streaming JSON response
        const result = await response.json();
        
        const updatedMessages = [...newMessagesWithAssistant];
        const lastMessage = updatedMessages[updatedMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: result.message || result.result?.content || 'Request completed successfully',
            variables: { ASSISTANT_RESPONSE: result.message || result.result?.content || 'Request completed successfully' }
          } as any;
        }
        setMessages(updatedMessages);
        await saveChatHistory(updatedMessages);
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

  const rebuildNode = useCallback(async (nodeId: string, previousPrompt: string, newPrompt: string) => {
    setLoading(true);

    try {
      // Create user message for rebuild request
      const userMessage = {
        role: 'user',
        content: 'Rebuild selected node',
        variables: { 
          USER_REQUEST: 'Rebuild selected node',
          NODE_ID: nodeId,
          PREVIOUS_PROMPT: previousPrompt,
          NEW_PROMPT: newPrompt
        }
      };

      // Use the code-editor agent with explicit node selection
      const response = await fetch('/api/agents/code-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage,
          nodeId: nodeId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to trigger rebuild');
      }

      // Get the JSON response
      const result = await response.json();
      console.log('Rebuild result:', result);

      console.log("Skipping refresh");
      // Only refresh if the graph was actually modified
      /* if (result.graphModified) {
        await loadProjectFromFileSystem();
        triggerRefresh();
      } */

    } catch (error) {
      console.error('Node rebuild error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMessages = useCallback(async () => {
    try {
      // Clear frontend state immediately
      setMessages([]);
      setLoading(false);
      
      // Clear user's chat history from database
      if (user?.id) {
        const response = await fetch('/api/chat', {
          method: 'DELETE',
          credentials: 'include',
        });
        
        if (!response.ok) {
          console.error('Failed to clear chat history from database');
        }
      }
      
      // Clear backend conversation (keep existing functionality)
      const response = await fetch('/api/llm-agent/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        console.error('Failed to clear conversation on backend');
      }
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  }, [user?.id]);

  return {
    state: { messages, loading, loadingHistory },
    actions: { sendMessage, clearMessages, rebuildNode, loadChatHistory }
  };
} 
