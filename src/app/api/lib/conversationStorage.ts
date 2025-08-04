import { Message, ParsedMessage } from './schemas';
import { getGraphSession } from './graphStorage';

// In-memory storage for conversation sessions
// In production, this should be replaced with a proper database
const conversationSessions = new Map<string, Message[]>();

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
async function createSystemMessage(currentFile?: string, sessionId?: string): Promise<Message> {
  
  // Get file list with lengths from the API response
  const response = await fetch('http://localhost:3000/api/files?list=true');
  const data = await response.json();
  
  // Get current file content only if needed
  let currentFileContent = '';
  if (currentFile) {
    currentFileContent = await getFileContent(currentFile);
  }

  // Get graph from storage if sessionId is provided
  let graphContext = '';
  if (sessionId) {
    try {
      const graph = getGraphSession(sessionId);
      if (graph) {
        graphContext = JSON.stringify(graph, null, 2);
      }
    } catch (error) {
      console.warn('Failed to get graph from storage:', error);
    }
  }
  
  return {
    role: 'system',
    variables: {
      PROJECT_FILES: data.files || [],
      CURRENT_FILE: currentFile || '',
      CURRENT_FILE_CONTENT: currentFileContent,
      GRAPH_CONTEXT: graphContext
    }
  };
}

/**
 * Get or create a conversation session
 */
export function getConversationSession(sessionId: string): Message[] {
  if (!conversationSessions.has(sessionId)) {
    conversationSessions.set(sessionId, []);
  }
  return conversationSessions.get(sessionId)!;
}

/**
 * Add a message to a conversation session
 */
export function addMessageToSession(sessionId: string, message: Message): void {
  const session = getConversationSession(sessionId);
  session.push(message);
}

/**
 * Build the complete conversation for the AI model
 * Includes system message with project context and conversation history
 */
export async function buildConversationForAI(
  sessionId: string, 
  userMessage: Message
): Promise<Message[]> {
  // Get or create session
  const session = getConversationSession(sessionId);
  
  // Extract current file from user message context
  const currentFile = userMessage.messageContext?.currentFile || undefined;
  
  // Create system message with current project state and graph context
  const systemMessage = await createSystemMessage(currentFile, sessionId);
  
  // Add the new user message to the session
  addMessageToSession(sessionId, userMessage);
  
  // Build the complete conversation: system + history + new message
  const allMessages = [systemMessage, ...session];
  
  return allMessages;
}

/**
 * Clear a conversation session
 */
export function clearConversationSession(sessionId: string): void {
  conversationSessions.delete(sessionId);
}

/**
 * Get conversation statistics
 */
export function getConversationStats(): { sessionCount: number; totalMessages: number } {
  let totalMessages = 0;
  for (const session of conversationSessions.values()) {
    totalMessages += session.length;
  }
  
  return {
    sessionCount: conversationSessions.size,
    totalMessages
  };
} 