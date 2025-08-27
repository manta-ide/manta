# Blaxel Sandbox Integration

This document explains how the Manta Editor integrates with Blaxel to provide personalized development sandboxes for each user.

## Overview

The integration automatically creates and manages dedicated Blaxel sandboxes for each authenticated user. When a user signs in:

1. **New User**: A new sandbox is automatically created with the default template
2. **Existing User**: Their existing sandbox is loaded and made available

## Architecture

### Core Components

1. **BlaxelService** (`src/lib/blaxel.ts`)
   - Manages sandbox creation and retrieval
   - Uses Blaxel SDK to interact with sandboxes
   - Provides utility methods for sandbox URLs and MCP connections

2. **SandboxService** (`src/lib/sandbox-service.ts`)  
   - Higher-level service that combines Blaxel operations with database storage
   - Tracks sandbox information in the user database
   - Handles user-sandbox relationship management

3. **Sandbox API** (`src/app/api/sandbox/init/route.ts`)
   - REST endpoints for sandbox initialization and status
   - Handles authentication and error responses
   - Provides GET/POST endpoints for sandbox operations

4. **useSandbox Hook** (`src/hooks/useSandbox.ts`)
   - React hook for managing sandbox state in components
   - Handles loading, initialization, and error states
   - Provides methods for sandbox operations

5. **SandboxStatus Component** (`src/components/sandbox/SandboxStatus.tsx`)
   - UI component for displaying sandbox information
   - Shows status, creation date, and action buttons
   - Handles sandbox initialization for new users

### Database Schema Updates

The user table now includes sandbox-related fields:

```sql
-- Added to existing user table
sandbox_id VARCHAR(255) -- Unique identifier for user's sandbox
```

## Configuration

### Environment Variables

Add these to your `.env.local` file:

```env
# Blaxel Configuration  
BLAXEL_WORKSPACE_ID="your-blaxel-workspace-id"
BLAXEL_API_KEY="your-blaxel-api-key"
```

### Blaxel Configuration

The default sandbox configuration can be modified in `src/lib/blaxel.ts`:

```typescript
export const BLAXEL_CONFIG = {
  defaultImage: "blaxel/prod-base:latest",  // Sandbox template
  defaultMemory: 4096,                      // Memory allocation (MB)
  defaultPorts: [{ target: 3000, protocol: "HTTP" }], // Exposed ports
  sandboxTTL: "24h",                        // Auto-deletion time
};
```

## User Experience

### Authentication Flow

1. User signs in/up through Better Auth
2. Auth context automatically checks for existing sandbox
3. If no sandbox exists, user sees initialization option in the sandbox panel
4. Sandbox is created with unique naming: `user-{userId}`

### Sandbox Panel

- Toggle sandbox panel visibility with the Play button in the top bar
- Shows sandbox status (standby/active/stopped)
- Displays creation date and sandbox ID
- Provides buttons to refresh status or open sandbox externally

### Sandbox Features

Each user sandbox includes:
- **File System Access**: Full read/write access to sandbox filesystem
- **Process Execution**: Run commands and manage processes
- **MCP Server**: WebSocket connection for AI agent interactions
- **Port Forwarding**: Access to exposed ports (default: 3000)
- **Auto-hibernation**: Sandboxes auto-sleep after 1 second of inactivity
- **Persistence**: File system and processes are maintained during hibernation

## API Endpoints

### POST `/api/sandbox/init`
Initialize a new sandbox for the authenticated user.

**Response:**
```json
{
  "success": true,
  "sandbox": {
    "sandboxId": "user-123",
    "sandboxUrl": "https://run.blaxel.ai/workspace/sandboxes/user-123",
    "mcpServerUrl": "wss://run.blaxel.ai/workspace/sandboxes/user-123",
    "createdAt": "2024-01-15T10:30:00Z",
    "status": "active"
  }
}
```

### GET `/api/sandbox/init`
Get existing sandbox information for the authenticated user.

**Response:**
```json
{
  "sandbox": {
    "sandboxId": "user-123",
    "sandboxUrl": "https://run.blaxel.ai/workspace/sandboxes/user-123", 
    "mcpServerUrl": "wss://run.blaxel.ai/workspace/sandboxes/user-123",
    "createdAt": "2024-01-15T10:30:00Z",
    "status": "standby"
  }
}
```

## Integration with AI Agents

Each sandbox exposes an MCP (Model Context Protocol) server that allows AI agents to:

- Execute commands and scripts
- Read and write files  
- List directories and processes
- Manage the development environment
- Perform code generation tasks

The MCP server URL follows the pattern:
```
wss://run.blaxel.ai/{WORKSPACE_ID}/sandboxes/user-{userId}
```

## Security Considerations

1. **Isolation**: Each user has their own dedicated sandbox
2. **Authentication**: All sandbox operations require user authentication
3. **Resource Limits**: Sandboxes have memory and TTL limits
4. **Network Security**: Only specified ports are exposed
5. **Auto-cleanup**: Sandboxes auto-delete after TTL expires

## Troubleshooting

### Common Issues

1. **Sandbox Creation Fails**
   - Check BLAXEL_WORKSPACE_ID and BLAXEL_API_KEY environment variables
   - Verify Blaxel account has sufficient quota
   - Check console logs for specific error messages

2. **Sandbox Not Loading**
   - Ensure user is properly authenticated
   - Check database connection and user table updates
   - Verify sandbox exists in Blaxel console

3. **MCP Connection Issues**
   - Confirm WebSocket URL format is correct
   - Check Blaxel workspace permissions
   - Verify sandbox is in 'active' or 'standby' state

### Monitoring

Monitor sandbox usage through:
- User database records (sandbox_id, sandbox_created_at)
- Blaxel console dashboard
- Application logs for creation/access patterns
- Error tracking for failed operations

## Future Enhancements

Potential improvements to consider:

1. **Template Selection**: Allow users to choose from multiple sandbox templates
2. **Resource Configuration**: Let users adjust memory/CPU limits
3. **Collaboration**: Share sandboxes between team members
4. **Backup/Restore**: Snapshot and restore sandbox states
5. **Integration**: Connect sandboxes with version control systems
6. **Monitoring**: Real-time sandbox resource monitoring
7. **Custom Images**: Support for user-defined Docker images

## References

- [Blaxel Documentation](https://docs.blaxel.ai/)
- [Blaxel SDK Reference](https://docs.blaxel.ai/SDK/Overview)
- [Better Auth Documentation](https://www.better-auth.com/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
