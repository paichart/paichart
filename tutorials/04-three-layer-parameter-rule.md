# Chapter 4 — The Silent Parameter Stripping Bug

**Audience**: Engineers maintaining MCP servers that use Zod (or any other strip-on-unknown validation library) for input validation. This bug does not occur on a server with no validation layer — but it is the most common source of "I added the parameter, why doesn't it do anything?" reports on real production servers.
**Prerequisite**: Chapter 2 GS11 (the three-layer rule). This chapter expands on that one paragraph into the full war story.
**Reading time**: ~12 minutes.

---

## What this chapter teaches

A bug class that affects almost every production MCP server with a separate validation layer. The bug looks like this from the outside:

> A developer adds a new parameter to a tool. They update the tool schema. They update the handler. They test it in isolation — works fine. They ship it. In production, the parameter does nothing. Calls succeed, the parameter is silently ignored, and the handler reports it as `undefined`.

The cause is a single line of behaviour in Zod (or any equivalent library): unknown fields are stripped by default. If a parameter is declared in the tool schema but not in the validation schema between the transport and the handler, it is silently removed in transit. Nothing throws. Nothing logs. The parameter is just gone by the time the handler reads it.

This chapter walks through the bug, the architecture that makes it possible, how to find existing instances in your codebase, and how to keep it from happening again — including a simple smoke-test technique drawn from Chapter 3.

---

## How the bug shows up

A real example from pAIchart's production pipeline, translated into the running weather example:

You decide to add a `units` parameter to `get_weather` so callers can request Celsius or Fahrenheit. You make three changes:

1. You update `tool-schemas.js` — the tool's `inputSchema` now declares `units` as an optional string with the allowed values `"C"` and `"F"`.
2. You update the handler — `handleGetWeather` reads `parameters.units` and converts the temperature when set to `"F"`.
3. You add an example to the description — `EXAMPLES: get_weather(city: "London", units: "F") → London: 57°F, Cloudy`.

You start the server, run a smoke test against the tool with `get_weather(city: "London", units: "F")`, and the response comes back as `London: 14°C, Cloudy`. Celsius. The conversion didn't run.

You add a `console.log(parameters)` at the top of the handler. The log shows `{ city: "London" }`. No `units`. The field disappeared somewhere between the tool schema and the handler.

That somewhere is the validation layer.

---

## Why it happens

Zod — and most other schema-validation libraries — strips fields that are not declared in the schema, unless told to do otherwise. This is intentional. It's a security feature: if a client sends `{ city: "London", isAdmin: true }`, you don't want `isAdmin` flowing through to your handler and being interpreted as a privilege escalation. Zod removes it before you can be tempted.

The behaviour, in code:

```typescript
const Schema = z.object({
  city: z.string()
});

const result = Schema.parse({ city: "London", units: "F" });
// result === { city: "London" }
// units is gone. No error. No warning.
```

To allow extra fields through, you have to opt in explicitly with `.passthrough()`:

```typescript
const PermissiveSchema = z.object({
  city: z.string()
}).passthrough();

const result = PermissiveSchema.parse({ city: "London", units: "F" });
// result === { city: "London", units: "F" }
```

Production MCP servers typically do **not** use `.passthrough()`. The default strip is the right choice for security and predictability. The downside is that every new parameter has to be declared explicitly in every validation schema between the transport and the handler.

---

## The three layers

A production-shape MCP server has at least three layers between the AI client and the business logic. Each layer can have its own schema, and they don't always agree.

```
AI Client (Claude Desktop / ChatGPT / Inspector)
    │
    │ sends: { city: "London", units: "F" }
    ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Tool Schema                                    │
│ File: lib/mcp/server/config/tool-schemas.js (or equiv)  │
│ Job:  Validate input shape; presented to AI clients     │
│       in the tool definition                            │
│       ✅ units declared here                             │
└─────────────────────────────────────────────────────────┘
    │
    │ passes: { city: "London", units: "F" }
    ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Validation Schema                              │
│ File: lib/validation/<domain>-validation.ts (or equiv)  │
│ Job:  Domain-specific validation, business rules,       │
│       authorisation contexts                            │
│       ❌ units NOT declared here → STRIPPED              │
└─────────────────────────────────────────────────────────┘
    │
    │ passes: { city: "London" }     ← units is gone
    ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Handler                                        │
│ File: lib/mcp/.../get-weather-handler.ts (or equiv)     │
│ Job:  Business logic                                    │
│       parameters.units === undefined                    │
└─────────────────────────────────────────────────────────┘
```

The critical boundary is Layer 2. It exists for good reasons — Layer 1's job is to validate the *shape* the AI client sees (so the schema can be presented as a tool description); Layer 2's job is to apply business rules and authorisation that shouldn't leak into the public tool description. Splitting them makes sense. The cost is that adding a parameter requires touching both.

