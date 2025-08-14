import { Message, ParsedMessage } from './schemas';
import { getGraphSession } from './graphStorage';

// In-memory storage for conversation
// In production, this should be replaced with a proper database
let conversationMessages: Message[] = [];

/**
 * Get all files from the project using the files API
 */
async function getAllProjectFiles(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  
  try {
    // Call the files API to get just the file list with lengths
    const response = await fetch('http://localhost:3000/api/files?list=true', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Files API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert the file list to a Map (we'll need to fetch individual files when needed)
    if (data.files && Array.isArray(data.files)) {
      data.files.forEach((file: any) => {
        // For now, we'll store empty content and fetch when needed
        // This prevents loading all file contents at once
        files.set(file.route, '');
      });
    }
  } catch (error) {
    console.error('Failed to fetch files from API:', error);
    // Fallback to empty files if API fails
  }
  
  return files;
}

/**
 * Get a specific file's content
 */
async function getFileContent(filePath: string): Promise<string> {
  try {
    // Call the files API to get the specific file content
    const response = await fetch(`http://localhost:3000/api/files?path=${encodeURIComponent(filePath)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Files API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.content || '';
  } catch (error) {
    console.error(`Failed to fetch file content for ${filePath}:`, error);
    return '';
  }
}

/**
 * Create a system message with project context
 */
export async function createSystemMessage(): Promise<Message> {
  
  // Get file list with lengths from the API response
  const response = await fetch('http://localhost:3000/api/files?list=true');
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
      MAX_NODES: "7"
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