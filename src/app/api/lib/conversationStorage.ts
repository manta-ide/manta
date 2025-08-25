import { Message } from './schemas';
import { getGraphSession } from './graphStorage';

// In-memory storage for conversation
// In production, this should be replaced with a proper database
let conversationMessages: Message[] = [];
/**
 * Create a system message with project context
 */
export async function createSystemMessage(): Promise<Message> {
  
  // Get file list with lengths from the API response
  const response = await fetch('BACKEND_URL/api/files?list=true');
  const data = await response.json();

  // Get graph from storage
  let graphContext = '';
  try {
    const graph = getGraphSession();
    if (graph) {
      graphContext = JSON.stringify(graph, null, 2);
    }
  } catch (error) {
    console.warn('Failed to get graph from storage:', error);
  }
  
  return {
    role: 'system',
    variables: {
      PROJECT_FILES: data.files || [],
      GRAPH_CONTEXT: graphContext,
      MAX_NODES: "5"
    },
    content: ""
  };
}

/**
 * Get the conversation messages
 */
export function getConversationSession(): Message[] {
  return conversationMessages;
}

/**
 * Add a message to the conversation
 */
export function addMessageToSession(message: Message): void {
  conversationMessages.push(message);
}

/**
 * Clear the conversation
 */
export function clearConversationSession(): void {
  conversationMessages = [];
}

/**
 * Get conversation statistics
 */
export function getConversationStats(): { messageCount: number } {
  return {
    messageCount: conversationMessages.length
  };
} 