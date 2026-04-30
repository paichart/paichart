# Chapter 3 — Smoke Tests for MCP Tools

**Audience**: Anyone who has written their first or second MCP server (often with Claude's help) and is now looking after it.
**Prerequisite**: Chapter 2. You'll get more out of this chapter if your tool already follows at least a few of the standards there — clearer descriptions, structured errors, `_meta` on responses.
**Reading time**: ~12 minutes.

---

## What this chapter teaches

A smoke test is a short list of things to ask your MCP tool to do, in order, written down so you can repeat them. The "smoke" part comes from old hardware testing — you turn the device on and watch for smoke. Same idea here: you call your tool a handful of times and watch what comes back. If something's smouldering, you find out before your AI client does.

This chapter covers what a smoke test is, what one looks like, how to run it, how it finds edge cases, and — most importantly — how it shows whether your tool actually corrects mistakes the way Chapter 2 promised.

---

## Why bother

For a normal API, the test question is "does it work?". For an MCP tool, the more useful question is one Chapter 2 set up: *"when something goes wrong, does the tool tell the AI client how to fix it?"*

Two practical reasons to write a smoke test, even before you have a CI pipeline or anything else:

1. **Documentation rots; smoke tests don't.** A README that explains how your tool works can drift silently as the tool changes. A smoke test is documentation that *fails out loud* if it lies.
2. **AI-written code accumulates inconsistencies.** If you ask Claude to add a feature today, then ask Claude to add another next week, the second change can quietly break the first. A smoke test catches that.

You don't need any new tools to start. You can write a smoke test in a text file and run it by typing into Claude Desktop.

---

## What a smoke test looks like

A markdown file (or a text file, or a sticky note) that lists calls to make, in order, and what to expect from each. Here is one for the gold-standard weather tool from `tutorials/examples/gold-standard-tool/`:

```
1. Happy path
   Call:   get_weather(city: "London")
   Expect: success; response text mentions "London" and a temperature
   Expect: response carries _meta with tool, timestamp, and at least one
           entry in nextSteps

2. Missing required argument
   Call:   get_weather()
   Expect: error returned (not thrown); the response object has
           isError: true
   Expect: error text mentions "city" and shows an example invocation

3. Typo (the corrective-error case)
   Call:   get_weather(city: "Londn")
   Expect: error returned; isError: true
   Expect: error text contains a fuzzy hint like
           Did you mean: "London" (NN%)?

4. Alias (parameter normalisation)
   Call:   get_weather(city_name: "London")
   Expect: success identical to test 1

5. Round-trip recovery
   First:  get_weather(city: "Londn")
   Then:   take the city named in the "Did you mean" hint and call
           get_weather(city: "<that city>")
   Expect: the second call succeeds. This proves the corrective error
           from test 3 actually corrects.
```

That is the whole document. Five calls, each with one or two things to verify. About fifteen lines, ten minutes to write, two or three minutes to run. You can keep it next to your `server.js`.

This is the same shape pAIchart uses for its own MCP tools — every essentials test in `.claude/knowledge/smoke-tests/` is a numbered list of MCP calls with expected outcomes, run by following the document. You don't need a test framework for it.

---

## How to run it

Three ways to actually do the calls, ordered by how much setup they need.

**Option 1 — Just type into Claude Desktop**

Connect your MCP server to Claude Desktop, open a fresh conversation, and type each call as a request: *"Use the weather tool to look up London."* Read the response. Check it against your expectations. Move to the next call.

This is what most people start with. It is slow because Claude has to interpret your sentence and decide which tool to call, but it requires no extra software.

**Option 2 — MCP Inspector**

```
npx @modelcontextprotocol/inspector node server.js
```

Inspector gives you a UI where you call tools directly — no LLM in the way. It is the fastest way to inspect raw responses, see the `_meta` object, and confirm that errors are returned as response envelopes rather than thrown. If you are following Chapter 2's GS7 (return-not-throw rule), Inspector is the easiest way to verify it.

**Option 3 — Automate it**

Once your tool stops changing every day, you can write the calls into a small script that calls the MCP SDK programmatically and asserts the responses. Run it on a schedule, or before each commit. Worth doing eventually; not worth doing on day one.

For your first or second MCP server: Option 1 or Option 2 is enough. Don't reach for automation until the tool is stable.

---

## How a smoke test finds edge cases

The trick: don't only call your tool the way you intend it to be used. Probe the boundaries.

**Try the obvious wrong things**

- Empty input — call the tool with no arguments
- Wrong type — pass a number where you expected a string
- Misspelled values — `"Londn"` instead of `"London"`
- Different capitalisation — `"LONDON"`, `"london"`, `"London"` — should they all work?
- Extra parameters — `get_weather(city: "London", color: "blue")`

Each of these is a potential edge case. Most will work; the ones that don't are where bugs live. Write down what you found.

**Try the things AI clients actually send**

- `snake_case` where you expect `camelCase` — `city_name` vs `city`
- Strings where you expect objects — some clients pack the entire arguments object as a JSON-encoded string
- Aliases — `location` instead of `city`

These are not theoretical: different MCP clients (Claude Desktop, ChatGPT, Claude mobile, MCP Inspector) shape their requests differently. Chapter 2's GS12 (parameter normalisation) is the answer to most of them. A smoke test confirms the answer is actually applied.

**Try things that should fail**

- Tool names you don't have — `wrong_tool(city: "London")`
- Required parameters omitted
- Identifiers that don't exist (`city: "Atlantis"`)

Failures should not be silent crashes. They should be clear errors with corrective hints. A smoke test that *expects* failures is the only way to confirm your error path works.

A short rule of thumb: every line of code you wrote that handles an error is untested unless something in your smoke test deliberately triggers it.

---

## How a smoke test shows error correction

This is the headline claim Chapter 2 made, made testable. The pattern is three steps, and you saw it as test 5 in the example above:

**Step A — wrong call**

Ask for something the tool can't do. The most useful version is a small mistake the AI client might realistically make: a typo, a missing optional, a stale identifier.

**Step B — read the corrective error**

The error response should tell you what went wrong *and* how to fix it. For a typo, you should see something like *"Did you mean 'London'?"*. That hint is the correction.

**Step C — make the right call using the hint**

Take the value from step B's hint and use it as the input to a follow-up call. If the hint was good, the second call should succeed.

When step C succeeds, your tool is doing what Chapter 2 promised: teaching the AI client how to call it correctly through the response itself, with no external documentation needed. When step C fails — the hint was misleading, or vague, or technically right but unusable — you have found a real problem. Either the corrective text is wrong, or the tool's recovery path is broken.

A simple way to think about it: your smoke test should always include at least one wrong-call-then-right-call sequence. That sequence is the most important assertion you can make about an MCP tool.

---

## A note on pAIchart's own testing approach

For context — pAIchart uses two complementary layers of testing on its own MCP tools:

- **Validation tests** are automated TypeScript scripts run via `npm run test:security`, `npm run test:agent-injection`, and so on. There are 28 suites covering 746 tests. They check two things at once: that the codebase contains the right validation patterns (Layer 1), and that those patterns actually behave correctly when given malicious or invalid input (Layer 2). The dual-layer approach exists because Layer 1 alone is not enough — code can have a security pattern that does not actually work, and only Layer 2 catches that. The full architecture is documented in `.claude/knowledge/domain/testing/validation-testing-architecture.md`.
- **Smoke tests** are markdown procedures stored under `.claude/knowledge/smoke-tests/`. They describe sequences of MCP tool calls to make and what to verify. They are run by humans, by Claude Code, or by anyone with an MCP client pointed at the server. There are 28 of them, organised into essentials (~15-20 minutes each), domain deep-dives, and security/policy verification.

The two layers are not redundant. Validation tests catch bugs *in the code*. Smoke tests catch bugs *in the live tool surface as a real client experiences it*. For your first or second MCP server, smoke tests alone are enough — automated validation tests are worth adding once the tool is stable and you want to catch regressions without re-running the smoke procedure by hand.

---

## When to run it

Three useful moments:

- **After every change to the tool.** Especially changes Claude wrote for you. Five minutes of running the smoke test catches inconsistencies before they ship.
- **Before you share the tool with anyone.** Your colleague's first call should not be the first call you've made since last Tuesday's edit.
- **Once a month, even if nothing changed.** Dependency updates and SDK upgrades can quietly shift behaviour. The MCP spec itself changes occasionally. A monthly smoke test surfaces drift early.

If you find yourself running the smoke test daily, that's the right time to start automating it (Option 3 above).

---

## What's next

Chapter 4 covers the silent parameter stripping bug — the three-layer rule from Chapter 2 GS11. A smoke test that includes calls with new parameters is exactly how you catch a parameter that has been added in some places but not others.

---

## Provenance

The smoke-test format described here is the same one pAIchart uses for its own MCP server: numbered procedures, expected outcomes per step, run by issuing the calls. The 28-test catalogue under `.claude/knowledge/smoke-tests/` was the source for the pattern.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