When a developer updates Layer 1 and Layer 3 but forgets Layer 2, the parameter is silently stripped. The smoke test passes if it only checks the response shape (the tool didn't error, it returned data). The bug is invisible until someone notices the data is wrong.

---

## How to find existing instances in your codebase

Three checks. Run them on any MCP server you didn't write yourself, or any server that's evolved over the last six months.

**Check 1 — find every parameter you've added recently and verify all three layers updated**

Look at `git log --since="6 months ago"` for the files containing your tool schema, your validation schema, and your handler. For each commit that adds or renames a parameter:

- Did the same commit (or a commit on the same day) touch all three files?
- If only two of the three files were touched, you have a candidate bug.

**Check 2 — grep for parameters declared in Layer 1 but missing from Layer 2**

If your tool schema and validation schema both use Zod, you can compare them. A rough first pass (filenames will differ in your codebase — substitute your own paths):

```bash
# List all parameters declared in the tool schema
grep -E "^\s+\w+:\s*z\." path/to/your/tool-schemas.* | sort -u

# List all parameters declared in validation schemas
grep -E "^\s+\w+:\s*z\." path/to/your/validation/*.* | sort -u

# Compare. Anything in the first list but not the second is suspicious.
```

This is approximate — `z.string()` and `z.number()` look different from each other in the regex — but it surfaces candidates worth a closer look. For a production audit, write a small script that imports both schemas and runs `Object.keys()` on each.

**Check 3 — exercise every parameter in a smoke test**

The detection technique that does not require any introspection of your code: for each parameter on each tool, write a smoke test that *exercises* that parameter and asserts the response reflects it.

For the `units` example: a smoke test would call `get_weather(city: "London", units: "F")` and assert that the returned text contains "°F" or a Fahrenheit-range temperature. If the parameter is silently stripped, the response says "°C" and the test fails.

This is the same shape as the round-trip recovery test from Chapter 3 — a call that should produce a measurably different result, with the assertion structured around the *effect* of the parameter, not the parameter's mere presence.

---

## How to keep it from happening again

A four-step procedure when adding a parameter:

```
[ ] Layer 1: Tool schema (tool-schemas.js)
    Add the field with .describe(); add to flat parameter list if used;
    add an EXAMPLE to the description (Chapter 2 GS1).

[ ] Layer 2: Validation schema (mcp-action-validation.ts or equivalent)
    Add the field. Confirm the surrounding schema does NOT use
    .passthrough() unless you have a specific reason.

[ ] Layer 3: Handler
    Destructure the parameter and use it.

[ ] Smoke test
    Add a call to your smoke-test markdown file that exercises the
    new parameter and asserts the response reflects its effect.
```

Treat the smoke-test step as part of "done", not a follow-up. It is the only check that runs without anyone remembering to run it. The other three checks rely on a developer's memory, which is exactly what failed in the original bug.

For teams with code review, a useful PR template entry: *"Did you update all three layers? Did you add a smoke-test call exercising the new parameter?"* — answered by the PR author, verified by the reviewer.

---

## Why this matters more than it sounds

The silent failure mode is what makes this bug expensive. Bugs that throw errors get caught: someone sees the stack trace, files an issue, fixes it. This bug does not throw. Nothing in the production logs indicates that anything is wrong. The handler runs successfully and returns data. The data is just *slightly* wrong — the new parameter had no effect.

In a team setting, the typical timeline is:

1. Day 1: Developer adds the parameter, ships, marks the issue resolved.
2. Day 7: A different developer or AI client uses the parameter, gets the wrong-but-not-failing result, doesn't realise.
3. Day 30: A user reports that the feature "isn't working".
4. Day 31: A different developer investigates. Eventually finds the missing Layer 2 declaration. Fixes it.

The cost is the 30 days of wrong data plus the investigation time. The fix is a one-line change to Layer 2. The bug-to-fix ratio is heavily weighted against you.

The whole class is preventable with the four-step procedure above. The smoke test is the safety net for everyone after the original developer.

---

## What's next

Chapter 5 covers a related but distinct bug class: transport boundary argument coercion. Same kind of failure mode (silent, no errors, wrong data), different cause (type information lost as values cross system boundaries — JSON encode/decode, HTTP, MCP transport). The mental model from this chapter is the foundation for that one.

---

## Provenance

The three-layer rule was extracted from a production pipeline test failure on pAIchart's MCP server (early 2026). A new parameter had been added to the tool schema and the handler, but not to the validation schema in between; the parameter was silently stripped, and the failure surfaced only when an end-to-end pipeline test exercised it. The pattern that emerged from the post-mortem is documented in `.claude/knowledge/patterns/mcp-parameter-three-layer-pattern.md`.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
