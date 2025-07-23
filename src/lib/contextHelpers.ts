import { Message } from '@/app/api/chat/route';
import { isValidSelection, Selection } from '@/lib/selectionHelpers';

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

export function convertToApiMessages(messages: DisplayMessage[]): Message[] {
  return messages.map(msg => ({
    role: msg.role,
    variables: msg.variables
  }));
} 