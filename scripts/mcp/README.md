MCP Graph Server (TypeScript)

- Script: `scripts/mcp/server.ts`
- Run server: `npm run mcp:graph` (via `tsx`)
- Inspect (GUI): `npm run mcp:inspect` (uses @modelcontextprotocol/inspector)

Auth model (per MCP over HTTP guidance)
- Use OAuth 2.1 access tokens; send `Authorization: Bearer <token>` on every backend API request.
- Config: `MCP_ACCESS_TOKEN` (or `MCP_BEARER_TOKEN`) for the user/machine token.
- Base URL: `MCP_GRAPH_API_BASE_URL` (defaults to `BACKEND_URL` or `NEXT_PUBLIC_APP_URL` or `http://localhost:3000`).

Exposed tools (all require Bearer):
- `graph_read`:
  - input: `{ includeEdges?: boolean, baseUrl?: string, accessToken?: string }`
  - behavior: `GET /api/backend/graph-api`
  - output: `{ graph }`, optionally with edges stripped
- `graph_unbuilt`:
  - input: `{ baseUrl?: string, accessToken?: string }`
  - behavior: `GET /api/backend/graph-api?unbuilt=true`
- `graph_node`:
  - input: `{ nodeId: string, baseUrl?: string, accessToken?: string }`
  - behavior: `POST /api/backend/graph-api` with `{ nodeId }`

Install deps:
- `@modelcontextprotocol/sdk` (server + stdio transport)
- `@modelcontextprotocol/inspector` (optional, provides GUI inspector)
- `tsx` (to run TypeScript directly)

Usage with an MCP-compatible client:
1) Install deps: `npm install`
2) Set `MCP_ACCESS_TOKEN` to a valid OAuth access token for the app.
3) Start server: `npm run mcp:graph`
4) Optional: open inspector GUI: `npm run mcp:inspect`
5) Or configure your MCP client to connect over stdio.
