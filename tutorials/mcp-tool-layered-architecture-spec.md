# MCP Tool Layered Architecture — Specification

**Type**: Universal architectural reference for MCP server implementation
**Scope**: Any MCP server, any platform, any team
**Audience**: Engineers shipping MCP tools to production who need a shared mental model for **where security controls belong** and **why**

**Companion documents**:
- For the security-defect lifecycle that motivated this spec: [Chapter 9 — Hardening MCP Tools](09-hardening-mcp-tools.md)
- For the gold standards that compose with this layering: [Gold Standards Specification](gold-standards-spec.md) (especially GS14)
- For transport-level edge cases that test the layering: [Chapter 5 — Transport Boundaries](05-transport-boundaries.md)
- For the static-design counterpart: [Chapter 4 — The Three-Layer Parameter Rule](04-three-layer-parameter-rule.md)

---

## What this document is

A specification for the **four-layer mental model** of an MCP tool implementation, with a security-controls matrix mapping each control type to the layer where it belongs.

The four layers are universal — they show up in every production MCP server regardless of language or framework. Naming them explicitly gives reviewers, auditors, and onboarding engineers a shared vocabulary for asking "where does this control belong?"

Three sections:

1. **The four layers** — what lives at each layer, what doesn't, why it matters
2. **Security controls by layer** — for each common control (auth, schema validation, prototype-pollution strip, resource authorization, etc.) where it belongs and why
3. **Cross-cutting concerns + audit recipe** — idempotency, drift detection, the per-layer self-audit

This spec is what you'd hand to a stranger and say *"draw the architecture of your MCP server using this model and tell me where each security control fires."* It is the companion to Chapter 9 (which shows the lifecycle of *failing* to assign a control to the right layer) and the [Gold Standards Specification](gold-standards-spec.md) (whose GS14 is the codification of one specific layer assignment — schema enforcement at the dispatcher).

---

## How to read the examples

Code samples use a generic `widget.update` action throughout (consistent with Chapter 9). Substitute your own action name. The patterns are domain-agnostic; substitute `widget` with whatever resource your tool acts on (`pov`, `task`, `order`, `tenant`, etc.).

Where a snippet shows `validateResourceAccess(...)`, mentally translate to *"your own resource-ownership check"* — `validatePOVAccess`, `validateOrderOwnership`, whatever your domain calls it.

---

