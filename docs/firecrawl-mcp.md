# Firecrawl MCP Server Integration

Firecrawl MCP server lets the agent scrape, crawl, search, and extract content from websites via Model Context Protocol (MCP) tools.

## Overview

- Provides tools like `scrape`, `crawl`, `search`, and `extract` to gather site content.
- Runs as an external MCP server and connects to the agent over stdio.
- Requires an API key.

## Install

No project dependency needed — the MCP server runs via `npx`.

```bash
# Ensure Node.js 18+ is installed
node -v

# Confirm you have an API key
export FIRECRAWL_API_KEY=your_api_key_here
```

## Run (standalone)

```bash
npx -y firecrawl-mcp --help
```

You should see usage info. The agent will spawn this automatically when needed.

## Client JSON Config

Add the Firecrawl MCP server to the client configuration as a stdio MCP server:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"]
    }
  }
}
```

This project already includes an equivalent programmatic setup in the agent execution path.

## Environment Variables

Set the API key in `.env.local`:

```bash
FIRECRAWL_API_KEY=your_api_key_here
```

## Smoke Test

We include a minimal smoke test endpoint to verify the MCP server is invocable:

- GET `/api/firecrawl/smoke`
  - Returns `{ ok: true, help: "..." }` with `--help` output if `FIRECRAWL_API_KEY` is set.

## Example Uses

Prompts the agent can handle once Firecrawl is available:

- "Scrape https://example.com and give me the page title and meta description."
- "Crawl the docs site at https://nextjs.org/docs and summarize the main sections."
- "Search for articles about Tailwind v4 release and summarize top 3 sources."
- "Extract product names and prices from https://example.com/shop into JSON."

Behind the scenes, the agent will call Firecrawl MCP tools (`scrape`, `crawl`, `search`, `extract`) as appropriate.

