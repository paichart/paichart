# Chapter 9 — Hardening MCP Tools: When Schema Definition Isn't Schema Enforcement

**Audience**: Engineers shipping MCP tools to production. You've defined Zod (or equivalent) schemas for your action parameters. You believe those schemas are protecting your handlers.
**Prerequisite**: Chapter 4 (Three-Layer Parameter Rule) and Chapter 3 (Smoke Tests). Familiarity with Zod's `.safeParse`, `.refine`, `.transform`.
**Reading time**: ~18 minutes.
**Companion reference**: [MCP Tool Layered Architecture Specification](mcp-tool-layered-architecture-spec.md) — the full four-layer mental model (Server / Tool / Dispatcher / Handler) this chapter's defense-in-depth pattern is a subset of. Read alongside if you want the per-layer assignment of every common security control.

---

## What this chapter teaches

Defining a schema and enforcing a schema are two different things. A tool can have a perfect schema with injection refines, DoS caps, strict-mode rejection of unknown keys — and still let everything through if the schema is never actually invoked at runtime.

This chapter walks through how a multi-path architecture (REST API + MCP transport, sharing the same handlers) can silently create a "transport-path bypass" where schema validation only fires on one path. It shows how a routine deploy-smoke test caught this in a production tool — after five rounds of specialist review missed it — and how the fix evolved from a one-handler hotfix to a router-level structural close.

The chapter ends with a **defense-in-depth checklist** for auditing your own MCP server.

The example uses a generic `widget.update` action throughout. The pattern applies to any consolidated MCP tool with sub-actions (`perform`, `manage`, `do`) that route to per-action handlers.

---

## The illusion

Here is a schema that looks safe:

```ts
export const MCPParameterSchemas = {
  'widget.update': z.object({
    widgetId: ValidationSchemas.WIDGET_ID,           // required CUID
    name: InjectionSafeOptional(255, 'Name', 1),     // XSS-refined, length-capped
    description: InjectionSafeOptional(5000, 'Description'),
    status: FormField.optional(PrismaEnum.widgetStatus),
    tags: FormField.optional(z.array(z.string().max(50)).max(20)),  // DoS-capped
    metadata: FormField.optional(safeRecord()),       // BC27 prototype-pollution strip
  })
  .strict()  // surplus keys rejected
  .refine(
    (data) => Object.keys(data).filter(k => k !== 'widgetId').length > 0,
    { message: 'At least one updatable field required besides widgetId' }
  )
  .transform(data => normalizeAliases(data));
};
```

Counts: required-CUID guard, length caps, injection refines on text, DoS array cap, prototype-pollution strip, strict mode, empty-update refine, snake_case→camelCase normalisation. Eight independent guards.

Now the handler:

```ts
export async function handleWidgetUpdate(
  parameters: any,
  user: TokenPayload,
  actionId: string,
): Promise<any> {
  const params = parameters as WidgetUpdateParams;   // TS cast, not runtime
  // ... admin check ...
  // ... validatePOVAccess ...
  // ... $transaction wrapping the write ...
}
```

Question: which of the eight guards fires when a request reaches this handler?

Answer: **none of them, in the worst case.** The handler takes `parameters: any` and applies a TypeScript-only cast. That's not a runtime check. Whether any guard runs depends entirely on whether a *caller* invoked the schema before reaching the handler.

---

## How the gap appears in practice

Most MCP servers in production have two entry paths sharing one set of handlers:

```
HTTP REST            POST /api/mcp/tasks/action
path                       │
                           ▼
                     validateMCPActionRequest()  ← schema runs here
                           │
                           ▼
                     TasksActionRouter.route(action, parameters, user)
                           │
                           ▼
                     handleWidgetUpdate(parameters, user, actionId)

MCP transport        Claude Desktop / ChatGPT (stdio or SSE)
path                       │
                           ▼
                     mcp-server-v5.js (the MCP server process)
                           │
                           ▼
                     task-action-handler.js   ← only checks the action enum
                           │
                           ▼
                     TasksActionRouter.route(action, parameters, user)
                           │
                           ▼
                     handleWidgetUpdate(parameters, user, actionId)
```

The handler is one function. It runs the same code for both paths. But only the REST path runs the schema. The MCP transport path checks the action *name* against an allowlist, then dispatches directly. The schema never fires.

Result: a `widget.update` call originating from an HTTP POST has eight guards firing on its parameters. The identical call originating from Claude Desktop has zero.

