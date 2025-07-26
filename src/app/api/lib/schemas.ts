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
  PROJECT_FILES: z.string().optional(),
  CURRENT_FILE: z.string().optional(),
  CURRENT_FILE_CONTENT: z.string().optional(),
  
  // User message variables
  USER_REQUEST: z.string().optional(),
  SELECTION: z.enum(['true', 'false']).optional(),
  SELECTION_X: z.string().optional(),
  SELECTION_Y: z.string().optional(),
  SELECTION_WIDTH: z.string().optional(),
  SELECTION_HEIGHT: z.string().optional(),
  
  // Assistant message variables
  ASSISTANT_RESPONSE: z.string().optional(),
});

export type MessageVariables = z.infer<typeof MessageVariablesSchema>;

// Role-specific variable schemas
export const SystemVariablesSchema = MessageVariablesSchema.pick({
  PROJECT_FILES: true,
  CURRENT_FILE: true,
  CURRENT_FILE_CONTENT: true,
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