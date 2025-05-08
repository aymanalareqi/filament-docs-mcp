# Filament Documentation MCP Server

MCP server for Filament PHP documentation that provides access to the Filament documentation through the Model Context Protocol (MCP).

## Features

### Tools

- `list_docs` - Get a comprehensive list of all available Filament documentation files
- `search_docs` - Search for specific information across the entire Filament documentation
- `docs_info` - Get metadata about the current documentation version and status
- `update_docs` - Ensure you have access to the latest Filament documentation

### Functionality

This server scrapes and caches information from:

- The official Filament documentation site (https://filamentphp.com/docs)

It provides structured data including:

- Documentation sections and subsections
- Page content
- Search functionality

## Development

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run dev
```

## Installation

### Claude Desktop Configuration

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

#### Using local build

```json
{
  "mcpServers": {
    "filament-docs-mcp": {
      "command": "node",
      "args": ["/path/to/filament-docs-mcp/build/index.js"]
    }
  }
}
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node /path/to/filament-docs-mcp/build/index.js
```

The Inspector will provide a URL to access debugging tools in your browser.

## License

MIT
