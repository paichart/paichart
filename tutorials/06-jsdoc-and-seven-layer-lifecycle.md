# Chapter 6 — Designing and Evolving Tools: JSDoc + the 7-Layer Lifecycle

**Audience**: Engineers building or maintaining a non-trivial MCP server — one with several tools, more than one developer working on it, or a codebase old enough that the original author isn't around to explain things.
**Prerequisite**: Chapters 4 and 5. The bug classes there are special cases of the architecture this chapter describes.
**Reading time**: ~15 minutes.

---

## What this chapter teaches

A mental model for the work of *evolving* an MCP tool surface — adding new tools, modifying existing ones, removing the ones you no longer want. The model is a seven-layer pipeline that every tool touches in a production-shape server, plus a single source-of-truth discipline (JSDoc on the handler) that keeps the seven layers from drifting apart.

The chapter is structured around three concrete operations: **adding** a new tool, **modifying** an existing one, and **removing** one cleanly. Removing is the operation most prone to silent drift — a deleted tool tends to leave debris behind. Most of the chapter's specifics come from a real cleanup that found 139 stale references across 36 files after a small group of tools was retired.

---

## The seven layers

Every MCP tool in a non-trivial server exists across roughly seven concerns. The exact filenames vary by codebase, but the *categories* are consistent.

```
Layer 1: Schema         What the AI client sees:
                        name, description, inputSchema (Zod or equivalent)

Layer 2: Security       Who is allowed to see and call this tool:
                        PUBLIC / AUTHENTICATED / ADMIN tiers, plus per-handler
                        authorisation checks where needed

Layer 3: Annotations    MCP-spec hints to the client:
                        readOnlyHint, destructiveHint, idempotentHint, title

Layer 4: Handler        The business logic:
                        a class or function that implements what the tool does

Layer 5: Facade         The dispatcher / aggregator:
                        the file that imports each handler and routes
                        tool calls to the right one

Layer 6: Routing        The transport-level registration:
                        the array of tool names the server advertises,
                        and the switch statement that picks a handler

Layer 7: Documentation  Everything outside the code:
                        agent specs, discovery prompts, this kind of doc,
                        smoke tests, README sections
```

**Filenames will differ in your codebase**. A typical layout might look like:

| Layer | Example filename pattern |
|---|---|
| 1 Schema | `tool-schemas.<ext>` (or `tools.config.<ext>`, etc.) |
| 2 Security | `tool-security.<ext>` (a tier list — PUBLIC / AUTHENTICATED / ADMIN arrays) |
| 3 Annotations | `tool-annotations.<ext>` (MCP-spec hints per tool) |
| 4 Handler | `<tool-name>-handler.<ext>` (one file per tool, grouped by domain) |
| 5 Facade | A facade class that imports each handler and exposes a unified delegate method |
| 6 Routing | The transport entry point that registers the tools with the SDK and routes calls |
| 7 Documentation | Wherever your team keeps reference docs, agent specs, and smoke tests |

A small server might collapse a few layers (Layer 5 disappears if you have one tool; Layer 7 might be a single README). A larger server might split some further (Layer 7 may be split between agent specs, ADRs, and user-facing docs). The portability rule: **expect five to seven layers; don't be surprised when you find them**. Open a server you didn't write yourself and these categories are nearly always there, even when they aren't named.

---

## JSDoc as the source of truth

Layers 1, 4, and 7 all describe the same thing: what the tool is, what its parameters are, how it behaves. When they disagree — usually because someone updated the schema and forgot the documentation, or vice versa — the result is a tool whose declared behaviour and actual behaviour diverge silently. This is the architectural cousin of Chapter 4's three-layer parameter bug.

The fix is to pick one artifact as canonical and have the others derive from it. The most useful canonical artifact is a JSDoc block on the handler entry point:

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

Why this block and not somewhere else? Because the handler is the only artifact in the seven layers that you cannot avoid touching when changing the tool's behaviour. The schema can be edited; the documentation can be edited; but if the handler doesn't change, the *behaviour* doesn't change. Anchoring the source of truth to the handler makes drift impossible to hide — when the JSDoc on the handler is wrong, every change to the handler must update it.

The block then drives:

- **Layer 1 (schema)**: the parameter list, types, and required/optional flags. The schema fields mirror `@param` entries; the description's `EXAMPLES` block uses the JSDoc `@example`.
- **Layer 4 (handler)**: this is where the JSDoc lives.
- **Layer 7 (docs)**: any agent spec or README that explains the tool can quote the JSDoc directly. When the JSDoc changes, those quotes can be regenerated.

For Layers 2, 3, 5, and 6, JSDoc is informative but not directly generative — security tier and annotations are policy decisions, not parameter definitions. But the JSDoc still lists the tool name, which Layer 5 and 6 reference, which lets a static analyser detect mismatches.

