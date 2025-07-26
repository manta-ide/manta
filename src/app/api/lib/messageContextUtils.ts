/**
 * Message Context Processing Utilities
 * 
 * Backend utilities for creating and managing message contexts for AI chat.
 * Handles system message creation, user message formatting, and selection context.
 * 
 * This is a backend-only utility that processes message data for AI consumption.
 */

import { Message } from '@/app/api/chat/route';
import { Selection } from '@/lib/uiSelectionUtils';

export interface MessageContext {
  currentFile?: string | null;
  selection?: Selection | null;
}

export interface DisplayMessage extends Message {
  content?: string; // For display purposes only
  operations?: any; // For file operations
  // Store selection context for this message
  messageContext?: MessageContext;
}

/**
 * Validates if a selection object is meaningful for AI processing
 */
function isValidSelection(selection: Selection | null | undefined): selection is Selection {
  if (!selection) return false;
  
  // Must have positive dimensions and be reasonably sized (at least 5x5 pixels)
  return selection.width >= 5 && 
         selection.height >= 5 && 
         selection.x >= 0 && 
         selection.y >= 0;
}

/**
 * Creates a system message with project context for the AI
 * Includes all project files and current file information
 */
export function createSystemMessage(
  allFiles: Map<string, string>,
  currentFile: string | null
): Message {
  const projectStructure = JSON.stringify(Object.fromEntries(allFiles), null, 2);
  
  return {
    role: 'system',
    variables: { 
      PROJECT_FILES: projectStructure,
      CURRENT_FILE: currentFile || '',
      CURRENT_FILE_CONTENT: currentFile ? allFiles.get(currentFile) || '' : ''
    }
  };
}

/**
 * Creates a user message with context information for the AI
 * Includes selection data if valid selection is provided
 */
export function createUserMessage(
  input: string,
  messageContext: MessageContext,
  selection?: Selection | null
): DisplayMessage {
  const validSelection = isValidSelection(selection);
  
  const userMessage: DisplayMessage = { 
    role: 'user', 
    variables: { USER_REQUEST: input },
    content: input,
    messageContext: {
      currentFile: messageContext.currentFile,
      selection: validSelection ? selection : null
    }
  };

  // Add selection variables to user message only if selection is valid
  if (validSelection) {
    userMessage.variables = {
      ...userMessage.variables,
      SELECTION: 'true',
      SELECTION_X: selection.x.toString(),
      SELECTION_Y: selection.y.toString(),
      SELECTION_WIDTH: selection.width.toString(),
      SELECTION_HEIGHT: selection.height.toString()
    };
  }

  return userMessage;
}

/**
 * Converts display messages to API-compatible messages
 * Strips UI-specific properties and keeps only variables for AI processing
 */
export function convertToApiMessages(messages: DisplayMessage[]): Message[] {
  return messages.map(msg => ({
    role: msg.role,
    variables: msg.variables
  }));
} 