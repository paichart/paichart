# Current State Validation Discovery
**Purpose**: Validate current implementation works BEFORE reviewing proposed changes
**When to Use**: Before ALL specialist reviews (especially auth, security, API, database)
**Time**: 15-30 minutes
**Created**: 2026-01-30
**Reason**: Phase 3 JWT reviews missed audience mismatch by reviewing plan without validating current state

---

## Why This Discovery Exists

### The Problem We Prevent

**Example: Phase 3 JWT Reviews (2026-01-24)**
- 3 specialists reviewed multi-key JWKS plan (93% confidence)
- All assumed Phase 2 RS256 tokens worked correctly
- None tested MCP OAuth write operations
- None decoded production tokens
- **Result**: Audience mismatch (`https://paichart.app/mcp` vs `paichart-api`) in production for weeks

**If This Discovery Had Been Run**:
- 30 minutes to decode tokens and grep for audiences
- Would have found 3 different audience values
- Would have caught mismatch before review
- Would have prevented production outage

**ROI**: 30 min validation saves 2-4 hours debugging production issues

---

## Discovery Steps

### Step 1: Test Current Implementation End-to-End

#### For Authentication/Authorization Changes:
```bash
# 1.1 Test all authentication flows locally
npm run dev              # Web app
npm run mcp:http:dev     # MCP server

# 1.2 Test each auth flow works:
- [ ] Web login (browser)
- [ ] MCP OAuth (ChatGPT / Claude Desktop)
- [ ] API key authentication (mcp-remote client)

# 1.3 Test both read AND write operations:
- [ ] Read operations (project(action: 'pov.list'), project(action: 'pov.details'))
- [ ] Write operations (perform(action: 'execute') with task.update)

# Document results:
✅ All flows work? Or ❌ Some failing?
```

#### For API Changes:
```bash
# 1.1 Test all affected endpoints
curl -H "Authorization: Bearer $TOKEN" https://paichart.app/api/endpoint

# 1.2 Document actual responses (not assumed)
# 1.3 Compare to Zod schemas
# 1.4 Test error cases (invalid input, missing fields)
```

#### For Database Changes:
```bash
# 1.1 Query production database for actual data
ssh <PROD_USER>@<PROD_HOST> "psql -U paichart -d paichart_production -c 'SELECT * FROM Table LIMIT 10'"

# 1.2 Check constraints and indexes
ssh <PROD_USER>@<PROD_HOST> "psql -U paichart -d paichart_production -c '\d Table'"

# 1.3 Verify foreign key relationships
# 1.4 Check for data quality issues
```

---

### Step 2: Decode Production Tokens/Data (Don't Assume!)

#### For Authentication Changes:

**2.1 Capture Production Tokens**:
```bash
# From production logs
ssh <PROD_USER>@<PROD_HOST> "tail -200 /var/log/paichart/mcp-combined-0.log | grep -i 'token\|jwt' | grep 'Bearer'"

# Or from browser DevTools (Network tab)
# Copy actual Authorization header
```

**2.2 Decode ALL Token Types**:
```bash
# Decode JWT tokens
node -e "
const token = 'ACTUAL_PRODUCTION_TOKEN_HERE';
const parts = token.split('.');
console.log('Header:', JSON.parse(Buffer.from(parts[0], 'base64').toString()));
console.log('Payload:', JSON.parse(Buffer.from(parts[1], 'base64').toString()));
"

# Document for each token type:
- Web user token claims
- MCP OAuth token claims
- API key token claims
- Refresh token claims
```

**2.3 Create Claims Comparison Table**:
```markdown
| Token Type | Algorithm | Audience | Issuer | Scope | Other Claims |
|-----------|-----------|----------|--------|-------|--------------|
| Web User | RS256 | paichart-api | https://paichart.app | - | sub, email, role |
| MCP OAuth | RS256 | https://paichart.app/mcp | https://paichart.app | email openid | azp, jti |
| API Key | HS256 | paichart-app | - | - | purpose |
```

**2.4 Identify Mismatches**:
```bash
# Question: Do all validation code paths accept all token types?
# If NO → Document the gap
# If YES → Verify with tests
```

---

### Step 3: Cross-Reference All Critical Values

#### 3.1 Grep for All Variations
```bash
# For audience claims:
grep -rn "audience\|\.aud\|setAudience" --include="*.ts" --include="*.js" lib/ app/ mcp-server*.js

# Document ALL unique values found:
# - 'paichart-api'
# - 'https://paichart.app/mcp'
# - 'paichart-app'
# etc.
```

#### 3.2 Map Where Each Value is Used
```bash
# Create table:
| Value | File:Line | Purpose | Validated By |
|-------|-----------|---------|--------------|
| paichart-api | token-manager.ts:86 | Web/API tokens | token-manager.ts:176 |
| https://paichart.app/mcp | mcp-server.js:614 | MCP OAuth | ??? |
| paichart-app | apiKeyService.ts:71 | API keys | ??? |
```

#### 3.3 Identify Validation Gaps
```bash
# For each value, find validation logic:
grep -rn "decoded\.aud.*===\|decoded\.aud.*!==\|audience.*check" --include="*.ts" lib/ app/

# Questions:
- Does validation accept ALL token types?
- Are there unvalidated token types?
- Are there mismatches (generation vs validation)?
```

---

### Step 4: Production Runtime Verification

#### 4.1 Check Production Logs for Actual Behavior
```bash
# Look for errors, warnings, rejections
ssh <PROD_USER>@<PROD_HOST> "tail -500 /var/log/paichart/mcp-error-0.log | grep -i 'audience\|invalid\|reject'"

# Example findings:
# - [verifyAccessToken] Invalid token audience: https://paichart.app/mcp
# ← Production token REJECTED due to mismatch!
```