---

## Operation 1 — Adding a new tool

When you add a tool, you touch all seven layers. Skipping any one of them creates a defect class:

| Layer skipped | Defect |
|---|---|
| 1 Schema | The tool isn't visible to AI clients (won't appear in `tools/list`) |
| 2 Security | The tool is visible, but the security check rejects every call |
| 3 Annotations | The tool works, but clients can't tell if it's read-only or destructive |
| 4 Handler | The tool dispatches to nothing — calls fail at runtime |
| 5 Facade | The dispatcher doesn't know about the new handler — calls fail at runtime |
| 6 Routing | The tool is registered in some entry points but not others — works in stdio but fails over HTTP, or vice versa |
| 7 Documentation | The tool exists but no agent or onboarding doc mentions it; usage stays at zero |

The seven-step procedure, in order:

```
[ ] Layer 1 — Schema
    Add Zod schema with name, description (Chapter 2 GS1 form),
    inputSchema with .describe() on every field. Add EXAMPLES.

[ ] Layer 2 — Security
    Add the tool name to the correct tier in tool-security.js
    (AUTHENTICATED_TOOLS or ADMIN_TOOLS — PUBLIC_TOOLS is rare).
    Update any "expected count" comments.

[ ] Layer 3 — Annotations
    Add an entry with title (human-readable), readOnlyHint
    (true if no data modification), destructiveHint (true if it
    creates / modifies / deletes). Rule: readOnlyHint and
    destructiveHint cannot both be true.

[ ] Layer 4 — Handler
    Create the handler class or function. Write the JSDoc block
    FIRST, before the implementation. Return the GS10 envelope
    (Chapter 2). Handle errors per GS3 + GS7.

[ ] Layer 5 — Facade
    Import the handler in the facade file. Instantiate it.
    Add a delegation method on the facade class.

[ ] Layer 6 — Routing
    Add the tool name to the registered tools array.
    Add a case to the dispatcher switch statement.

[ ] Layer 7 — Documentation
    Update agent specs that mention tool counts. Add to relevant
    discovery prompts. Add to the architecture reference.
    Add at least one smoke-test entry exercising the new tool.

[ ] Verify
    Run the verification script (see "Verification" below) — it
    should report N+1 tools across all layers and zero drift.
```

