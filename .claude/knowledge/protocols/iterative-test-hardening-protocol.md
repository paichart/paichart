# Iterative Test & Hardening Protocol

**Version**: 1.0
**Created**: 2026-02-24
**Author**: Claude Opus 4.6 + Steve Terry
**Purpose**: Progressive test round creation, failure-driven hardening, and policy verification for any MCP domain
**Proven By**: Hub testing — 6 rounds, 67 tests, 5 bugs fixed, 2 security gaps hardened, zero regressions
**Time**: 1-3 hours per round (run multiple rounds per session or across sessions)

---

## Executive Summary

An iterative cycle where each test round's findings inform the next round's design. Starts with functional smoke tests, progresses through edge cases and security probing, and finishes by verifying that the domain's security policy claims match actual enforcement. Failures become fixes, fixes become verification tests, and policy documents become test sources.

**Key Insight**: Test rounds are not pre-planned. Each round is designed AFTER the previous round completes, targeting gaps revealed by the results — including gaps revealed by the fixes themselves.

**Relationship to other protocols**:
- **smoke-test-sweep-standardize**: Complementary. Use that for bug class eradication across the codebase. Use THIS for progressive test depth within a single domain.
- **mcp-domain-testing-methodology-v2**: That's for initial comprehensive domain QA (90-day POV). THIS is for iterative hardening of domains that already have basic tests.
- **bug-class-eradication**: When a fix reveals a bug class (e.g., "fuzzy resolver matches wrong service"), hand off to that protocol for codebase-wide sweep.

---

## When to Use

- After a domain passes its essentials/smoke test and you want to go deeper
- After deploying fixes and needing verification that the fixes work
- When a security policy or design doc exists but hasn't been functionally verified
- Quarterly hardening of critical subsystems
- When you have 1-3 hours per round (can stop after any round)

**Prerequisites**:
- Domain has at least one passing test prompt (essentials or smoke test)
- MCP connection active
- Domain's handlers, validators, and policy files identified

---

## The Cycle

```
Round N: Run tests
    ↓
Failures found?
    YES → Investigate → Fix → Verify fix → Document in test prompt changelog
    NO  → Analyze findings (warnings, edge behaviors)
    ↓
Design Round N+1 based on:
    1. Gaps revealed by fixes (the fix changed behavior — does the new behavior hold?)
    2. Adjacent areas the fix touches (did the fix break something nearby?)
    3. Policy/doc claims not yet tested (what does the security policy promise?)
    4. Specialist recommendations (spin up mcp-hub-specialist or domain specialist)
    ↓
Write Round N+1 test prompt → Run → Repeat
```

**Stopping condition**: A round passes cleanly AND no untested policy claims remain.

---

## Phase 1: Foundation Round

**Goal**: Establish baseline with functional tests.
**Time**: 30-60 minutes
**Output**: Test prompt with 10-17 tests, all passing

### Steps

1. **Identify or create the essentials test prompt**
   - If one exists (e.g., `hub-and-logging-essentials-test.md`), use it
   - If not, create one covering the core lifecycle: register/create → read/list → update → delete
   - Include happy path, basic error cases, and log correlation

2. **Run all tests, record results**
   - PASS/FAIL for each test
   - Note any warnings or unexpected-but-not-wrong behaviors

3. **Fix any failures immediately**
   - Investigate root cause (use Explore agent or domain specialist)
   - Fix, verify, commit
   - Update test prompt changelog with fix notes

4. **Assess: is the foundation solid?**
   - All tests pass → proceed to Phase 2
   - >2 failures → fix first, re-run, then proceed

### Test Prompt Template

```markdown
# [Domain] — Essentials Test

**Purpose**: Verify core lifecycle operations work correctly
**Time**: ~15-20 minutes
**When to use**: After any changes to [domain] handlers or schema

## Tests
1. [Operation] - happy path
2. [Operation] - with optional parameters
...

## Changelog
### [Date] — Initial creation
```

---

## Phase 2: Edge Case Rounds

**Goal**: Probe transformation boundaries, cache coherence, error transparency.
**Time**: 30-60 minutes per round
**Output**: 1-2 additional test prompts, 10 tests each

### What to Target

| Category | What to Probe | Example |
|----------|--------------|---------|
| **Name/ID Resolution** | Partial match, case-insensitive, alias resolution | `get_health("weather")` vs `get_health("WEATHER-SERVICE")` |
| **Cache Coherence** | Mutation → immediate visibility, filter isolation | Register → discover (is it there?) |
| **Error Transparency** | Specific vs generic errors, error ordering | Non-existent tool on real service |
| **Transformation Boundaries** | Identity lost through validation → DB → routing | Input name → resolved name → target system |

### Design Process

1. **Review the handlers** for the domain — where does data transform?
2. **Check for the pattern**: Input → transformation → lookup → mismatch = silent failure
3. **Use a specialist** to evaluate proposed tests against existing coverage
   ```
   Spin up [domain]-specialist to evaluate these edge cases considering
   the tests we already have in [existing test prompts]
   ```
