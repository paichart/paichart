# Chapter 2 — Ten UX + Three Plumbing Standards for MCP Tools

**Audience**: Engineers building or maintaining MCP tools.
**Prerequisite**: Familiarity with the MCP tool definition shape (`name`, `description`, `inputSchema`, handler).
**Reading time**: ~20 minutes (Part A: 15 min, Part B: 5 min).

---

## What this chapter teaches

Thirteen concrete standards — extracted from a production audit of MCP tool implementations — that move a tool from *technically working* to *reliably callable by AI clients without external documentation*.

The standards split into two parts:

- **Part A — Ten UX standards** (Gold Standards 1–10): how the tool *presents itself* to AI clients through descriptions, errors, response metadata, and response shape. This is the user-facing surface.
- **Part B — Three Plumbing standards** (Gold Standards 11–13): how the tool's internals are wired so the UX surface is correct by construction. These can be excerpted into a separate plumbing primer; a reader can adopt Part A first and reach Part B later.

Each standard is structured as: definition, minimal example, why it matters, checklist.

The standards are derived from real failure modes: tools that AI clients consistently called incorrectly, errors that surfaced as opaque "tool execution failed" messages, parameters that disappeared between transport and handler, and recurring mistakes that the tool's own response format *could* have prevented but did not.

---

## Background: the audit and the consolidation

In late 2025, an audit scored every tool in a 28-tool MCP server against three axes — description quality, error handling, response structure. The audit produced a ranked list. Tools at the top consistently exhibited the same patterns; tools at the bottom consistently lacked them. The patterns were not invented — they were observed, then promoted to standards.

In March 2026, that same server consolidated most of its 28 tools into 6 action-based tools (`project`, `perform`, `analytics`, `template`, `services`, `registry`) using an `entity.verb` sub-action convention. The remaining 4 tools (`search`, `fetch`, `prompt_command`, `list_prompts`) stayed as standalone tools because their semantics did not benefit from grouping. The audit findings transferred unchanged to the consolidated surface: a description is a description regardless of how many sub-actions sit behind the tool name.

A separate February 2026 cleanup of the same server identified a different category of failure on the same surface: tools registered in some configuration files but not others (ghost tools), annotations referencing non-existent tools, dead helper methods totalling 356 lines, and 139 stale documentation references across 36 files. The discipline that emerged from that cleanup — atomically updating every layer of the tool pipeline when a tool changes — is covered in Chapter 6 and underpins Gold Standards 11 and 13. The audit and the cleanup describe the same underlying problem from two angles: the audit asked "is this tool well-presented?", and the cleanup asked "is this tool consistently registered?".

The standards below are those audit findings, with the consolidated surface used in examples.

---

## A note on the example syntax

Many examples in this chapter use forms like:

```
project(action: "task.list", povId: "...")
perform(action: "task.create", povId: "...", title: "...")
```

This is the consolidated form pAIchart uses. Three things to know to read it:

1. The first identifier (`project`, `perform`) is the **tool name** — what the AI client sees in `tools/list`. There are six such consolidated tools (`project`, `perform`, `analytics`, `template`, `services`, `registry`) plus four standalone tools (`search`, `fetch`, `prompt_command`, `list_prompts`).
2. `action` is a **regular parameter**, not part of the tool name. Each consolidated tool routes internally to a sub-handler based on the action value. The AI client sees a small fixed set of tools; the richness lives in the action enum behind each one.
3. Sub-actions use **entity.verb** form — `pov.list`, `task.create`, `agent.execute`. The part before the dot is the entity; the part after is the operation.

For the purposes of this chapter, you can read these as if they were single tool names. `perform(action: "task.create", ...)` is mentally the same as `create_task(...)` would be on a non-consolidated server. The patterns this chapter teaches apply to either shape — the syntax is the form pAIchart happens to use, not a precondition for the standards.

Why this shape exists — token efficiency, naming consistency, and permission flexibility — is the subject of [Chapter 7 — Tool Consolidation](07-tool-consolidation-case-study.md), a case study walking through pAIchart's collapse from 28 tools to 10.

---

# Part A — Ten UX Standards

## Gold Standard 1 — Description UX

A tool description is not a comment. It is the only documentation the AI client reads at runtime. A complete description includes a one-sentence purpose, `WHEN TO USE` (with both positive and negative cases), `EXAMPLES` showing realistic invocations and their outputs, a `WORKFLOW` showing where the tool sits in a multi-step sequence, and `SEE ALSO` cross-references to related tools.

```javascript
description: `List all Projects (Proof of Value) with name-based filtering.

WHEN TO USE:
✅ Need structured filtering (status, geography, customer)
✅ First step before project(action: "pov.details")
❌ Natural language search (use search instead)
❌ Already know POV name (use project(action: "pov.details") directly)