In a typical PR, this is a checklist applied to a single file change. The seven items add up to maybe two hours of work for a non-trivial tool, most of which is in Layer 4 (the actual implementation) and Layer 7 (writing documentation that doesn't lie).

---

## Operation 2 — Modifying a tool

A change to an existing tool needs only a subset of layers, depending on what you're changing:

```
Behaviour change          → Layer 4 (handler) + Layer 7 (docs)
Schema change             → Layer 1 (schema) + Layer 4 (handler) + Layer 7 (docs)
                            Plus the three-layer parameter rule
                            from Chapter 4 if you have a separate
                            validation schema.
Permission change         → Layer 2 (security) — usually no other
                            layer needed
Read/write classification → Layer 3 (annotations) — and usually
                            Layer 4 (handler) if the behaviour
                            actually changed
```

The smallest change that requires *all* seven layers is a tool rename. That's why renames are operationally identical to "add new + remove old" rather than a single in-place edit. If you can avoid renaming, do.

---

## Operation 3 — Removing a tool

This is the hardest operation. A retired tool tends to leave debris behind — references in code that's never run, references in documents that are no longer accurate, helper methods that no longer have callers. The Feb 2026 cleanup of pAIchart's tool surface, after retiring four tools, found:

- **Ghost tools** — registered in the schema but missing from security: visible to AI clients, but every call rejected. Dead from the start, but never removed.
- **Ghost annotations** — annotation entries for tools that were never implemented. Inert, but confused engineers reading the file.
- **Dead helper methods** — 356 lines of helper code with zero callers. A previous removal hadn't followed the call graph.
- **Stale documentation** — 139 references across 36 files. Tool counts in agent specs, examples in user docs, references in cross-tool `SEE ALSO` blocks.
- **Stale test scripts** — scripts that called retired tools and would have failed if anyone had run them.
- **Backup files** — an 87KB `.BACKUP.js` left in the codebase from a previous edit.

Six categories of debris from removing four tools. The cleanup took a focused session to undo. The pattern that emerged is the eight-step removal checklist:

```
[ ] Layer 1 — Schema
    Remove the schema. Also remove from any other tool's
    SEE ALSO references — those would otherwise dangle.

[ ] Layer 2 — Security
    Remove from AUTHENTICATED_TOOLS / ADMIN_TOOLS.
    Update count comments.

[ ] Layer 3 — Annotations
    Remove the annotation entry.

[ ] Layer 4 — Handler
    Delete the handler file. Then grep for any helper methods
    that ONLY served the removed handler — if no other caller
    exists, delete those too.

[ ] Layer 5 — Facade
    Remove the import, the constructor instantiation, and
    the delegation method. Then grep for the delegation method
    name across the codebase to confirm no stragglers reference it.

[ ] Layer 6 — Routing
    Remove from the registered tools array. Remove the case
    from the switch statement.

[ ] Layer 7 — Documentation sweep
    grep -r "<retired_tool_name>" .claude/ lib/ scripts/
    Update tool counts. Remove from cross-references in other
    tools' descriptions. Update SEE ALSO. Update onboarding docs.

[ ] Verify
    grep for the retired name across the entire codebase.
    Should return zero hits (except possibly migration history docs).
    Run the verification script — should report N-1 tools across
    all layers.
```

The non-obvious step is **the helper-method sweep** under Layer 4. When a tool dies, its private helpers don't always have visible references elsewhere — they look like normal codebase methods until you grep for callers and find none. The Feb 2026 cleanup found 356 lines of code in this category. That much dead code does not delete itself.

The grep at the end of Layer 7 is the audit. Anything that returns a hit either needs updating or — if the hit is in historical commentary like a migration log — should be deliberately retained as history. Either way, it should be a *decision*, not a leftover.

---

## The two-layer permission model

Layer 2 (Security) and Layer 4 (Handler) jointly enforce who can call what. The split looks redundant at first; it isn't.

**Layer 2 (tool-level visibility)** controls which tools appear in the AI client's `tools/list` response. Three tiers:

- `PUBLIC_TOOLS` — visible to unauthenticated clients. Rare and audited carefully.
- `AUTHENTICATED_TOOLS` — visible to any logged-in user.
- `ADMIN_TOOLS` — visible only to admins.

If a tool is in `ADMIN_TOOLS`, non-admins never see it in their tool list, and an attempt to call it directly is blocked at the boundary before the handler runs.

**Layer 4 (handler-level authorisation)** controls *what specific actions* within a visible tool a user can perform. For example, the consolidated `perform` tool is `AUTHENTICATED_TOOLS` — every authenticated user sees it — but its `pov.create` action checks the user's role inside the handler and rejects non-admins. Visibility and authorisation are separate axes.

When to use which:

- Use Layer 2 (`ADMIN_TOOLS`) when *the entire tool* should be invisible to non-admins.
- Use Layer 4 (handler check) when the tool is visible but specific *actions* within it need role-based gating.

The two-layer model gives you the flexibility to expose partial functionality without splitting the tool into two registrations.

---

## Verification

The seven-step add and eight-step remove checklists are tedious. The way to keep them honest is automation: a script that walks the seven layers, compares the tool names registered at each, and reports any drift.

pAIchart has two such scripts:

```bash
# Pipeline alignment — every tool should appear in every relevant layer
node scripts/verify-tool-annotations.js
# Expected: every tool in tool-schemas.js appears in tool-security.js
# AND tool-annotations.js. Any drift reported.

# Gold Standard compliance — every tool follows the Chapter 2 standards
node scripts/test-gold-standard-compliance.js
# Expected: every tool's description has WHEN TO USE / EXAMPLES /
# SEE ALSO; every error helper uses the four-emoji format; etc.
```

Both run in a few seconds, and both produce actionable output (the name of the offending tool and the layer it's missing from). They are the only enforcement mechanism that survives the original developer leaving the team. Add equivalents to your own server even if they cover only Layers 1 + 2 + 6 — the simplest version of the script is "diff the tool names declared in three places".

---

## Portability

The layers in this chapter are *categories of concern*, not specific files. Some servers collapse a few of them; some split them differently. The portability rules:

- Every non-trivial server has Layers 1 (schema) and 4 (handler).
- Every server with more than one tool needs Layers 5 (facade) and 6 (routing) in some form, even if both fit into the same file.
- Layers 2 (security), 3 (annotations), and 7 (documentation) are policy categories — they may be informal at first and formalise as the server grows.
- The seventh layer (documentation) is the easiest to skip and the hardest to recover. If you skip it deliberately, leave a comment explaining where the canonical description of each tool lives.

The pAIchart-specific filenames in the table near the start of this chapter are the concrete instance. Read them as examples, not requirements.

---

## What's next

Chapter 7 (optional) covers the bridge from a single MCP server to a multi-service hub — service discovery, capability-based search, multi-service workflows, and per-user authentication. If your work has been a single server up to this point, Chapter 7 is the moment that changes.

---

## Provenance

The 7-layer pipeline is documented in `.claude/knowledge/patterns/mcp-tool-lifecycle-pattern.md`. The Feb 2026 cleanup numbers (139 stale doc references across 36 files, 356 lines of dead helper code, etc.) are from that file's *Anti-Patterns* section, which captures the actual findings of the cleanup session. The two verification scripts cited here are real, in `/scripts/`.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
