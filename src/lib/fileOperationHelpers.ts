import { applyAllDiffBlocks } from '@/app/diffHelpers';

export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'patch';
  path: string;
  content?: string;
}

export function parseFileOperations(response: string): FileOperation[] {
  const operations: FileOperation[] = [];
  
  // Look for file operation blocks in the response
  const fileOpRegex = /```(create|update|delete|patch):([^\n]+)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = fileOpRegex.exec(response)) !== null) {
    const [, type, pathRaw, content] = match;
    const trimmedContent = content.trim();
    
    // Use the path as provided by the LLM, just clean whitespace
    let cleanPath = pathRaw.trim();
    
    console.log(`📝 Parsed operation: ${type} on "${cleanPath}"`);
    
    if (type === 'patch') {
      // Log the diff format being used
      if (trimmedContent.includes('@@')) {
        console.log('📋 Using unified diff format (@@)');
      } else {
        console.log('📋 Using simple diff format');
      }
      
      // Store the raw diff content for processing
      operations.push({
        type: 'patch',
        path: cleanPath,
        content: trimmedContent
      });
    } else {
      // Validate that the content is not using placeholder comments
      if (type !== 'delete' && trimmedContent) {
        const hasPlaceholderComments = 
          trimmedContent.includes('...rest unchanged') ||
          trimmedContent.includes('... existing code ...') ||
          trimmedContent.includes('...rest of page unchanged') ||
          trimmedContent.includes('... rest of file unchanged') ||
          /\/\*.*?\.{3}.*?\*\//.test(trimmedContent) ||
          /\/\/.*?\.{3}/.test(trimmedContent);
        
        if (hasPlaceholderComments) {
          console.warn(`Warning: File operation for ${cleanPath} contains placeholder comments. This may result in incomplete file content.`);
        }
      }
      
      operations.push({
        type: type as 'create' | 'update' | 'delete',
        path: cleanPath,
        content: type === 'delete' ? undefined : trimmedContent
      });
    }
  }
  
  // Also look for individual file operations described in text
  const textOpRegex = /(?:create|update|delete)\s+(?:file\s+)?["`']([^"`']+)["`'](?:\s+with\s+content)?/gi;
  while ((match = textOpRegex.exec(response)) !== null) {
    const [fullMatch, filePath] = match;
    const operation = fullMatch.toLowerCase().startsWith('create') ? 'create' :
                     fullMatch.toLowerCase().startsWith('update') ? 'update' : 'delete';
    
    // Use path as-is
    const cleanPath = filePath.trim();
    
    // Only add if we don't already have an operation for this file
    if (!operations.find(op => op.path === cleanPath)) {
      operations.push({
        type: operation,
        path: cleanPath,
        content: operation === 'delete' ? undefined : ''
      });
    }
  }
  
  return operations;
}

export interface ProjectStore {
  createFile: (path: string, content: string) => Promise<void>;
  setFileContent: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  getFileContent: (path: string) => string | null;
}

export async function applyFileOperations(operations: any[], store: ProjectStore): Promise<void> {
  if (!operations || !Array.isArray(operations)) return;
  
  for (const op of operations) {
    try {
      switch (op.type) {
        case 'create':
          await store.createFile(op.path, op.content || '');
          break;
        case 'update':
          await store.setFileContent(op.path, op.content || '');
          break;
        case 'patch':
          // Apply patch using diff helpers
          const currentContent = store.getFileContent(op.path);
          console.log(`🔧 Patch operation for ${op.path} (${currentContent ? currentContent.length : 'null'} chars)`);
          
          if (currentContent && op.content) {
            const newContent = applyAllDiffBlocks(currentContent, [op.content]);
            
            if (newContent !== currentContent) {
              await store.setFileContent(op.path, newContent);
              console.log(`✅ Patch applied successfully to ${op.path}`);
            } else {
              console.warn(`❌ Patch operation failed: no changes made to ${op.path}`);
            }
          } else {
            console.warn(`❌ Patch operation failed: missing content for ${op.path}`);
          }
          break;
        case 'delete':
          await store.deleteFile(op.path);
          break;
      }
    } catch (error) {
      console.error('Error applying file operation:', error);
    }
  }
} 