# MCP Tool Gold Standards — Specification

**Type**: Universal specification for MCP tool quality
**Scope**: Any MCP server, any platform, any team
**Audience**: Anyone reviewing or grading an MCP tool surface — including Claude when grading a customer's tools, external auditors, and engineers writing their first MCP server

**Companion documents**:
- For tutorial-style introduction with worked examples: [Chapter 2 — Ten UX + Three Plumbing Standards](02-the-ten-gold-standards.md)
- For the full series index: [tutorials/README.md](README.md)

(There is also a pAIchart-internal implementation reference that maps each standard to specific files in the pAIchart codebase. It is not part of this public series; the universal definitions, criteria, and grading rubric in this document are the same ones it derives from.)

---

## What this document is

The canonical specification of the thirteen gold standards for MCP tools. Each standard has a definition, success criteria, and failure modes. The document is platform-agnostic by design — there are no file paths, no specific code references, no team conventions. Replace any concrete example name (`get_weather`, `pov.list`) with whatever applies to your domain.

Three sections:

1. **The thirteen standards** — Part A (UX, GS1–10) + Part B (Plumbing, GS11–13)
2. **Cross-cutting implementation rules** — how the standards interact (e.g., the *content.text mirrors _meta* rule)
3. **Grading rubric** — A+/A/A−/B+ etc. for assessing a tool against the spec

This spec is what you'd hand to a stranger and say *"grade my tool against this"*. It is also what Claude consults when asked to grade a third-party MCP server.

---

## How to read the examples

Code samples in this document use a project-management domain (`pov`, `task`, `project`) as concrete substrate. The patterns are domain-agnostic — substitute your own entity names. Where a snippet shows `project(action: "pov.list", ...)`, mentally translate to `<your_consolidated_tool>(action: "<your_collection>.list", ...)`.

---

# Part A — The Ten UX Standards

The user-facing surface: how the tool *presents itself* to AI clients through descriptions, errors, response metadata, and response shape.

---

## Gold Standard 1 — Description UX

A tool description is not a comment. It is the only documentation the AI client reads at runtime. A complete description includes:

- A one-sentence purpose at the top
- A `WHEN TO USE` block with **both** ✅ positive cases (3+) and ❌ negative cases (2+) pointing to alternatives
- An `EXAMPLES` block with 3+ realistic invocations and their results, separated by `→`
- A `WORKFLOW` block when the tool is part of a multi-step sequence (see GS2)
- A `SEE ALSO` block listing 2–4 related tools

**Example (paste-template):**

```
description: `<one-sentence purpose>.

WHEN TO USE:
✅ <primary positive case>
✅ <secondary positive case>
✅ <tertiary positive case>
❌ <antipattern case 1> (use <alternative tool> instead)
❌ <antipattern case 2> (use <alternative tool> instead)

EXAMPLES:
• <call 1> → <result 1>
• <call 2> → <result 2>
• <call 3> → <result 3>

WORKFLOW:
1. <previous step>
2. <this step> (you are here)
3. <next step>

SEE ALSO:
• <related tool 1>
• <related tool 2>
• <related tool 3>`
```

**Success criteria**:
- One-sentence purpose at start ✓
- 3+ ✅ cases ✓
- 2+ ❌ cases pointing to alternatives ✓
- 3+ examples with `→` results ✓
- Workflow showing tool progression (when applicable) ✓
- 2–4 SEE ALSO entries ✓

**Failure modes**:
- Five-word description that gives no usage guidance
- ❌ cases missing — AI client doesn't know when NOT to use the tool
- Examples with no `→` — AI client guesses what the result looks like
- No SEE ALSO — AI client picks an adjacent tool when this one would be better

---

## Gold Standard 2 — Workflow Documentation

When a tool participates in a multi-step sequence, every tool in the sequence shows the same numbered workflow, with `(you are here)` marking the current position.

**Success criteria**:
- Numbered steps (1. 2. 3. 4.)
- `(you are here)` marker on the current tool
- Same workflow text in all related tools (with the marker moved)
- `→` arrow showing what each step returns/does
- Complete sequence from start to end

**Failure modes**:
- Workflow shown only on the first tool in the sequence
- Workflow text differs slightly between tools (drift)
- `(you are here)` marker forgotten when copying the workflow

