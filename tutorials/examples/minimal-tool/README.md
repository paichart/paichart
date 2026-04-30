# Minimal Tool — Baseline Weather Server

A working MCP tool with no quality investment. The tool is functional. AI clients can call it. But:

- The description is a five-word sentence — clients infer parameters by guessing
- Errors are bare `throw new Error()` — clients see "Error occurred during tool execution" with no recovery hint
- Success responses have no `_meta` — clients have no structured channel
- No fuzzy matching on not-found — typos return a flat "No data for X" message
- No parameter normalisation — `city_name`, `cityName`, `location` all fail with the same useless error

This is the deliberately mediocre baseline. Compare with [`../gold-standard-tool/`](../gold-standard-tool/) to see Chapter 2's standards applied.

## Run

```bash
npm install
node server.js
```

## Test calls and observed behaviour

| Call | What happens |
|---|---|
| `get_weather(city: "London")` | Returns mock data as a JSON string in `content` |
| `get_weather(city_name: "London")` | Fails — bare validation error, no aliasing |
| `get_weather(city: "Londn")` (typo) | Bare error: `No data for Londn`, no suggestions |
| `get_weather()` | Bare validation error: `city is required`, no example |
| `wrong_tool(city: "London")` | JSON-RPC error: `Unknown tool: wrong_tool`, hidden as a generic failure on some clients |

## Standards NOT applied

This server demonstrates the absence of (at minimum):

- GS1 Description UX
- GS3 Error Categorisation
- GS4 State-Aware Responses
- GS7 Error Response `nextSteps` (and the return-not-throw rule)
- GS8 Centralised Error Helpers
- GS9 Success Response `_meta`
- GS12 Parameter Normalisation
- GS13 JSDoc as Source of Truth

See `../gold-standard-tool/` for what each looks like in practice.
