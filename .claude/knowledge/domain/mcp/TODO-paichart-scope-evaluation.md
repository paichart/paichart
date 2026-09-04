# TODO: pAIchart Scope System Evaluation

> **Status**: TODO | **Priority**: Medium-High | **Created**: 2026-03-15 | **Updated**: 2026-03-28
> **Context**: Discovered during Snowflake MCP External OAuth integration
> **Prerequisite for**: Snowflake per-user auth (Option A), fine-grained service authorization
> **Not blocking**: Snowflake External OAuth with `any_role_mode = 'ENABLE'` (Option B, deployed)

---

## Why Scope Enforcement Matters (and When It Doesn't)

**Today**: pAIchart has a small, trusted user base. All users authenticate as themselves with their full role. The existing RBAC system (`role_permissions`, `enforceToolSecurity`, `withPOVAccess`) provides equivalent authorization — a user can only perform actions their role permits, regardless of what scopes their token carries. Scope enforcement would add a second layer with no practical security benefit.

**When scope enforcement becomes necessary**:
- **Third-party developers with limited access** — e.g., "this API key can only read POVs, not modify them." Without scope enforcement, any valid token holder has the full permissions of their role. Scopes allow restricting below the role level.
- **Different token tiers** — e.g., free vs paid plans, read-only vs full access. Scopes let you issue tokens with different capability sets to the same role.
- **Fine-grained API keys** — e.g., a key that can call `services(action: "discover")` but not `services(action: "call")`. The key holder's role might allow both, but the key's scope restricts it.
- **External service authorization** — e.g., Snowflake needs `session:role-any` in the token scope to map to a Snowflake role. This is already implemented.

**The trigger**: Scope enforcement should be implemented when pAIchart onboards its first external developer or creates its first restricted API key tier. Until then, RBAC provides equivalent protection.

**Anthropic compliance**: The [MCP Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices) recommends "progressive, least-privilege scope model." Our current RBAC is compliant with the spirit (server-side authorization independent of token claims). The scope infrastructure is ready (scopes in tokens, tool-annotations.js mapping, this TODO with Q1-Q10 plan) — enforcement is a design decision, not a security gap.

---

## Background

During the Snowflake MCP service integration, a 4-specialist review (auth-permissions 91/100, sec-ops 91/100, boundary-contract 92/100, architectural-review 88/100) revealed that:

1. `mintMcpToken` in `mcp-server-http-clean.js` already embeds a `scope` claim in every MCP JWT (line 1025)
2. The `MCP_SCOPES` constant (lines 71-80) defines pAIchart-specific scopes but they are **only used in discovery endpoint responses**, not injected into tokens or enforced
3. Actual token scope values come from **OAuth providers** (GitHub: `read:user read:org`, Microsoft: `openid email`), not from pAIchart's own scope definitions
4. Three of four specialists missed this existing infrastructure, suggesting the scope system is unclear even to deep analysis

## Evaluation Questions

This TODO requires a comprehensive evaluation before any scope changes are made. The goal is to simplify and clarify, not add complexity.

### Q1: Current State Audit

- Where are `MCP_SCOPES` (`mcp:read`, `tools:pov.read`, etc.) actually referenced in the codebase?
- Are they enforced anywhere (middleware, handlers, guards)?
- Or are they purely cosmetic (only in OAuth discovery responses)?
- What scope value actually ends up in a minted MCP token for each auth path?
  - GitHub OAuth (Claude Desktop) → `read:user read:org`
  - Microsoft OAuth (ChatGPT) → `openid email`
  - API Key → ?
  - RS256 first-party → ?

### Q2: OAuth Provider Scopes

- Why are GitHub scopes (`read:user read:org`) embedded in pAIchart MCP tokens?
- These are GitHub API permissions — do they serve any purpose after the GitHub OAuth exchange is complete?
- Same question for Microsoft scopes (`openid email`) — are they meaningful after user identity is established?
- Can we stop embedding provider scopes in pAIchart tokens and use pAIchart-specific scopes instead?
- Or do we need BOTH (provider scopes for upstream API calls, pAIchart scopes for downstream authorization)?

### Q3: MCP Protocol Scope (`mcp:read`)

- What does `mcp:read` mean in practice?
- Is it checked anywhere in the MCP request processing pipeline?
- Should there be `mcp:write` or `mcp:execute` counterparts?
- Is this scope meaningful or just a placeholder from initial implementation?

