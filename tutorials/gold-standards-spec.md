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

The canonical specification of the fourteen gold standards for MCP tools. Each standard has a definition, success criteria, and failure modes. The document is platform-agnostic by design — there are no file paths, no specific code references, no team conventions. Replace any concrete example name (`get_weather`, `pov.list`) with whatever applies to your domain.

Three sections:

1. **The fourteen standards** — Part A (UX, GS1–10) + Part B (Plumbing, GS11–14)
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

**This standard also covers malformed-format normalisation** — for example, detecting known wrong-format prefixes like `pov-`/`task-` (which come from `fetch`-style resource IDs accidentally pasted into actions that expect bare CUIDs).

**Design rule — auto-strip vs reject + suggest**:

The two recovery options for a malformed input are not equivalent. Pick based on whether the underlying meaning is unambiguous:

- **Auto-correct silently (with warning in `_meta`)** when the meaning is unambiguous. Examples: `snake_case` → `camelCase`, JSON-string args → object, `city_name` → `city` alias. There is exactly one possible interpretation, and rejecting wastes a turn for nothing the AI client could not have known.
- **Reject with a corrective suggestion** when ambiguity is possible. Example: a `pov-cmxyz...` ID. Could be a stale fetch-result that's now wrong-pov, a typo, or a paste from the right place. Auto-stripping silently could operate on a different POV than the user meant; the cost of that silent miss is worse than the cost of an extra turn.
- **Reject with a *type-mismatch* error (no suggestion)** when the prefix detected doesn't match the parameter's type. Example: `task-cmxyz...` passed as `povId`. The bare CUID inside is likely a *task* CUID, not a *POV* CUID; auto-suggesting the bare CUID would silently substitute a different resource type, leading to a downstream lookup against the wrong table. The right behaviour is to flag the type mismatch explicitly and direct the caller to find a real POV ID.

The principle: normalise where the meaning is unambiguous; reject where ambiguity exists; reject *without* a CUID suggestion when the prefix tells you the underlying resource is the wrong type.

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

## Gold Standard 14 — Schema Enforcement at the Dispatch Boundary

Defining a schema and enforcing a schema are two different things. A schema is enforced only when something explicitly invokes it at runtime — `.safeParse(...)`, `.parse(...)`, or the equivalent for your validator. A tool that has a complete schema but no caller that invokes it has *zero* runtime guards, regardless of how thorough the schema looks in code review.

This becomes a security concern in multi-path architectures where one entry path enforces the schema and another path doesn't. The typical pattern: an HTTP REST API path runs the schema upstream; an MCP transport path (Claude Desktop, ChatGPT) calls the handler directly without invoking the schema. Same handler, two security postures.

**The pipeline**:

```
HTTP entry            POST /api/.../action
                            │
                            ▼
                      validateRequest()  ← schema runs here
                            │
                            ▼
                      Router.route(action, parameters)
                            │
                            ▼
                      handle<Action>(parameters)

MCP transport entry   MCP server (stdio / SSE)
                            │
                            ▼
                      transport-action-handler.*  ← only checks action enum
                            │
                            ▼
                      Router.route(action, parameters)
                            │
                            ▼
                      handle<Action>(parameters)
```

If `validateRequest()` is the *only* place the schema runs, the MCP-transport path is unprotected.

**The standard**: schema enforcement happens at the dispatch boundary (the router that maps action name to handler), not in `validateRequest()` alone, and not in each handler. One place, looked up by action name:

```typescript
async route(action, parameters, user, actionId) {
  const schema = ParameterSchemas[action];
  if (schema) {
    const parsed = schema.safeParse(parameters);
    if (!parsed.success) {
      throw new Error(`${action} validation failed: ${formatErrors(parsed.error)}`);
    }
    parameters = parsed.data;   // transformed data passes downstream
  }
  // ... per-action dispatch ...
}
```