---

## Gold Standard 3 — Error Categorisation

Errors are categorised (`CONFIGURATION`, `DATABASE`, `PERMISSION`, `TIMEOUT`, `VALIDATION`, `NOT_FOUND`, `AUTHENTICATION`), and each category carries category-specific recovery steps. The error itself lists valid parameters and working examples.

**Four-emoji format** (the canonical structure):

```
❌ <operation> failed: <error message>

🔍 Error Type: <CATEGORY>
💡 Suggestion: <one-line explanation>

Valid Parameters:
  • <param> - <description>

Examples:
  • <example invocation>

🔧 Recovery Steps:
  • <step 1>
  • <step 2>

Tip: <next-action hint>
```

**Why the emoji structure**: it gives AI clients a parseable structure. The model that issued the call can extract the *error type*, the *suggestion*, and the *recovery steps* from a free-text response without needing JSON.

**Success criteria**:
- Error categorised by type
- Category-specific recovery steps (not generic)
- Valid parameters listed
- Working examples included
- Four-emoji format (`❌ 🔍 💡 🔧`)

**Failure modes**:
- `Failed to do thing: ECONNREFUSED` (no category, no recovery)
- Generic recovery steps regardless of category
- Examples missing — AI client doesn't see the right shape

---

## Gold Standard 4 — State-Aware Responses

`nextSteps` adapts based on outcome state — success vs. failure, found vs. empty, immediate vs. queued, authenticated vs. anonymous.

**State table to enumerate per tool**:

| State type | Examples | nextSteps adaptation |
|---|---|---|
| Success / Failure | Validation passed/failed | Show proceed vs. fix guidance |
| Found / Empty | Results found vs. no results | Show details vs. search tips |
| Immediate / Queued | Sync vs. async execution | Monitor vs. execute guidance |
| Authenticated / Guest | User logged in vs. anonymous | Full vs. limited actions |

**Success criteria**:
- All possible outcome states identified
- Distinct `nextSteps` per state
- State-specific (not generic) language
- ✅/❌ emojis indicate success/failure where useful
- A `recommendation` field summarising the outcome

**Failure modes**:
- One `nextSteps` array regardless of outcome
- Empty result and successful result produce identical guidance
- Failed validation produces success-shaped `nextSteps`

---

## Gold Standard 5 — Decision Tree Documentation

Tools that expose multiple actions or modes carry a `[WHICH ACTION DO I USE?]` section. Actions grouped by intent (CREATE / MODIFY / DELETE / EXECUTE), with `→` pointing to the correct action and a `[COMMON ERRORS]` section listing recurring mistakes.

**Format**:

```
[WHICH ACTION DO I USE?]

Want to CREATE something?
  → <action 1> - <description>
  → <action 2> - <description>

Want to MODIFY?
  → <action 3> - <description>

Want to <other intent>?
  → <action 4> - <description>

[IMPORTANT] Common Confusion:
• <action A> handles <case>; <action B> is for <distinct case>

[COMMON ERRORS]:

❌ "<error pattern 1>"
✅ <how to fix>

❌ "<error pattern 2>"
✅ <how to fix>
```

**Success criteria**:
- `[WHICH ACTION DO I USE?]` section
- Actions grouped by intent
- `→` to the correct action
- `[IMPORTANT]` block addressing common confusion
- `[COMMON ERRORS]` with `❌` / `✅` pairs

**Failure modes**:
- Flat list of N actions with no grouping
- No common-errors block — repeated mistakes never get caught at the description level

**Apply when**: the tool exposes multiple actions or modes.

---

## Gold Standard 6 — Cost / Benefit Messaging

When a tool spawns expensive processes, replaces manual work, or carries non-obvious performance characteristics, the description states the cost-benefit explicitly. The same statement appears in success responses where relevant.

**Apply when**: tool spawns expensive processes; replaces manual work; has performance optimisations worth surfacing; or reduces external API calls.

**Success criteria**:
- Cost or benefit stated in tool description
- Same statement repeated in success responses where appropriate
- Numbers if available (e.g., "70-80% cost savings")

**Failure modes**:
- Two similar tools where the AI client can't tell which is more expensive
- Cost stated only in internal docs, never seen by the AI client