4. **Write the test prompt** following the established format

### Specialist Evaluation Template

```
Please evaluate these proposed edge cases for [domain]:
1. [proposed test]
2. [proposed test]
...

Consider:
- What does the existing test suite ([file paths]) already cover?
- Which proposals are genuinely new vs duplicates?
- What additional tests would YOU propose?
```

---

## Phase 3: Security & Resilience Rounds

**Goal**: Probe injection vectors, SSRF, state transitions, and input stress.
**Time**: 30-60 minutes per round
**Output**: Test prompt with 10 tests

### Pathological-Case Framing (test-design technique)

Before running probes, **pre-enumerate 3-5 pathological-case inputs** for each surface — weird types, edge values, prototype-pollution keys, control chars, oversized strings, scheme/protocol mismatches. The mental model is: *"what's the most absurd / wrong-shape input that COULD reach this code path?"* — not just textbook OWASP top-10 vectors.

**Why it works**: Real attackers fuzz with structurally-wrong inputs that bypass surface-level filters. The framing finds gaps the textbook payloads miss.

**Canonical examples** (2026-05-23 Round 3 Hub probes):
- `'-alert(1)-'` (JS-string-context breakout, no HTML tags) bypassed the HTML-only input validator and persisted raw in `mcp_recommendations.actions[].description` JSONB — wouldn't have surfaced from a `<script>` payload.
- `<script>...</script>` in unbounded `services.call.tool` (no regex on `tool` field) stored raw in Activity audit metadata — found because the case was pre-enumerated, not because it was a "known XSS surface."
- 200-tool `capabilities.tools[]` array exposed missing `maxItems` cap on `registry.register` schema — found because "5000 items" was on the pre-enumerated pathological-input list.

**Procedure** (each surface):
1. List 3-5 pathological inputs upfront in chat: types, values, encoding tricks.
2. Run each as a probe. Watch for `success: true` where you expected rejection.
3. For any unexpected pass, inspect DB persistence + downstream consumers — output-time sanitize may be present while write-time is missing (BC71 two-axes pattern).

See [[feedback_pathological_case_framing]] memory for the broader rationale.

### What to Target

| Category | What to Probe | Example |
|----------|--------------|---------|
| **Registration-Time Injection** | XSS, SQL, path traversal in stored fields | `description: "<script>alert('xss')</script>"` |
| **SSRF at Boundaries** | Cloud metadata, RFC 1918 in endpoints | `endpoint: "http://169.254.169.254"` |
| **State Transitions** | INACTIVE service calls, endpoint swap staleness | Update endpoint → call → which endpoint used? |
| **Input Stress** | Env var syntax, ID-shaped names, Unicode | `arguments: { location: "${DATABASE_URL}" }` |

### Hardening Pattern