EXAMPLES:
• project(action: "pov.list", status: 'VALIDATION', limit: 20) → POVs ready to close
• project(action: "pov.list", customer_name: 'CyberDefense') → Customer's projects

WORKFLOW:
1. project(action: "pov.list", filters) → Discover POVs
2. project(action: "pov.details", povId) → Get team IDs and structure
3. perform(action: "task.create", povId, ...) → Create tasks

SEE ALSO:
• search - Natural language cross-resource discovery
• project(action: "pov.details") - Full POV details after filtering`
```

Why it matters: AI clients select tools by reading descriptions. A description without negative cases (`❌`) leaves the client guessing whether your tool or a sibling tool is the right one. A description without examples forces the client to invent parameter shapes, which is the single most common source of first-call failures.

**Checklist**: one-sentence purpose · 3+ ✅ cases · 2+ ❌ cases pointing to alternatives · 3+ examples with `→` results · `WORKFLOW` showing tool progression · `SEE ALSO` with 2–4 related tools.

---

## Gold Standard 2 — Workflow Documentation

When a tool participates in a multi-step sequence, every tool in the sequence shows the same numbered workflow, with `(you are here)` marking the current position. The example below is drawn from a browser-automation tool family in the source server (now consolidated under `template` and `perform`):

```javascript
// In template(action: "list"):
WORKFLOW (follow these steps):
1. template(action: "list", category: "browser") → Discover templates (you are here)
2. template(action: "details", templateId) → Review parameters
3. perform(action: "task.create", agentTemplateId, parameters) → Create + execute

// In template(action: "details") — same workflow, marker moved:
WORKFLOW:
1. template(action: "list", category: "browser") → Choose template
2. template(action: "details", templateId) → Review parameters (you are here)
3. perform(action: "task.create", agentTemplateId, parameters) → Create + execute
```

Why it matters: AI clients chaining tool calls need a model of "what comes next". The marker turns a list of tools into a stateful map. Repeating the same workflow across every tool in the sequence makes the sequence self-reinforcing — the client cannot read about one step without being reminded of the others.

**Checklist**: numbered steps · `(you are here)` marker · same workflow text in all related tools · `→` showing each step's effect.

---

## Gold Standard 3 — Error Categorisation

Errors are categorised (`CONFIGURATION`, `DATABASE`, `PERMISSION`, `TIMEOUT`, `VALIDATION`, `NOT_FOUND`, `AUTHENTICATION`), and each category carries category-specific recovery steps. The error itself lists valid parameters and working examples.

```javascript
const errorMsg = error.message || String(error);
let errorType = 'UNKNOWN';
let recovery = [];

if (errorMsg.includes('database') || errorMsg.includes('prisma')) {
  errorType = 'DATABASE';
  recovery = ['Check database connection', 'Verify PostgreSQL is running'];
} else if (errorMsg.includes('permission') || errorMsg.includes('EACCES')) {
  errorType = 'PERMISSION';
  recovery = ['Check user role', 'Authenticate if needed'];
}
// ...

throw new Error(
  `❌ ${operation} failed: ${errorMsg}\n\n` +
  `🔍 Error Type: ${errorType}\n` +
  `💡 Suggestion: ${suggestion}\n\n` +
  `Valid Parameters:\n${validParams.map(p => '• ' + p).join('\n')}\n\n` +
  `Examples:\n${examples.map(e => '• ' + e).join('\n')}\n\n` +
  `🔧 Recovery Steps:\n${recovery.map(r => '• ' + r).join('\n')}`
);
```

The four-emoji format (`❌ 🔍 💡 🔧`) is not decoration. It gives AI clients a parseable structure: the model that issued the call can extract the *error type*, the *suggestion*, and the *recovery steps* from a free-text response without needing JSON.

A note on `throw` vs `return`: this snippet throws within the handler's internal layers. The transport-boundary catch block (covered under GS7) converts the thrown error into the MCP envelope before it reaches the AI client. Internal code stays idiomatic; the boundary stays compliant.

Why it matters: a generic `Failed to discover services: ECONNREFUSED` tells the client nothing it can act on. A categorised error with valid parameters and recovery steps lets the client retry correctly on the same turn — the most observable difference between a tool that "works" and a tool that "is usable".

**Checklist**: error categorised · category-specific recovery · valid parameters listed · working examples · four-emoji format.

---

## Gold Standard 4 — State-Aware Responses

`nextSteps` adapts based on outcome state — success vs. failure, found vs. empty, immediate vs. queued, authenticated vs. anonymous.