---

## Gold Standard 7 — Error Response `nextSteps` (with the return-not-throw rule)

Every catch produces a response with `_meta.nextSteps` specific to the error context. The error response is *returned* as `{content, isError: true}`, not thrown — at the transport boundary.

**Two-layer rule**:

1. **Internal helpers** may throw structured `Error` objects. This keeps internal code idiomatic.
2. **The tool entry point** must catch every error and *return* `{content, isError: true}` with `_meta`. A thrown error that escapes the handler becomes a JSON-RPC error, which some clients render as a generic *"Error occurred during tool execution"* — the `nextSteps` are then invisible.

The pattern: helpers throw deep, the boundary catch returns the envelope.

**Success criteria**:
- Every entry-point catch returns `{content, isError: true}` with `_meta.nextSteps`
- 2–3 actionable suggestions per error
- Alternative tools named where applicable
- `_meta.tool` uses the consolidated tool name (with `action` as a sibling field if applicable)

**Failure modes**:
- Throwing at the entry point — error renders as generic transport failure on some clients
- `nextSteps` generic regardless of error type
- Not-found errors with no fuzzy suggestions for similar resources

**Fuzzy suggestions on NOT_FOUND** are the canonical implementation:

```
❌ Not found: "<input>"

🔍 Error Type: NOT_FOUND
💡 Suggestion: <input> is not in the dataset

Did you mean: "<closest>" (NN%), "<next>" (NN%)?

Available options:
  • <option 1>
  • <option 2>

🔧 Recovery: pick one of the options above, or check spelling.
```

---

## Gold Standard 8 — Centralised Error Helpers

A domain with three or more error types has a dedicated `error-helpers` module exporting helpers (`notFoundError`, `validationError`, `enhancedOperationError`, `authRequiredError`). Handlers call the helpers; they do not inline error strings.

**Two-layer flow** (the GS7+GS8 reconciliation):

```
helpers throw Error objects (clean internal code)
  ↓
handler catches, returns MCP envelope
  ↓ {content, isError: true, _meta: {...nextSteps}}
transport boundary obeys GS7 (return, not throw)
```

**Success criteria**:
- Dedicated `error-helpers` module per domain
- All helpers use the four-emoji format
- Helpers imported in handlers
- Inline error strings replaced where appropriate
- Name lookups use fuzzy suggestions

**Use helpers when**: error types are standard (NOT_FOUND, VALIDATION, PERMISSION, AUTH_REQUIRED), multiple handlers share patterns, or you want categorisation to be automatic.

**Use inline patterns when**: the response shape genuinely differs from the helper output, or the error needs handler-specific context the helper does not support.

---

## Gold Standard 9 — Success Response `_meta`

Every success response carries a `_meta` object with a consistent shape: `tool` (the consolidated tool name), `action` (the sub-action, when applicable), `timestamp`, `sdkNative`, and `nextSteps` that include the actual IDs returned in the response.

**Recommended `_meta` shape**:

```javascript
_meta: {
  // Required
  tool: '<consolidated tool name>',
  timestamp: <ISO timestamp>,

  // Recommended
  action: '<sub.action>',          // when the tool routes by action
  nextSteps: [...],
  sdkNative: true,

  // Context-specific
  resourceType: '<type>',
  resultCount: <N>,
  cached: false,
  cacheAge: <ms>
}
```

**Critical**: `_meta.tool` should be the *consolidated* tool name (e.g., `project`, `perform`) — not the sub-action — so client code that switches on `tool` does not have to enumerate every action variant.

**Success criteria**:
- Every success response has `_meta`
- Includes `tool` (consolidated name), `timestamp`, `nextSteps`
- `action` is a sibling field, not packed into `tool`
- `nextSteps` are context-aware (use real IDs from the response)
- Resource-type tools have type-specific guidance

**Failure modes**:
- `_meta.tool: 'project(action: "pov.list")'` — packing the action into the tool field
- `nextSteps` with placeholder IDs instead of the real ones from the response
- No `_meta` at all on success responses

---

## Gold Standard 10 — Action Handler Response Structure

Action handlers return a fixed envelope: `actionId`, `action`, `status`, and a `result` object wrapping the response payload.

