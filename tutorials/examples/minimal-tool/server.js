const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const MOCK_WEATHER = {
  london:     { temperature: 14, condition: 'Cloudy',         humidity: 78 },
  tokyo:      { temperature: 22, condition: 'Sunny',          humidity: 60 },
  sydney:     { temperature: 19, condition: 'Partly cloudy',  humidity: 65 },
  'new york': { temperature: 12, condition: 'Rainy',          humidity: 85 }
};

const server = new Server(
  { name: 'weather-minimal', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'get_weather',
    description: 'Get weather for a city',
    inputSchema: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city']
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name !== 'get_weather') {
    throw new Error(`Unknown tool: ${name}`);
  }

  const city = args.city;
  if (!city) {
    throw new Error('city is required');
  }

  const data = MOCK_WEATHER[city.toLowerCase()];
  if (!data) {
    throw new Error(`No data for ${city}`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(data) }]
  };
});

const transport = new StdioServerTransport();
server.connect(transport);
