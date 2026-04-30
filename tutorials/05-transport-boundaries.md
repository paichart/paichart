# Chapter 5 — Transport Boundaries Are Where Types Go to Die

**Audience**: Engineers maintaining MCP servers that route calls to other services or store tool parameters in a database. If your server only handles its own tools and never crosses a transport boundary outbound, this bug class doesn't affect you yet — but the moment you add an MCP Hub, an external service call, or persistence into a JSON column, it does.
**Prerequisite**: Chapter 4 (the silent parameter stripping bug). The two chapters describe the same family of failure: data goes wrong somewhere between the transport and your code, and nothing throws.
**Reading time**: ~12 minutes.

---

## What this chapter teaches

A bug class that looks like the one in Chapter 4 from the outside — silent, no errors, wrong data in the handler — but happens for a different reason. Chapter 4's bug was about *fields* being stripped by validation. This bug is about *types* being mutated by transport.

The headline: a nested object in your tool arguments can arrive at your handler as a JSON-encoded string, with no warning, no error, and no log entry indicating that a transformation took place. Code that expects to read `args.capabilities.tools` finds itself looking at a string property of a string, gets `undefined`, and proceeds as if the field were empty.

The fix is mechanical: a single helper function applied at every transport boundary. The trap is that *every* boundary must have it. Miss one, and the bug returns somewhere unrelated.

---

## How the bug shows up

There are two variants. They look completely different from the operator's seat.

**Variant A — the loud version**

Your server makes an outbound call to another MCP service. The call has a nested object argument:

```javascript
await client.callTool({
  name: 'query',
  arguments: { filter: { state: 'TX', status: 'active' } }
});
```

The downstream service receives the call and returns an error:

```
MCP error -32602: Service call failed: MCP error -32603: [
  {
    "code": "invalid_type",
    "expected": "object",
    "received": "string",
    "path": ["params", "arguments"],
    "message": "Expected object, received string"
  }
]
```

The downstream service is telling you it received `arguments` as a string. You sent it as an object. Somewhere between your `client.callTool` call and the service's handler, the object was serialised. The error is annoying but informative: at least you know exactly where to look.

**Variant B — the silent version**

Your server registers an external service in your database. The registration includes a `capabilities` object:

```javascript
await prisma.mcpTool.create({
  data: {
    name: 'my-api',
    capabilities: { tools: ['fetch', 'query'], version: 1 }
  }
});
```

Prisma accepts the input. The row is created. The service appears registered. Days later, a different tool tries to read the capabilities:

```javascript
const row = await prisma.serviceRegistry.findUnique({ where: { name: 'my-api' } });
const tools = row.capabilities?.tools;
// tools === undefined
```

The handler that reads it returns an empty list. The user reports that the service "doesn't have any tools". The investigator looks at the reading code, can't find the bug, gives up, files an issue. Eventually someone runs (substituting their own table and column names):

```sql
SELECT jsonb_typeof(capabilities) FROM <your_jsonb_table> WHERE name = 'my-api';
-- Returns: 'string'
```

The `capabilities` column is `jsonb` and contains a *string* — a JSON-encoded representation of the original object. `jsonb` accepted it because a string is a valid JSON value. It's just the wrong type. Every read of `capabilities.tools` returns `undefined` because strings don't have a `.tools` property.

This variant is the dangerous one. Nothing failed. Nothing logged. The data round-tripped through serialisation without anyone noticing.

---

## Why it happens

Different MCP transports handle nested-object serialisation differently. The MCP SDK has implementations for stdio, SSE, HTTP, and WebSocket. Each one decides what to do with the `arguments` field of a `tools/call` payload. Most preserve nested objects. Some — particularly when bridging between transport types — silently call `JSON.stringify()` on nested values during transit.

A typical path that triggers the bug:

```
Claude Code (stdio transport)
    │
    │ sends: arguments = { filter: { state: "TX" } }
    ▼
Hub MCP Server (the bridge)
    │
    │ receives object, validates it (still an object)
    │ forwards via SSE transport
    ▼
SSE serialisation
    │
    │ nested objects → JSON string in some implementations
    │ arguments now arrives as: "{"filter":{"state":"TX"}}"
    ▼
Downstream service (SSE transport)
    │
    │ receives string instead of object
    └──→ ❌ "Expected object, received string"
```

Or for the silent variant:

```
Hub receives valid registration call
    │
    │ arguments.capabilities is an object
    ▼
Validation passes
    │
    │ Hub stores via Prisma.create(...)
    │ But arguments was already a string by the time it
    │ entered the handler — it just looked like an object
    │ to the validation layer because Zod parsed it leniently
    ▼
prisma.mcpTool.create({ data: { capabilities: <string> } })
    │
    │ jsonb accepts the string
    │ row created successfully
    └──→ Future reads see jsonb_typeof = 'string', not 'object'
```

The exact cause varies by SDK version and transport pair. The takeaway is not "fix the SDK" — it's "your code cannot assume nested objects are still objects after a transport boundary".

---

## Why it's hard to find

Five reasons this bug eats time:

1. **The error appears at the wrong place.** Variant A's error says "downstream service rejected my call". The bug is in the boundary your code crossed *to reach* the downstream service. Variant B's error says "the read code is broken". The bug is in the write code from days earlier.
2. **Validation passes.** The validation layer (Chapter 4's Layer 2) sees an object, because it ran *before* the transport boundary. The mutation happens in transit, not at validation.
3. **There's no explicit `JSON.stringify` in your code.** Engineers grep their codebase for stringification and find nothing. The serialisation happens inside the SDK's transport layer, where it's not visible.
4. **It works in development.** Most developers test against a single client (often Claude Desktop, which is SSE-to-SSE end-to-end). The bug appears when a *different* client (Claude Code, which is stdio) calls the same server.
5. **Prisma is helpful, not strict.** The `jsonb` type accepts any valid JSON value, including strings. Prisma's TypeScript types say `Json`, which lets a string through without complaint. Strict ORMs would reject this; loose ones don't.

The bug is hard to diagnose because every individual layer is doing what it should. The transport layer is doing its job. Validation is doing its job. Prisma is doing its job. The bug is in the *interaction* between layers — specifically at the boundary between the transport layer and the next layer that consumes the data.

---

## The fix

A single helper function, applied at every transport boundary. The implementation we use is called `ensureObject`:

```javascript
// Treat as a local helper in your codebase (implementation below)
import { ensureObject } from './your-utils/ensure-object';

// Before any external callTool
const callArguments = ensureObject(validatedArgs.arguments, {}, 'Service Call');

// Before any Prisma storage of arguments that originated as tool parameters
const capabilities = ensureObject(validatedArgs.capabilities, {}, 'register.capabilities');
```

The helper does three things:

1. If the input is already an object, returns it unchanged.
2. If the input is a JSON-encoded string (e.g., `'{"a":1}'`), parses it and returns the resulting object.
3. If the input is `null`, `undefined`, or unparseable, returns the fallback (typically `{}`) and logs the recovery for diagnostic visibility.

The third step matters. Silent recovery is exactly what got you into this mess in the first place. The helper recovers automatically (so the operation completes), but it also logs that it recovered, so a sweep through logs surfaces every boundary where the bug was actively occurring.

A minimal implementation, in case you don't want to depend on someone else's helper:

```typescript
export function ensureObject<T extends object>(
  value: unknown,
  fallback: T,
  label: string
): T {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Optional: log that recovery happened, with `label` for traceability
        console.warn(`[ensureObject:${label}] recovered from string`);
        return parsed as T;
      }
    } catch {
      // Fall through to fallback
    }
  }
  return fallback;
}
```

Six lines of recovery, plus a log line. That's the entire fix at a single site. The work is in finding every site that needs it.

---

## How to find every boundary in your codebase

Two checks. Both should be run as one-time audits, not ongoing automation.

**Check 1 — every outbound MCP call**

Find every place your server calls an external MCP service:

```bash
grep -rn "client.callTool\|\.callTool(" --include="*.ts" --include="*.js" lib/
```

For each result, confirm the `arguments` field is wrapped in `ensureObject` before being passed. Most likely candidates are: hub orchestration code, multi-service workflow runners, anything that makes a downstream call on behalf of an AI client.

**Check 2 — every Prisma write that stores MCP tool data**

Find every place your server stores a value that originated as an MCP tool argument into a JSON column:

```bash
grep -rn "prisma.\w*.create\|prisma.\w*.update" --include="*.ts" lib/
```

For each result, find the data shape being written. If any field on that shape originated as `args.<something>` from a tool call, it should be wrapped in `ensureObject` before being passed to Prisma. Common targets: service registries, workflow definitions, audit logs, anything that stores a free-form `metadata` or `parameters` object.

If your server is using `jsonb` columns, you can also probe the database directly to find rows that already have the bug (substitute your own table and column names):

```sql
SELECT id, name, jsonb_typeof(<your_jsonb_column>) AS type
FROM <your_jsonb_table>
WHERE jsonb_typeof(<your_jsonb_column>) = 'string';
```

Any row this query returns is a row that has the bug today. The fix on the read side is to detect the wrong type and parse it; the fix on the write side is `ensureObject` so it stops happening to new rows.

---

## How to keep it from coming back

A short rule, added to your code review checklist:

> *"Does this change call an external MCP service or persist MCP tool arguments? If yes, is `ensureObject` (or your equivalent) applied at every boundary?"*

Reviewers can answer this in 30 seconds for a typical PR. The cost of asking the question is small. The cost of forgetting is the diagnosis time you just spent reading this chapter.

For a more durable defence: a smoke test that calls one of your tools with a deliberately stringified argument, and asserts the handler still sees the object correctly. The Chapter 3 round-trip recovery pattern works here too — your tool surface should tolerate the transport bug as long as the boundary helper is present.

---

## What this chapter and Chapter 4 share

Chapter 4 was about a parameter being stripped between layers. Chapter 5 is about a parameter being mutated between transports. They're the same family of bug:

- Both fail silently. No error, no log, just wrong data.
- Both have a "good reason" — Zod's strip-unknown is a security feature; transport serialisation is an SDK choice. Neither is wrong on its own.
- Both have a single small fix per site, and an audit problem (every site needs it).
- Both are caught early by smoke tests that exercise the field's *effect*, not its presence.

If you find one of these in your codebase, look for the other. They tend to coexist — the same kind of haste that produced one usually produced the other.

---

## What's next

Chapter 6 is the architectural chapter. It covers the seven layers a tool touches in a real production server (schema, security, annotations, handler, facade, routing, documentation), with JSDoc as the source of truth that ties them together. Chapter 4's three-layer rule and Chapter 5's transport-boundary defence are both subsets of the seven-layer view.

---

## Provenance

The transport-boundary bug class was eradicated from pAIchart in February 2026 — 13 sites fixed across 22 files, with `ensureObject` standardised as the boundary helper. The pattern is documented in `.claude/knowledge/patterns/transport-boundary-argument-coercion-pattern.md`, and the eradication followed the bug-class-eradication protocol in the same knowledge base.

- pAIchart Hub overview: <https://paichart.app>
- Source repository: <https://github.com/paichart/paichart>

---

## License

This chapter is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
