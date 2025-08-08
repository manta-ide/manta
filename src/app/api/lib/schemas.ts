/**
 * Shared Schema Definitions
 * 
 * This file contains Zod schemas for message validation and type checking
 * used both by the frontend client and backend API.
 */

import { z } from 'zod';

// Selection schema for UI selections
export const SelectionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  selectedElements: z.string().optional(),
});

export type Selection = z.infer<typeof SelectionSchema>;

// Message context schema containing file and selection information
export const MessageContextSchema = z.object({
  currentFile: z.string().nullable().optional(),
  selection: SelectionSchema.nullable().optional(),
});

export type MessageContext = z.infer<typeof MessageContextSchema>;

// Base variables schema containing all possible template variables
export const MessageVariablesSchema = z.object({
  // System message variables
  PROJECT_FILES: z.array(z.object({
    route: z.string(),
    lines: z.number()
  })).optional(),
  CURRENT_FILE: z.string().optional(),
  CURRENT_FILE_CONTENT: z.string().optional(),
  // Graph context variable
  GRAPH_CONTEXT: z.string().optional(),
  GRAPH_DATA: z.string().optional(),
  MAX_NODES: z.number().optional(),
  
  // Node-specific variables for individual node code generation
  NODE_TITLE: z.string().optional(),
  NODE_KIND: z.string().optional(),
  NODE_WHAT: z.string().optional(),
  NODE_HOW: z.string().optional(),
  NODE_PROPERTIES: z.string().optional(),
  NODE_CHILDREN: z.string().optional(),
  
  // User message variables
  USER_REQUEST: z.string().optional(),
  SELECTION: z.string().optional(),
  SELECTION_X: z.string().optional(),
  SELECTION_Y: z.string().optional(),
  SELECTION_WIDTH: z.string().optional(),
  SELECTION_HEIGHT: z.string().optional(),
  SELECTION_ELEMENTS: z.string().optional(),
  
  // Assistant message variables
  ASSISTANT_RESPONSE: z.string().optional(),
});

export type MessageVariables = z.infer<typeof MessageVariablesSchema>;

// Role-specific variable schemas
export const SystemVariablesSchema = MessageVariablesSchema.pick({
  PROJECT_FILES: true,
  CURRENT_FILE: true,
  CURRENT_FILE_CONTENT: true,
  GRAPH_DATA: true,
  MAX_NODES: true,
});

export const UserVariablesSchema = MessageVariablesSchema.pick({
  USER_REQUEST: true,
  SELECTION: true,
  SELECTION_X: true, 
  SELECTION_Y: true,
  SELECTION_WIDTH: true,
  SELECTION_HEIGHT: true,
});

export const AssistantVariablesSchema = MessageVariablesSchema.pick({
  ASSISTANT_RESPONSE: true,
});

// Unified Message schema for both API requests and UI display
export const MessageSchema = z.object({
  // Core message properties
  role: z.enum(['system', 'user', 'assistant']),
  variables: MessageVariablesSchema.optional(),
  
  // Display properties (used in UI)
  content: z.string().optional(),
  operations: z.any().optional(),
  messageContext: MessageContextSchema.optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ParsedMessage is the processed message with content after template processing
export const ParsedMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

// Chat request schema
export const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Simplified client request schema - only sends the latest user message
export const ClientChatRequestSchema = z.object({
  userMessage: MessageSchema,
  sessionId: z.string().optional(), // For conversation continuity
  parsedMessages: z.array(ParsedMessageSchema).optional(), // Pre-processed messages for AI
});

export type ClientChatRequest = z.infer<typeof ClientChatRequestSchema>;

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