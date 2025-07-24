import { RefObject } from 'react';
import { isValidSelection, Selection } from '@/lib/selectionHelpers';

/** Base typing speed: characters appended per animation frame. */
export const BASE_CHARS_PER_FRAME = 2;
/** Maximum typing speed when catching up */
export const MAX_CHARS_PER_FRAME = 20;
/** Queue size threshold to start speeding up */
export const SPEED_UP_THRESHOLD = 50;

export interface StreamingState {
  charQueueRef: RefObject<string[]>;
  animatingRef: RefObject<boolean>;
  streamIdxRef: RefObject<number | null>;
  typedLenRef: RefObject<number>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content?: string;
  operations?: any;
  variables?: Record<string, string>;
  messageContext?: {
    currentFile?: string | null;
    selection?: Selection | null;
  };
}

/** Scroll to bottom helper */
export function scrollToBottom(scrollRef: RefObject<HTMLDivElement | null>): void {
  const el = scrollRef.current;
  if (!el) return;
  // No smooth each frame; cheap immediate pin
  el.scrollTop = el.scrollHeight;
}

/** Calculate adaptive typing speed based on queue size */
function getAdaptiveSpeed(queueSize: number): number {
  if (queueSize < SPEED_UP_THRESHOLD) {
    return BASE_CHARS_PER_FRAME;
  }
  
  // Exponential scale up based on queue size
  const multiplier = Math.min(
    MAX_CHARS_PER_FRAME / BASE_CHARS_PER_FRAME,
    1 + (queueSize / SPEED_UP_THRESHOLD) * 2
  );
  
  return Math.floor(BASE_CHARS_PER_FRAME * multiplier);
}

/** rAF typewriter drain with adaptive speed */
export function kickAnimation(
  streamingState: StreamingState,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  scrollRef: RefObject<HTMLDivElement | null>
): void {
  if (streamingState.animatingRef.current) return;
  streamingState.animatingRef.current = true;

  const step = () => {
    if (streamingState.charQueueRef.current && streamingState.charQueueRef.current.length > 0 && streamingState.streamIdxRef.current !== null) {
      const queueSize = streamingState.charQueueRef.current.length;
      const charsThisFrame = getAdaptiveSpeed(queueSize);
      
      const chunk = streamingState.charQueueRef.current.splice(0, charsThisFrame).join('');
      streamingState.typedLenRef.current = (streamingState.typedLenRef.current || 0) + chunk.length;
      
      setMessages((prev) => {
        const updated = [...prev];
        const idx = streamingState.streamIdxRef.current!;
        const m = updated[idx];
        updated[idx] = {
          ...m,
          content: (m?.content ?? '') + chunk,
        };
        return updated;
      });
      
      scrollToBottom(scrollRef); // keep view pinned
      requestAnimationFrame(step);
    } else {
      streamingState.animatingRef.current = false;
    }
  };

  requestAnimationFrame(step);
}

export interface StreamEvent {
  t: 'token' | 'final' | 'error' | 'tool_call' | 'tool_result';
  d?: string;
  reply?: string;
  operations?: any;
  error?: string;
  toolName?: string;
  args?: any;
  result?: any;
  codeBlock?: {
    language: string;
    filename: string;
    content: string;
  };
}