### Q4: Resource-Level Scopes (`tools:pov.read`, etc.)

- Are `tools:pov.read`, `tools:tasks.write`, `tools:agents.execute` enforced?
- Should they be? The existing RBAC (`role_permissions` table, `withPOVAccess` middleware) already handles authorization
- Is there overlap/duplication between scope-based auth and role-based auth?
- Could scopes replace or complement the existing RBAC system?

### Q5: Simplification Opportunities

- Can we reduce to fewer, coarser scopes? (e.g., just `read` and `write` based on role)
- Should scopes be derived from the existing `role` claim at token minting time (auth-permissions specialist recommended this)?
- What's the minimum viable scope design that serves:
  - Snowflake External OAuth (needs a scope to map to Snowflake roles)
  - OAuth 2.0 compliance (RFC 6749 Section 3.3)
  - Future external service authorization

### Q6: Snowflake Integration Impact

- With `external_oauth_any_role_mode = 'ENABLE'`, Snowflake ignores scope values and uses the user's default role
- If we later want scope-to-role mapping in Snowflake, what scope values would we need?
- Should this mapping live in the Snowflake MCP service (all 4 specialists agreed: yes)?
- Can we add a `session:role-any` scope (Snowflake convention) alongside pAIchart scopes?

### Q7: Token Size and Backward Compatibility

- How many scopes is too many? (Each scope adds ~10-20 bytes to JWT)
- Do any consumers validate scope format strictly?
- What happens to existing tokens/sessions if we change scope values?

### Q8: Scope Extraction (Enforcement — Part 1)

> Added 2026-03-28 — addresses P1 from MCP security compliance tracker

Currently, scope is embedded in every minted JWT (`mintMcpToken` line 1025) but **never extracted** on the receiving side:
- Auth middleware (`mcp-server-http-clean.js` lines 629-741) sets `req.user` with `userId`, `email`, `role`, `token`, `authMethod` — but no `scope`
- `enforceToolSecurity()` (`lib/mcp/server/config/tool-security.js` line 58) checks `context.authenticated` and `context.role` — never `context.scope`
- `processMCPRequest` and `setUserContext` don't thread scope through

**Questions:**
- Where should scope be extracted from the JWT? In the RS256 verification block (line 645-655)?
- Should `req.user.scope` be a string (space-delimited, OAuth standard) or an array?
- What happens if an old token has provider scopes (`read:user read:org`) and a new token has pAIchart scopes (`data:read data:write`)? Backward compatibility during transition?
- Should the HS256 path (session JWT, line 686) and API key path (line 731) also populate `req.user.scope`?

### Q9: Scope Enforcement (Enforcement — Part 2)

> Added 2026-03-28 — the 3-boundary fix identified by boundary-contract specialist

**Boundary 1: Auth middleware → req.user.scope**
```javascript
// In RS256 verification block (line 645-655):
req.user = {
  userId: payload.sub || payload.userId,
  email: payload.email,
  role: payload.role,
  scope: payload.scope || payload.scp || '',  // Extract from JWT
  token: token,
  authMethod: 'mcp_token'
};
```

**Boundary 2: Request context → tool handler**
- `processMCPRequest` / `setUserContext` must pass `scope` alongside `authenticated`, `role`, `userId`
- Where exactly does the user context flow from `req.user` to tool handlers?

**Boundary 3: Tool handler → enforceToolSecurity**
```javascript
// In enforceToolSecurity (tool-security.js line 58):
function enforceToolSecurity(toolName, context) {
  // Existing: check authenticated + role
  // NEW: check scope against tool annotation
  const annotation = toolAnnotations[toolName];
  if (annotation?.readOnlyHint === false && !hasWriteScope(context.scope)) {
    return false; // Write tool requires write scope
  }
}
```

**Questions:**
- What scope vocabulary maps to `readOnlyHint: false`? Is it `tools:pov.write` (current MCP_SCOPES) or something simpler like `write`?
- Should scope enforcement be a HARD reject (403) or a WARN-and-allow during rollout?
- How does DEMO_USER work? (sec-ops flagged: DEMO_USER might not have write scopes, causing lockout if enforcement is strict)
- `tool-annotations.js` already has `readOnlyHint`/`destructiveHint` for ALL tools — this is 80% of the mapping. What's the other 20%?

