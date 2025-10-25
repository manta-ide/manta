# Environment Variables for OAuth Configuration

To enable OAuth authentication for the MCP server, set the following environment variables:

## Required Variables

### MCP_ACCESS_TOKEN
A secure access token that clients must provide in the Authorization header.
```
MCP_ACCESS_TOKEN=your-secure-access-token-here
```

### OAUTH_AUTHORIZATION_SERVER_URL
The URL of your OAuth authorization server that issues valid tokens.
```
OAUTH_AUTHORIZATION_SERVER_URL=https://your-oauth-server.com
```

## Usage

1. Create a `.env.local` file in the project root
2. Add the above variables with your actual values
3. The MCP server will use these for token verification

## Production Setup

For production deployments, you should:
1. Use a proper OAuth/OIDC provider (Auth0, Keycloak, etc.)
2. Implement JWT token validation instead of simple token comparison
3. Set up proper token expiration and refresh logic
4. Configure appropriate scopes for your MCP tools

## Current Implementation

The current implementation uses a simple token comparison for demonstration. Replace the `verifyToken` function in `src/app/api/mcp/route.ts` with proper JWT/OAuth validation for production use.
