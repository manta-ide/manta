/**
 * Simple Chat Service
 * 
 * React hook that manages chat state and makes requests to the agent-request API.
 * No streaming complexity - just basic message management.
 */

import { useState, useCallback } from 'react';
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

    // Add user message to UI
    setMessages((prev) => [...prev, userMessage]);

    setLoading(true);

    try {
      // Create assistant message placeholder
      const assistantMessage: Message = {
        role: 'assistant',
        content: 'Processing your request...',
        messageContext
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      // Make request to edit-graph API for general chat messages
      const response = await fetch('/api/backend/agent-request/edit-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      // Get the JSON response
      const result = await response.json();
      
      // Update the assistant message with the result
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMessage,
            content: result.message || 'Request completed successfully',
            variables: { ASSISTANT_RESPONSE: result.message || 'Request completed successfully' }
          };
        }
        return updated;
      });

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
      setMessages((prev) => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          updated[updated.length - 1] = {
            ...lastMessage,
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [currentFile, selection, selectedNodeId, selectedNode, setSelection]);

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
      
      // Clear backend conversation
      const response = await fetch('/api/chat/clear', {
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
  }, []);

  return {
    state: { messages, loading },
    actions: { sendMessage, clearMessages, rebuildNode }
  };
} 