### Q10: Rollout Strategy

> Added 2026-03-28 — prevents breakage during scope enforcement rollout

- **Phase A: Logging only** — Extract scope, log mismatches, don't reject. Run for 1-2 weeks to identify false positives.
- **Phase B: Warn + allow** — Log warnings for scope violations, allow the operation. Identify which tools would be blocked.
- **Phase C: Enforce** — Reject scope violations with 403. Only after Phase A/B data confirms no false positives.
- **Phase D: Require pAIchart scopes** — Stop embedding provider scopes, mint pAIchart-specific scopes derived from role. This is the Q5 simplification.

**Estimated effort:**
| Phase | Effort | Risk |
|-------|--------|------|
| Q1-Q7 evaluation (scope design) | 2-3h | None (research only) |
| Q8 extraction (Boundary 1) | 1h | Very low |
| Q9 enforcement (Boundaries 2-3) | 3-4h | Medium (false positives) |
| Q10 Phase A (logging) | 30 min | None |
| Q10 Phase B (warn) | 30 min | Low |
| Q10 Phase C (enforce) | 1h | Medium |
| Q10 Phase D (new scope vocab) | 2-3h | Medium (backward compat) |
| **Total** | **10-14h** | |

## Key Files for Investigation

| File | What to check |
|------|--------------|
| `lib/auth/auth-constants.ts` (Wave 3a Phase 3.1) | `MCP_SCOPES`, `CLAUDE_SCOPE`, `CHATGPT_SCOPE` definitions — moved from mcp-server-http-clean.js to shared constants module |
| `lib/auth/token-manager.ts:mintMcpToken` (U2 Phase A) | Canonical mint location — how scope enters the JWT. Was inline at `mcp-server-http-clean.js:1117-1172` pre-U2; consolidated 2026-05-19. |
| `lib/mcp/server/routes/oauth-discovery-routes.ts` (Wave 6 Phase 6.3 — R5) | Discovery endpoint — where `MCP_SCOPES` is served via `.well-known/oauth-authorization-server`. Grep `registerR5AuthorizationServer`. |
| `lib/mcp/server/routes/oauth-discovery-routes.ts` (Wave 6 Phase 6.3) | OpenID discovery — all scopes listed. Same file as R5. |
| `lib/mcp/server/routes/oauth-flow-routes.ts:registerR9TokenExchange` (Wave 6 Phase 6.4) | GitHub OAuth token minting — `requestedScope`. Grep `requestedScope` in oauth-flow-routes.ts. |
| `lib/mcp/server/routes/oauth-flow-routes.ts` (Wave 6 Phase 6.4) | Microsoft OAuth token minting via R8/R9 flow. `handleMicrosoftAuthorize` still on server class (Domain C — open Wave 7.4 backlog). |
| `lib/auth/token-manager.ts:mintAccessToken` | Web app token signing — no scope currently |
| `lib/auth/oauth/mcp-oauth-validator.js` | OAuth validation — scope handling |
| `tests/oauth/first-party-tokens.test.js` | Existing scope tests |
| `lib/mcp/server/config/tool-annotations.js` | `readOnlyHint`/`destructiveHint` per tool — 80% of scope-to-tool mapping |
| `lib/mcp/server/config/tool-security.js:58` | `enforceToolSecurity()` — currently checks role only, scope enforcement target |

## Production Reality: Snowflake External OAuth (March 2026)

The Snowflake integration revealed concrete scope requirements that any redesign must account for:

### What We Had to Do

1. **Appended `session:role-any`** to all MCP token scopes in `mintMcpToken` (line 1018 of `mcp-server-http-clean.js`). This is a Snowflake-specific scope value that tells Snowflake External OAuth to use the user's default role. Without it, Snowflake rejects the token.

2. **Set `EXTERNAL_OAUTH_SCOPE_DELIMITER = ' '`** in Snowflake because pAIchart uses space-delimited scopes (OAuth 2.0 standard) but Snowflake defaults to comma-delimited.

3. **Set `EXTERNAL_OAUTH_SCOPE_MAPPING_ATTRIBUTE = 'scope'`** because Snowflake defaults to `scp` (Microsoft convention) but our JWT uses `scope`.

### What This Means for Scope Redesign