This is the "transport-path bypass". It is not a bug in any single file. It is a bug in the *contract* between the router and the path that calls it — the router was designed assuming the caller validated upstream, and one of two callers did not.

---

## Why this gap is hard to see in review

A multi-specialist review of the schema, the handler, and the action enum will pass each check in isolation:

- The schema has all the guards
- The handler has the correct types
- The action enum has the new action

What none of those reviews ask is: *which paths run the schema, and which don't?*

In the production case this chapter is drawn from, the new action passed five rounds of specialist review (schema design, handler architecture, transaction integrity, MCP tool registration, validation engineering — all signed off above their confidence bars). The deploy succeeded. The first smoke test caught the bypass.

The smoke test the team had already written for the chapter on smoke tests (Chapter 3) was the right artifact. The smoke test exercised the *real* tool through the *real* transport, against a real authenticated session. The first call — an empty body that should have been rejected by the empty-update refine — was accepted and returned "0 fields changed". The second call — an injection payload in the `name` field — was accepted and persisted to the database.

The mistake was treating schema definition as schema enforcement. The smoke test exposed it because the smoke test was the first thing that exercised the full MCP transport stack, not a unit test of the schema in isolation.

---

## The three fixes, in order of widening blast radius

### Fix 1 — Handler-level safeParse (hotfix)

The minimum scope that closes the gap *for the affected action* is to add an explicit `safeParse` at the top of the handler:

```ts
export async function handleWidgetUpdate(
  parameters: any,
  user: TokenPayload,
  actionId: string,
): Promise<any> {
  const parsed = MCPParameterSchemas['widget.update'].safeParse(parameters);
  if (!parsed.success) {
    const details = parsed.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new Error(`widget.update validation failed: ${details}`);
  }
  const params = parsed.data;
  // ... rest of handler unchanged ...
}
```

What this does:
- Forces the schema to run regardless of which path called the handler
- Returns transformed data (snake_case aliases normalised, null→undefined transforms applied)
- Surfaces validation errors as clear messages back through the MCP transport

What this does **not** do:
- Close the gap for any other handler. Every action's handler has the same problem.

This fix takes ~10 minutes. It is the right thing to ship immediately when you discover the bypass on a specific action — the value of closing one vector right now is high. But it should not be the final fix.

---

### Fix 2 — The audit

Before writing fix 3, do the audit. Two questions:

1. *Which actions have schemas in `MCPParameterSchemas`?*
2. *Which of their handlers actually run those schemas?*

The answer in the production case: every action had a schema. Zero handlers ran them. Some handlers had partial manual validation (an `if (!title) throw` here, a hardcoded format check there), so the *practical* exposure varied. But every action was undefended against the full schema's guard set.

This is worth stating cleanly: a multi-handler MCP server with one validation function called by one of N paths is a fleet problem, not a single-action problem.

Audit output is a 2-column table:

| Action | Schema present? | Schema enforced at handler entry? |
|--------|-----------------|-----------------------------------|
| widget.update | Yes (8 guards) | **No** — discovered by smoke |
| widget.create | Yes | No — never tested |
| item.move | Yes | No — never tested |
| ... | ... | ... |

A complete audit is the bridge between fix 1 (handler-specific hotfix) and fix 3 (the structural close).

---

### Fix 3 — Router-level enforcement (structural)

The structural fix lives at the boundary between the router and the per-action handlers. The router knows the action name; the action name maps to a schema in `MCPParameterSchemas`; the router can run the schema before dispatching:

```ts
import { MCPParameterSchemas } from '@/lib/validation/mcp-action-validation';

export class TasksActionRouter {
  async route(
    action: string,
    parameters: any,
    user: TokenPayload,
    actionId: string,
  ): Promise<any> {
    // SECURITY: enforce schema at the router boundary.
    // Closes the transport-path bypass for every action with a schema,
    // in one place, regardless of which upstream path called us.
    const schema = MCPParameterSchemas[action as keyof typeof MCPParameterSchemas];
    if (schema) {
      const parsed = schema.safeParse(parameters);
      if (!parsed.success) {
        const details = parsed.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        throw new Error(`${action} validation failed: ${details}`);
      }
      parameters = parsed.data;  // pass validated/transformed data downstream
    }

    switch (action) {
      case 'widget.update':
        return await handleWidgetUpdate(parameters, user, actionId);
      case 'widget.create':
        return await handleWidgetCreate(parameters, user, actionId);
      // ... all other cases unchanged ...
    }
  }
}
```

