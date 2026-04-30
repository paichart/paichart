const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { weatherNotFoundError, weatherValidationError } = require('./error-helpers.js');

const MOCK_WEATHER = {
  london:     { temperature: 14, condition: 'Cloudy',         humidity: 78 },
  tokyo:      { temperature: 22, condition: 'Sunny',          humidity: 60 },
  sydney:     { temperature: 19, condition: 'Partly cloudy',  humidity: 65 },
  'new york': { temperature: 12, condition: 'Rainy',          humidity: 85 }
};

// GS12 — parameter normalisation at the transport boundary.
// Flat Record<string, string> mapping observed aliases to the canonical name.
const PARAMETER_ALIAS_MAPPINGS = {
  city_name: 'city',
  cityName:  'city',
  location:  'city'
};

function normaliseInput(rawArgs) {
  // Some clients send arguments as a JSON-encoded string
  if (typeof rawArgs === 'string') {
    try { rawArgs = JSON.parse(rawArgs); } catch { rawArgs = {}; }
  }
  const args = rawArgs || {};
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    const canonical = PARAMETER_ALIAS_MAPPINGS[key] || key;
    out[canonical] = value;
  }
  return out;
}

const server = new Server(
  { name: 'weather-gold-standard', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'get_weather',
    // GS1 — Description UX: WHEN TO USE, EXAMPLES, SEE ALSO, WORKFLOW, PARAMETERS
    description: `Get current weather conditions for a city.

WHEN TO USE:
✅ Quick weather lookup for a known city
✅ Comparing conditions across cities
❌ Weather forecasting (this returns current conditions only)
❌ Historical weather data (use a forecasting service)

EXAMPLES:
• get_weather(city: "London") → "London: 14°C, Cloudy (humidity 78%)"
• get_weather(city: "Tokyo") → "Tokyo: 22°C, Sunny (humidity 60%)"
• get_weather(city: "new york") → case-insensitive

PARAMETERS:
• city - City name (required, case-insensitive).
  Aliases accepted: city_name, cityName, location

WORKFLOW:
1. get_weather(city) → Current conditions

SEE ALSO:
• (extend with list_supported_cities, get_forecast, etc., as the surface grows)`,
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (case-insensitive).' }
      },
      required: ['city']
    }
  }]
}));

/**
 * Get current weather for a city.
 *
 * @param {object} parameters
 * @param {string} parameters.city - City name (case-insensitive). Aliases accepted: city_name, cityName, location.
 * @returns {{ city: string, temperature: number, condition: string, humidity: number }} Weather record.
 *
 * @example
 *   handleGetWeather({ city: 'London' })
 *   // → { city: 'London', temperature: 14, condition: 'Cloudy', humidity: 78 }
 */
function handleGetWeather(parameters) {
  const { city } = parameters;

  if (!city || typeof city !== 'string') {
    throw weatherValidationError('city', city, 'a non-empty string');
  }

  const data = MOCK_WEATHER[city.toLowerCase()];

  if (!data) {
    throw weatherNotFoundError(city, Object.keys(MOCK_WEATHER));
  }

  return {
    city,
    temperature: data.temperature,
    condition: data.condition,
    humidity: data.humidity
  };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: rawArgs } = req.params;

  // GS12 — normalise at the transport boundary, before validation
  const args = normaliseInput(rawArgs);

  // GS7 — entry point catches and RETURNS the MCP envelope (does not throw)
  try {
    if (name !== 'get_weather') {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = handleGetWeather(args);
    const text = `${result.city}: ${result.temperature}°C, ${result.condition} (humidity ${result.humidity}%)`;

    // GS9 — success response with structured _meta
    return {
      content: [{ type: 'text', text }],
      isError: false,
      _meta: {
        tool: 'get_weather',
        timestamp: new Date().toISOString(),
        sdkNative: true,
        // GS4 — state-aware nextSteps (success branch)
        nextSteps: [
          `Try another city: get_weather(city: "Tokyo")`,
          `Aliases accepted: city_name, cityName, location all map to city`
        ]
      }
    };
  } catch (error) {
    // GS3 — categorise; GS4 — state-aware nextSteps; GS7 — return, not throw
    const message = error.message || String(error);
    const errorType =
      message.includes('NOT_FOUND') ? 'NOT_FOUND' :
      message.includes('VALIDATION') ? 'VALIDATION' :
      'UNKNOWN';

    const nextSteps = errorType === 'NOT_FOUND' ? [
      'Pick a city from the list above',
      'Check spelling — fuzzy suggestions are included where similar cities exist',
      'Aliases accepted: city_name, cityName, location'
    ] : errorType === 'VALIDATION' ? [
      'Pass city as a non-empty string',
      'Example: get_weather(city: "London")'
    ] : [
      'Verify the tool name is correct',
      'Use the tools/list endpoint to see available tools'
    ];

    return {
      content: [{ type: 'text', text: message }],
      isError: true,
      _meta: {
        tool: name,
        timestamp: new Date().toISOString(),
        sdkNative: true,
        errorType,
        recoverable: errorType !== 'UNKNOWN',
        nextSteps
      }
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write('weather-gold-standard MCP server running on stdio\n');
});
