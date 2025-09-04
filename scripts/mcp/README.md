MCP Graph Server (TypeScript)

- Script: `scripts/mcp/graph-server.ts`
- Run server: `npm run mcp:graph` (via `tsx`)
- Inspect (GUI): `npm run mcp:inspect` (uses @modelcontextprotocol/inspector)

Environment/options:
- Preferred: call the app API with a valid session cookie
  - `MCP_GRAPH_API_BASE_URL` (defaults to `BACKEND_URL` or `NEXT_PUBLIC_APP_URL` or `http://localhost:3000`)
  - `MCP_GRAPH_API_COOKIE` (optional; provide session cookie if not passing `cookie` input)

Exposed tools:
- `read_graph`:
  - input: `{ userId: string, baseUrl?: string, cookie?: string, includeEdges?: boolean, format?: 'json' | 'summary' }`
  - behavior: calls `GET /api/backend/graph-api` with provided cookie; filters edges if requested
  - output: JSON graph or a one-line summary
  - note: `userId` is currently unused by the API call (graph is resolved from the session cookie)

Install deps:
- `@modelcontextprotocol/sdk` (server + stdio transport)
- `@modelcontextprotocol/inspector` (optional, provides GUI inspector)
- `tsx` (to run TypeScript directly)

Usage with an MCP-compatible client:
1) Install deps: `npm install`
2) Export env vars (see above).
3) Ensure you are signed in to the app locally and copy your session cookie (or provide a service mechanism for auth).
4) Start server: `npm run mcp:graph`
5) Optional: open inspector GUI: `npm run mcp:inspect`
6) Or configure your MCP client to connect over stdio.