#### 4.2 Test With Production API
```bash
# Use actual production token
curl -H "Authorization: Bearer $PRODUCTION_TOKEN" \
  https://paichart.app/api/mcp/tasks/action \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"task.update","parameters":{"taskId":"...","status":"IN_PROGRESS"}}'

# Expected: Success OR specific error
# Document: What actually happens vs what should happen
```

---

### Step 5: Negative Testing (Verify Security Works)

#### 5.1 Test Invalid Cases Are Rejected
```bash
# Invalid audience
# Invalid issuer
# Expired token
# Missing claims
# Wrong signature

# Document:
- [ ] Invalid audience rejected? ✅/❌
- [ ] Expired token rejected? ✅/❌
- [ ] Wrong issuer rejected? ✅/❌
```

#### 5.2 Test Attack Scenarios
```bash
# Modified claims
# Token replay
# Token from different system
# Privilege escalation attempts

# Ensure all are properly rejected
```

---

## Deliverable Template

Save findings to: `/cline_docs/current-state-validation-{feature}-{date}.md`

```markdown
# Current State Validation: {Feature Name}
**Date**: {YYYY-MM-DD}
**Validator**: {Your Name / discovery-scout}
**Feature Under Review**: {Feature description}

---

## Step 1: End-to-End Testing Results

### Authentication Flows:
- [x] Web login: ✅ Works
- [x] MCP OAuth (ChatGPT): ❌ Write operations fail
- [x] API key: ✅ Works

### Failure Details:
**MCP OAuth Write Operations**:
- Error: "Invalid token audience"
- Token audience: https://paichart.app/mcp
- Expected audience: paichart-api

---

## Step 2: Production Token Analysis

### Tokens Decoded:

#### Web User Token:
```json
{
  "alg": "RS256",
  "aud": "paichart-api",
  "iss": "https://paichart.app",
  "sub": "cm...",
  "email": "...",
  "role": "ADMIN"
}
```

#### MCP OAuth Token:
```json
{
  "alg": "RS256",
  "aud": "https://paichart.app/mcp",  ← MISMATCH!
  "iss": "https://paichart.app",
  "azp": "f2e44a69-...",
  "sub": "cm...",
  "email": "...",
  "role": "PROJECT_MANAGER"
}
```

---

## Step 3: Cross-Reference Results

### All Audience Values Found:
1. `'paichart-api'` - token-manager.ts:86 (RS256 signing)
2. `'https://paichart.app/mcp'` - mcp-server.js:614 (MCP OAuth)
3. `'paichart-app'` - apiKeyService.ts:71 (API keys, HS256)

### Validation Logic:
- token-manager.ts:176: Only accepts `'paichart-api'` ← MISMATCH!

---

## Step 4: Production Runtime Verification

### Errors Found in Logs:
```
[verifyAccessToken] Invalid token audience: https://paichart.app/mcp
```
Frequency: ~50 errors in last 24 hours

### Impact:
- MCP OAuth write operations: 100% failure rate
- MCP OAuth read operations: Working (why?)

---

## Step 5: Negative Testing Results

- [ ] Invalid audience rejected: ✅ Working (too strict!)
- [ ] Expired token rejected: Not tested
- [ ] Wrong issuer rejected: Not tested
- [ ] Missing claims rejected: Not tested

---

## Summary

**Current State**: ❌ Partially broken
- MCP OAuth tokens cannot execute write operations
- Audience validation is too strict (only accepts one value)

**Root Cause**: Audience mismatch between token generation and validation

**Recommendation**:
1. Fix immediately: Accept multiple audiences in validation
2. Long-term: Standardize on ONE audience value
3. Update: Add Phase 0 validation to all future reviews

**Confidence in Review**: Can now proceed with 95% confidence (current state understood)
```

---

## When to Use This Discovery

**MANDATORY Before**:
- All security/auth changes
- All API changes
- All database schema changes
- Any feature >2 hours

**ESPECIALLY For**:
- Token/JWT changes
- OAuth flow changes
- Validation logic changes
- Cross-boundary changes (MCP ↔ API, Frontend ↔ Backend)

**Time Investment**: 15-30 minutes

**Value**: Prevents production outages, catches assumptions, validates reality

---

## Integration with Specialist Reviews

**Workflow**:
```
1. Phase 0: Run this discovery (15-30 min)
   └─> Document current state, identify gaps

2. Phase 1: Request specialist reviews
   └─> Provide current-state validation document to specialists

3. Phase 2: Specialists review with full context
   └─> No blind assumptions about current state

4. Phase 3: Apply recommendations
   └─> Fix gaps identified in Phase 0 + specialist findings
```

**Result**: Higher confidence reviews (90-95% vs 75-85% without Phase 0)

---

## Success Criteria

This discovery is successful if:

- [x] All auth flows tested (works vs doesn't work documented)
- [x] All production tokens decoded (actual claims documented)
- [x] All variations of critical values found (grep results documented)
- [x] Production runtime behavior verified (logs checked)
- [x] Negative tests performed (invalid cases tested)
- [x] Gaps identified and documented
- [x] Current state summary created for specialists

**Deliverable**: Specialists can review with 100% confidence in current state understanding

---

**Discovery Version**: 1.0
**Created**: 2026-01-30
**Triggered By**: Phase 3 JWT audience mismatch lesson learned
**Prevents**: Reviewing plans based on assumptions instead of reality
