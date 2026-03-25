/**
 * pAIchart MCP Hub Connector (stdio)
 *
 * Lightweight MCP server that advertises pAIchart's capabilities
 * and directs users to the hosted platform. Designed for containerized
 * deployments (Glama) where a local stdio MCP server is required.
 *
 * The actual MCP Hub runs at https://paichart.app/mcp with full OAuth,
 * service discovery, workflow orchestration, and per-user authentication.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const server = new Server(
  { name: 'paichart-mcp-hub', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'connect',
      description: 'Get connection instructions for pAIchart MCP Hub. The full Hub runs at https://paichart.app with 11 services, 39+ tools, per-user OAuth, and multi-service workflow orchestration.',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'discover',
      description: 'Discover available services on the pAIchart MCP Hub (fetches from public API)',
      inputSchema: { type: 'object', properties: {
        capability: { type: 'string', description: 'Filter by capability keyword (optional)' }
      }, required: [] }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'connect') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          hub: 'pAIchart MCP Hub',
          description: 'AI-native service orchestration with per-user authentication',
          connect: 'https://paichart.app/mcp',
          auth: 'OAuth 2.0 (GitHub, Google, Microsoft)',
          services: 11,
          tools: 39,
          features: [
            'Capability-based service discovery',
            'Per-user External OAuth (Snowflake, Databricks)',
            '6-tier trust level system',
            'Multi-service workflow chaining',
            'RS256 JWT/JWKS authentication (95/100 security score)'
          ],
          quickstart: {
            step1: 'Sign in at https://paichart.app',
            step2: 'Connect via Claude Desktop, ChatGPT, or custom MCP client',
            step3: 'Run: services(action: "discover") to see available services',
            step4: 'Run: /prompt register_guide to add your own service'
          },
          links: {
            hub: 'https://paichart.app/mcp',
            discovery: 'https://paichart.app/api/mcp/discover',
            llmsTxt: 'https://paichart.app/llms.txt',
            jwks: 'https://paichart.app/api/auth/jwks'
          }
        }, null, 2)
      }]
    };
  }

  if (name === 'discover') {
    try {
      const url = args?.capability
        ? `https://paichart.app/api/mcp/discover?capability=${encodeURIComponent(args.capability)}`
        : 'https://paichart.app/api/mcp/discover';
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Failed to fetch services: ${error.message}. Visit https://paichart.app/api/mcp/discover directly.` }] };
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
