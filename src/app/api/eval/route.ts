import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { azure } from '@ai-sdk/azure';
import { z } from 'zod';
import { 
  EvalRequestSchema, 
  TestCase, 
  EvalResult,
  Message,
  Selection
} from '../lib/schemas';
import { 
  createJob, 
  updateJob, 
  generateJobId, 
  calculateStatistics 
} from '../lib/evalJobStorage';
import { getTemplate, parseMessageWithTemplate } from '../lib/promptTemplateUtils';
import { isValidSelection } from '../lib/messageContextUtils';

// Judge response schema for structured output
const JudgeResponseSchema = z.object({
  score: z.number().min(1).max(100),
  reasoning: z.string(),
});

// Function to load project files using the files API
async function loadProjectFiles(): Promise<Map<string, string>> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/files`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Files API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return new Map(Object.entries(data.files));
  } catch (error) {
    console.error('Error loading project files:', error);
    return new Map();
  }
}


// Function to restore project files to their original state
async function restoreProjectFiles(originalFiles: Map<string, string>) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Get current files to compare
    const currentFiles = await loadProjectFiles();
    
    // Restore original files that were modified or deleted
    for (const [filePath, originalContent] of originalFiles) {
      const currentContent = currentFiles.get(filePath);
      
      if (!currentContent || currentContent !== originalContent) {
        // File was deleted or modified, restore it
        await fetch(`${baseUrl}/api/files`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filePath,
            content: originalContent,
          }),
        });
      }
    }
    
    // Delete any new files that were created during testing
    for (const [filePath] of currentFiles) {
      if (!originalFiles.has(filePath)) {
        // This is a new file, delete it
        await fetch(`${baseUrl}/api/files`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ filePath }),
        });
      }
    }
    
    // Clean up any empty directories that were created during testing
    await cleanupEmptyDirectories(originalFiles, currentFiles, baseUrl);
    
    console.log('✅ Project files restored to original state');
  } catch (error) {
    console.error('Error restoring project files:', error);
  }
}

// Helper function to extract unique directory paths from file paths
function getDirectoryPaths(filePaths: string[]): Set<string> {
  const directories = new Set<string>();
  
  for (const filePath of filePaths) {
    const parts = filePath.split('/');
    // Build nested directory paths (e.g., "a/b/c.txt" -> ["a", "a/b"])
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      if (dirPath) {
        directories.add(dirPath);
      }
    }
  }
  
  return directories;
}

// Function to clean up empty directories created during testing
async function cleanupEmptyDirectories(
  originalFiles: Map<string, string>,
  currentFiles: Map<string, string>,
  baseUrl: string
) {
  try {
    // Get directory paths from original and current file sets
    const originalDirs = getDirectoryPaths(Array.from(originalFiles.keys()));
    const currentDirs = getDirectoryPaths(Array.from(currentFiles.keys()));
    
    // Find directories that were created during testing
    const newDirectories = Array.from(currentDirs).filter(dir => !originalDirs.has(dir));
    
    // Sort directories by depth (deepest first) to ensure we delete child dirs before parent dirs
    newDirectories.sort((a, b) => b.split('/').length - a.split('/').length);
    
    // Try to delete each new directory (this will only succeed if they're empty after file cleanup)
    for (const dirPath of newDirectories) {
      try {
        await fetch(`${baseUrl}/api/files`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            filePath: dirPath,
            isDirectory: true 
          }),
        });
        console.log(`🗑️ Cleaned up empty directory: ${dirPath}`);
      } catch (error) {
        // Directory might not be empty or might not exist, which is fine
        // We only want to clean up truly empty directories
      }
    }
  } catch (error) {
    console.error('Error cleaning up directories:', error);
  }
}

// Function to call chat API internally
async function callChatAPI(
  input: string, 
  projectFiles: Map<string, string>,
  currentFile?: string,
  selection?: Selection
): Promise<{ response: string; fullContext: any }> {
  try {
    // Only use selection if it's valid
    const validSelection = selection && isValidSelection(selection) ? selection : null;
    
    const roundedSelection = validSelection ? {
      x: Math.round(validSelection.x),
      y: Math.round(validSelection.y),
      width: Math.round(validSelection.width),
      height: Math.round(validSelection.height)
    } : null;

    const projectStructure = await fetch('http://localhost:3000/api/files?list=true');
    const projectStructureData = await projectStructure.json();
    // Create system message with project context
    const systemMessage: Message = {
      role: 'system',
      variables: {
        PROJECT_FILES: projectStructureData.files,
        CURRENT_FILE: currentFile || '',
        CURRENT_FILE_CONTENT: currentFile ? projectFiles.get(currentFile) || '' : ''
      },
    };

    // Create user message with request and selection context
    const userMessage: Message = {
      role: 'user',
      variables: {
        USER_REQUEST: input,
        SELECTION: roundedSelection ? 'true' : 'false',
      },
    };

    // Add selection variables if selection is valid
    if (roundedSelection) {
      userMessage.variables = {
        ...userMessage.variables,
        SELECTION_X: roundedSelection.x.toString(),
        SELECTION_Y: roundedSelection.y.toString(),
        SELECTION_WIDTH: roundedSelection.width.toString(),
        SELECTION_HEIGHT: roundedSelection.height.toString()
      };
    }

    const messages: Message[] = [systemMessage, userMessage];

    // Make actual HTTP request to chat API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      throw new Error(`Chat API responded with status: ${response.status}`);
    }

    // Parse the streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

         let fullResponse = '';
     let toolCalls: any[] = [];
     let toolResults: any[] = [];
     let fileOperations: any[] = [];
     const decoder = new TextDecoder();

     try {
       while (true) {
         const { done, value } = await reader.read();
         if (done) break;

         const chunk = decoder.decode(value);
         const lines = chunk.split('\n').filter(line => line.trim());

         for (const line of lines) {
           try {
             const data = JSON.parse(line);
             if (data.t === 'token' && data.d) {
               fullResponse += data.d;
             } else if (data.t === 'tool_call') {
               // Track tool calls
               toolCalls.push({
                 toolName: data.toolName,
                 args: data.args
               });
             } else if (data.t === 'tool_result') {
               // Track tool results
               toolResults.push({
                 toolName: data.toolName,
                 result: data.result,
                 codeBlock: data.codeBlock
               });

               if (data.result?.operation) {
                 fileOperations.push(data.result.operation);
               }
             } else if (data.t === 'final' && data.reply) {
               fullResponse = data.reply;
               if (!toolCalls.length && data.toolCalls) {
                 // Get tool call data from the final message if not tracked earlier
                 fileOperations = data.operations || [];
               }
               break;
             }
           } catch (parseError) {
             // Skip malformed JSON lines
             continue;
           }
         }
       }
     } finally {
       reader.releaseLock();
     }

     const finalResponse = fullResponse || 'No response received';
     
     // Build full context for judge including tool calls
     const fullContext = {
       systemMessage,
       userMessage,
       aiResponse: finalResponse,
       projectContext: {
         currentFile: currentFile || null,
         selection: roundedSelection,
         projectFiles: Object.fromEntries(projectFiles)
       },
       toolContext: {
         toolCalls,
         toolResults,
         fileOperations
       }
     };
     
     return { response: finalResponse, fullContext };
   } catch (error) {
     console.error('Error calling chat API:', error);
     const errorResponse = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
     return { 
       response: errorResponse, 
       fullContext: {
         systemMessage: null,
         userMessage: { role: 'user', variables: { USER_REQUEST: input } },
         aiResponse: errorResponse,
         projectContext: { currentFile: null, selection: null, projectFiles: {} }
       }
     };
   }
}

// Function to judge a response
async function judgeResponse(fullContext: any): Promise<{ score: number; reasoning: string }> {
  try {
    const judgeTemplate = await getTemplate('eval-judge-prompt-template');
         const judgePrompt = parseMessageWithTemplate(judgeTemplate, {
       USER_REQUEST: fullContext.userMessage.variables.USER_REQUEST,
       AI_RESPONSE: fullContext.aiResponse,
       SYSTEM_CONTEXT: JSON.stringify(fullContext.systemMessage, null, 2),
       PROJECT_CONTEXT: JSON.stringify(fullContext.projectContext, null, 2),
       TOOL_CONTEXT: JSON.stringify(fullContext.toolContext, null, 2),
       FULL_CONVERSATION: JSON.stringify({
         system: fullContext.systemMessage,
         user: fullContext.userMessage,
         assistant: { role: 'assistant', content: fullContext.aiResponse }
       }, null, 2)
     });

    const result = await generateObject({
      model: azure('o4-mini'),
      messages: [{ role: 'user', content: judgePrompt }],
      schema: JudgeResponseSchema,
    });

    return result.object;
  } catch (error) {
    console.error('Error judging response:', error);
    return {
      score: 1,
      reasoning: `Judge error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Async function to process all test cases
