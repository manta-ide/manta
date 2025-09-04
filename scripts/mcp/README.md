MCP Graph Server (TypeScript)

- Script: `scripts/mcp/server.ts`
- Run server: `npm run mcp:graph` (via `tsx`)
- Inspect (GUI): `npm run mcp:inspect` (uses @modelcontextprotocol/inspector)

Auth model (per MCP over HTTP guidance)
- Use OAuth 2.1 access tokens; send `Authorization: Bearer <token>` on every backend API request.
- Config via environment passed by your MCP client:
  - Token: `MANTA_API_KEY` (preferred), or `MCP_ACCESS_TOKEN`/`MCP_BEARER_TOKEN`.
  - Base URL: `MANTA_API_BASE_URL`/`MANTA_BASE_URL` (or `MCP_GRAPH_API_BASE_URL`), falling back to `BACKEND_URL` → `NEXT_PUBLIC_APP_URL` → `http://localhost:3000`.

Exposed tools (all require Bearer):
- `graph_read`:
  - input: `{ includeEdges?: boolean, accessToken?: string }`
  - behavior: `GET /api/backend/graph-api`
  - output: `{ graph }`, optionally with edges stripped
- `graph_unbuilt`:
  - input: `{ accessToken?: string }`
  - behavior: `GET /api/backend/graph-api?unbuilt=true`
- `graph_node`:
  - input: `{ nodeId: string, accessToken?: string }`
  - behavior: `POST /api/backend/graph-api` with `{ nodeId }`

Install deps:
- `@modelcontextprotocol/sdk` (server + stdio transport)
- `@modelcontextprotocol/inspector` (optional, provides GUI inspector)
- `tsx` (to run TypeScript directly)

Usage with an MCP-compatible client:
1) Install deps: `npm install`
2) Set `MANTA_API_KEY` to a valid access token (or session token from the UI dialog). MCP config example:
   {
     "mcpServers": {
       "manta": {
         "command": "npm",
         "args": ["run", "mcp"],
         "env": { "MANTA_API_KEY": "<token>" }
       }
     }
   }
3) Start server: `npm run mcp:graph`
4) Optional: open inspector GUI: `npm run mcp:inspect`
5) Or configure your MCP client to connect over stdio.
