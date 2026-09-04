# Token Validator — Visual Validation Showcase

> **Gold standard MCP service response UX demonstration**
>
> See comprehensive validation results with enhanced formatting

> **⚠️ POST-U2 (2026-05-19) UPDATE — example output below is stale**
>
> The token-validator-service Docker container was updated 2026-05-19 (commit `2da131e3`) to accept per-service audience `https://paichart.app/mcp/token-validator-service`. Live output now shows:
> - `kid='paichart-2026-04'` (current production kid; rotates ~90-day)
> - `Token audience validated: https://paichart.app/mcp/token-validator-service (per-service, RFC 8707)` instead of legacy `/mcp`
> - `azp` claim now present in `tokenClaims` (e.g., `azp: 'claude-desktop'`) — propagated from Option α populateReqUser
>
> One **known labeling bug** in the `component5Verification` subsection of the response: its hardcoded `expectedAudiences` array (in the validator's response-formatter code, NOT the gate) still has only the 2 legacy audiences, so it reports `match: NO` + `⚠️ Legacy audience (deprecated Jul 5, 2026)` even when the actual gate validates the per-service audience successfully. The gate result (`Token audience validated... per-service, RFC 8707`) is the truth; the component5Verification label is cosmetic-stale and worth a future 2-line fix.

---

## Quick Test

**Fastest way to see enhanced validation:**

```javascript
services(action: "workflow.execute", workflowName: "trust-level-basic-demo")
```

**Or direct call:**

```javascript
services(action: "workflow.execute", {
  steps: [{
    service: "token-validator-service",
    tool: "verify_auth",
    arguments: { enhancedFormat: true }
  }]
})
```

---

## What You'll See

### Complete Validation Report

```
╔═══════════════════════════════════════════════════════════════════╗
║  TRUSTED TRUST LEVEL - COMPLETE SUCCESS                          ║
╚═══════════════════════════════════════════════════════════════════╝

RESULTS:
  ✅ Trust Level: TRUSTED
  ✅ Token Received: true
  ✅ Token Validation: SUCCESS (11/11 steps passed)
  ✅ Execution Time: 147ms
  ✅ JWKS Validation: 43ms (Component 5 compliant)

VALIDATION STEPS:
  ✅ _context received from pAIchart Hub
  ✅ Trust level assigned: TRUSTED
  ✅ JWT token present in _context (trust level grants token access)
  ✅ Token header decoded - Algorithm: RS256, Key ID: paichart-2026-01
  ✅ Token uses RS256 (asymmetric public key cryptography)
  ✅ JWKS public keys fetched from https://paichart.app/api/auth/jwks (41ms)
  ✅ Public key matched: kid='paichart-2026-01' found in JWKS
  ✅ RS256 signature verified using public key (41ms)
  ✅ Token issuer validated: https://paichart.app
  ✅ Token audience validated: https://paichart.app/mcp (Component 5)
  ✅ Token not expired (valid for 13 minutes)

TOKEN CLAIMS VERIFIED:
  • User: you@example.com
  • Role: ADMIN
  • Issuer: https://paichart.app
  • Audience: https://paichart.app/mcp
  • Expires In: 13 minutes

SUMMARY:
Token Validation:
  ✅ JWT received and decoded
  ✅ RS256 signature verified via JWKS
  ✅ Issuer/audience validated
  ✅ Token not expired

Security Verified:
  ✅ Public key cryptography (RS256)
  ✅ Trust level properly assigned
  ✅ 43ms validation (< 50ms SLA)
  ✅ Component 5 compliant
```

---

## Section Breakdown

### 1. RESULTS (5 Key Metrics)

Instant status overview — see success at a glance.

- Trust level assigned (INTERNAL, TRUSTED, OWNER, TEAM_MEMBER, SCOPED, or ANONYMOUS)
- Whether a JWT token was received
- Overall validation status (11 steps)
- Performance metrics (total + JWKS validation time)

### 2. VALIDATION STEPS (11-Step Process)

Detailed JWKS validation breakdown:

- Step-by-step token verification with timing per step
- Failure point identification (first red X shows where validation broke)
- Educational: see exactly how RS256/JWKS validation works

### 3. TOKEN CLAIMS VERIFIED

User identity confirmation from the decoded JWT:

- Verified user email and role
- Token issuer and audience (Component 5 compliance)
- Token expiration countdown

### 4. SUMMARY

What was validated + contextual insights auto-detected from trust level:

| Trust Level | Contextual Notes |
|-------------|-----------------|
| INTERNAL | Platform service, full access |
| TRUSTED | Localhost Docker service, full token access |
| OWNER | Service ownership verified, full token for integration testing |
| TEAM_MEMBER | POV team validated, token for collaboration |
| SCOPED | POV context validated, no token (add service owner to team for token) |
| ANONYMOUS | No POV context, no token (hints to improve trust) |

---

## Trust Level Reference

The Hub assigns one of 6 trust levels to each service call, which determines JWT token access:

| Trust Level | Token? | When Assigned |
|-------------|--------|---------------|
| INTERNAL | Yes | `paichart-*` platform services |
| TRUSTED | Yes | Localhost Docker services (in TRUSTED_INTERNAL_SERVICES list) |
| OWNER | Yes | Caller owns the target service |
| TEAM_MEMBER | Yes | Service owner is on the caller's POV team |
| SCOPED | No | Public service called with a povId |
| ANONYMOUS | No | Public service called without povId |

**See also**: `/prompt trust_levels` for the complete guide.

---

## Testing Different Trust Levels

### Test 1: TRUSTED (Localhost Docker Service)

The `token-validator-service` runs on localhost:3105, so it gets TRUSTED trust automatically:

```javascript
services(action: "workflow.execute", workflowName: "trust-level-basic-demo")
```

**Expected**: Trust Level TRUSTED, token received, 11/11 validation steps pass.

### Test 2: Multi-Language Validation (Parallel)

Runs 3 parallel validations — TypeScript, JavaScript, Python contexts:

```javascript
services(action: "workflow.execute", workflowName: "jwks-validation-advanced-demo")
```

**Expected**: 3 parallel results, all TRUSTED, total time ~300ms (not 900ms sequential).

### Test 3: Troubleshooting with POV Context

```javascript
services(action: "workflow.execute", {
  workflowName: "token-troubleshooting-demo",
  povId: "your-pov-id"
})
```

**Expected**: Trust level may vary based on POV team membership. Useful for debugging why a service isn't receiving tokens.

---

## Advanced Usage

### Raw JSON Format (For Programmatic Parsing)

```javascript
services(action: "call", {
  targetService: "token-validator-service",
  tool: "verify_auth",
  arguments: { enhancedFormat: false }
})
```

Returns raw JSON without `_visual` or `_formatted` fields. Use for CI/CD scripts, automated testing, log parsing.

### Custom Code Examples (Opt-In)

Code examples are disabled by default to prevent ChatGPT safety layer blocks. To include TypeScript/JavaScript/Python validation code:

```javascript
services(action: "call", {
  targetService: "token-validator-service",
  tool: "verify_auth",
  arguments: {
    enhancedFormat: true,
    includeCodeExample: true,
    codeLanguage: "python"
  }
})
```

---

## What This Demonstrates

### For External Service Developers

This is the gold standard for MCP service responses:

1. Clear status — box header shows trust level + result
2. Key metrics — 5 most important points upfront
3. Detailed validation — 11-step process with checkmarks
4. User identity — verified claims in friendly format
5. Educational summary — what was validated and why
6. Performance — timing metrics for SLA compliance
7. Contextual help — auto-detected based on trust level

### For Users

Understand your integration status instantly:

- Green checkmarks = everything working
- Red X marks = what failed and where
- Trust level = why you did/didn't get a token
- Contextual notes = how to improve your access

### For Support

Screenshot-ready troubleshooting — user sends screenshot, support sees trust level, validation status, and error point. No follow-up questions needed.

---

## Pre-Built Demo Workflows

```javascript
// 1. Basic trust level test
services(action: "workflow.execute", workflowName: "trust-level-basic-demo")

// 2. Advanced JWKS validation (3 languages, parallel)
services(action: "workflow.execute", workflowName: "jwks-validation-advanced-demo")

// 3. Troubleshooting with POV context
services(action: "workflow.execute", {
  workflowName: "token-troubleshooting-demo",
  povId: "your-pov-id"
})

// 4. Direct service call (simplest)
services(action: "call", {
  targetService: "token-validator-service",
  tool: "verify_auth",
  arguments: { enhancedFormat: true }
})
```

---

## Related Prompts

- **trust_levels** — Complete 6-tier trust hierarchy guide
- **external_service_auth** — JWKS integration deep dive
- **security_policy** — Multi-layer Hub security
- **workflow_guide** — Multi-service orchestration
- **getting_started** — New user tutorials
- **register_guide** — Register your first service
- **platform_tool_architecture** — Three-tier tool architecture (platform / internal / external)

---

**Version:** 2.0 | **Updated:** 2026-03-19 | **Status:** Production-Ready
**Service:** `token-validator-service` (localhost:3105)
**Purpose:** Demonstrate gold standard MCP service validation UX