- **`session:role-any` is now in ALL MCP tokens** — every external service sees it, even though only Snowflake needs it. This violates the "generic, not service-specific" principle but was necessary for production.
- The current scope string looks like: `read:user read:org session:role-any` (GitHub auth) or `mcp:read tools:pov.read ... session:role-any` (MCP OAuth)
- **Future external services** that use their own External OAuth may need similar scope values (e.g., Databricks, BigQuery). The scope string could grow with service-specific values unless we design a better model.

### Options for the Redesign

**Option A: Accept service-specific scopes in the token**
- Pros: Works today, each service gets what it needs
- Cons: Token grows, violates generic principle, coupling between token minting and service requirements

**Option B: Generic role-based scopes that services map internally**
- E.g., `data:read data:write admin` → Snowflake maps `data:read` to `PAICHART_READER`
- Pros: Clean separation, token doesn't grow per-service
- Cons: Snowflake still needs `session:role-any` OR we'd need to add `session:role:PAICHART_READER` to the scope — which is service-specific again

**Option C: Audience-scoped tokens**
- Mint separate tokens per external service with service-specific scopes
- E.g., Snowflake token gets `session:role-any`, other services get different scopes
- Pros: No leakage, each service only sees its scopes
- Cons: More complex token minting, one token per service call

**Recommendation**: Evaluate during scope redesign. For UAT, `session:role-any` in all tokens is acceptable.

---

## Recommended Approach

**Part 1: Scope Design (Q1-Q7)**
1. **Run discovery-scout** to map all scope usage across the codebase
2. **Consult auth-permissions-specialist** with findings from Q1-Q4
3. **Evaluate the three options above** in the context of Snowflake production learnings
4. **Design simplified scope model** based on findings

**Part 2: Scope Enforcement (Q8-Q10) — added Mar 28, 2026**
5. **Extract scope from JWT** in auth middleware → `req.user.scope` (Q8)
6. **Thread scope through request context** to tool handlers (Q9, Boundary 2)
7. **Enforce scope in `enforceToolSecurity()`** using `tool-annotations.js` mapping (Q9, Boundary 3)
8. **Rollout in phases**: logging → warn → enforce → new vocab (Q10)
9. **Validate** with Snowflake and existing clients
10. **Document** the scope model in this domain knowledge area

**Part 1 and Part 2 can overlap**: Start Part 2 Phase A (logging) while finalizing Part 1 design.

## Principles (from specialist reviews)

- **Generic, not service-specific**: pAIchart scopes should be meaningful across all services, not just Snowflake
- **Derived from role**: Scopes should be a projection of existing RBAC, not a second source of truth (auth-permissions 91/100)
- **Service maps internally**: Each external service maps generic scopes to its own authorization model (architectural-review 88/100, all 4 agreed)
- **Additive, not breaking**: New scope values must not break existing token validation (boundary-contract 92/100)
- **Simplify**: Prefer fewer coarse scopes over many fine-grained ones at this stage
- **NEW: Snowflake reality check**: Some external services require specific scope values in the JWT regardless of our generic model (production-validated March 2026)

## Related Documents

- `hub-authentication-context-passing.md` — Token forwarding policy (scope travels with token)
- `mcp-hub-security-policy.md` — Service trust levels and token access
- `TODO-user-consent-trust-integration.md` — Related: user consent for service access
- `../patterns/identity-preserving-token-forwarding-pattern.md` — Token forwarding chain
- `../patterns/docker-mcp-service-gold-standard-v2.md` — Snowflake use case with scope config details

---

## Compliance Context (Mar 28, 2026)

- **P1 (Scope enforcement)** in `cline_docs/mcp-security-best-practices-compliance-2026-03-11.md` — CRITICAL, unchanged at 82% compliance
- **P1 is the last item needed to reach 95% compliance** (currently blocked by scope design)
- 3 specialists confirmed: scopes ARE in tokens but never extracted or enforced downstream
- `tool-annotations.js` `readOnlyHint`/`destructiveHint` provides 80% of scope-to-tool mapping
- Reassessment: `cline_docs/mcp-security-compliance-reassessment-2026-03-28.md`

**Next action**: When ready, run discovery-scout with scope-focused investigation, then consult auth-permissions-specialist for redesign. Part 2 (enforcement) can start in parallel with Phase A logging.
