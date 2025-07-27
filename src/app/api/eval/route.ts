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
  score: z.number().min(1).max(10),
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

    // Create system message with project context
    const systemMessage: Message = {
      role: 'system',
      variables: {
        PROJECT_FILES: JSON.stringify(Object.fromEntries(projectFiles), null, 2),
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
  try {
    // Load project files once for all test cases
    const projectFiles = await loadProjectFiles();
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