What changes:
- Every action with a schema in `MCPParameterSchemas` is now enforced at the router boundary
- Handler signatures are unchanged
- The handler-level `safeParse` added in fix 1 becomes redundant; remove it as a follow-up commit
- Both paths (REST and MCP transport) now hit the same gate

Double-validation note: the REST path runs `validateMCPActionRequest` upstream, which already parses the schema. After fix 3, REST requests pass through *two* `safeParse` calls. This is harmless if (and only if) every schema's transforms are idempotent — `normalizeAliases` on already-normalised data is a no-op, `null→undefined` on already-undefined data is a no-op, `stripDangerousKeys` on already-clean data is a no-op. Verify your transforms have this property before relying on double-validation. If they don't, gate the second parse on a flag set by the REST upstream.

---

## The defense-in-depth pattern

Three places where schema enforcement can happen, and what each one is responsible for:

| Layer | Where | Responsibility |
|-------|-------|----------------|
| **Transport entry** | REST: `app/api/.../route.ts`. MCP: `mcp-server-v5.js` action-enum check + `task-action-handler.js`. | Reject malformed requests *as early as possible*. Prevents wasted compute on garbage input. |
| **Router boundary** | The dispatcher that maps action name → handler function. One file per consolidated MCP tool. | The *single source of truth* for schema enforcement. Runs the schema; refuses to dispatch on failure. Adopts the action's schema by name; no per-action code changes when a new action is added. |
| **Handler entry** | The first lines of `handle<Action>` in each handler file. | Defense in depth. Optional once the router enforces, but worth retaining if your team treats handlers as potentially reusable from non-router callers (test mocks, alternative entry points, scripted maintenance). |

For most MCP servers, **router-level enforcement is sufficient and the right primary line of defense**. Per-handler enforcement adds robustness but is redundant if no caller bypasses the router.

The transport-entry layer is *also* the right place for cheap rejections (action name not in the allowlist, body exceeds a size cap, malformed JSON). It is not the right place for schema-detail validation — that responsibility belongs to the router because the router has access to per-action context.

For the full layered decomposition (transport entry, tool definition, dispatcher/router, handler) and a per-layer assignment of every common security control — authentication, schema enforcement, prototype-pollution strip, resource authorization, transaction integrity — see the [MCP Tool Layered Architecture Specification](mcp-tool-layered-architecture-spec.md). The three-layer table above is the security-focused subset; the layered spec is the full architectural map.

---

## The smoke test that catches this

A handler-only unit test of the schema won't catch the bypass. The schema passes its own unit test in isolation. The bypass is a runtime contract issue, not a schema issue.

What catches it:

- An end-to-end smoke that uses the same transport the production AI client uses
- A small number of payloads chosen to exercise each guard
- A test that **runs against the deployed server**, not just the local code

Example smoke list for `widget.update`:

```
1. Empty body { widgetId: "..." }
   → expect rejection with "at least one updatable field" message
   (exercises the refine guard)

2. { widgetId: "...", name: "<script>alert(1)</script>" }
   → expect rejection with the injection-refine message
   (exercises InjectionSafeOptional on text fields)

3. { widgetId: "...", name: "ok", foo: "bar" }
   → expect rejection with "Unrecognized key: 'foo'"
   (exercises .strict() mode)

4. { widgetId: "...", projectManager: null }
   → expect rejection with "Expected string, received null"
   (exercises OptionalCUIDStrict null handling)

5. { widgetId: "...", tags: [<51 strings>] }
   → expect rejection with "Array must contain at most 20 element(s)"
   (exercises DoS cap)

6. { widgetId: "...", status: "VALID_STATUS" }
   → expect success
   (sanity check the happy path)
```

If any of tests 1–5 succeed when run against the deployed server, *you have a transport-path bypass.* The schema is defined but not enforced.

This is the corollary to the Chapter 3 "round-trip recovery test": that test verifies *corrective errors actually correct*; this one verifies *defensive errors actually defend*.

---

## What specialists tend to miss, and why

Five rounds of specialist review on the production case all signed off above their confidence bars. The smoke test still found the bypass in five seconds. Why?

- Schema reviewers ask: *is the schema correct?*
- Handler reviewers ask: *does the handler do the right thing with valid inputs?*
- Architecture reviewers ask: *is the dispatcher pattern sound?*

None of those reviewers ask: *which paths run the schema, and which don't?* That question requires walking the request all the way from MCP transport entry to handler return, treating intermediate code as a graph not a tree. It is the kind of question a smoke test asks by construction — the smoke test calls the *real* tool through the *real* transport, and the validation either fires or it doesn't.