```typescript
interface ActionHandlerResponse {
  actionId: string;
  action: string;
  status: 'completed' | 'failed' | 'pending' | 'queued';
  result: {
    success?: boolean;
    created?: boolean;
    updated?: boolean;
    // ... resource fields ...
    message: string;
    warnings?: string[];
    metadata?: object;
  };
}
```

**Status values**:

| Status | When to use |
|---|---|
| `completed` | Action succeeded synchronously, **or** kicked off async work and returned a queued message in `result.message` |
| `failed` | Action failed (handler caught the error and returned the envelope rather than throwing) |
| `pending` | Action accepted but the result is not yet final |
| `queued` | Fire-and-forget execution started; poll separately for completion |

**Note**: The current production idiom is to return `'completed'` for fire-and-forget paths with the queued state expressed in `result.message`, rather than using the `'queued'` enum value.

**Success criteria**:
- Returns `actionId` (from handler params)
- Returns `action` (string literal)
- Returns `status` (one of four values)
- Response data wrapped in `result`
- `result.message` provides a one-line summary
- Error responses follow the same shape with `status: 'failed'`

**Failure modes**:
- Returning `{ success, data, message }` directly — output formatter renders `Action: undefined, Status: undefined`
- Mixing the response shape across action handlers — some return the envelope, others return raw data

**Note**: This is the single platform-specific standard in the set. The *concept* (a consistent action-handler envelope) is universal; the specific field names (`actionId`, `action`, `status`, `result`) reflect one production implementation. Adopt the concept; substitute names as needed.

---

# Part B — The Three Plumbing Standards

The wiring underneath the UX surface. These can be excerpted into a separate plumbing primer; a reader can adopt all of Part A without touching Part B and still ship measurably better tools.

---

## Gold Standard 11 — Three-Layer Parameter Update

When adding a new parameter to an MCP action, three layers must change in lockstep — tool schema, validation schema, handler. Skip any one and the parameter is silently stripped at the validation boundary.

**The pipeline**:

```
AI Client
    ↓ sends parameters
Layer 1: Tool Schema (e.g., tool-schemas.* file)
    → Zod (or equivalent) validates input shape
    ↓
Layer 2: Validation Schema (e.g., action-validation.* file)
    → Action-specific schema validates again
    → ⚠️ Strips unknown fields by default
    → If parameter is not declared here → SILENTLY REMOVED
    ↓
Layer 3: Handler
    → Destructures parameters
    → Uses the field
```

**Success criteria when adding a parameter**:
- Tool schema (Layer 1) — added to Zod schema, flat params list, description with example
- Validation schema (Layer 2) — added to action-specific schema in the validation map
- Handler (Layer 3) — destructures and uses the parameter
- Smoke test — exercises the parameter end-to-end

**Failure modes**:
- New parameter added to schema and handler, not to validation; parameter silently stripped; nothing throws; feature appears to work in isolation but does nothing in production

---

## Gold Standard 12 — Parameter Normalisation at Transport Boundary

AI clients do not all send parameters in the same shape. Claude Desktop sends snake_case identifiers; ChatGPT sends camelCase; some clients pass the entire arguments object as a JSON string.

The pattern: normalise at a single transport-boundary function, before validation.

```javascript
function normaliseInput(rawArgs) {
  // 1. Ensure args is an object (some clients send it as a JSON string)
  const args = ensureObject(rawArgs);

  // 2. Map every observed alias to its canonical name
  const normalised = {};
  for (const [key, value] of Object.entries(args)) {
    const canonical = PARAMETER_ALIAS_MAPPINGS[key] || key;
    normalised[canonical] = value;
  }

  return normalised;
}
```

The alias map is a flat `Record<string, string>` keyed by alias, with the canonical name as value:

```javascript
const PARAMETER_ALIAS_MAPPINGS = {
  'pov_id':         'povId',
  'team_member_id': 'teamMemberId',
  'project_id':     'projectId',
  // ... one row per observed alias ...
};
```

**This standard also covers malformed-format normalisation** — for example, automatically detecting and stripping known wrong-format prefixes like `pov-`/`task-` (which come from `fetch`-style resource IDs accidentally pasted into actions that expect bare CUIDs).