# Part A — The Four Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1 — SERVER (transport entry point)                            │
│   stdio / SSE / HTTP / in-process. TLS, authentication, rate        │
│   limiting, request size caps. Cheap rejections before any work.   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 2 — TOOL (consolidated MCP tool definition)                   │
│   Where the tool's surface is DECLARED: name, description, schema, │
│   action enum, parameter shape. Declaration ≠ enforcement.          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 3 — DISPATCHER / ROUTER (routes sub-actions to handlers)      │
│   Where the schema is ENFORCED (safeParse). Single source of truth │
│   for every transport. Strips dangerous keys, normalizes aliases.  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 4 — HANDLER (per-sub-action logic)                            │
│   Resource authorization, business rules, transaction integrity,    │
│   persistence. Receives validated/transformed parameters.          │
└─────────────────────────────────────────────────────────────────────┘
```

## Why four layers (not three, not five)

The four-layer model is the smallest decomposition that lets you answer the question:

> *Where does control X belong, and why does it not belong at any other layer?*

Three layers conflates "where the schema is declared" with "where the schema is enforced" — and that's exactly the conflation Chapter 9 documents as a security defect (Gold Standard 14). Layer 2 (declaration) and Layer 3 (enforcement) MUST be separable. A schema is just a data structure; it has no protective power until something invokes it.

Five layers tends to over-decompose — splitting "router" from "dispatcher" when in practice they're one concern, or splitting "validation" from "transformation" when in practice they're chained. Four is the smallest model that names every distinct architectural responsibility without inventing new ones.

**Both servers (SDK transport like stdio + in-process embedded) share Layers 2-4.** The only thing that varies across transports is Layer 1. This is what makes the model robust: when you add a new transport, you only touch Layer 1 — Layers 2-4 are reused as-is.

## Why this matters

Three concrete benefits:

1. **Single responsibility per layer.** Each layer owns one kind of check. Adding new controls becomes a layer-assignment question, not an "everywhere?" question.
2. **DRY enforcement.** Schema enforcement at Layer 3 protects all Layer 1 transports without per-transport code. Add a new transport — schema enforcement is automatic.
3. **Failure isolation.** A bug at one layer can't bypass other layers. Each layer is independently testable: unit-test Layer 3's schema, integration-test Layer 4's authorization, smoke-test Layer 1 end-to-end.

The mental model itself is a quality control. *"Where does this control live?"* is a yes/no question with a defensible answer at every code review.

---

# Part B — Security Controls by Layer

For each common security control: *what layer does it belong at, and why does it not belong at any other layer?*

The controls below appear in roughly the order requests flow through the system (entry → handler) — but the model is non-linear. Some controls are split across layers (declared at one, enforced at another) and that split is explicit.

---

## Layer 1 — Server (transport entry)

**What lives here:**
- Transport protocol (stdio / SSE / streamable HTTP / in-process)
- TLS termination
- Authentication (JWT validation, OAuth flow, session lookup)
- Rate limiting / quota enforcement
- Request size caps (drop requests > N KB without parsing)
- Coarse-grained logging (request received, response sent, status code)
- Cheap action-name allowlist check (does this action exist at all?)

**Controls that belong here:**

| Control | Why this layer |
|---|---|
| Authentication | Identity must be established before any work. Layer 2+ trust the auth context. |
| Rate limiting | Cheap rejection of abuse. Compute spent here is throttling cost, not business cost. |
| Request size cap | Reject 1 GB JSON payloads before deserialization. Saves Layer 3 from DoS. |
| TLS | Layer 1 is where bytes hit the network. |
| Coarse action-name allowlist | A 5-character `if (!ACTIONS.has(name))` short-circuit avoids serializing parameters into Layer 3 for actions that don't exist. **This is a perf optimization, not the security gate** — the security gate is at Layer 3 via the schema's `action: z.enum([...])`. |

**Controls that do NOT belong here:**

- ❌ **Schema validation.** Layer 1 doesn't know the per-action schema. If you put schema validation here, you couple Layer 1 to every action — and you'll forget to update it when a new action ships.
- ❌ **Resource authorization.** Layer 1 doesn't know which resource the action targets (the POV ID, the widget ID). That's parameter-level information that arrives after parsing.
- ❌ **Business rules.** Same reason.

**Common pitfalls:**

- Putting schema validation in HTTP middleware. Looks tidy at first; breaks when you add a second transport (the second transport doesn't run the middleware, and Layer 3+ assumed Layer 1 validated). This is the exact defect Chapter 9 documents.
- Trusting `Content-Length` for size capping without enforcing it (deserialize-as-you-go parsers will happily exceed the declared length).

**Code-shape example:**

```ts
// Layer 1 — transport entry (generic; substitute your framework)
server.handle('callTool', async (req) => {
  // Authentication — Layer 1
  const user = await verifyToken(req.headers.authorization);
  if (!user) return errorResponse('unauthenticated');

  // Rate limit — Layer 1
  if (!rateLimiter.check(user.id)) return errorResponse('rate_limited');

  // Size cap — Layer 1
  if (JSON.stringify(req.params).length > MAX_REQUEST_BYTES) {
    return errorResponse('request_too_large');
  }

  // Cheap action-name allowlist — Layer 1 (perf only)
  if (!KNOWN_TOOLS.has(req.params.name)) {
    return errorResponse('unknown_tool');
  }

  // Hand off to Layer 2/3
  return await callTool(req.params.name, req.params.arguments, user);
});
```

---

## Layer 2 — Tool (definition and schema declaration)

**What lives here:**
- Tool name (`widget`, `project`, `perform`)
- Tool description (used by AI clients to choose between tools)
- Input schema declaration (Zod / AJV / hand-rolled)
- Action enum (the `action: z.enum([...])` source of truth)
- Parameter shapes (field types, length caps, refines, transforms)
- Output schema (when applicable)
- Tool annotations (admin-only, read-only, idempotent — metadata for AI clients)

**Controls DECLARED here (enforced at Layer 3):**

| Control | Mechanism |
|---|---|
| Type checking | `z.string()`, `z.number()`, `z.boolean()` |
| Enum validation | `z.enum([...])` for action names, status values, categories |
| Length caps | `.min(N).max(N)` on strings |
| DoS array bounds | `z.array(...).max(N)` |
| Injection refines | `.refine(val => isSafe(val), {message: ...})` |
| Prototype-pollution strip | `.transform(stripDangerousKeys)` on passthrough/record fields |
| Parameter normalization | `.transform(normalizeAliases)` for snake_case → camelCase |
| Required vs optional fields | `.optional()`, `.nullable()`, defaults |

**The single most important property of Layer 2:**

> **Declaration is not enforcement.**
>
> Putting a guard in the schema does *not* mean the guard fires. A schema is data describing a shape; it has no protective effect until *something invokes it*. The thing that invokes it is Layer 3.

This is the lesson Chapter 9 documents. A multi-specialist review at Layer 2 can confirm the schema has every guard the spec calls for and still miss the fact that Layer 3 doesn't run the schema on some transport.

**Controls that do NOT belong here:**

- ❌ **Authentication.** Schemas don't know who's calling.
- ❌ **Resource authorization.** Schemas don't know which resources the caller owns.
- ❌ **Rate limiting.** Schemas can't observe call frequency.
- ❌ **Transaction integrity.** Schemas describe inputs, not persistence.

**Common pitfalls:**

- Declaring `arguments: z.record(z.any())` for a field that accepts arbitrary objects, with no prototype-pollution strip. The schema *looks* permissive but is also a wide-open pollution channel. Fix: `.transform(stripDangerousKeys)` on the record.
- Declaring `.passthrough()` to accept unknown fields, with no strip. Same problem at the object level.
- A JSON-string union arm `z.union([z.object({...}), z.string()])` where the string branch does `JSON.parse(str)` and returns the raw parsed object. Any `__proto__` in the JSON survives. Fix: `JSON.parse(str)` → `stripDangerousKeys(JSON.parse(str))`.

**Code-shape example:**

```ts
// Layer 2 — tool definition (Zod-flavored; same pattern in ajv/yup/joi)
export const widgetToolSchema = z.object({
  action: z.enum(['widget.list', 'widget.get', 'widget.update', 'widget.delete']),

  // Required CUID — type + format
  widgetId: z.string().regex(CUID_PATTERN).optional(),

  // Length-capped + injection-refined text
  name: z.string()
    .max(255)
    .refine(val => detectInjection(val).isSafe, {message: 'name contains injection patterns'})
    .optional(),

  // DoS-capped array
  tags: z.array(z.string().max(50)).max(20).optional(),

  // Open-shape metadata with prototype-pollution strip
  // (declaration; the strip executes when Layer 3 invokes the schema)
  metadata: z.record(z.any()).transform(stripDangerousKeys).optional(),

  // Open-shape passthrough at top level — also strip
}).passthrough().transform(stripDangerousKeys);
```

---

## Layer 3 — Dispatcher / Router (schema enforcement and action routing)

**What lives here:**
- The function that receives `(toolName, args)` from Layer 1
- The `safeParse(args)` call that **enforces** the Layer 2 schema
- The action-name → handler-function dispatch table (switch / map)
- Error response formatting on validation failure (returns to Layer 1 as a structured error)
- The single chokepoint where every transport's requests converge before reaching handlers

**Controls ENFORCED here (declared at Layer 2):**

| Control | Mechanism | Notes |
|---|---|---|
| Schema validation | `schema.safeParse(args)` | The single most important thing this layer does |
| Action enum (security gate) | Same `safeParse` — the schema's `action: z.enum([...])` rejects unknown actions | Reuses the declaration from Layer 2 |
| Prototype-pollution strip | Runs as part of safeParse via the `.transform(stripDangerousKeys)` declared at Layer 2 | |
| Parameter normalization | Runs as part of safeParse via the `.transform(normalizeAliases)` declared at Layer 2 | |
| Refines (injection, business rules expressible in schema) | Run as part of safeParse | |

**The single most important property of Layer 3:**

> **Layer 3 is the security gate, and there is exactly ONE of them per tool.**
>
> Every transport from Layer 1 funnels through one Layer 3 dispatcher per tool. If Layer 3 enforces the schema, all transports are protected. If Layer 3 does NOT enforce the schema, no transport is protected (unless every Layer 1 transport individually runs the schema, which is the antipattern Chapter 9 documents).

This is the dispatcher-boundary `safeParse` from [Gold Standard 14](gold-standards-spec.md). The single source of truth.

**Controls that do NOT belong here:**

- ❌ **Resource authorization.** Layer 3 dispatches by action name; it doesn't open the database or check `userId`-can-access-`resourceId`. That's Layer 4.
- ❌ **Business rule validation** (beyond what's expressible as a schema refine). E.g., *"widget can only be deleted if status=ARCHIVED"* is a database read followed by a check — it belongs at Layer 4.
- ❌ **Transaction integrity.** Layer 3 doesn't write.

**Common pitfalls:**

- Putting safeParse only in *one* Layer 1 transport (REST API middleware) and assuming all transports route through it. The MCP transport path bypasses the middleware. This is the Chapter 9 defect.
- Putting safeParse at Layer 4 instead of Layer 3. Works, but you have to remember it in every handler — and a future contributor will forget. Layer 3 enforcement is structural; Layer 4 enforcement is convention.
- Reading raw `args.someField` *after* `safeParse` succeeded. Use `parsed.data.someField`. Reading raw `args` after parsing skips any transforms (strip, normalize) — silently corrupts the validated contract.

**Code-shape example:**

```ts
// Layer 3 — dispatcher (the single security gate)
export class WidgetDispatcher {
  async handle(args: unknown, context: Context) {
    // ENFORCE the schema. This is the line that closes Chapter 9's bypass.
    const parsed = widgetToolSchema.safeParse(args);
    if (!parsed.success) {
      return formatValidationError(parsed.error);
    }

    // Use validated/transformed data downstream. Never read raw `args` again.
    const { action, ...params } = parsed.data;

    // Dispatch to Layer 4
    switch (action) {
      case 'widget.list':   return handleWidgetList(params, context);
      case 'widget.get':    return handleWidgetGet(params, context);
      case 'widget.update': return handleWidgetUpdate(params, context);
      case 'widget.delete': return handleWidgetDelete(params, context);
    }
  }
}
```

---

## Layer 4 — Handler (per-action business logic)

**What lives here:**
- The function that implements one sub-action (`handleWidgetUpdate`, `handleWidgetDelete`, etc.)
- Resource authorization (does this user own/access this widget?)
- Admin-tier check (is this action restricted to admins?)
- Business-rule validation (state-machine checks like *"can't delete a widget in ACTIVE state"*)
- Transaction integrity (wrap multi-step writes in a DB transaction)
- Downstream data sanitization (re-strip before persisting JSON columns)
- Audit logging (record what was changed by whom)
- Side effects (cache invalidation, notifications, webhooks)

**Controls that belong here:**

| Control | Why this layer |
|---|---|
| Resource authorization (`validateResourceAccess` / `validatePOVAccess` / `validateOrderOwnership`) | Per-resource; needs the parameter values (resourceId) plus the auth context. Cannot be done at Layer 3 without re-implementing a per-action authorization table. |
| Admin-tier check | Per-action; some actions are admin-restricted while sibling actions on the same tool are not. The check is `if (user.role !== 'ADMIN') throw`. |
| Business-rule validation | Requires database reads (e.g., *"can't delete a widget in ACTIVE state"* needs to fetch the widget). Layer 3 doesn't read the DB. |
| Transaction integrity | The handler is the boundary of "what's atomic." `$transaction(async (tx) => {...})` wraps the multi-step write. |
| Downstream sanitization on writes | If the handler writes JSON-typed columns (configurable schemas, freeform metadata), re-strip dangerous keys before writing — even though Layer 3 stripped on input — because (a) the handler may have merged fields from other sources, and (b) defense in depth. |
| Audit logging | The handler knows the *meaningful* state delta (old value vs new value). Audit at this layer captures business semantics, not just "an HTTP request happened." |
| Runtime gates for non-static threats (SSRF, DNS-rebinding, network-policy) | Some threats can't be validated statically: a URL like `legitimate-service.example.com` may pass a Zod `.url()` and protocol allowlist but resolve at fetch time to a private IP (169.254.169.254, 127.0.0.1, RFC 1918). Layer 3 has no DNS resolver and no network context; the check has to run at Layer 4 against the about-to-be-used value. Often combined with a *seeded-allowlist exemption* for first-party internal services that legitimately use loopback addresses. |

**The single most important property of Layer 4:**

> **Layer 4 trusts that Layer 3 validated the inputs.**
>
> If the handler is reachable only via Layer 3, the parameters are already typed, length-capped, enum-validated, transformed. The handler reads `params.widgetId` knowing it's a valid CUID. Business logic doesn't have to re-check.
>
> This trust is what makes Layer 4 readable. The first 10 lines of every handler are *authorization* and *business preconditions* — not *did the input arrive in the right shape?*

**Controls that do NOT belong here (in well-architected servers):**

- ❌ **Schema validation.** That's Layer 3's job. (Putting `safeParse` here as defense-in-depth is *acceptable* but conventionally avoided to keep Layer 4 free of cross-cutting concerns.)
- ❌ **Parameter normalization.** Same reason — done at Layer 3 via schema transform.
- ❌ **Rate limiting / size caps.** Already handled at Layer 1.

**Common pitfalls:**

- Accepting `parameters: any` as a TypeScript-only cast (no runtime check) and reading fields directly. This is the Chapter 9 *handler-side* fingerprint of the bypass — the handler *looks* type-safe in TS but has zero runtime defense if Layer 3 didn't enforce.
- Reading raw `args.field` after Layer 3 validated. You miss the transformed value. Always read from `parsed.data.field` (or destructure once at the top: `const { field } = validatedParams`).
- Putting the resource-authorization check *after* the database write. Order matters: `validateResourceAccess` → fetch existing state → check business preconditions → write.

**Code-shape example:**

```ts
// Layer 4 — handler (trusts Layer 3 validation; owns authz + business rules)
export async function handleWidgetUpdate(
  params: WidgetUpdateParams,  // already validated by Layer 3
  context: Context,
) {
  // Resource authorization — Layer 4
  await validateResourceAccess(context.user, 'widget', params.widgetId);

  // Business-rule check — Layer 4
  const existing = await db.widget.findUnique({ where: { id: params.widgetId } });
  if (existing.status === 'ARCHIVED') {
    throw new Error('Cannot update an archived widget');
  }

  // Transaction integrity — Layer 4
  return await db.$transaction(async (tx) => {
    const updated = await tx.widget.update({
      where: { id: params.widgetId },
      // Downstream sanitization (defense in depth) — Layer 4
      data: {
        ...params,
        metadata: stripDangerousKeys(params.metadata),  // Layer 3 stripped; we re-strip
      },
    });
    await tx.auditLog.create({ data: { ... } });
    return updated;
  });
}
```

---

# Part C — Cross-Cutting Concerns

Concerns that span layers, not localised to one.

## Idempotency under double-pass validation

If your architecture validates at *both* Layer 1 (some transports run a schema in middleware) and Layer 3 (canonical enforcement), every transform in your schema must be idempotent on its own output.

Why: the SDK transport path may run `safeParse` at Layer 1 (smart error recovery middleware), then Layer 3 runs `safeParse` again on the already-transformed data.

Idempotency requirements per transform:

| Transform | Idempotent? | Why |
|---|---|---|
| `stripDangerousKeys` | Yes | If no dangerous keys are present, the function short-circuits and returns the same reference. Second pass is a no-op. |
| `normalizeAliases` (snake → camel) | Yes | Already-camel keys pass through unchanged. |
| `null → undefined` form coercion | Yes | Already-undefined inputs return undefined. |
| `z.string().transform(JSON.parse)` | **No, unless using a union(string, object) pattern** | First pass: string → object. Second pass on the object would throw. Solution: declare as `z.union([z.string().transform(JSON.parse), z.object({})])` so the second pass hits the object branch. |
| `z.string().toLowerCase()` | Yes | Already-lowercase is identity. |
| `z.string().transform(s => s + '_v2')` | **No** | Each pass appends `_v2`. Avoid. |

**Rule of thumb**: if you can't write `f(f(x)) === f(x)` for your transform, it doesn't belong in a schema that runs twice. Either restructure as a union to be self-converging, or gate the second pass on a flag set by the first pass.

## Drift detection for inlined helpers

If your build chain has a runtime where you can't import your canonical helpers (e.g., a bare-Node process that doesn't resolve TypeScript paths, a worker that runs in a different sandbox), you may end up inlining a security primitive (like `stripDangerousKeys`) at the call site rather than importing it.

That's a defensible trade-off — but it creates a **sync invariant**: the inlined copy must match the canonical source.

Maintain the invariant with:
1. A `KEEP IN SYNC` comment in both files pointing at the other.
2. A **drift-detection smoke test** that imports both versions and asserts equality. If someone updates the canonical to add a new dangerous key, the test fails until the inline copy is also updated.

The smoke test is what makes the comment enforceable instead of a hope.

## Static schemas vs runtime gates

Some threats are *unreachable* by Layer 3 schema validation, no matter how strict the schema.

The clearest example: a URL field with `.url()` + a protocol-allowlist refine (`.refine(u => u.startsWith('https://'))`) passes Zod. But the hostname `legitimate-service.example.com` may resolve at fetch time to `169.254.169.254` (AWS metadata), `127.0.0.1` (loopback), or an RFC 1918 private address. SSRF defense requires the DNS resolution and a blocklist check — neither of which Layer 3 has.

This is the fingerprint of a **runtime gate** belonging at Layer 4:

- The check needs information unavailable at safeParse time (DNS state, network policy, time-of-day, on-disk content).
- The check has side-effect implications (rejecting an endpoint *before* a network fetch is fundamentally different from validating its string shape).
- The check often has an *exemption list*: first-party internal services that legitimately use loopback addresses, seeded into an allowlist at install time.

How this composes with Layer 3:

| Defense | Lives at | What it catches |
|---|---|---|
| `.url()` + protocol refine | Layer 3 | Garbage strings, non-HTTP(S) protocols, malformed URLs |
| Runtime SSRF gate (e.g., `assertEndpointSafe`) | Layer 4 | Hostnames that resolve to private/loopback IPs, regardless of how clean the string looks |
| Seeded-allowlist exemption | Layer 4 | First-party services that legitimately need loopback (e.g., Docker containers on `127.0.0.1:31xx`) |

**Operational consequence:** if your Layer 4 runtime gate has no exemption mechanism (or the exemption keys off an existing-record lookup that doesn't apply to create operations), then **first-party seed scripts must use a *direct* persistence path that bypasses your tool handler**, not the user-facing tool itself. The handler can correctly reject the user-facing equivalent ("register a service with a localhost endpoint") while the seed script writes via the ORM directly. The seed script becomes the documented operational escape valve.

This is not a leak in the architecture — it is the architecture working as designed. The runtime gate's job is to refuse the user-facing path; the seed-script-via-ORM is the *administrative* path. Document the distinction in your operational runbook so a sysadmin doesn't try to re-register a deleted service via the tool and hit a confusing rejection.

**Pattern fingerprint:** if Layer 3 alone can't see the threat (because the threat lives in DNS resolution, network policy, environment, or on-disk state), Layer 4 needs a runtime gate. Don't try to push it back into Layer 3 — you'll either duplicate the check loudly or, worse, give a false sense of completeness.

## Multi-surface action allowlist alignment

If your codebase has multiple lists of valid action names (the canonical schema enum, plus a routing map, plus a risk-classification table, plus a discovery/suggestion list, plus error-message hints), they will drift.

The *security* gate is the schema enum at Layer 2 — that's the source of truth. But the parallel surfaces matter for **correctness**: a missing entry in the routing map causes a silent-success no-op; a missing entry in the risk classifier means a write-heavy action ships without approval gating.

After adding a new action, grep your codebase for *all* surfaces that enumerate actions. If you can't, you don't know if your action is fully wired. (See the Gold Standards Specification v1.2 multi-surface audit recipe for the canonical list of surfaces to check.)

## Smoke-test contracts

Each layer has a smoke-test contract that catches different defects:

| Layer | Smoke contract |
|---|---|
| Layer 1 | Unauthenticated request → rejected with 401 (not 500). Oversized payload → rejected before parsing. |
| Layer 2 | Schema unit-test: every guard fires on a synthetic input designed to violate it. Use property-based testing (fast-check + your validator) for fuzz coverage. |
| Layer 3 | **End-to-end through the real transport.** This is the test that catches the Chapter 9 bypass. Send a payload that *should* be rejected by a Layer 2 guard, through the *real* transport the AI client uses, against the *deployed* server. If it's accepted, Layer 3 isn't enforcing the schema. |
| Layer 4 | Authorization smoke: user A acting on user B's resource → rejected. Business-rule smoke: forbidden state transition → rejected. |

Each layer's smoke is testing a different question. **Layer 2's unit test passing does not imply Layer 3's smoke test passes.** That's the Chapter 9 lesson made concrete.

---

# Part D — Decision Matrix

When you encounter a new control and have to assign it to a layer, use this matrix:

| Control type | Layer | Why |
|---|---|---|
| **Authentication** (who is the caller) | 1 | Identity must be established before any work. |
| **Rate limiting** (call frequency) | 1 | Cheap rejection. |
| **Request size cap** (DoS via large payloads) | 1 | Pre-deserialization rejection. |
| **TLS** (transport encryption) | 1 | Layer 1 is the network boundary. |
| **Tool name allowlist** (perf reject of unknown tools) | 1 | Optimisation only — security source of truth is at Layer 2 + 3. |
| **Schema declaration** (parameter shapes, enums, refines) | 2 | Declaration belongs with the tool definition. |
| **Action enum** (which sub-actions exist) | 2 | Source of truth; Layer 3 enforces via the schema. |
| **Length caps / array DoS bounds** | 2 (declared) → 3 (enforced) | Declared as `.max(N)`; enforced by safeParse at Layer 3. |
| **Injection refines** | 2 (declared) → 3 (enforced) | `.refine(detectInjection)` declared at Layer 2, runs during safeParse. |
| **Prototype-pollution strip** | 2 (declared) → 3 (enforced) | `.transform(stripDangerousKeys)` declared at Layer 2, runs during safeParse. |
| **Parameter normalization** (snake → camel) | 2 (declared) → 3 (enforced) | Same pattern as above. |
| **Schema validation** (the safeParse call) | **3** | **The single source of truth. GS14.** |
| **Validation error formatting** | 3 | The dispatcher returns the formatted error to Layer 1. |
| **Resource authorization** (`validateResourceAccess`) | **4** | Per-resource; needs param values + auth context. |
| **Admin-tier action gate** | 4 | Per-action; some actions are admin-only, siblings aren't. |
| **Business-rule validation** (state machine, multi-record consistency) | 4 | Needs DB reads. |
| **Transaction integrity** (`$transaction` wrap) | 4 | Handler is the atomicity boundary. |
| **Downstream sanitization** (re-strip before write to JSON columns) | 4 | Defense in depth; merging fields from other sources may reintroduce dangerous keys. |
| **Audit logging** (business-meaningful state deltas) | 4 | Handler knows the semantics; Layer 1 only knows "an HTTP request happened." |
| **Idempotency-aware transforms** | 2 (declared, written to be idempotent) → 3 (executes safely twice) | Cross-cutting; see Part C. |
| **Runtime SSRF / DNS-rebinding gate** (URL resolves to private/loopback IP) | 4 | Layer 3 has no DNS resolver; static schema can't reach the threat. See *Static schemas vs runtime gates* in Part C. |
| **Seeded-allowlist exemption** (first-party services using loopback) | 4 | Bound to the runtime gate; seed scripts bypass the user-facing path via direct ORM writes. |
| **Drift detection for inlined helpers** | Cross-cutting | Smoke test asserts inline copy equals canonical source. |

**Rule of thumb**: if you can't find your control in this table, ask *"what does this control need to know?"* The answer dictates the layer.

- Knows only the network bytes → Layer 1.
- Knows the parameter shape → Layer 2 (declares) → Layer 3 (enforces).
- Knows the specific resource being acted on → Layer 4.

---

# Part E — Self-Audit

For each tool in your server:

**Layer 1:**
1. Where do requests enter? List every transport (stdio, SSE, HTTP REST, in-process call). Is authentication enforced at each?
2. Is there a request size cap? What's the limit, and is it enforced before parsing?
3. Is there a rate limiter? Per-user or per-tool?

**Layer 2:**
4. Where is the tool's schema declared? Is the declaration colocated with the tool's description?
5. Does the schema have: type checks, enum validation for `action`, length caps on every string field, DoS caps on every array field, prototype-pollution strip on every `.passthrough()` / `z.record(z.any())`, refines on free-text fields?
6. Is the action enum the source of truth — i.e., do other surfaces (routing tables, risk classifiers) derive their lists from this enum or hardcode parallel lists?

**Layer 3:**
7. Where is `safeParse(args)` called? Is there exactly one invocation per tool, at the dispatcher boundary?
8. Does the dispatcher use `parsed.data` for downstream calls, never raw `args`?
9. If validation fails, what does the dispatcher return? Is it a structured error reaching Layer 1, not a thrown exception that crashes the server?

**Layer 4:**
10. Does the handler trust the validation — i.e., is the parameter type `WidgetUpdateParams` (the validated type) and not `any`?
11. Is `validateResourceAccess` called BEFORE any database read that depends on the resource?
12. Are write operations wrapped in `$transaction` when they touch multiple records?
13. Are JSON-column writes re-stripped before persistence (defense in depth)?

**Cross-cutting:**
14. If you have double-validation (Layer 1 middleware + Layer 3 dispatcher), is every transform idempotent? Is there a smoke test that verifies double-pass equality?
15. If you've inlined a security helper at a call site (because the canonical source isn't importable from that runtime), is there a drift-detection smoke test asserting equality with the canonical source?
16. After adding a new action, did you grep for all action-enumerating surfaces and update them? (See Gold Standards Specification GS14 v1.2 for the canonical list.)

---

# Provenance

This spec emerged from a sequence of production hardening passes on a multi-path MCP server (May 2026). The four-layer model became explicit when reviewers needed to answer *"where does this control belong?"* during a cross-cutting security audit. Three patterns kept recurring:

1. **Same defect, different layers.** A "missing validation" report at the handler level often pointed to a "missing safeParse at the dispatcher" — same bug, different layer. Naming the layers explicitly made review reports actionable.
2. **Phantom canonical.** Schemas declared in the right place at Layer 2 but never invoked at Layer 3 — Chapter 9's lesson. Naming Layer 2 vs Layer 3 explicitly is what makes this defect describable.
3. **Cross-transport drift.** A new transport added at Layer 1 silently bypassed Layer 3 because the new transport ran its own validation middleware (and forgot to). Naming "Layer 3 as the single chokepoint" turned this from a recurring class of bug into a one-line code review check.

The four layers themselves are not novel — they're the natural decomposition of any tool-routing system. What's specific to MCP servers is the importance of Layer 3 being a *single* chokepoint serving *all* Layer 1 transports. That's the GS14 prescription and the reason the four-layer model is worth naming explicitly.

For one production server's specific application of this model — file paths, code references, the dispatcher pattern that ties pAIchart's tool surface together — pAIchart maintains an internal implementation reference. The universal model in this spec is the same one it derives from.

---

# Document metadata

**Version**: 1.0
**Created**: 2026-05-16
**Status**: Authoritative spec for the layered MCP architecture mental model. Companion to [Chapter 9](09-hardening-mcp-tools.md) and the [Gold Standards Specification](gold-standards-spec.md).
**Confidence**: 90% (validated against three production MCP servers; the four-layer decomposition is robust across all three)

**Changelog**:
- 1.0 (2026-05-16): Initial release. Four layers (Server / Tool / Dispatcher / Handler), security controls assigned per layer, cross-cutting concerns (idempotency / drift detection / multi-surface alignment), decision matrix, self-audit. Derived from the production hardening work documented in Chapter 9.

---

## License

This specification is published under [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt the material with attribution.