The lesson is not that specialists are inadequate. It is that **end-to-end smoke is non-negotiable** for tools with multi-path entries. The smoke test isn't a substitute for review; it is the *check* on what review missed.

---

## Audit checklist for your own server

If your MCP server has more than one entry path sharing handlers, run this audit. Each item should take less than five minutes.

**1. Map your entry paths.**
- Where does an HTTP request enter? (e.g., `app/api/mcp/.../route.ts`)
- Where does an MCP-transport request enter? (e.g., `mcp-server-v5.js` → `task-action-handler.js`)
- Where else? (Cron handlers? Internal services? Test fixtures that bypass the router?)

**2. For each entry path, find the schema invocation.**
- Grep for `safeParse(` and `parse(` on your `MCPParameterSchemas` (or equivalent).
- Map: which entry paths actually run the schema, and which call the router/handler directly with raw parameters?

**3. List the handler entry points.**
- Find each `handle<Action>` function. Confirm whether it runs the schema or accepts `parameters: any` as a TS cast.
- If a handler accepts a TS cast and is reachable from a path that didn't run the schema upstream, you have a bypass.

**4. Choose your enforcement layer.**
- **Recommended**: router-level. Single source of truth. Affected when adding a new action: zero per-action changes (the schema lookup is by action name).
- **Alternative**: handler-level. More verbose, but co-located with the handler's logic. Use if your router doesn't have a single dispatch point you can intercept.
- **Avoid**: transport-entry-only. You'll repeat yourself for each transport path, and the next transport you add will start unprotected.

**5. Write the smoke test.**
- One payload per schema guard (empty body, injection in each text field, surplus key, null on strict CUID, array > DoS cap, etc.).
- Run against the *deployed* server, not unit-tested in isolation.
- Fail loud if any defensive guard fails to fire.

**6. Audit your transforms for idempotency.**
- If you intend to double-validate (REST upstream + router-level), confirm every transform on every schema is idempotent on its own output.
- `normalizeAliases`, `stripDangerousKeys`, `null→undefined` are all idempotent by construction. Custom transforms (e.g., string-to-Date coercion) may not be — test them.

**7. Audit your runtime gates for symmetric coverage.**
- For each handler that accepts a URL, file path, or network address, list whether it runs a runtime check (SSRF, path-traversal, DNS-rebinding) — separately from the schema check.
- If `update` runs the gate but `register` doesn't (or vice versa), you have an asymmetric defense. Lift the inline check into a shared helper and call it from every site that persists or fetches that field.
- For the `register` direction specifically: does the runtime gate have an *exemption mechanism*? If it keys off an existing DB record, register has no record to match — the gate has to either run unconditionally or refuse with no exemption. Document whichever you choose.

**8. Audit your administrative escape valves.**
- For every seeded-allowlist entry (first-party internal services using loopback addresses, trusted upstream APIs, etc.), confirm there is a seed script that writes the record via direct ORM access — *not* via the user-facing tool.
- A missing seed script means: if that record is ever deleted (manual cleanup, accidental delete, DB restore from an older snapshot), there is no recovery path that respects your new runtime gate. The only way back is either to weaken the gate or to write the seed script under pressure.
- Match the seed-script file list against the allowlist constant. Gaps are operational risk, not security risk — file them as follow-ups.

---

## When the schema can't reach the threat

GS14 closes the dispatch-boundary bypass: every action validates its schema, every path runs the validator. But some threats are *fundamentally outside the schema's reach*.

The clearest case: SSRF. A URL field with `.url()` plus a `.refine(u => u.startsWith('https://'))` passes Zod cleanly. But the hostname `service.example.com` may resolve at fetch time to `169.254.169.254` (AWS metadata), `127.0.0.1` (loopback), or an RFC 1918 private address. The schema has no DNS resolver. The runtime fetch hits the internal target.

Two consequences for hardening:

**1. Runtime gates are not a sign of weak schema design.** When a threat depends on DNS state, network policy, environment, or on-disk content, you need a runtime check at the handler boundary (Layer 4) — not a fancier refine. The schema's job ends where static validation ends.

**2. Symmetric coverage matters.** If your `update` action has a runtime SSRF check but `register` doesn't, you have an asymmetric defense. An attacker who can register a service has persisted an attacker-controlled internal-IP record in your registry; the gap is "detection delayed, not prevented." Audit your handlers as a group: does *every* path that persists or fetches a URL run the runtime gate?

**3. Where the exemption lives shapes your operational story.** A runtime SSRF gate often has an *exemption list* — first-party internal services that legitimately use loopback addresses (Docker containers on `127.0.0.1:31xx`). The exempt check has two shapes:

- *Match against the already-loaded DB record* (cheap, idempotent — fine for `update` paths)
- *Match against caller-supplied name* (fragile — user-controlled input could spoof exempt names)

For `register` paths there is no DB record yet, so option 1 is unavailable and option 2 is unsafe. The right architectural choice: **register has no exemption, full stop**. The user-facing path always runs the full check. First-party services with loopback endpoints register via a **seed script that writes directly via the ORM**, bypassing the handler entirely.

This is not a leak in the design. It is the design working correctly:

- The user-facing tool path correctly refuses to register a localhost endpoint.
- The seed script becomes the documented administrative escape valve.
- Sysadmin runbooks need to know which path to use; otherwise they'll try the tool, hit the rejection, and report it as a bug.

The hardening checklist below has an item for this audit.

---

## What this isn't

- This is not about CSRF, authentication, or authorisation. Those are separate layers. This chapter assumes auth already happened correctly; the bypass is in *what the authenticated request is allowed to do*.
- This is not specific to Zod. The same gap exists with `ajv`, `yup`, `joi`, hand-rolled validators — any validator that has to be explicitly invoked. The structural fix at the router boundary works the same way.
- This is not specific to MCP. The pattern shows up in any system where multiple entry paths share a handler — HTTP + GraphQL, REST + gRPC, REST + queue-consumer. Replace "MCP transport" with "the queue worker" and the chapter still reads correctly.

---

## Closing — the lifecycle

The full lifecycle that produced this chapter:

```
1. Design a schema with all the right guards.
2. Multi-round specialist review. All pass.
3. Deploy.
4. Run smoke test. Bypass discovered.
5. Hotfix: handler-level safeParse. Closes the one action.
6. Audit: all other handlers have the same gap.
7. Structural fix: router-level safeParse. Closes the fleet.
8. Document the pattern (you are here).
```

Step 4 is the critical step. Steps 1–3 do not produce a secure system on their own — they produce a system whose security depends on a contract no reviewer enforced. Step 4 is where you discover whether the contract holds. Step 5 is the right immediate response. Step 7 is the right final response. Step 8 is what closes the loop so the next team doesn't repeat the lesson.

For your own server: when you next ship a new action, the smoke test in step 4 should be the gate between staging and production. Not because the specialists missed something — they almost certainly did, in some other place. Because the smoke test is the only artifact in this list that exercises the real system, end-to-end, the way the AI client will.

---

## See also

- Chapter 3 — *Smoke Tests as Living Documentation*: the methodology that surfaces bypasses by construction.
- Chapter 4 — *The Three-Layer Parameter Rule*: the static-definition counterpart to this chapter's runtime-enforcement story.
- Chapter 5 — *Transport Boundaries*: where the transport-path bypass shows up at a different layer (parameter coercion across stdio/SSE).
- [Gold Standards Specification](gold-standards-spec.md) — **GS14 (Schema Enforcement at the Dispatch Boundary)** is the universal codification of this chapter's pattern.
- [MCP Tool Layered Architecture Specification](mcp-tool-layered-architecture-spec.md) — the full four-layer mental model (Server / Tool / Dispatcher / Handler) with per-layer security-control assignment. Companion reference for the "defense-in-depth pattern" section above.

---

## What's next

This chapter is the latest in the series as of v1.1 of the gold-standards spec. The Smoke Tests chapter (3) and the Three-Layer Parameter Rule chapter (4) are the most direct adjacent reads — together they cover the *static design* (Ch. 4), the *runtime enforcement* (this chapter, Ch. 9), and the *check on both* (Ch. 3).

---

## Provenance

This chapter was triggered by a production discovery: a newly-shipped MCP action passed five rounds of multi-specialist review (schema design, handler architecture, transaction integrity, MCP tool registration, validation engineering) and all signed off above their confidence bars. The deploy succeeded. The first smoke test against the deployed server caught a transport-path schema-enforcement bypass in under five seconds. The discovery → handler-level hotfix → fleet audit → router-level structural fix lifecycle informed the chapter's structure.

The pattern is universal — it applies to any system with multiple entry paths sharing a handler. The MCP-specific framing reflects pAIchart's own architecture; substitute "queue worker" or "gRPC entry" for "MCP transport" and the chapter reads the same way.

GS14 (Schema Enforcement at the Dispatch Boundary) was added to the [Gold Standards Specification](gold-standards-spec.md) at v1.1 as the universal codification of this pattern.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