```javascript
return createSuccessResponse({
  validation: { isValid, errors, warnings },
  nextSteps: validation.isValid
    ? [
        "✅ Parameters validated successfully",
        "Ready to create automation task:",
        "perform(action: 'task.create', agentTemplateId, parameters)"
      ]
    : [
        `❌ Validation failed with ${errors.length} errors`,
        "Fix the errors listed above and validate again",
        "Need help? Use template(action: 'details', templateId) for schema"
      ],
  recommendation: validation.isValid ? 'proceed_to_create' : 'fix_errors_and_retry'
});
```

Why it matters: a tool that returns the same `nextSteps` regardless of outcome is providing decoration, not guidance. State-aware `nextSteps` make the response the *only* thing the client needs to read to decide its next action.

**Checklist**: identify all outcome states · distinct `nextSteps` per state · state-specific (not generic) language · `recommendation` field summarising the outcome.

---

## Gold Standard 5 — Decision Tree Documentation

Tools that expose multiple actions or modes carry a `[WHICH ACTION DO I USE?]` section in their description. Actions are grouped by intent (CREATE / MODIFY / DELETE / EXECUTE), with `→` arrows pointing to the correct action and a `[COMMON ERRORS]` section listing the mistakes most often seen in production.

```
[WHICH ACTION DO I USE?]

Want to CREATE something?
  → pov.create     - New POV with team and phases (ADMIN ONLY)
  → task.create    - New task (povId REQUIRED)
  → stage.create   - New stage in phase

Want to MODIFY a task?
  → task.update    - Change ANY field (status, assignee, priority)
  → task.complete  - Mark done

Want to use AGENTS for automation?
  1. agent.assign  - Attach template to task (required first step)
  2. agent.execute - Run the agent
  3. agent.status  - Check if still running
  4. agent.results - Get output and artifacts

[IMPORTANT] Common Confusion:
• task.update can change assignee directly (and any other field) — use it for general edits.
• task.assign exists as a specialised path for assignee-only updates; either works for assignee changes.
• agent.configure is optional; agent.assign with template defaults works for most cases.

[COMMON ERRORS]:

❌ "parameters.priority: Must be one of HIGH, MEDIUM, LOW"
✅ Use UPPERCASE values. Example: { priority: 'HIGH' } not { priority: 'urgent' }

❌ "parameters.povId: Required"
✅ Always include povId when creating tasks. Example: { povId: 'cuid-...', title: '...' }
```

Why it matters: a flat list of fourteen actions is unreadable. A decision tree is selectable. The `[COMMON ERRORS]` block converts the most expensive failures (parameter format mismatches that recur across users) into a one-line lookup the client can resolve before retrying.

**Checklist**: `[WHICH ACTION DO I USE?]` section · actions grouped by intent · `→` to the correct action · `[IMPORTANT]` block addressing common confusion · `[COMMON ERRORS]` with `❌` / `✅` pairs.

---

## Gold Standard 6 — Cost / Benefit Messaging

When a tool spawns expensive processes, replaces manual work, or carries non-obvious performance characteristics, the description states the cost-benefit explicitly. The same statement appears in success responses where relevant.

```
COST BENEFIT:
On-demand browser processes eliminate $200-400/month waste from
persistent servers. Achieves 70-80% cost savings while maintaining
full automation capabilities.
```