async function processEvaluation(jobId: string, testCases: TestCase[]) {
  // Save original file state for restoration after evaluation
  let originalFiles: Map<string, string> | null = null;
  
  try {
    // Load and save original project files state
    originalFiles = await loadProjectFiles();
    console.log(`📁 Saved original state of ${originalFiles.size} files`);
    
    // Work with a copy of the files for the evaluation
    let projectFiles = new Map(originalFiles);
    const results: EvalResult[] = [];
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const testCaseId = testCase.id || `test_${i + 1}`;
      
             try {
         // Get AI response with context from test case
         const { response: aiResponse, fullContext } = await callChatAPI(
           testCase.input,
           projectFiles,
           testCase.currentFile,
           testCase.selection
         );
         
         // Judge the response with full context
         const judgment = await judgeResponse(fullContext);
         
                   const result: EvalResult = {
            testCaseId,
            input: testCase.input,
            aiResponse,
            judgeScore: judgment.score,
            judgeReasoning: judgment.reasoning,
            toolCalls: fullContext.toolContext.toolCalls,
            fileOperations: fullContext.toolContext.fileOperations,
          };
        
        results.push(result);
        
                 // If this test case performed file operations, restore original state for next test case
         if (fullContext.toolContext.fileOperations && fullContext.toolContext.fileOperations.length > 0) {
           console.log(`🔄 Restoring original state after test case ${testCaseId} (${fullContext.toolContext.fileOperations.length} file operations)`);
           await restoreProjectFiles(originalFiles);
           projectFiles = new Map(originalFiles); // Reset to original state
         }
        
        // Update progress
        const progress = Math.round(((i + 1) / testCases.length) * 100);
        updateJob(jobId, {
          progress,
          results: [...results],
        });
        
      } catch (error) {
        console.error(`Error processing test case ${testCaseId}:`, error);
        
                 // Add error result
         const errorResult: EvalResult = {
           testCaseId,
           input: testCase.input,
           aiResponse: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
           judgeScore: 1,
           judgeReasoning: 'Processing error occurred',
           toolCalls: [],
           fileOperations: [],
         };
        
        results.push(errorResult);
      }
    }
    
    // Calculate final statistics
    const scores = results.map(r => r.judgeScore);
    const statistics = calculateStatistics(scores);
    
    // Mark job as completed
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      results,
      statistics,
      completedAt: new Date(),
    });
    
  } catch (error) {
    console.error('Error in evaluation:', error);
    updateJob(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    // Always restore original file state after evaluation completes
    if (originalFiles) {
      console.log('🔄 Restoring project files to original state...');
      await restoreProjectFiles(originalFiles);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataset } = EvalRequestSchema.parse(body);
    
    if (dataset.length === 0) {
      return NextResponse.json(
        { error: 'Dataset cannot be empty' },
        { status: 400 }
      );
    }
    
    // Create new job
    const jobId = generateJobId();
    const job = createJob(jobId, {
      status: 'running',
      progress: 0,
      results: [],
      createdAt: new Date(),
    });
    
    // Start processing asynchronously
    processEvaluation(jobId, dataset).catch(error => {
      console.error('Evaluation process error:', error);
    });
    
    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      message: `Started evaluation of ${dataset.length} test cases`,
    });
    
  } catch (error) {
    console.error('Eval API error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 