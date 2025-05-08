#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { scrapeDocumentation, searchDocumentation, getDocumentationInfo, updateDocumentation } from "./documentation.js";

// Create the server
const server = new Server({
  name: "filament-docs-mcp",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_docs",
        description: "A comprehensive documentation indexing tool that provides access to all available Filament documentation files. Use this tool to get a complete overview of the available documentation landscape before diving into specific topics.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "search_docs",
        description: "A powerful search engine for finding specific information across the entire Filament documentation. This tool allows precise querying to locate exact features, functions, or concepts within the documentation.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to find in the documentation"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "docs_info",
        description: "A metadata retrieval tool that provides information about the current documentation version and status. This tool helps understand the context and relevance of the documentation you're exploring.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "update_docs",
        description: "A documentation synchronization tool that ensures you have access to the latest Filament documentation. This tool can target specific versions, sections, and control update behavior.",
        inputSchema: {
          type: "object",
          properties: {
            version: {
              type: "string",
              description: "The version of documentation to update to (e.g., '3.x')"
            },
            force: {
              type: "boolean",
              description: "Whether to force an update even if the documentation is already up to date"
            },
            section: {
              type: "string",
              description: "Specific section to update (e.g., 'Panels', 'Forms'). If not provided, all sections will be updated."
            },
            check_versions: {
              type: "boolean",
              description: "Whether to check available versions from GitHub before updating"
            }
          },
          required: []
        }
      }
    ]
  };
});

// Define schemas for tool parameters
const searchDocsSchema = z.object({
  query: z.string().describe("The search query to find in the documentation")
});

const updateDocsSchema = z.object({
  version: z.string().optional().describe("The version of documentation to update to (e.g., '3.x')"),
  force: z.boolean().optional().describe("Whether to force an update even if the documentation is already up to date"),
  section: z.string().optional().describe("Specific section to update (e.g., 'Panels', 'Forms'). If not provided, all sections will be updated."),
  check_versions: z.boolean().optional().describe("Whether to check available versions from GitHub before updating")
});

// Implement the tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "list_docs": {
        const docs = await scrapeDocumentation();
        return {
          content: [
            {
              type: "text",
              text: docs
            }
          ]
        };
      }

      case "search_docs": {
        const args = searchDocsSchema.parse(request.params.arguments);
        const results = await searchDocumentation(args.query);
        return {
          content: [
            {
              type: "text",
              text: results
            }
          ]
        };
      }

      case "docs_info": {
        const info = await getDocumentationInfo();
        return {
          content: [
            {
              type: "text",
              text: info
            }
          ]
        };
      }

      case "update_docs": {
        const args = updateDocsSchema.parse(request.params.arguments);
        const result = await updateDocumentation(args.version, args.force, args.section, args.check_versions);
        return {
          content: [
            {
              type: "text",
              text: result
            }
          ]
        };
      }

      default:
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`
            }
          ]
        };
    }
  } catch (error) {
    console.error("Error in tool execution:", error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ]
    };
  }
});

// Connect the transport
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Filament Documentation MCP server running on stdio");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
