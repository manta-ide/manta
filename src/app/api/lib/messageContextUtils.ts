/**
 * Message Context Processing Utilities
 * 
 * Backend utilities for creating and managing message contexts for AI chat.
 * Handles system message creation, user message formatting, and selection context.
 * 
 * This is a backend-only utility that processes message data for AI consumption.
 */

import { 
  Message,
  MessageContext,
  Selection,
  MessageVariables,
  SystemVariablesSchema,
  UserVariablesSchema
} from './schemas';

/**
 * Validates if a selection object is meaningful for AI processing
 */
export function isValidSelection(selection: Selection | null | undefined): selection is Selection {
  if (!selection) return false;
  
  // Must have positive dimensions and be reasonably sized (at least 5x5 pixels)
  return selection.width >= 5 && 
         selection.height >= 5 && 
         selection.x >= 0 && 
         selection.y >= 0;
}

/**
 * Creates a message context object from current file and selection
 */
export function createMessageContext(
  currentFile: string | null,
  selection: Selection | null
): MessageContext {
  return {
    currentFile,
    selection
  };
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
  
  const variables = SystemVariablesSchema.parse({
    PROJECT_FILES: projectStructure,
    CURRENT_FILE: currentFile || '',
    CURRENT_FILE_CONTENT: currentFile ? allFiles.get(currentFile) || '' : ''
  });
  
  return {
    role: 'system',
    variables
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
): Message {
  const validSelection = isValidSelection(selection);
  
  // Create base variables
  const variables: MessageVariables = {
    USER_REQUEST: input
  };

  // Add selection variables to user message only if selection is valid
  if (validSelection && selection) {
    Object.assign(variables, {
      SELECTION: 'true',
      SELECTION_X: selection.x.toString(),
      SELECTION_Y: selection.y.toString(),
      SELECTION_WIDTH: selection.width.toString(),
      SELECTION_HEIGHT: selection.height.toString(),
      SELECTION_ELEMENTS: selection.selectedElements
    });
  }
  
  // Validate with UserVariablesSchema
  const validatedVariables = UserVariablesSchema.parse(variables);
  
  const userMessage: Message = { 
    role: 'user', 
    variables: validatedVariables,
    content: input,
    messageContext: {
      currentFile: messageContext.currentFile,
      selection: validSelection ? selection : null
    }
  };

  return userMessage;
}

/**
 * Converts display messages to API-compatible messages
 * Strips UI-specific properties and keeps only variables for AI processing
 */
export function convertToApiMessages(messages: Message[]): Message[] {
  return messages.map(msg => ({
    role: msg.role,
    variables: msg.variables
  }));
} 