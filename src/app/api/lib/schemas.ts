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
  SELECTED_NODE_ID: z.string().optional(),
  SELECTED_NODE_TITLE: z.string().optional(),
  SELECTED_NODE_PROMPT: z.string().optional(),
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

// Property schemas for graph node properties

// Property type enum - defines the available property types for graph nodes
export const PropertyTypeEnum = z.enum(['color', 'text', 'number', 'select', 'boolean', 'checkbox', 'radio', 'slider']);
export type PropertyType = z.infer<typeof PropertyTypeEnum>;

// Property definition - represents a configurable property of a graph node
export const PropertySchema = z.object({
  id: z.string().describe('Unique identifier for the property (should follow pattern: property-name)'),
  title: z.string().describe('Human-readable title/name for the property'),
  type: PropertyTypeEnum.describe('The type of property (color, text, number, or select)'),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional().describe('The current/default value for the property'),
  options: z.array(z.string()).optional().describe('Array of available options (required for select type)'),
  maxLength: z.number().optional().describe('Maximum length constraint for text properties'),
  min: z.number().optional().describe('Minimum value constraint for number properties'),
  max: z.number().optional().describe('Maximum value constraint for number properties'),
  step: z.number().optional().describe('Step increment for number properties'),
});

export type Property = z.infer<typeof PropertySchema>;

// Updated GraphNodeSchema to include properties and parentId
export const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  children: z.array(z.object({
    id: z.string(),
    title: z.string(),
  })),
  // Parent ID for bidirectional relationship tracking
  parentId: z.string().optional(),
  // Tracks the build state of this node
  state: z.enum(["built", "unbuilt", "building"]).default("unbuilt").optional(),
  // Properties for the node
  properties: z.array(PropertySchema).optional(),
});

export const GraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
});

export type Graph = z.infer<typeof GraphSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;

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

// Property generation schema - uses unified property type schema
export const PropertyGenerationSchema = z.object({
  properties: z.array(PropertySchema).optional(),
});

export type PropertyGeneration = z.infer<typeof PropertyGenerationSchema>;

// File system schemas
export const FileNodeSchema: z.ZodType<{
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: Array<any>;
    content?: string;
  }>;
  content?: string;
}> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  children: z.array(z.lazy(() => FileNodeSchema)).optional(),
  content: z.string().optional(),
});

export type FileNode = z.infer<typeof FileNodeSchema>;

// Chat service schemas
export const ChatServiceStateSchema = z.object({
  isConnected: z.boolean(),
  isConnecting: z.boolean(),
  error: z.string().nullable(),
  messages: z.array(MessageSchema),
  currentMessage: z.string(),
});

export type ChatServiceState = z.infer<typeof ChatServiceStateSchema>;

export const ChatServiceActionsSchema = z.object({
  sendMessage: z.function().args(z.string()).returns(z.promise(z.void())),
  clearMessages: z.function().returns(z.void()),
  setCurrentMessage: z.function().args(z.string()).returns(z.void()),
});

export type ChatServiceActions = z.infer<typeof ChatServiceActionsSchema>;

// Property code service schemas
export const CodeUpdateSchema = z.object({
  file: z.string(),
  start: z.number(),
  end: z.number(),
  newCode: z.string(),
  newValue: z.string().optional(),
  propertyId: z.string().optional(),
});

export type CodeUpdate = z.infer<typeof CodeUpdateSchema>;

// Graph event schemas
export const GraphUpdateEventSchema = z.object({
  type: z.literal('graph-update'),
  graph: GraphSchema,
});

export type GraphUpdateEvent = z.infer<typeof GraphUpdateEventSchema>;

// Property generation request/response schemas
export const GeneratePropertiesRequestSchema = z.object({
  graph: GraphSchema,
  nodeId: z.string(),
  generatedCode: z.string(),
  filePath: z.string(),
});

export type GeneratePropertiesRequest = z.infer<typeof GeneratePropertiesRequestSchema>;

export const GeneratePropertiesResponseSchema = z.object({
  success: z.boolean(),
  properties: z.array(PropertySchema).optional(),
  error: z.string().optional(),
});

export type GeneratePropertiesResponse = z.infer<typeof GeneratePropertiesResponseSchema>;

// Project store schemas
export const ProjectStoreSchema = z.object({
  files: z.instanceof(Map),
  currentFile: z.string().nullable(),
  selectedFile: z.string().nullable(),
  fileTree: z.array(FileNodeSchema),
  selection: SelectionSchema.nullable(),
  refreshTrigger: z.number(),
  selectedNodeId: z.string().nullable(),
  selectedNode: GraphNodeSchema.nullable(),
  graph: GraphSchema.nullable(),
  graphLoading: z.boolean(),
  graphError: z.string().nullable(),
});

export type ProjectStore = z.infer<typeof ProjectStoreSchema>; 

// Graph quick patch schemas
export const GraphQuickPatchResponseSchema = z.object({
  success: z.boolean(),
  patched_graph: GraphSchema,
  error_message: z.string().optional(),
});

export type GraphQuickPatchResponse = z.infer<typeof GraphQuickPatchResponseSchema>;

// Partial code generation schemas
export const PartialCodeGenerationResponseSchema = z.object({
  success: z.boolean(),
  generated_code: z.string(),
  error_message: z.string().optional(),
});

export type PartialCodeGenerationResponse = z.infer<typeof PartialCodeGenerationResponseSchema>; 