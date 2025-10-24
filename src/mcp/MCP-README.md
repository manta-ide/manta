# Manta Graph Reader MCP Server

A read-only Model Context Protocol (MCP) server that provides access to Manta's graph operations. This server allows external MCP clients to read graph data and analyze differences without modifying the underlying graphs.

## Features

- **Read Graph Data**: Access current or base graphs, including filtering by C4 architectural layers
- **Node Details**: Get detailed information about specific nodes
- **Diff Analysis**: Analyze differences between current and base graphs
- **MCP Protocol**: Full MCP compliance with tools and resources

## Installation

The MCP server is included in the main Manta project. Make sure dependencies are installed:

```bash
npm install
```

## Usage

### Starting the Server

Run the MCP server alongside your main Manta application:

```bash
# Terminal 1: Start the main Manta app
npm run dev

# Terminal 2: Start the MCP server
npm run mcp
```

The MCP server will start on port 3001 by default.

### Environment Variables

- `MCP_PORT`: Port for the MCP server (default: 3001)
- `MANTA_BASE_URL`: Base URL for the Manta API (default: http://localhost:3000)

### Endpoints

- **MCP Protocol**: `http://localhost:3001/mcp`
- **Inspector UI**: `http://localhost:3001/inspector` (for development/testing)

## Available Tools

### 1. `read`

Read from current graph, or a specific node with all its connections. Can filter by C4 architectural layer.

**Parameters:**
- `nodeId` (optional): Specific node ID to read
- `layer` (optional): C4 layer filter ("system", "container", "component", "code")
- `includeProperties` (optional): Include node properties
- `includeChildren` (optional): Include child nodes

**Example:**
```json
{
  "layer": "component"
}
```

### 2. `analyze_diff`

Analyze differences between current graph and base graph.

**Parameters:**
- `nodeId` (optional): Specific node ID to analyze, or analyze entire graph if not provided

**Example:**
```json
{
  "nodeId": "node123"
}
```

## Available Resources

### 1. `config://graph`

Graph configuration and available operations.

Returns JSON with:
- Base URL configuration
- Available operations
- Supported graph types and layers
- Server description

## Integration Examples

### Using with Claude Code

Configure Claude Code to use this MCP server by adding it to your MCP configuration:

```json
{
  "mcpServers": {
    "manta-graph": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/your/manta/project"
    }
  }
}
```

### Using with other MCP clients

Any MCP-compatible client can connect to `http://localhost:3001/mcp` to access the graph reading tools.

## Development

### Testing the Server

Use the built-in inspector UI at `http://localhost:3001/inspector` to test tools and resources during development.

### Architecture

The MCP server uses the `mcp-use` framework and provides:
- **Tools**: Executable functions for graph operations
- **Resources**: Static/dynamic content access
- **Express Integration**: HTTP endpoints for UI and custom routes

## Security

This is a read-only MCP server with no write operations. It only provides access to:
- Graph reading operations
- Diff analysis
- Configuration information

All operations are proxied through your existing Manta API endpoints.
