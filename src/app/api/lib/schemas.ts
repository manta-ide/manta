/**
 * Shared Schema Definitions
 * 
 * This file contains Zod schemas for message validation and type checking
 * used both by the frontend client and backend API.
 */

import { z } from 'zod';

// Message context for providing file and selection information
export const MessageContextSchema = z.object({
  currentFile: z.string().optional(),
  selection: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    selectedElements: z.string(),
  }).optional(),
});

export type MessageContext = z.infer<typeof MessageContextSchema>;

// Message variables for template substitution
export const MessageVariablesSchema = z.object({
  // User request
  USER_REQUEST: z.string().optional(),
  
  // File context
  PROJECT_FILES: z.array(z.object({
    route: z.string(),
    lines: z.number(),
  })).optional(),
  CURRENT_FILE: z.string().optional(),
  CURRENT_FILE_CONTENT: z.string().optional(),
  
  // Graph context
  GRAPH_CONTEXT: z.string().optional(),
  GRAPH_DATA: z.string().optional(),
  GRAPH_NODE_COUNT: z.string().optional(),
  
  // Selection context
  SELECTION: z.string().optional(),
  SELECTION_X: z.string().optional(),
  SELECTION_Y: z.string().optional(),
  SELECTION_WIDTH: z.string().optional(),
  SELECTION_HEIGHT: z.string().optional(),
  SELECTION_ELEMENTS: z.string().optional(),
  
  // Node-specific context
  NODE_ID: z.string().optional(),
  PREVIOUS_PROMPT: z.string().optional(),
  NEW_PROMPT: z.string().optional(),
  SELECTED_NODE_IDS: z.string().optional(),
  STRICT_EDIT_MODE: z.string().optional(),
  EDIT_HINTS: z.string().optional(),
  
  // Assistant response
  ASSISTANT_RESPONSE: z.string().optional(),
  
  // Additional context
  MAX_NODES: z.string().optional(),
});

export type MessageVariables = z.infer<typeof MessageVariablesSchema>;

// Message schema
export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  variables: MessageVariablesSchema.optional(),
  messageContext: MessageContextSchema.optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// Parsed message for template processing
export const ParsedMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

// Selection schema for UI interactions
export const SelectionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  selectedElements: z.string(),
});

export type Selection = z.infer<typeof SelectionSchema>;

// Client chat request schema
export const ClientChatRequestSchema = z.object({
  message: z.string(),
  currentFile: z.string().optional(),
  selection: SelectionSchema.optional(),
});

export type ClientChatRequest = z.infer<typeof ClientChatRequestSchema>;

// Graph schema for structured output
export const GraphSchema = z.object({
	rootId: z.string(),
	nodes: z.array(z.object({
		id: z.string(),
		title: z.string(),
		prompt: z.string().optional(),
		kind: z.enum(['page', 'section', 'group', 'component', 'primitive', 'behavior']).optional(),
		what: z.string().optional(),
		how: z.string().optional(),
		properties: z.array(z.string()).optional().default([]),
		built: z.boolean().optional(),
		children: z.array(z.object({
			id: z.string(),
			title: z.string(),
			prompt: z.string().optional(),
			kind: z.enum(['page', 'section', 'group', 'component', 'primitive', 'behavior']).optional(),
		})).optional().default([]),
	})),
});

export type Graph = z.infer<typeof GraphSchema>;

// Evaluation schemas
export const TestCaseSchema = z.object({
  id: z.string().optional(),
  input: z.string(),
  // Optional context for each test case
  currentFile: z.string().optional(),
  selection: SelectionSchema.optional()
});

export type TestCase = z.infer<typeof TestCaseSchema>;

export const EvalDatasetSchema = z.object({
  dataset: z.array(TestCaseSchema),
});

export type EvalDataset = z.infer<typeof EvalDatasetSchema>;

export const EvalResultSchema = z.object({
  testCaseId: z.string(),
  input: z.string(),
  aiResponse: z.string(),
  judgeScore: z.number(),
  judgeReasoning: z.string(),
  toolCalls: z.array(z.any()).optional(),
  fileOperations: z.array(z.any()).optional(),
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

export const EvalJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  progress: z.number(), // 0-100
  results: z.array(EvalResultSchema),
  statistics: z.object({
    average: z.number(),
    median: z.number(),
    standardDeviation: z.number(),
    count: z.number(),
  }).optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  completedAt: z.date().optional(),
});

export type EvalJob = z.infer<typeof EvalJobSchema>;

export const EvalRequestSchema = z.object({
  dataset: z.array(TestCaseSchema),
});

export type EvalRequest = z.infer<typeof EvalRequestSchema>; 