**Success criteria**:
- A single normalisation function per tool entry point
- `ensureObject` (or equivalent) handles JSON-string args
- A flat alias map declaring canonical names and accepted aliases
- Normalisation runs before schema validation, not after
- Every supported client is exercised in smoke tests

**Failure modes**:
- Same tool returns different errors depending on which AI client called it
- "Works in development, fails in production" reports
- Format mismatches (e.g., `pov-` prefixes) silently produce empty results

---

## Gold Standard 13 — JSDoc as Source of Truth

Tool authoring spans three artifacts that must agree: the tool schema, the handler signature, and the documentation. Drift between them is the root cause of GS11's three-layer bug.

The pattern: write the JSDoc block on the handler entry point, and let the schema and the documentation derive from it.

```typescript
/**
 * <one-line purpose>.
 *
 * @param {object} parameters
 * @param {string} parameters.<field> - <description> (REQUIRED).
 * @param {('A'|'B'|'C')} [parameters.<enumField>='A'] - <description>.
 * @param {string[]} [parameters.<arrayField>] - <description>.
 *
 * @returns {Promise<<ResponseType>>}
 *   <return shape description>.
 *
 * @example
 *   await handle<Action>({
 *     <field>: '<value>',
 *     ...
 *   });
 */
export async function handle<Action>(parameters, ...) { ... }
```

The JSDoc is the canonical source for:
- Required and optional fields → drives Layer 1 schema and Layer 2 validation
- Type unions and defaults → drives Zod enum/default declarations
- The example invocation → seeds the tool description's `EXAMPLES` block (GS1)
- The `@returns` clause → confirms GS10 envelope compliance

When the JSDoc and the schema disagree, the JSDoc is the canonical answer.

**Success criteria**:
- Every handler entry point has a JSDoc block listing all parameters with types, optionality, and defaults
- The JSDoc includes at least one `@example`
- The tool schema's `EXAMPLES` references the JSDoc example
- Schema-to-JSDoc parity is enforced by lint or generation tooling

**Failure modes**:
- JSDoc out of date with handler signature — every drift is a future GS11 bug
- Schema's example invocation references different parameters than the handler accepts

---

# Cross-Cutting Implementation Rules

Rules that span multiple standards and govern how they interact.

---

## Rule 1 — `content.text` must mirror `_meta.nextSteps` for empty/error states

**Bug class**: a handler can be structurally compliant with GS3, GS4, GS7, and GS9 — populating `_meta.nextSteps` correctly for every state — and still ship a dead-end user experience if the *formatter* that builds `content.text` discards the empty-state guidance. Many MCP clients render `content[0].text` prominently and treat `_meta` as hidden plumbing. A response with `content.text: "No tasks found."` and `_meta.nextSteps: ["Adjust filters", "Create task: ..."]` looks compliant in code review and broken in production.

**The rule**: For every empty-state, error-state, or recoverable-failure response:

- The handler builds `_meta.nextSteps` (per GS4, GS7, GS9).
- The formatter (or whichever code constructs `content.text`) must surface those `nextSteps` in the human-readable text — typically as a `💡 Suggestions:\n  • <step>\n  • <step>` block appended to the base message.
- A formatter that builds `content.text` independently of `_meta.nextSteps` is a defect, regardless of how clean each side looks in isolation.

**How to audit**: for each formatter function in your codebase that produces empty-state text, confirm it accepts the metadata/context object and uses `nextSteps` from it. A formatter signature that takes only the data array (no metadata) is a smell.

**Pair with**: a smoke test that issues a deliberately-failing call, asserts on `content[0].text` directly (not `_meta`), and confirms the corrective hint is present in the human-readable channel.

---

# Implementation Priority

When upgrading a tool to gold standard:

| Priority | Standard | Effort |
|---|---|---|
| P0 | GS10 — Action Handler Response Structure | 5–10 min |
| P1 | GS3 — Error Categorisation | 30–45 min |
| P2 | GS8 — Centralised Error Helpers | 1–2 hrs (one-time per domain) |
| P3 | GS7 — Error Response `nextSteps` (return-not-throw) | 15–30 min |
| P4 | GS9 — Success Response `_meta` | 20–30 min |
| P5 | GS4 — State-Aware Responses | 30–45 min |
| P6 | GS1 — Description UX | 20–30 min |
| P7 | GS2 — Workflow Documentation | 15–20 min |
| P8 | GS5 — Decision Tree (when applicable) | 30–45 min |
| P9 | GS6 — Cost / Benefit Messaging (when applicable) | 10 min |
| P10 | GS11 — Three-Layer Parameter Update | discipline, not time |
| P11 | GS12 — Parameter Normalisation | 30–60 min one-time per server |
| P12 | GS13 — JSDoc as Source of Truth | discipline, not time |

