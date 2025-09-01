# Chat Persistence Feature

This document explains the chat persistence functionality that has been implemented to save and load chat conversations for users.

## Overview

The chat persistence feature automatically:
- **Saves** chat messages to the database when users send/receive messages
- **Loads** chat history when users log in
- **Clears** chat history from the database when users clear their chat

## Database Schema

### User Table Update
A new column `chat_history` has been added to the user table:
- **Column Name**: `chat_history` (snake_case)
- **Type**: `jsonb` (PostgreSQL JSONB type for efficient JSON storage)
- **Required**: `false` (nullable for new users or cleared chats)

## Implementation Details

### 1. Database Column
- Location: `src/lib/auth.ts`
- Added `chat_history: { type: "string", required: false }` to user additional fields
- Maps to PostgreSQL `chat_history` JSONB column for efficient JSON storage

### 2. API Endpoints
- Location: `src/app/api/chat/route.ts`
- **GET `/api/chat`**: Load user's chat history
- **POST `/api/chat`**: Save user's chat history  
- **DELETE `/api/chat`**: Clear user's chat history

### 3. Chat Service Updates
- Location: `src/lib/chatService.ts`
- Added automatic loading of chat history on user login
- Added automatic saving after each message
- Updated clear function to remove from database

### 4. UI Updates
- Location: `src/components/FloatingChat.tsx`
- Added loading state for chat history
- Shows "Loading chat history..." when fetching saved messages

## Key Features

### Automatic Save
- Chat messages are automatically saved to the database after each user message and AI response
- No manual save action required from users

### Automatic Load
- When a user logs in, their previous chat history is automatically loaded
- Shows a loading indicator while fetching history

### Smart Clear
- When users click "Clear conversation", it removes messages from both:
  - Frontend state (immediate visual feedback)
  - Database (permanent removal)
  - Backend conversation session (existing functionality)

### User Isolation
- Each user's chat history is completely isolated
- Users can only access their own chat conversations
- Authentication is required for all chat persistence operations

## Usage Flow

1. **User Login**: Chat history automatically loads from database
2. **Sending Messages**: Each message is saved to database in real-time
3. **Page Refresh**: Chat history persists and reloads automatically  
4. **Clear Chat**: Removes all messages from database and UI
5. **Logout/Login**: Chat history remains available across sessions

## Error Handling

- Database save failures are logged but don't interrupt the chat UI
- Load failures default to empty chat history
- Network errors are gracefully handled without breaking functionality

## Security

- All chat persistence operations require user authentication
- Users can only access their own chat data
- Chat history is stored as JSON in the user's database record
- Standard Better Auth session validation protects all endpoints

## Future Enhancements

Potential improvements for the future:
- Chat history compression for large conversations
- Multiple chat sessions/workspaces per user
- Export chat history functionality
- Search within chat history
- Chat backup and restore features