(This wording is the original from the source server's browser-automation tool family — preserved here as a real-world example rather than a reconstruction.)

Why it matters: this is the smallest of the standards but disproportionately useful when a tool is one of several that could plausibly be used. A cost statement embedded in the description nudges the AI client toward the right tool *and* lets the human reviewing the trace later understand why a particular choice was made.

**Apply when**: the tool spawns processes, replaces manual work, has performance optimisations worth surfacing, or reduces external API calls.

---

## Gold Standard 7 — Error Response `nextSteps` (and the return-not-throw rule)

Every tool entry-point catch produces a response with a `_meta.nextSteps` array specific to the error context. The error response is *returned* as `{content, isError: true}`, **not thrown** — at the transport boundary.

```javascript
} catch (error) {
  return {
    content: [{ type: "text", text: `❌ Error in project(action: "pov.list"): ${error.message}` }],
    isError: true,
    _meta: {
      tool: 'project',                    // consolidated tool name
      action: 'pov.list',                 // sub-action as a separate field
      timestamp: new Date().toISOString(),
      sdkNative: true,
      nextSteps: [
        'Try: project(action: "pov.list") without filters',
        'Check: status values are PROJECTED, IN_PROGRESS, STALLED, VALIDATION, WON, LOST',
        'Alternative: search("pov name") for natural language search'
      ]
    }
  };
}
```

The throw-vs-return rule has two layers:

1. **Internal helpers** (and the categorisation logic of GS3) *may* throw structured `Error` objects. This keeps internal code idiomatic.
2. **The tool entry point** must catch every error and *return* `{content, isError: true}` with `_meta`. A thrown error that escapes the handler becomes a JSON-RPC error, which some clients (notably Claude mobile in early 2026) display as a generic "Error occurred during tool execution" — the `nextSteps` are then invisible.

The pattern is: helpers throw deep, the boundary catch returns the envelope.

For not-found errors, fuzzy suggestions add measurable lift:

```javascript
if (!document) {
  const suggestions = await getFuzzySuggestions(type, resourceId, 5);
  return {
    content: [{ type: "text", text: JSON.stringify({
      error: "Resource not found",
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      _meta: {
        tool: 'fetch',
        errorType: 'NOT_FOUND',
        recoverable: true,
        nextSteps: [
          `Use search("${resourceId.substring(0, 8)}...") to find similar resources`,
          'Use project(action: "pov.list") to see what exists'
        ]
      }
    })}],
    isError: true
  };
}
```

**Checklist**: every entry-point catch returns `{content, isError: true}` with `_meta.nextSteps` · suggestions are specific to error type · 2–3 actionable suggestions · alternative tools named where applicable · `_meta.tool` uses the consolidated tool name (with `action` as a sibling field if applicable).

---

## Gold Standard 8 — Centralised Error Helpers

A domain with three or more error types has a dedicated `error-helpers.js` module exporting helpers (`notFoundError`, `validationError`, `enhancedOperationError`, `authRequiredError`). Handlers call the helpers; they do not inline error strings.

```javascript
// error-helpers.js — internal layer, throws structured errors
function enhancedOperationError(operation, error, options = {}) {
  const { validParams = [], examples = [], tips = [] } = options;
  // ... auto-categorise + format with 4-emoji structure ...
  return new Error(parts.join('\n'));   // returns an Error object
}

// In an internal handler — calls helper, throws
const { enhancedOperationError } = require('./error-helpers');

try {
  // ... operation ...
} catch (error) {
  throw enhancedOperationError('Service discovery', error, {
    validParams: ['capability: Filter by capability'],
    examples: ['services(action: "discover") → All services'],
    tips: ['Use services(action: "discover") for available categories']
  });
}

// At the tool entry point — catches and returns the MCP envelope (GS7 boundary)
async function toolEntryPoint(args) {
  try {
    return await internalHandler(args);  // helpers may throw deep inside
  } catch (error) {
    return {
      content: [{ type: "text", text: error.message }],
      isError: true,
      _meta: {
        tool: 'services',
        timestamp: new Date().toISOString(),
        sdkNative: true,
        // nextSteps derived from the error type — implement per your taxonomy.
        // A minimal version: switch on errorType embedded in error.message,
        // or attach a structured `error.nextSteps` array inside the helper.
        nextSteps: extractNextSteps(error) ?? [
          'Try again',
          'Check the error message above for specifics'
        ]
      }
    };
  }
}
```

This two-layer flow is the reconciliation of GS7 and GS8: helpers throw, the boundary returns. Internal code stays clean; the transport stays compliant.

For name-based lookups, `notFoundError` accepts an optional fuzzy-suggestions array with confidence scores. The output format becomes `Did you mean: "weather-api" (92%), "weather-v2" (85%)?` — directly usable by the AI client without additional reasoning.

Why it matters: consistency. A domain that inlines error strings will, over time, accumulate three formats, two emoji conventions, and four near-identical error categorisation blocks. A single helper module enforces the format at the only point that produces errors and reduces handler code by 60–70 percent in the catch paths.

**Use helpers when**: error types are standard (NOT_FOUND, VALIDATION, PERMISSION, AUTH_REQUIRED), multiple handlers share patterns, or you want categorisation to be automatic.
**Use inline patterns when**: the response shape genuinely differs from the helper output, or the error needs handler-specific context the helper does not support.

**Checklist**: dedicated `error-helpers.js` per domain · all helpers use four-emoji format · helpers imported in handlers · inline error strings replaced where appropriate · name lookups use fuzzy suggestions · the tool entry-point catch returns the MCP envelope (GS7).

---

## Gold Standard 9 — Success Response `_meta`

Every success response carries a `_meta` object with a consistent shape: `tool` (the consolidated tool name), `action` (the sub-action, when applicable), `timestamp`, `sdkNative`, and `nextSteps` that include the actual IDs returned in the response.

```javascript
return {
  content: [{ type: "text", text: formattedText }],
  isError: false,
  _meta: {
    tool: 'perform',                              // consolidated tool name
    action: action,                               // e.g. 'task.create'
    timestamp: new Date().toISOString(),
    sdkNative: true,
    nextSteps: actionNextSteps[action] || [
      `Action "${action}" completed successfully`,
      `View task: project(action: "task.context", taskId: '${resultId}')`
    ]
  }
};

const actionNextSteps = {
  'task.create': [
    'Task created successfully',
    `View task: project(action: "task.context", taskId: '${resultId}')`,
    `Assign agent: perform(action: "agent.assign", taskId: '${resultId}', agentTemplateId: '...')`
  ]
};
```

The recommended `_meta` shape:

```javascript
_meta: {
  // Required
  tool: 'tool_name',                    // bare consolidated name
  timestamp: new Date().toISOString(),
  // Recommended
  action: 'sub.action',                 // when the tool routes by action
  nextSteps: [...],
  sdkNative: true,
  // Context-specific
  resourceType: 'pov',
  resultCount: 5,
  cached: false,
  cacheAge: 1500
}
```

Why it matters: `_meta` is the structured channel that survives whichever way the human-readable `content` is rendered. AI clients that parse responses programmatically (rather than letting the model read free text) rely on `_meta` for routing decisions. Crucially, `_meta.tool` should be the *consolidated* tool name (`project`, `perform`) — not the sub-action — so client code that switches on `tool` does not have to enumerate every action variant.

A note on adoption: `_meta.tool` and `_meta.timestamp` are uniformly applied across production handlers. `_meta.action` is a more recent convention and is not yet uniformly emitted everywhere — handlers that build on the older patterns may pack the action name into the tool field or omit it entirely. The recommendation here represents the target shape; existing handlers will be brought into line incrementally.

**Checklist**: every success response has `_meta` · includes `tool` (consolidated name), `timestamp`, `nextSteps` · `action` is a sibling field, not packed into `tool` · `nextSteps` are context-aware (use real IDs) · resource-type tools have type-specific guidance.

### Critical implementation rule: `content.text` must mirror `_meta.nextSteps` for empty/error states

A handler can be structurally compliant with GS3, GS4, GS7, and GS9 — populating `_meta.nextSteps` correctly for every state — and still ship a dead-end user experience if the *formatter* that builds `content.text` discards the empty-state guidance. Many MCP clients render `content[0].text` prominently and treat `_meta` as hidden plumbing. A response with `content.text: "No tasks found."` and `_meta.nextSteps: ["Adjust filters", "Create task: ..."]` looks compliant in code review and broken in production.

The rule:

- The handler builds `_meta.nextSteps` (per GS4, GS7, GS9).
- The formatter (or whichever code constructs `content.text`) must surface those `nextSteps` in the human-readable text — typically as a `💡 Suggestions:\n  • <step>\n  • <step>` block appended to the base message.
- A formatter that builds `content.text` independently of `_meta.nextSteps` is a defect, regardless of how clean each side looks in isolation.

**How to audit**: for each formatter function in your codebase that produces empty-state text, confirm it accepts the metadata/context object and uses `nextSteps` from it. A formatter signature that takes only the data array (no metadata) is a smell.

**Pair with**: a smoke test that issues a deliberately-failing call, asserts on `content[0].text` directly (not `_meta`), and confirms the corrective hint is present in the human-readable channel.

---

## Gold Standard 10 — Action Handler Response Structure

Action handlers return a fixed envelope: `actionId`, `action`, `status`, and a `result` object wrapping the response payload. This is the standard the MCP output formatter expects.

```typescript
interface ActionHandlerResponse {
  actionId: string;                              // tracking ID, passed in
  action: string;                                // 'task.create', 'pov.create', etc.
  status: 'completed' | 'failed' | 'pending' | 'queued';
  result: {
    success?: boolean;
    created?: boolean;
    updated?: boolean;
    task?: object;
    pov?: object;
    message: string;                             // human-readable summary
    warnings?: string[];
    metadata?: object;
  };
}
```

**A note on the status enum.** The four-value union above is the *recommended* surface. In current production, action handlers return `'completed'` almost universally — including for fire-and-forget paths like `agent.execute`, where the handler returns `'completed'` with a `result.message` indicating the agent has been queued. `'failed'`, `'pending'`, and `'queued'` are reserved for handlers that legitimately need to express asynchronous or partial-completion states. External authors building their own handlers should default to `'completed'` for synchronous paths and adopt the other values only when their handler genuinely cannot return a final result on the same call.

A correct handler:

```typescript
return {
  actionId,
  action: 'task.create',
  status: 'completed',
  result: {
    task: { id, title, status, priority },
    message: `Task "${title}" created successfully`,
    created: true
  }
};
```

A regression in `pov.create` (December 2025) returned `{ success, pov, message }` directly without the envelope. The MCP output formatter rendered the response as `Action: undefined, Status: undefined, Action ID: undefined`. The data was correct; the envelope was missing. After the fix, the same data renders as `Action: pov.create, Status: completed, Action ID: mcp-action-xxx`.

**Status values**:

| Status | When to Use | Production usage |
|---|---|---|
| `completed` | Action succeeded synchronously, **or** kicked off async work and returned a queued message in `result.message` | Used by virtually every handler today |
| `failed` | Action failed (handler caught the error and returned the envelope rather than throwing) | Used selectively |
| `pending` | Action accepted but the result is not yet final | Reserved for future async handlers |
| `queued` | Fire-and-forget execution started; poll separately for completion | Reserved for future async handlers |

The current production idiom is to return `'completed'` for fire-and-forget paths (e.g., `agent.execute`) with the queued state expressed in `result.message`, rather than using the `'queued'` enum value. External authors should match this idiom unless their handler genuinely needs to express partial completion at the envelope level.

**Checklist**: returns `actionId` (from handler params) · returns `action` (string literal) · returns `status` (one of four values) · response data wrapped in `result` · `result.message` provides a one-line summary · error responses follow the same shape with `status: 'failed'`.

---

## Implementation priority for Part A

The standards are not equally urgent. When upgrading an existing tool:

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

GS10 leads because a missing envelope causes the most visible breakage. GS3 and GS8 cluster next because errors are where AI clients spend the most attention.

---

# Part B — Three Plumbing Standards

> Part B is structured as a separable concern. The three standards below sit *below* the UX surface — they govern how the tool's internals are wired so the UX standards in Part A produce correct output. A reader can adopt all of Part A without touching Part B and still ship measurably better tools. Part B can be excerpted into a standalone plumbing primer if this chapter runs long.

---

## Gold Standard 11 — Three-Layer Parameter Update

When adding a new parameter to an MCP action, three layers must change in lockstep — tool schema, validation schema, handler. Skip any one and the parameter is silently stripped at the validation boundary.

```
AI Client (Claude Desktop / ChatGPT)
    ↓ sends parameters
Layer 1: Tool Schema (tool-schemas.js)
    → Zod validates input shape
    ↓
MCP Server
    → Builds payload from validated input
    ↓ HTTP or direct dispatch
Layer 2: Validation Schema (e.g. mcp-action-validation.ts)
    → Action-specific Zod schema validates again
    → ⚠️ Zod STRIPS unknown fields by default
    → If the parameter is not declared here → SILENTLY REMOVED
    ↓
Layer 3: Handler
    → Destructures parameters
    → Uses the field
```

The critical boundary is Layer 2. Zod's default behaviour is to strip fields not declared in the schema. Production schemas typically do *not* use `.passthrough()` because it would allow injection of arbitrary fields into downstream calls. The trade-off is that every new parameter must be explicitly declared.

The anti-pattern: a developer adds the parameter to the tool schema and the handler, tests in isolation, and observes that "it works". In production, traffic flows through Layer 2, the parameter is stripped, and the handler receives `undefined`. Nothing throws; the call silently uses defaults.

The fix is procedural, not architectural: a checklist that enforces the three-layer update, plus a smoke test that calls the action with the new parameter and asserts the handler received it.

**Checklist when adding a parameter**:
- [ ] Tool schema (`tool-schemas.js`) — added to Zod schema, flat params list, description with example
- [ ] Validation schema (e.g. `mcp-action-validation.ts`) — added to action-specific schema in the validation map
- [ ] Handler — destructures and uses the parameter
- [ ] Smoke test — exercises the parameter end-to-end

---

## Gold Standard 12 — Parameter Normalisation at the Transport Boundary

AI clients do not all send parameters in the same shape. Claude Desktop sends snake_case identifiers; ChatGPT sends camelCase; some clients pass the entire arguments object as a JSON string under a single key. Tools that fail when the input shape varies by client will fail unpredictably in production.

The pattern: normalise at a single transport-boundary function, before validation.

```javascript
// At the entry point, before Zod validation
import { ensureObject } from './lib/utils/ensure-object';
import { PARAMETER_ALIAS_MAPPINGS } from './lib/mcp/server/config/parameter-aliases';

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

The alias map declares the canonical name for each observed alias. In production it is a single flat `Record<string, string>` keyed by alias, with the value being the canonical name:

```javascript
const PARAMETER_ALIAS_MAPPINGS: Record<string, string> = {
  'pov_id':         'povId',
  'team_member_id': 'teamMemberId',
  'project_id':     'projectId',
  // ... one row per observed alias across the whole tool surface
};
```

A flat map keeps lookups O(1) and avoids per-tool branching at the boundary. Tool-specific overrides (rare in practice) can be passed as a second argument to the normaliser, layered on top of the global map.

Why it matters: without normalisation, the same tool returns different errors depending on which AI client called it. This is the single largest source of "works in development, fails in production" reports for MCP authors who only test against one client. Normalisation at the boundary makes the rest of the codebase oblivious to client variation.

**Checklist**: a single normalisation function per tool entry point · `ensureObject` (or equivalent) handles JSON-string args · `PARAMETER_ALIAS_MAPPINGS` declares canonical-name and accepted aliases · normalisation runs before Zod validation, not after · every supported client is exercised in smoke tests.

---

## Gold Standard 13 — JSDoc as Source of Truth

Tool authoring spans three artifacts that must agree: the tool schema (what the AI client sees), the handler signature (what your code accepts), and the documentation (what the human author writes). Drift between these is the root cause of GS11's three-layer bug.

The pattern: write the JSDoc block on the handler entry point, and let the schema and the documentation derive from it.

```typescript
/**
 * Create a new task within a Proof of Value.
 *
 * @param {object} parameters
 * @param {string} parameters.povId - CUID of the parent POV (REQUIRED).
 * @param {string} parameters.title - Task title, ≤ 200 chars (REQUIRED).
 * @param {('LOW'|'MEDIUM'|'HIGH')} [parameters.priority='MEDIUM'] - Task priority.
 * @param {string} [parameters.assigneeId] - CUID of the assignee, optional.
 * @param {string[]} [parameters.tags] - Tag strings, optional.
 *
 * @returns {Promise<ActionHandlerResponse>}
 *   GS10 envelope with status 'completed' on success.
 *
 * @example
 *   await handleTaskCreate({
 *     povId: 'cuid-...',
 *     title: 'Set up CI pipeline',
 *     priority: 'HIGH'
 *   }, user, actionId);
 */
export async function handleTaskCreate(parameters, user, actionId) { ... }
```

The JSDoc block is then the single authoritative source for:
- Required and optional fields → drives Layer 1 schema and Layer 2 validation
- Type unions and defaults → drives Zod enum/default declarations
- The example invocation → seeds the tool description's `EXAMPLES` block (GS1)
- The `@returns` clause → confirms GS10 envelope compliance

When the JSDoc and the schema disagree, the JSDoc is the canonical answer. Tooling that lints JSDoc against the schema (or generates one from the other) closes the loop.

Why it matters: every drift between schema and handler is a future GS11 bug. Anchoring both to the JSDoc gives reviewers a single artifact to check during code review and reduces the cognitive cost of adding parameters.

**Checklist**: every handler entry point has a JSDoc block listing all parameters with types, optionality, and defaults · the JSDoc includes at least one `@example` · the tool schema's `EXAMPLES` references the JSDoc example · schema-to-JSDoc parity is enforced by lint or generation tooling.

---

## Where these standards come from

Most of the thirteen are best practice that applies to any AI-callable tool, not pAIchart-specific patterns. The table below names the origin and the portability of each:

| Standard | Origin | Portability |
|---|---|---|
| GS1 Description UX | Best practice — applies to any AI-callable tool | Universal |
| GS2 Workflow Documentation | Best practice — sequenced multi-step UX | Universal (multi-step tools) |
| GS3 Error Categorisation | Common error-handling pattern | Universal |
| GS4 State-Aware Responses | Best practice — outcome-shaped guidance | Universal |
| GS5 Decision Tree Documentation | Best practice — disambiguation aid | Universal (multi-action tools) |
| GS6 Cost / Benefit Messaging | Specific use case | Situational |
| GS7 Error Response `nextSteps` (return-not-throw) | MCP transport implication; observed Claude-mobile rendering bug | Universal |
| GS8 Centralised Error Helpers | Best practice — DRY error formatting | Universal |
| GS9 Success Response `_meta` | MCP spec field; consolidated-name + `action` sibling convention | Universal concept, naming convention |
| GS10 Action Handler Response Structure | pAIchart formatter convention | pAIchart-specific envelope; universal concern |
| GS11 Three-Layer Parameter Update | Common Zod pitfall | Universal where Zod (or equivalent) validation is used |
| GS12 Parameter Normalisation | Multi-client transport reality | Universal |
| GS13 JSDoc as Source of Truth | Best practice — drift prevention | Universal |

Eleven of the thirteen are universal. GS6 is situational; GS10 carries a pAIchart-specific envelope shape, but the underlying concern (a consistent action-handler response structure) is universal. The chapter's contribution is the curation — identifying *which* best practices reliably move tools from "works" to "usable without external documentation", and naming them so they can be audited.

---

## Self-audit

For each tool in your server, answer the thirteen questions:

**Part A (UX):**
1. Does the description include `WHEN TO USE` (with `❌` cases) and `EXAMPLES` with results?
2. If the tool participates in a multi-step sequence, does it show the full numbered workflow with `(you are here)`?
3. Are errors categorised, with category-specific recovery steps?
4. Does `nextSteps` adapt to outcome state?
5. If the tool exposes multiple actions, is there a `[WHICH ACTION DO I USE?]` decision tree?
6. Where relevant, is the cost or benefit stated explicitly?
7. Does the tool entry point return `{content, isError: true}` with context-specific `_meta.nextSteps` (rather than letting errors propagate as JSON-RPC)?
8. Does the domain have a dedicated `error-helpers.js`, and are handlers using it?
9. Does every success response carry a `_meta` with `tool` (consolidated name), `action`, `timestamp`, and context-aware `nextSteps`?
10. Do action handlers return the `{ actionId, action, status, result }` envelope, including `status: 'queued'` for fire-and-forget paths?

**Part B (Plumbing):**
11. When you last added a parameter, did you update all three layers (tool schema, validation schema, handler)?
12. Is parameter normalisation applied at a single transport-boundary function, before validation?
13. Is the handler's JSDoc the canonical source for parameter names, types, defaults, and examples?

A tool meeting twelve or thirteen standards is graded **A**. Ten or eleven is **A−**. Seven to nine is **B+**. The goal is not the grade — it is the consistent observation that A-graded tools recur in successful client traces, while lower-graded tools recur in support traces. (The audit dataset behind these grades is described in the *Background* section.)

---

## Applying these standards to your own server

The standards are useful as a checklist; they're more useful as a workflow. Here is the procedure for taking a server you've built and bringing it to A− or better, in roughly the order that pays off fastest.

### 1. Inventory your tool surface

List every tool your server exposes via `tools/list`. For a small server this is a one-line `grep`; for a larger one, copy the JSON response from a live `tools/list` call into a working file.

### 2. Score each tool against the self-audit

Run the 13 self-audit questions from the section above against each tool. Note the score per tool. A spreadsheet is fine; a markdown table is fine; a sticky note is fine.

### 3. Pick the lowest-scoring tool that's most-called

Two factors matter: how broken it is, and how often AI clients reach for it. The lowest-scoring most-called tool is the highest-leverage fix. If you don't have call-frequency data, pick the tool you'd be most embarrassed to demo.

### 4. Apply standards in priority order

Use the *Implementation Priority for Part A* table earlier in the chapter. GS10 (action handler envelope) leads — it's a 5-minute fix that closes the most visible breakage. GS3 + GS8 cluster next; errors are where AI clients spend the most attention.

### 5. Add smoke tests

For every standard you applied, add a smoke test that exercises the new behaviour. Chapter 3 walks through the format. Test 5 from Chapter 3 (round-trip recovery — wrong call → corrective error → right call) is the single most useful pattern; if you only add one test per tool, make it that one.

### 6. Re-score, repeat

Run the self-audit again on the upgraded tool. Move to the next-lowest-scoring tool. Stop when every tool is A− or better.

That's the whole loop. A small server (3–5 tools) finishes in a weekend. A medium one (10–20 tools) takes about a week of focused work. A large one (30+) is a multi-month project, but the highest-leverage fixes still pay off in the first day.

---

## Creating your own pattern

The thirteen standards in this chapter are general — they apply to any MCP tool surface. Your codebase will have its own conventions on top: domain-specific error categories, response field names, ID formats, authorisation models. Those domain-specific patterns deserve documentation in the same shape as the standards above.

A short template for your own internal "Pattern" doc:

```
# <Your Pattern Name> Pattern

**Type**: Excellence Pattern (extends gold-standards spec)
**Confidence**: <%>
**Domain**: <where this applies, e.g., "agent execution lifecycle">
**Companion to**: gold-standards spec (universal)

## What this pattern covers

<one paragraph: what falls under this pattern that the universal standards don't address>

## Standards specific to this domain

### Pattern-specific standard 1 — <name>
[same shape as a gold standard: definition, criteria, examples, checklist]

### Pattern-specific standard 2 — <name>
[same shape]

## Cross-references to gold standards

| This pattern's standard | Reinforces gold standard |
|---|---|
| <standard 1> | GS<N> |

## Implementation reference

<file paths in your codebase, code samples, who to ask for help>
```

The pattern of patterns: every team eventually has a domain-specific gold-standards document of its own. The universal thirteen are the foundation; your patterns are the layer above. As long as your patterns are auditable (clear criteria, clear failure modes, an audit checklist), they're as legitimate as any of the standards in this chapter.

---

## What's next

Chapter 3 covers smoke tests as living documentation — how a sequenced test plan flushes out the exact parameter mistakes that motivate Gold Standards 3, 5, 7, and 11. The test runner becomes the audit harness: every wrong call should be answered by an error so specific that the next call is correct.

---

## Provenance

The thirteen standards apply to any MCP server. They were extracted from pAIchart's own tool surface and remain in continuous use there. The Hub's own tools (`services`, `registry`, and the consolidated workflow actions under `services(action: "workflow.*")`) are themselves audited against the same standards.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
