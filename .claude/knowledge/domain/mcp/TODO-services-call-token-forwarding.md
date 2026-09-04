# Token Forwarding in services(action: "call") — Intentionally Deferred

> **Status**: DEFERRED (security decision) | **Priority**: Low | **Created**: 2026-03-17
> **Context**: Identified during Snowflake MCP External OAuth integration
> **Complexity**: LOW (~20 lines, infrastructure already exists)
> **Decision**: Do NOT enable without explicit security review

---

## Current Behavior (Intentional)

`services(action: "call")` does NOT forward `_context.token` to external services. Only `services(action: "workflow.execute")` does. **This is a security decision, not a bug.**

### Why This Is Safer

1. **Direct calls have no POV context** — Without `povId`, there's no authorization scope for trust level determination. The trust system would default to ANONYMOUS (no token) or TRUSTED (always token) with no middle ground.

2. **Attack surface reduction** — If direct calls forwarded tokens, any authenticated user's JWT would be sent to any public service they call. A malicious public service could harvest JWTs from every user who calls it.

3. **Workflow execution has guardrails** — `povId` provides authorization scope, trust level determines who gets tokens (OWNER/TEAM_MEMBER), and the audit trail tracks the full chain.

4. **Principle of least privilege** — Tokens should only be forwarded when there's an explicit authorization context. Workflow execution with `povId` provides that context; direct calls do not.

### Current State

**`service-call-handler.js` (~line 400)** — No trust level, no token:
```javascript
client.callTool({
  name: tool,
  arguments: validatedArgs.arguments  // No _context, no token
});
```

**`workflow-tools-handler.js` (~line 460)** — Full trust level system:
```javascript
const trustLevel = await determineTrustLevel({...});
const serviceContext = buildServiceContext(trustLevel, {...});
client.callTool({
  name: tool,
  arguments: { ...args, _context: serviceContext }  // Token included
});
```

### Impact

- Users must use `services(action: "workflow.execute")` for per-user authentication
- Direct `services(action: "call")` always results in service-account fallback for services like Snowflake
- Inconsistent developer experience — two call paths with different auth behavior

### Documented In

- `hub-authentication-context-passing.md` (line 409-415): "Status: services(action: 'call') does NOT currently pass tokens (identified 2026-01-30)"
- `hub-authentication-context-passing.md` (line 420-434): Planned enhancement with code example
- `mcp-hub-external-service-authentication.md`: References workflow execution for token forwarding

---

## Proposed Fix

Add trust level determination and `_context` injection to `service-call-handler.js`, using the same infrastructure already in `workflow-tools-handler.js`.

### Files to Modify

| File | Change |
|------|--------|
| `lib/mcp/server/tools/hub/service-call-handler.js` | Add `determineTrustLevel()` + `buildServiceContext()` before `callTool()` |

### Implementation Sketch

```javascript
// In service-call-handler.js, before the callTool() call:

// Import (already available in the codebase)
const { determineTrustLevel, buildServiceContext, trustLevelReceivesToken } =
  require('../../../../services/workflow/security/trust-level');

// Determine trust level
const trustLevel = await determineTrustLevel({
  serviceId: targetService.id,
  serviceRecord: targetService,
  userId,
  povId: validatedArgs.povId || null,
  prisma: this.prisma
});

// Build context with or without token based on trust
const serviceContext = buildServiceContext(trustLevel, {
  userId, userEmail, userRole,
  token: userToken,
  povId: validatedArgs.povId || null,
  tenantId: validatedArgs.povId || null,
  requestId: `svc-${Date.now()}`,
  source: 'mcp_hub_service_call'
});

// Include _context in call
client.callTool({
  name: tool,
  arguments: { ...validatedArgs.arguments, _context: serviceContext }
});
```

### Schema Change

The `services(action: "call")` schema would need an optional `povId` parameter (currently only `workflow.execute` accepts it) so callers can provide POV context for trust level determination.

---

## Considerations

- **Security**: The trust level system already handles all security decisions. This is just wiring it into the call path.
- **Backward compatibility**: Services that don't expect `_context` will ignore it (extra fields in arguments are harmless).
- **Testing**: The `token-troubleshooting-demo` workflow can be adapted to test both paths.
- **Specialist consensus** (from Jan 30 decision): "Pass tokens to PUBLIC services (user explicitly called)" — approved by auth-permissions + oauth-multi-provider specialists.

---

## Related

- `hub-authentication-context-passing.md` — Token passing policy with both paths documented
- `TODO-paichart-scope-evaluation.md` — Scope system affects what's in the forwarded token
- `docker-mcp-service-gold-standard-v2.md` — Documents the workaround (use workflow.execute)