What this closes:
- Strict mode (unknown-key rejection)
- All `.refine()` guards (empty-update checks, business-rule checks)
- Injection refines on text fields
- DoS caps on arrays
- Enum-from-source-of-truth validation
- All `.transform()` chains (snake_case → camelCase normalisation, null → undefined, etc.)

**Defense-in-depth layers**:

| Layer | Where | What it does |
|-------|-------|--------------|
| Transport entry | REST route handler, MCP server's action-enum check | Cheap early rejection (body size, action name, JSON shape). Not the right place for per-action schema validation. |
| **Dispatch boundary** | The router that dispatches action → handler | **Primary line of defense.** Single `safeParse` block; adopts every action by name. |
| Handler entry | First lines of `handle<Action>` | Defense in depth. Optional once the router enforces; worth retaining if handlers are reachable from non-router callers (test mocks, scripted maintenance). |

The dispatch boundary is the right primary layer because: (a) it has access to per-action context (schema-by-name lookup); (b) adopting a new action requires zero per-action enforcement code; (c) the single source of truth is greppable.

**Success criteria**:
- Every action with a parameter schema in your validation map is enforced before its handler runs, on every entry path
- A grep of `safeParse(` (or your validator's equivalent) in the dispatch layer returns *exactly one* invocation that handles all actions, not N per-handler invocations
- Smoke tests against the *deployed* server confirm each schema guard fires (empty body rejected, injection rejected, DoS cap fires, strict mode rejects surplus keys)
- If you intend to double-validate (upstream + dispatch), every transform on every schema is idempotent on its own output (`normalizeAliases`, `stripDangerousKeys`, `null→undefined` all qualify; verify custom transforms)

**Failure modes**:
- Schema defined but never invoked: handler accepts anything that doesn't crash type-coercion
- Multiple entry paths sharing one handler, with only one path enforcing the schema (the "transport-path bypass")
- Per-handler `safeParse` blocks instead of dispatch-level: every new action requires touching the handler; future handlers added without the block reintroduce the gap
- Schema is enforced but a `.transform()` non-idempotency causes a second-pass parse to reject already-transformed data (rare; verify if double-validating)
- Smoke tests exercise the schema in isolation (`schema.safeParse(payload)`) instead of the deployed tool through the transport, masking the bypass
- **Action allowlists in non-validation surfaces drift silently** (added v1.2 — see Provenance). The validation layer is one site where actions are enumerated; production codebases typically have several more — routing maps (which actions go through which dispatcher), risk classification sets (which actions need approval), discovery/fuzzy-match sets (which actions appear in "did you mean" suggestions), activity-logging taxonomies. When a new action is added to the validation layer but not to these other surfaces, the action works on direct dispatch but degrades on derivative paths. The worst variant: an action missing from a routing map falls through to a no-op stub that returns success without executing — a "silent success" that's worse than a loud failure. See the GS14 audit guidance below for the multi-surface grep.

**How to find this in your own server**:

1. Grep for `safeParse(` and `parse(` on your validation map. Count occurrences in each layer.
2. Map your entry paths: how does a request reach a handler from HTTP? From the MCP server? From any other source?
3. For each path, find where (if anywhere) the schema runs.
4. If two paths share handlers and only one path runs the schema, you have a bypass. Add dispatch-boundary `safeParse`.
5. **(v1.2)** Grep for ALL named action lists across your codebase — not just the validation map. Common sites: routing maps, risk classification sets, discovery/suggestion lists, logging taxonomy maps, fallback-action hard-codes. For each list, check whether your full action surface is represented. Missing entries on non-validation lists won't fail loudly; they degrade specific code paths silently. (See the audit recipe below for a concrete worked example.)

**v1.2 — the multi-surface allowlist audit (added 2026-05-16)**

The 2026-05-15 round of this discovery surfaced the *primary* bypass — a single P0 site where validation didn't run. v1.1 of this spec described the fix in terms of "the dispatch boundary". Subsequent cross-domain audit (parallel commissions to MCP architecture + MCP hub specialists) found that the *primary* bypass was correctly fixed but there were **additional allowlist sites the validation review hadn't reached** — routing maps, risk classification sets, and discovery surfaces. These additional sites don't cause security bypasses (the dispatch-boundary `safeParse` still enforces validation) but they cause **functional silent-degradation**: action absent from a routing map → request routes to a no-op stub → operation reported as successful, mutates nothing.

When auditing a real codebase, expect 5–10 named action enumerations, not 1. The dispatch-boundary `safeParse` from the GS14 base standard closes the security gap. The multi-surface alignment check closes the silent-degradation gap. Both audits are necessary; neither alone is sufficient.

**Multi-surface audit grep** (universal recipe — adapt file paths to your codebase):
```bash
# Find every place an action is hardcoded by enumerating its peers (e.g., your
# 'pov.create' or 'user.delete' will appear in 5-10 sites). Each output line
# is a candidate site that needs to know about every action.
grep -rn "'<peer.action.1>'.*'<peer.action.2>'" lib/ app/ src/ --include='*.ts' --include='*.js'
```

For pAIchart's MCP surface, the 2026-05-16 audit identified 10 sites across 5 files. The full per-domain inventory is maintained in the project's bug-class registry; the universal lesson is: **the validation layer is rarely the only place actions are enumerated**.

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
| P13 | GS14 — Schema Enforcement at Dispatch Boundary | 30–60 min one-time per server; **promote earlier if your server has more than one entry path sharing handlers** |

GS10 leads because a missing envelope causes the most visible breakage. GS3 and GS8 cluster next because errors are where AI clients spend the most attention. GS14 is listed last by default but should be triaged **immediately** for any server with multi-path architecture (REST + MCP transport, REST + queue worker, etc.) — the cost of the bypass is a class of security defect that all the other standards cannot compensate for.

---

# Grading Rubric

Use this to assess any tool against the spec.

| Grade | Criteria |
|---|---|
| **A+** | All 14 standards met + the cross-cutting `content.text mirrors _meta` rule + innovative enhancements |
| **A** | 12–14 standards met + cross-cutting rule satisfied + **GS14 must be met for any multi-path server** |
| **A−** | 11 standards met + cross-cutting rule satisfied + **GS14 must be met for any multi-path server** |
| **B+** | 8–10 standards met OR all 14 with cross-cutting rule violated |
| **B** | 6–7 standards met + baseline compliance |
| **B−** | 4–5 standards met + baseline compliance |
| **C+** | 1–3 standards met + baseline compliance |
| **C** | Baseline compliance only (the tool works, errors are returned as MCP envelopes) |
| **D** | Major gaps in baseline (errors thrown, no `_meta`, dead-end response text) |
| **F** | Multi-path server with the transport-path bypass (GS14 not met). Schema definition without schema enforcement is a security defect that overrides UX grading; the tool grades F regardless of other standards. |

**Notes**:
- GS10 is platform-specific in its concrete form; for non-pAIchart servers, score GS10 as "consistent action-handler envelope across the surface" rather than the literal `actionId/action/status/result` field names.
- The **F** grade is reserved for security defect of GS14 omission on multi-path servers. A tool that meets every other standard but has a transport-path bypass is functionally a tool with no validation at all on the bypass path — the standards aren't compensating each other; they're orthogonal.

---

# Self-Audit (14 Questions)

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
14. If your server has more than one entry path sharing handlers (REST + MCP transport, REST + queue worker, etc.): is the validation schema enforced at the *dispatch boundary*, not in the handler body or only in one entry path? Can you grep for `safeParse(` in the dispatch layer and find exactly one invocation that handles every action by name?

**Plus the cross-cutting rule:**

15. Does the formatter that builds `content.text` for empty/error states surface `_meta.nextSteps` in the human-readable channel?

---

# Provenance

The thirteen original standards were extracted from a production audit of a 28-tool MCP server (December 2025). The audit scored every tool on description quality, error handling, and response shape; the patterns this spec documents are what the highest-scoring tools had in common. Subsequent additions (GS11–13, the cross-cutting rule) emerged from cleanup work and bug-class triage in early-to-mid 2026.

**GS14 was added in v1.1 (2026-05-15)** after a production smoke test discovered a transport-path bypass in a newly-deployed action: the schema had eight independent guards (injection refines, DoS caps, strict mode, empty-update refine) but none of them fired because the MCP transport path called the handler directly without invoking the schema. Five rounds of specialist review (schema design, handler architecture, transaction integrity, MCP tool registration, validation engineering) had all passed; the smoke test found the bypass in seconds. The discovery → handler-level hotfix → fleet audit → router-level structural fix lifecycle is documented in [Chapter 9 — Hardening MCP Tools](https://github.com/paichart/paichart/blob/main/tutorials/09-hardening-mcp-tools.md) of the public series.

**v1.2 (2026-05-16)** added the multi-surface-allowlist failure mode after a follow-on audit. The day after the v1.1 fix shipped, two specialists (MCP architecture + MCP hub) ran a parallel sweep and found the validation-layer fix had closed the security gap correctly, but several *other* action enumerations elsewhere in the codebase had silently drifted from the validation list — routing maps, risk classification sets, discovery/suggestion lists. None caused security defects; one (a routing map) caused a P1 silent-degradation where AI-recommended actions fell through to a no-op stub that returned success without executing. The v1.1 wording about "the dispatch boundary" remains correct as the *security* prescription; v1.2 adds the multi-surface audit as the *correctness* prescription. The two are layered: schema enforcement closes the security gap; multi-surface alignment closes the silent-degradation gap. Both audits are needed.

For one production server's specific application of these standards — file paths, code references, the dispatcher pattern that ties pAIchart's tool surface together — pAIchart maintains an internal implementation reference that is not part of this public series. The universal definitions, criteria, and grading rubric in this document are the same ones it derives from.

For tutorial-style introduction with worked examples, see [Chapter 2](https://github.com/paichart/paichart/blob/main/tutorials/02-the-ten-gold-standards.md) and [Chapter 9](https://github.com/paichart/paichart/blob/main/tutorials/09-hardening-mcp-tools.md) of the public MCP Tool Excellence series.

---

# Document metadata

**Version**: 1.2
**Created**: 2026-05-05
**Last updated**: 2026-05-16 (extended GS14 with the multi-surface-allowlist failure mode and audit recipe; clarified the layered prescription — dispatch-boundary safeParse closes the security gap, multi-surface alignment closes the silent-degradation gap)
**Status**: Authoritative spec for the gold standards. The pAIchart implementation reference and the public tutorial chapters both derive their definitions from this spec.
**Confidence**: 99% (production-validated; same definitions as the implementation reference and the public tutorial)

**Changelog**:
- 1.2 (2026-05-16): Extended GS14 with a new failure mode — action allowlists in non-validation surfaces (routing maps, risk classification sets, discovery/suggestion lists) drift silently from the validation list and cause silent-degradation on derivative paths. Added the multi-surface audit recipe. Provenance updated. Triggered by a parallel cross-domain specialist audit that ran the day after v1.1 shipped and found the validation-layer fix had closed the security gap but other action enumerations had silently drifted; one (a routing map) caused a P1 silent-success-no-op on AI-recommendation execution. The v1.1 "dispatch boundary" prescription remains correct for *security*; v1.2 adds multi-surface alignment as the *correctness* layer.
- 1.1 (2026-05-15): Added GS14. Triggered by production discovery of a transport-path schema-enforcement bypass on a multi-path MCP server. Smoke-test driven; specialist review did not catch it. See GS14's "How to find this in your own server" section and Chapter 9 of the tutorial series.
- 1.0 (2026-05-05): Initial release with GS1–13 + cross-cutting rule.