When a test passes but reveals a defense-by-accident (e.g., `new URL()` normalizes traversal but the input wasn't validated):

1. **Note it as a finding** (not a failure)
2. **Harden**: Add explicit validation at the input layer
3. **Create verification test in next round** to confirm hardening works

```
Round N: Test 23 passes — path traversal normalized by URL constructor
  → Finding: defense-by-accident, not defense-by-design
  → Hardening: Add Zod .refine() + handler check
  → Round N+1: Test 31 verifies hardening rejects the input
```

---

## Phase 4: Policy Claims Verification

**Goal**: Verify that documentation claims match actual enforcement.
**Time**: 30-60 minutes
**Output**: Test prompt with 8-10 tests

### Process

1. **Read the domain's policy/security documentation thoroughly**
   - What does it promise? (blocked patterns, rate limits, access control, uniqueness)

2. **Map each claim to existing test coverage**

   | Policy Claim | Tested? | Where |
   |---|---|---|
   | [Claim 1] | Yes/No | [Round/Test or gap] |
   | [Claim 2] | Yes/No | [Round/Test or gap] |

3. **Filter to testable gaps**
   - Remove claims that are internal mechanics (not testable via MCP tools)
   - Remove claims already covered by previous rounds
   - Prioritize: hardening verification > uniqueness > policy workflows

4. **Write the verification test prompt**
   - Each test should reference the specific policy claim it verifies
   - Include expected behavior from the policy document

### Common Policy Claims to Verify

- Uniqueness enforcement (name, endpoint)
- Quota limits
- Approval workflows (PENDING vs REJECT vs AUTO_APPROVE)
- Whitelist enforcement (positive + negative cases)
- SSRF blocklist at all boundaries (not just registration)
- Input validation at all mutation points (not just the first one)

---

## Phase 5: Continuation & Handoff

**Goal**: Enable resumption across sessions.
**Time**: 5 minutes

### Continuation Prompt Template

When a session ends mid-cycle, create a continuation prompt:

```markdown
## Continuation: [Domain] Round [N] Tests

### Context
[1-2 sentences on what rounds have been completed and overall status]

### Key commits this session
- `[hash]` — [description]

### Files modified
- [file] — [what changed and why]

### What to do
1. Reconnect MCP (server must restart to pick up code changes)
2. Run Round [N] — Read and execute `[test prompt path]`
3. Fix any failures
4. Update test doc changelog with results
5. Commit

### Test suite status
Round 1: X/X [status]
Round N: 0/X  <- RUN THIS
Total: Y/Z

### Cleanup notes
- [Test X creates service Y — must delete after]
```

---

## Test Prompt Structure

All test prompts follow a consistent format for readability and re-runnability:

```markdown
# [Domain] — [Focus Area] Test

**Purpose**: [One sentence]
**Companion to**: [Previous test prompt] (run that FIRST)
**Time**: ~X minutes
**When to use**: [Trigger conditions]

---

## What This Tests
| Area | Tests | What It Catches |
|------|-------|-----------------|

---

## Prerequisites
- [Previous rounds pass]
- [MCP connection active]

---

## Area N: [Name] (X tests)

### Test [number]: [Name]
[Setup commands]
[Test command]
**What this tests**: [Explanation]
**Pass criteria**: [Specific, observable]
**Fail indicators**: [What failure looks like and what it means]
**Cleanup**: [If test creates data]

---

## Overall Pass/Fail
| Area | Tests | Required |
|------|-------|----------|

---

## Quick Re-Run Checklist
[All commands in sequence, copy-pasteable]

---

## Relationship to Test Suite
[Ordered list of all rounds with test counts]

---

## Changelog
### [Date] — Initial creation
[Motivation for each test area]

### [Date] — Run results + fixes
[What passed, what failed, what was fixed, commit hashes]
```

---

## Decision Framework

### When to create a new round

| Signal | Action |
|--------|--------|
| A fix changed behavior that isn't tested | New round to verify |
| Specialist recommends additional tests | Evaluate, write if warranted |
| Policy doc has untested claims | Policy verification round |
| Clean pass + no gaps identified | **Stop** — you're done |

### When to use a specialist

| Situation | Specialist |
|-----------|-----------|
| Evaluating proposed edge cases | Domain specialist (e.g., `mcp-hub-specialist`) |
| Fix touches multiple handlers | `architectural-review-specialist` |
| Fix involves security boundaries | `sec-ops-specialist` |
| Root cause unclear | `trouble-shooting-specialist` |

### When to hand off to another protocol

| Signal | Hand Off To |
|--------|------------|
| Bug found in multiple sites across codebase | `bug-class-eradication-protocol` |
| Inline patterns should be standardized | `smoke-test-sweep-standardize-protocol` |
| Full domain needs initial QA (no tests exist) | `mcp-domain-testing-methodology-v2` |

---

## Proven Results

### Hub Domain (Feb 24, 2026)

| Round | Focus | Tests | Bugs Found | Fixes |
|-------|-------|-------|-----------|-------|
| 1 | Essentials | 17 | 0 | — |
| 2 | Advanced | 12 | 0 | — |
| 3 | Edge Cases | 10 | 1 | Compliance ordering (`782a7c39`) |
| 4 | Identity/Policy | 10 | 2 | Fuzzy resolver wrong-match (`ad58fcb4`) |
| 5 | Security/Resilience | 10 | 0 | 2 hardenings (`a2a460c4`) |
| 6 | Policy Claims | 8 | TBD | Verifies hardening + policy claims |
| **Total** | | **67** | **3 bugs + 2 hardenings** | **5 commits** |

**Key pattern observed**: Round N's fixes create Round N+1's tests. The fuzzy resolver fix (Round 4) led to the security probing round (Round 5). The security probing findings led to hardening (Round 5→6). The hardening led to verification tests (Round 6).

---

## Checklist: Applying to a New Domain

```
[ ] Domain has passing essentials test (or create one — Phase 1)
[ ] Domain's handlers, validators, and policy files identified
[ ] MCP connection active and authenticated

Phase 1: Foundation
[ ] Essentials test prompt exists and passes
[ ] All failures fixed and documented

Phase 2: Edge Cases
[ ] Transformation boundaries identified (name → DB → routing)
[ ] Specialist evaluated proposed tests
[ ] Edge case test prompt written and run
[ ] Failures fixed, findings noted

Phase 3: Security & Resilience
[ ] Injection vectors probed at registration/update boundaries
[ ] SSRF tested at all mutation points (not just the first)
[ ] State transitions tested
[ ] Hardenings applied for defense-by-accident findings

Phase 4: Policy Claims
[ ] Security/policy documentation read thoroughly
[ ] Claims mapped to test coverage (gap table created)
[ ] Verification test prompt written for untested claims
[ ] All claims verified or documented as untestable

Phase 5: Handoff
[ ] Continuation prompt created if work spans sessions
[ ] Test suite relationship section updated across all prompts
[ ] All test prompts have changelogs with run results
```