GS10 leads because a missing envelope causes the most visible breakage. GS3 and GS8 cluster next because errors are where AI clients spend the most attention.

---

# Grading Rubric

Use this to assess any tool against the spec.

| Grade | Criteria |
|---|---|
| **A+** | All 13 standards met + the cross-cutting `content.text mirrors _meta` rule + innovative enhancements |
| **A** | 11–13 standards met + cross-cutting rule satisfied |
| **A−** | 10 standards met + cross-cutting rule satisfied |
| **B+** | 8–9 standards met OR all 13 with cross-cutting rule violated |
| **B** | 6–7 standards met + baseline compliance |
| **B−** | 4–5 standards met + baseline compliance |
| **C+** | 1–3 standards met + baseline compliance |
| **C** | Baseline compliance only (the tool works, errors are returned as MCP envelopes) |
| **D** | Major gaps in baseline (errors thrown, no `_meta`, dead-end response text) |

**Note**: GS10 is platform-specific in its concrete form; for non-pAIchart servers, score GS10 as "consistent action-handler envelope across the surface" rather than the literal `actionId/action/status/result` field names.

---

# Self-Audit (13 Questions)

For each tool in your server, answer:

**Part A (UX):**

1. Does the description include `WHEN TO USE` (with `❌` cases) and `EXAMPLES` with results?
2. If the tool participates in a multi-step sequence, does it show the full numbered workflow with `(you are here)`?
3. Are errors categorised, with category-specific recovery steps?
4. Does `nextSteps` adapt to outcome state?
5. If the tool exposes multiple actions, is there a `[WHICH ACTION DO I USE?]` decision tree?
6. Where relevant, is the cost or benefit stated explicitly?
7. Does the tool entry point return `{content, isError: true}` with context-specific `_meta.nextSteps` (rather than letting errors propagate as JSON-RPC)?
8. Does the domain have a dedicated `error-helpers`, and are handlers using it?
9. Does every success response carry a `_meta` with `tool` (consolidated name), `action`, `timestamp`, and context-aware `nextSteps`?
10. Do action handlers return the `{ actionId, action, status, result }` envelope (or your equivalent), including `status: 'queued'` for fire-and-forget paths?

**Part B (Plumbing):**

11. When you last added a parameter, did you update all three layers (tool schema, validation schema, handler)?
12. Is parameter normalisation applied at a single transport-boundary function, before validation?
13. Is the handler's JSDoc the canonical source for parameter names, types, defaults, and examples?

**Plus the cross-cutting rule:**

14. Does the formatter that builds `content.text` for empty/error states surface `_meta.nextSteps` in the human-readable channel?

---

# Provenance

The thirteen standards were extracted from a production audit of a 28-tool MCP server (December 2025). The audit scored every tool on description quality, error handling, and response shape; the patterns this spec documents are what the highest-scoring tools had in common. Subsequent additions (GS11–13, the cross-cutting rule) emerged from cleanup work and bug-class triage in early-to-mid 2026.

For one production server's specific application of these standards — file paths, code references, the dispatcher pattern that ties pAIchart's tool surface together — pAIchart maintains an internal implementation reference that is not part of this public series. The universal definitions, criteria, and grading rubric in this document are the same ones it derives from.

For tutorial-style introduction with worked examples, see [Chapter 2](https://github.com/paichart/paichart/blob/main/tutorials/02-the-ten-gold-standards.md) of the public MCP Tool Excellence series.

---

# Document metadata

**Version**: 1.0
**Created**: 2026-05-05
**Status**: Authoritative spec for the gold standards. The pAIchart implementation reference and Chapter 2 tutorial both derive their definitions from this spec.
**Confidence**: 99% (production-validated; same definitions as the implementation reference and the public tutorial)
