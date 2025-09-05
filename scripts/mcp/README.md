MCP Graph Server (TypeScript)

- Script: `scripts/mcp/server.ts`
- Run server: `npm run mcp:graph` (via `tsx`)
- Inspect (GUI): `npm run mcp:inspect` (uses @modelcontextprotocol/inspector)

Auth model (per MCP over HTTP guidance)
- Use OAuth 2.1 access tokens; send `Authorization: Bearer <token>` on every backend API request.
- Config via environment passed by your MCP client (required):
  - `MANTA_API_URL`: Base URL of your app API (required).
  - `MANTA_API_KEY`: Access token (or session token from the UI dialog).

Exposed tools (all require Bearer via env):
- `graph_read`:
  - input: `{ includeEdges?: boolean }`
  - behavior: `GET /api/backend/graph-api`
  - output: `{ graph }`, optionally with edges stripped
- `graph_unbuilt`:
  - input: `{}`
  - behavior: `GET /api/backend/graph-api?unbuilt=true`
- `graph_node`:
  - input: `{ nodeId: string }`
  - behavior: `POST /api/backend/graph-api` with `{ nodeId }`
 - `graph_set_node_state`:
   - input: `{ nodeId: string, state: string }`
   - behavior: Loads current graph (`GET /api/backend/graph-api`), updates the node's `state`, then persists via `PUT /api/backend/graph-api` with `{ graph }`.

Resources
- `manta://graph` (application/json): Full graph for the authenticated user. Content is fetched from `GET /api/backend/graph-api` using `MANTA_API_KEY` as Bearer.

Install deps:
- `@modelcontextprotocol/sdk` (server + stdio transport)
- `@modelcontextprotocol/inspector` (optional, provides GUI inspector)
- `tsx` (to run TypeScript directly)

Usage with an MCP-compatible client:
1) Install deps: `npm install`
2) Set environment via your MCP client. Example config:
   {
     "mcpServers": {
       "manta": {
         "command": "npm",
         "args": ["run", "mcp"],
         "env": {
           "MANTA_API_URL": "http://localhost:3000",
           "MANTA_API_KEY": "<token>"
         }
       }
     }
   }
3) Start server: `npm run mcp:graph`
4) Optional: open inspector GUI: `npm run mcp:inspect`
5) Or configure your MCP client to connect over stdio.
