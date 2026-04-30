# Gold-Standard Tool — Weather Server

The same `get_weather` tool as `../minimal-tool/`, with the standards from Chapter 2 applied. Same domain, same data, same input — but the response surface is now self-documenting.

## Run

```bash
npm install
node server.js
```

## Test calls and observed behaviour

| Call | Behaviour |
|---|---|
| `get_weather(city: "London")` | Success. Response includes structured `_meta` with `tool`, `timestamp`, `nextSteps` |
| `get_weather(city_name: "London")` | Success — `city_name` normalised to `city` at the boundary |
| `get_weather(location: "London")` | Success — `location` aliased to `city` |
| `get_weather(city: "Londn")` | NOT_FOUND error returned (not thrown). Includes fuzzy suggestion: `Did you mean: "London" (NN%)?` |
| `get_weather()` | VALIDATION error returned. Includes example invocation. |
| `wrong_tool(city: "London")` | Unknown-tool error returned with `_meta.nextSteps` directing the client to `tools/list` |

The strongest demonstration is the typo case: call `get_weather(city: "Londn")` and read the response. The error message itself contains the error type, a fuzzy suggestion, the full list of available cities, and recovery steps. The AI client can correct itself on the next call without external help. That is the headline claim Chapter 2 makes.

## Standards-to-code map

| Standard | Where in code |
|---|---|
| GS1 Description UX | `server.js` — the `description` block in `ListToolsRequestSchema` handler (`WHEN TO USE`, `EXAMPLES`, `PARAMETERS`, `WORKFLOW`, `SEE ALSO`) |
| GS3 Error Categorisation | `error-helpers.js` — both helpers produce four-emoji output (`❌ 🔍 💡 🔧`) with category, suggestion, recovery |
| GS4 State-Aware Responses | `server.js` `CallToolRequestSchema` handler — `nextSteps` differs by `errorType` (NOT_FOUND vs VALIDATION vs UNKNOWN) |
| GS7 Error Response `nextSteps` (return-not-throw) | `server.js` outer `try/catch` in the handler — internal helpers throw, the boundary catch returns `{content, isError: true}` with `_meta.nextSteps` |
| GS8 Centralised Error Helpers | `error-helpers.js` — single module, helpers RETURN `Error` objects; entry point converts to envelope |
| GS9 Success Response `_meta` | `server.js` — success path returns `_meta` with `tool`, `timestamp`, `sdkNative`, `nextSteps` |
| GS12 Parameter Normalisation at Transport Boundary | `server.js` — `PARAMETER_ALIAS_MAPPINGS` and `normaliseInput()` run before any handler logic |
| GS13 JSDoc as Source of Truth | `server.js` `handleGetWeather` — JSDoc with `@param`, `@returns`, `@example` is the canonical declaration; the schema and the description draw from it |
| (fuzzy suggestions on NOT_FOUND) | `error-helpers.js` `weatherNotFoundError` — Dice-coefficient similarity, top-3 suggestions with confidence scores |

## Standards intentionally not demonstrated

| Standard | Why not |
|---|---|
| GS2 Workflow Documentation | Single-step tool — the `WORKFLOW` block has one entry. Multi-tool sequences carry richer workflows. |
| GS5 Decision Tree | Single-action tool — no `[WHICH ACTION DO I USE?]` to disambiguate. Apply when a tool exposes multiple actions. |
| GS6 Cost / Benefit Messaging | No expensive operation worth surfacing. |
| GS10 Action Handler Response Structure | pAIchart-specific envelope (`{ actionId, action, status, result }`). Not applicable to a standalone MCP server. |
| GS11 Three-Layer Parameter Update | No separate validation-schema layer in this minimal example. Production servers with Zod-based validation enforce this rule when adding parameters. |

These are the situational, platform-specific, or rarely-changing standards from Chapter 2's portability table. Their absence here is deliberate.
