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

// Property schemas for graph node properties
export const CodeBindingSchema = z.object({
  file: z.string(),
  start: z.number(),
  end: z.number(),
});

export type CodeBinding = z.infer<typeof CodeBindingSchema>;

// Property type schemas
export const ColorPropertySchema = z.object({
  type: z.literal('color'),
  value: z.string(),
  options: z.array(z.string()).optional(),
}).required();

export const TextPropertySchema = z.object({
  type: z.literal('text'),
  value: z.string(),
  maxLength: z.number().optional(),
}).required();

export const NumberPropertySchema = z.object({
  type: z.literal('number'),
  value: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
}).required();

export const SelectPropertySchema = z.object({
  type: z.literal('select'),
  value: z.string(),
  options: z.array(z.string()),
}).required();

// Union of all property types
export const PropertyValueSchema = z.discriminatedUnion('type', [
  ColorPropertySchema,
  TextPropertySchema,
  NumberPropertySchema,
  SelectPropertySchema,
]);

export type PropertyValue = z.infer<typeof PropertyValueSchema>;

// Property definition
export const PropertySchema = z.object({
  id: z.string(),
  title: z.string(),
  propertyType: PropertyValueSchema,
  codeBinding: CodeBindingSchema,
}).required();

export type Property = z.infer<typeof PropertySchema>;

// Updated GraphNodeSchema to include properties
export const GraphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  children: z.array(z.object({
    id: z.string(),
    title: z.string(),
  })),
  // Tracks whether code for this node has been generated
  built: z.boolean().optional(),
  // Properties for the node
  properties: z.array(PropertySchema).optional(),
});

export const GraphSchema = z.object({
  rootId: z.string(),
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

// Property generation schema - simplified to avoid discriminated union issues
export const PropertyGenerationSchema = z.object({
  properties: z.array(z.object({
    id: z.string(),
    title: z.string(),
    propertyType: z.object({
      type: z.enum(['color', 'text', 'number', 'select']),
      value: z.union([z.string(), z.number()]),
      options: z.array(z.string()).optional(),
      maxLength: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
    }),
    codeBinding: z.object({
      file: z.string(),
      start: z.number(),
      end: z.number(),
    }),
  })),
}).required();

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