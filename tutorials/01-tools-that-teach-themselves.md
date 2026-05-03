# Chapter 1 — Tools That Teach Themselves

**Audience**: People building MCP servers — including everyone who has scaffolded one with Claude or another AI assistant and wants to make it actually pleasant to use.
**Prerequisite**: None. If you've heard of MCP and know roughly what a "tool" means in that context (a function the AI client can call), you can read this chapter cold.
**Reading time**: ~10 minutes.

---

## What this chapter teaches

You wrote your first MCP tool. It works in the test client. But when you wire it up to Claude Desktop or ChatGPT, the AI client either calls it incorrectly, calls it less than you expected, or asks you for things your tool already knows how to do. None of that shows up as an error in your logs.

The single most useful idea in this whole tutorial series is the explanation: an MCP tool isn't just a function. It's a *user interface* — and the user is an AI client that decides whether to call your tool, what parameters to pass, and what to do with the response.

If your tool is built like a function (here's the input, here's the output, that's it), AI clients call it sometimes and miss the cases where it would actually help. If your tool is built like a UI — with a clear self-description, helpful errors, and structured response metadata — AI clients call it confidently, recover from mistakes on the same turn, and use it for things you didn't even anticipate.

This chapter covers what that distinction looks like in practice, why it matters, and which chapters of the rest of the series cover which aspects.

---

## The thing nobody tells you about MCP tools

An MCP tool definition has three required parts. The Model Context Protocol spec lists them: `name`, `description`, and `inputSchema`. Most tutorials treat these like the boilerplate they look like — fill them in, get a working tool, move on.

The trick is that two of those three parts (`description` and `inputSchema`) are *the only documentation an AI client ever reads about your tool*. The AI client doesn't read your README. It doesn't see your handler comments. It doesn't know about the slash command you set up. It sees the description, the parameter shape, and — when something goes wrong — your error message. That's it.

So when you write:

```javascript
{
  name: 'get_weather',
  description: 'Get weather for a city',
  inputSchema: { /* ... */ }
}
```

…the AI client now knows that there's a tool called `get_weather`, that it does *something with weather*, and that it takes some parameters. It doesn't know:

- When this tool should be used vs. some other weather-shaped tool
- What the response looks like
- What happens if the city name is misspelled
- What happens if the city is outside the supported set
- Whether it's safe to call speculatively, or whether it modifies state

The AI client guesses. Sometimes it guesses right. The guesses get worse as your tool surface grows.

A tool that "teaches itself" closes that gap. The description tells the client *when to use it*. Errors include corrective hints. Responses carry structured metadata the client can act on. The AI client doesn't need to guess; the tool tells it.

---

## A demonstration

Two tools. Same domain. Same data. Same input. Different design.

**Tool A** — minimal:

```javascript
{
  name: 'get_weather',
  description: 'Get weather for a city',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city']
  }
}
```

Handler returns weather data on success. On failure, throws an error.

**Tool B** — same data, redesigned:

```javascript
{
  name: 'get_weather',
  description: `Get current weather conditions for a city.

WHEN TO USE:
✅ Quick weather lookup for a known city
❌ Weather forecasting (this returns current conditions only)

EXAMPLES:
• get_weather(city: "London") → "London: 14°C, Cloudy (humidity 78%)"
• get_weather(city: "new york") → case-insensitive

PARAMETERS:
• city - City name (required, case-insensitive).
  Aliases accepted: city_name, location

SEE ALSO:
• (extend with related tools as your surface grows)`,
  inputSchema: { /* same shape, with .describe() on every field */ }
}
```

Handler returns weather data with structured `_meta` on success. On failure, returns a categorised error with a fuzzy suggestion if the city name is close to a known one.

Now imagine an AI client that's been asked: *"What's the weather in Londn?"*

**With Tool A**: the call goes through. The handler returns an error: `No data for Londn`. The error reaches the AI client as a generic protocol error — something like *"Error occurred during tool execution"*. The AI client tries again with `Londn`, gets the same error, and gives up — or asks the user to clarify. The user gets a worse experience than they'd have had with a search engine.

**With Tool B**: the call goes through. The handler returns:

```
❌ Weather lookup failed: no data for "Londn"

🔍 Error Type: NOT_FOUND
💡 Suggestion: city "Londn" is not in the dataset

Did you mean: "London" (88%)?

Available cities:
  • London
  • Tokyo
  • Sydney
  • New York

🔧 Recovery: pick one of the cities above, or check spelling.
```

The AI client reads "Did you mean: London", calls `get_weather(city: "London")`, returns the right answer to the user. Same data. Same handler logic. Different presentation.

The first tool *worked*. The second tool *taught the AI client how to use it*.

---

## Why this matters more than it sounds

A tool that's hard to call correctly causes three things to go wrong, all of which are easy to miss:

1. **It gets called less.** An AI client that's uncertain how to call your tool just calls it less. You ship a feature, and the AI client quietly avoids it because the description didn't make it confident the tool would help.

2. **The wrong tool gets picked.** When the AI client has several tools that could plausibly be relevant, it picks the one whose description is clearest. Even if your tool is the better fit, an unclear description hands the call to a sibling tool.

3. **A small mistake snowballs.** A failed tool call on one turn often means the conversation veers off course on the next. The user retries, rephrases, or gives up. Two turns later the conversation is stuck, even though your tool actually had the answer if it had been called correctly.

None of these show up as errors. None of them are caught by tests that just check "does the tool return data". They show up as conversations that didn't go where you expected.

The fix isn't more code. It's more *attention to the surface that's actually visible to the AI client*.

---

## What the rest of the series covers

The next chapter — Chapter 2 — names the patterns. Thirteen of them, observed in a production audit of a 28-tool MCP server. Ten cover the user-facing surface (descriptions, errors, response metadata). Three cover the wiring underneath (parameter handling, transport guards, JSDoc as source of truth). The chapter is the longest in the series; it's also the one you can read once and reach for any time you're building or reviewing a tool.

After that, the series expands:

- **Chapter 3** — how to write a smoke test for an MCP tool, in the kind of plain language that doesn't assume you've ever written one before. The "wrong call → corrective error → right call" pattern is the headline assertion.
- **Chapters 4 and 5** — the two silent-failure bug classes that affect production servers. Each one looks like the tool is working when it isn't. Both have a specific architectural fix.
- **Chapter 6** — the seven layers a tool touches in a non-trivial server. JSDoc as the source of truth that keeps them aligned.
- **Chapter 7** — a case study walking through pAIchart's own consolidation from 28 tools to 10, with the costs and benefits laid out honestly.
- **Chapter 8 (optional)** — the bridge from a single MCP server to a multi-service hub.

You don't need to read them in order. Chapter 2 is the spine. Most of the others can be picked up when the corresponding situation arises.

---

## The main idea, in one sentence

A working MCP tool gets called when the AI client knows about it. A *self-teaching* MCP tool gets called correctly even when the AI client is making its first mistake — because the tool itself contains everything needed to recover.

Chapter 2 is the next step.

---

## Provenance

The "self-teaching tool" framing comes from a December 2025 review of pAIchart's 28-tool MCP server. Tools at the top of the review produced measurably better AI-client behaviour — fewer mistaken calls, faster recovery from misformed inputs — than tools at the bottom. The patterns this series documents are what those high-scoring tools had in common.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
