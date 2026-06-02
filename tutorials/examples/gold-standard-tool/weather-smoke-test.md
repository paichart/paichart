# Smoke test — gold-standard weather tool

A smoke test is a short list of calls to make, in order, with what to expect from each. Run it by hand against this server (`node server.js`) using MCP Inspector or any MCP client. About fifteen lines, ten minutes to write, three minutes to run.

This is the worked example from **Chapter 3 — Smoke tests for MCP tools** (`../../03-smoke-tests-as-living-documentation.md`).

---

## The five tests

### 1. Happy path
**Call:** `get_weather(city: "London")`
**Expect:**
- Success — `isError: false`
- Response text mentions `London` and a temperature
- A `_meta` object with `tool`, `timestamp`, and at least one `nextSteps` entry

### 2. Missing required argument
**Call:** `get_weather()`  *(no `city`)*
**Expect:**
- Error **returned**, not thrown — `isError: true` on the response
- Error text categorises as `VALIDATION` and includes an example invocation
- The AI client that just made this mistake now has enough to fix it

### 3. Typo (the corrective-error case)
**Call:** `get_weather(city: "Londn")`
**Expect:**
- `isError: true`, `_meta.errorType: "NOT_FOUND"`
- Error text contains a fuzzy hint: `Did you mean: "London" (NN%)?`
- This hint is the corrective information Test 5 uses

### 4. Alias normalisation
**Call:** `get_weather(city_name: "London")`  *(snake_case alias instead of `city`)*
**Expect:**
- Success, **identical** content to Test 1
- Confirms the boundary normalises `city_name` / `cityName` / `location` → `city`

### 5. Round-trip recovery (the keystone)
```
First:  get_weather(city: "Londn")
        → parse the city named in the "Did you mean" hint
Then:   get_weather(city: "<that city>")
```
**Expect:** the second call succeeds. This proves the corrective error from Test 3 actually corrects — the contract the gold standards promise. If the hint is misleading, vague, or technically right but unusable, this test fails, and that's your signal the recovery path regressed.

---

## Edge-case probes (add as the tool grows)

Don't only call the tool the way you intend it to be used.

| # | Call | Expect |
|---|---|---|
| 6 | `get_weather()` | error names the missing parameter (`city`) |
| 7 | `get_weather(city: 123)` | error returned cleanly (wrong type), not a crash |
| 8 | `get_weather(city: "Londn")` | NOT_FOUND + fuzzy hint (the typo case) |
| 9 | `get_weather(city: "LONDON")` | success (case-insensitive) |
| 10 | `wrong_tool(city: "London")` | error returned, not a transport-level failure |

**Rule of thumb:** every line of error-handling code you wrote is untested unless something in this list deliberately triggers it.

---

## Running it

- **Claude Desktop** — connect the server, type each call as a request. Slowest, no extra tooling.
- **MCP Inspector** — `npx @modelcontextprotocol/inspector node server.js`. Direct tool calls, raw `_meta` visible, no LLM in the way. Best for seeing the return-not-throw behaviour.
- **Automate** — once the tool stops changing daily, script these calls with the MCP SDK and run them before each commit.

Supported cities in this example: London, Tokyo, Sydney, New York.