/** Parse & handle one NDJSON event */
export async function processStreamLine(
  line: string,
  streamingState: StreamingState,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  scrollRef: RefObject<HTMLDivElement | null>,
  onOperations: (operations: any[]) => Promise<void>,
  onComplete: () => void,
  onFullResponse?: (fullResponse: string) => void
): Promise<void> {
  try {
    const evt = JSON.parse(line) as StreamEvent;

    if (evt.t === 'token') {
      if (evt.d) {
        if (streamingState.charQueueRef.current) {
          streamingState.charQueueRef.current.push(...evt.d.split(''));
        }
        kickAnimation(streamingState, setMessages, scrollRef);
      }
    } else if (evt.t === 'tool_call') {
      // Show code block immediately with calling status in header
      setMessages((prev) => {
        const updated = [...prev];
        const idx = streamingState.streamIdxRef.current ?? updated.length - 1;
        const currentContent = updated[idx]?.content || '';
        
        // Create a placeholder code block with calling status
        let toolMessage = '';
        if (evt.toolName === 'createFile' || evt.toolName === 'updateFile') {
          const operation = evt.toolName === 'createFile' ? 'create' : 'update';
          const filePath = evt.args?.path || 'file';
          toolMessage = `\n\`\`\`${operation}:${filePath}:calling\nLoading...\n\`\`\`\n`;
        } else if (evt.toolName === 'patchFile') {
          const filePath = evt.args?.path || 'file';
          toolMessage = `\n\`\`\`patch:${filePath}:calling\nLoading...\n\`\`\`\n`;
        } else if (evt.toolName === 'deleteFile') {
          const filePath = evt.args?.path || 'file';
          toolMessage = `\n\`\`\`delete:${filePath}:calling\nPreparing to delete file...\n\`\`\`\n`;
        } else {
          // Fallback for other tools
          toolMessage = `\n\`\`\`tool-status:${evt.toolName}:calling\n🔧 Calling ${evt.toolName}\n\`\`\`\n`;
        }
        
        updated[idx] = {
          ...updated[idx],
          content: currentContent + toolMessage
        };
        
        return updated;
      });
      scrollToBottom(scrollRef);
    } else if (evt.t === 'tool_result') {
      // Replace the calling code block with the actual result
      if (!evt.toolName) {
        console.warn('Tool result missing toolName');
        return;
      }
      
      // Apply file operation immediately to update AppViewer
      if (evt.result?.operation) {
        await onOperations([evt.result.operation]);
      }
      
      setMessages((prev) => {
        const updated = [...prev];
        const idx = streamingState.streamIdxRef.current ?? updated.length - 1;
        const currentContent = updated[idx]?.content || '';
        
        let newContent = currentContent;
        
        // Replace the calling code block with the actual result
        if (evt.codeBlock) {
          // Create the calling pattern to replace
          const escapedToolName = evt.toolName!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          if (evt.toolName === 'createFile' || evt.toolName === 'updateFile') {
            const operation = evt.toolName === 'createFile' ? 'create' : 'update';
            const filePath = evt.codeBlock.filename;
            const callingPattern = `\`\`\`${operation}:${filePath}:calling\nLoading...\n\`\`\``;
            const resultBlock = `\`\`\`${evt.codeBlock.language}\n${evt.codeBlock.content}\n\`\`\``;
            newContent = newContent.replace(callingPattern, resultBlock);
          } else if (evt.toolName === 'patchFile') {
            const filePath = evt.codeBlock.filename;
            const callingPattern = `\`\`\`patch:${filePath}:calling\nLoading...\n\`\`\``;
            const resultBlock = `\`\`\`${evt.codeBlock.language}\n${evt.codeBlock.content}\n\`\`\``;
            newContent = newContent.replace(callingPattern, resultBlock);
          } else if (evt.toolName === 'deleteFile') {
            const filePath = evt.codeBlock.filename;
            const callingPattern = `\`\`\`delete:${filePath}:calling\nPreparing to delete file...\n\`\`\``;
            const resultBlock = `\`\`\`${evt.codeBlock.language}\nFile deleted: ${filePath}\n\`\`\``;
            newContent = newContent.replace(callingPattern, resultBlock);
          }
        } else {
          // Fallback for tools without code blocks
          const callingPattern = `\`\`\`tool-status:${evt.toolName}:calling\n🔧 Calling ${evt.toolName}\n\`\`\``;
          const completedBlock = `\`\`\`tool-status:${evt.toolName}:completed\n✅ ${evt.toolName} completed\n\`\`\``;
          newContent = newContent.replace(callingPattern, completedBlock);
        }
        
        updated[idx] = {
          ...updated[idx],
          content: newContent
        };
        
        return updated;
      });
      
      scrollToBottom(scrollRef);
    } else if (evt.t === 'final') {
      // Log the full response if callback provided
      if (onFullResponse && evt.reply) {
        onFullResponse(evt.reply);
      }

      // no content overwrite; trust streamed tokens
      if (process.env.NODE_ENV !== 'production') {
        const typedLen = streamingState.typedLenRef.current || 0;
        const replyLen = evt.reply?.length || 0;
        const diff = replyLen - typedLen;
        if (diff !== 0) {
          console.warn(
            `Typewriter: final reply length (${replyLen}) != typed (${typedLen}). diff=${diff}`
          );
        }
      }

      // attach operations once typing done (for backward compatibility)
      const waitUntilDone = async () => {
        const isAnimating = streamingState.animatingRef.current;
        const hasQueuedChars = streamingState.charQueueRef.current && streamingState.charQueueRef.current.length > 0;
        
        if (isAnimating || hasQueuedChars) {
          requestAnimationFrame(waitUntilDone);
          return;
        }
        
        setMessages((prev) => {
          const updated = [...prev];
          const idx = streamingState.streamIdxRef.current ?? updated.length - 1;
          updated[idx] = {
            ...updated[idx],
            operations: evt.operations || [],
            variables: { ASSISTANT_RESPONSE: evt.reply || '' }
          };
          return updated;
        });
        
        // Apply file operations to the project (for backward compatibility)
        if (evt.operations && evt.operations.length > 0) {
          await onOperations(evt.operations);
        }
        
        streamingState.streamIdxRef.current = null;
        onComplete();
        scrollToBottom(scrollRef);
      };
      waitUntilDone();
    } else if (evt.t === 'error') {
      console.error('❌ Model error:', evt.error);
    }
  } catch (err) {
    console.error('❌ Bad stream line', line, err);
  }
}

export function createMessageContext(
  currentFile: string | null,
  selection: Selection | null
) {
  return {
    currentFile,
    selection: isValidSelection(selection) ? selection : null
  };
} 