# Tutorial Examples

Two runnable MCP servers that implement the same `get_weather` tool. The first is a minimum-viable implementation; the second applies the standards from Chapter 2.

## Directory layout

```
examples/
├── minimal-tool/         # ~40 lines — what most MCP tutorials produce
└── gold-standard-tool/   # ~190 lines — same tool, twelve standards applied
```

Both use mock data (no API keys needed) and run as stdio MCP servers.

## How to run

```bash
cd minimal-tool          # or gold-standard-tool
npm install
node server.js
```

The server speaks MCP over stdio. Connect to it from any MCP client (Claude Desktop, MCP Inspector, etc.) by pointing the client at the `node server.js` command.

## How to compare

Open `minimal-tool/server.js` and `gold-standard-tool/server.js` side-by-side. The contrast tells the story Chapter 2 narrates:

- The minimal tool *works*. An AI client can call it and get correct data when the call is well-formed.
- The gold-standard tool *teaches itself*. When an AI client makes a malformed or imprecise call, the response tells the client exactly how to make the right call — typos return fuzzy suggestions, missing parameters return examples, and every response carries structured metadata.

`gold-standard-tool/README.md` includes a standards-to-code map showing which functions demonstrate which standards (and which standards do not apply to a single-tool server).

## Caveat

These are illustrative examples, not production servers. Real production servers add: authentication, rate limiting, telemetry, real upstream APIs, and per-environment configuration. Chapter 2's standards apply equally to those concerns; the examples here strip them away to keep the patterns visible.
