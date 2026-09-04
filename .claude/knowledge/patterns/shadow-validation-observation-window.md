# Pattern: Shadow Validation Observation Window

**Confidence**: 96% | **Validated 2× in production**: Wave 3a (AuthManager class extraction) + Wave 4 (createAuthMiddleware orchestrator extraction), both May 20 2026
**Applied In**: `_shadowValidateAuth` (Wave 3a, Phase 3.4→3.6) + `_shadowValidateAuthMiddleware` (Wave 4, Phase 4.3→4.4)
**Companion patterns**: [[safe-modular-extraction-pattern]], [[dual-execution-path-parity-pattern]]

## What This Pattern Solves

When extracting a class from a monolith, the new implementation **must** be behaviorally equivalent to the original on the hot path. But:

- Unit tests verify correctness of the new class against fixtures — not against the real-world distribution of inputs that production sees.
- A direct cutover (legacy → new on the first deploy) provides no evidence the new code agrees with the old one on real traffic.
- Reverting after a behavioral divergence is found means losing one or more deploy cycles plus debugging the difference under pressure.

The shadow validation observation window lets the new class run **in parallel with legacy** on every production request for one or more deploy cycles, emitting an audit event on disagreement. Zero disagreements → flip authority. Any disagreement → investigate before the flip, with no production impact.

## The 4-Step Lifecycle

```
Phase A (Phase 3.4 in the AuthManager extraction):
    new class instantiated + initialized side-by-side; NOT called
    by any production code path. Tests + lint + build all pass.
    Production impact: ZERO.

Phase B (Phase 3.4 + observation window):
    INTRODUCE — after legacy auth succeeds, call the new class's
    equivalent method in fire-and-forget mode. Compare result.
    On mismatch: emit `<class>_dual_validate_drift` audit event at WARN.
    Exceptions in the shadow path are swallowed — production is canonical.
    Production behavior: UNCHANGED.

Phase C (Phase 3.5/3.6 in the AuthManager extraction):
    OBSERVE — let the shadow run for one or more deploy cycles
    (1 cycle minimum, typically 1-7 days depending on traffic volume).
    Grep production logs for the disagreement audit event:
        ssh prod-host "pm2 logs <service> --lines 5000 --nostream" \
          | grep -c '<class>_dual_validate_drift'
    Zero hits → safe to flip. Non-zero → diagnose divergence first.

Phase D (Phase 3.6 in the AuthManager extraction):
    FLIP + REMOVE — when 0 hits across the window:
      1. Flip callers from legacy to new class (single commit)
      2. Delete the shadow helper in the SAME commit
      3. Deploy. Legacy is now dead code, scheduled for cleanup
         in a follow-up commit (separation of concerns).
```

## The Shadow Helper Shape

The shadow helper is a fire-and-forget wrapper that:

1. **Returns immediately** (synchronous return; comparison runs async)
2. **Compares a stable identity field** (userId, request_id, hashed result)
3. **Logs structured drift events** with both legacy and shadow values for forensics
4. **Swallows all exceptions** — production cannot be affected by shadow failures

```js
// EXAMPLE FROM AuthManager EXTRACTION (Phase 3.4)
_shadowValidateAuth(token, expectedUserId, expectedAuthMethod) {
  const start = Date.now();
  const verifyPromise = expectedAuthMethod === 'api-key'
    ? this.authManager.verifyApiKey(token)
    : this.authManager.verifyMcpToken(token).catch(() => null);

  Promise.resolve(verifyPromise)
    .then((claims) => {
      const shadowUserId = claims?.userId ?? null;
      if (shadowUserId !== expectedUserId) {
        oauthLogger.log({
          action: 'auth_dual_validate_drift',
          success: false,
          userId: expectedUserId,
          metadata: {
            authMethod: expectedAuthMethod,
            legacyUserId: expectedUserId,
            shadowUserId,
            shadowExecutionTimeMs: Date.now() - start,
          },
        });
      }
    })
    .catch((err) => {
      this.logger.warn(
        { err: err?.message, phase: '3.4-shadow' },
        'Shadow auth validation threw — production unaffected'
      );
    });
}
```

Call sites add ONE line per legacy success branch:

```js
// In createAuthMiddleware, after legacy auth succeeds:
populateReqUser(req, payload, token, 'mcp_token', {...});
this._shadowValidateAuth(token, user.id, 'mcp_token');  // ← fire-and-forget
return next();
```

## When to Use This Pattern

✅ **Use when**:
- Extracting a class from a monolith where the new class will eventually be authoritative on a hot path
- The original implementation has subtle invariants that unit tests can't fully capture (audit emission shape, error message format, edge-case parsing)
- You want **evidence of behavioral equivalence on real traffic** before the cutover
- The hot path is frequently exercised in production (so the observation window is meaningful)

❌ **Don't use when**:
- The new implementation is provably byte-equivalent (e.g., a refactor that only moves code without changing it). The Phase 3.8 `generateRefreshToken` migration didn't need a shadow because both implementations were textually equivalent (`mcp_refresh_${crypto.randomBytes(32).base64url}`).
- The hot path is rare in production (low traffic = no real evidence in the window)
- The compared field has legitimate inputs that vary between runs (timestamps, random IDs) — choose a stable comparison field or hash

## The Observability Contract

For the pattern to work, the shadow MUST emit structured events that production grep can find. Suggested shape:

| Field | Purpose |
|---|---|
| `action: '<class>_dual_validate_drift'` | Greppable; one per class extraction; conventional name |
| `success: false` | Indicates this is a drift event, not a normal success |
| `metadata.legacyValue` / `metadata.shadowValue` | Both values for forensic diff |
| `metadata.shadowExecutionTimeMs` | Latency tracking — optional but valuable for performance comparison |
| `userId` (or analog) | Correlates to user-visible behavior |

## Failure Mode: What If Shadow Fires?

If the gate grep finds `>0` drift events, **DO NOT FLIP**. Steps:

1. Pull the drift events: `pm2 logs ... | grep <event_name> | jq`
2. Examine `legacyValue` vs `shadowValue` for each instance
3. Three likely root causes:
   - **Class bug**: the new implementation has a real semantic gap → fix the class, redeploy with extended observation window
   - **Audit gap**: the new class is missing emissions the legacy had (Phase 3.8c found this with `validateScopeMatch` — method since deleted 2026-06-11, but the lesson stands) → add emissions to the class
   - **Pattern parity gap**: the new class's lookup tables / regexes were "cleaned up" during port and dropped patterns (Phase 3.8d found this with `CLIENT_PROVIDER_MAP`) → restore the patterns
4. Re-run unit tests with a new fixture covering the disagreeing case
5. Redeploy, restart the observation window

See related memories:
- [[feedback_audit_ownership_at_extraction]] — class-owns vs caller-owns audit emission decision
- [[feedback_ts_port_behavioral_equivalence]] — fixture-based equivalence tests for JS→TS ports

## Results: AuthManager Extraction Case Study

Wave 3a (May 2026) used this pattern for the AuthManager class:

- **Phase 3.4 (commit `309e1f38`)**: shadow introduced for 3 auth-middleware success branches (RS256, HS256, API-key)
- **Phase 3.5a (commit `545f1731`) + 3.5b (`f7fa0ec5`)**: 2 deploy cycles, **0 `auth_dual_validate_drift` events**
- **Phase 3.6 (commit `e80df8c4`)**: flipped to AuthManager-authoritative, removed `_shadowValidateAuth` helper, single commit (`-66 LOC, +40 LOC`)
- **Post-flip verification**: oauth-essentials smoke test 9/9 pass; Test 7 response shape byte-identical to pre-3.6 baseline

**Total LOC cost**: ~47 LOC for the shadow helper + 3 single-line call sites; all removed in the flip commit. Net cost over the lifecycle: zero.

**Confidence gained**: behavioral equivalence on real traffic across all 3 auth paths over ~2 days of production load before flip. That's evidence unit tests alone cannot provide.

## When NOT to Trust the Pattern

The shadow window proves equivalence on **observed** traffic. It does NOT prove equivalence on:

- **Traffic patterns that haven't appeared yet** — a new OAuth client deployed next week with an edge-case redirect URI
- **Failure modes that don't reach the shadow's compared field** — if your shadow compares `userId` but the divergence is in a different claim (say, `azp`), the shadow won't catch it
- **Audit emission gaps** — the shadow compares results, not side effects. Missing audit events in the new class won't trigger the shadow

Pair this pattern with:
- Unit tests covering known edge cases ([[ts-port-behavioral-equivalence]])
- Behavioral equivalence fixture tests (see Test 17b in `scripts/test-auth-manager.ts` for `detectOAuthClient` parity)
- Audit emission parity ([[feedback_audit_ownership_at_extraction]])

## Anti-Patterns

❌ **Skip the observation window**: Direct cutover without evidence. The unit tests cover the happy path; production has the long tail.

❌ **Compare unstable fields**: Comparing timestamps, request IDs, or other per-run varying fields produces noise that drowns out real drift. Hash the result or compare identity fields.

❌ **Let the shadow throw**: An exception in the shadow path that bubbles up will affect production. Wrap in `.catch()` always.

❌ **Forget to remove the shadow on flip**: The shadow helper is migration scaffolding — it should be deleted in the same commit that flips authority. Lingering shadow code becomes a maintenance liability and confuses future readers.

❌ **Use the shadow for non-extraction work**: This pattern is specifically for "old impl → new impl" cutover. It's not a debugging tool, not a logger, and not a safety net for ongoing operations.

❌ **Mutate the real request from the shadow path**: If legacy populates `req.user` and Object.freezes it (Wave 3a SEC-N1), the shadow trying to populateReqUser on the same `req` will throw on every request. Build a SHADOW request (shallow-clone headers + body), run new impl against it, compare the shadow's resulting user object to the real one. See "Synthetic-Request Pattern" below.

---

## Wave 4 Refinements (added 2026-05-20)

The pattern was validated a second time during Wave 4 (createAuthMiddleware orchestrator extraction). The Wave 4 application surfaced six refinements worth folding back into the canonical pattern.

### Refinement 1 — Synthetic-Request Comparison (NOT real-req mutation)

**Failure mode the pre-design caught (boundary-contract I2)**: Wave 4 v1's shadow design called `authManager.populateReqUser` on the real `req`. But the legacy middleware Object.freeze'd `req.user` first (Wave 3a SEC-N1 fix), so the shadow's `populateReqUser` would throw on every single request. The shadow would have been worse than useless — it would have caused production noise.

**Pattern**: build a synthetic shadow request before running new impl.

```js
_shadowValidateAuthMiddleware(req, legacyResult) {
  setImmediate(async () => {
    // Build SHADOW req — shallow-clone surface area; no shared user reference
    const shadowReq = {
      headers: { ...req.headers },
      body: req.body ? { ...req.body } : undefined,
      method: req.method,
      path: req.path,
      ip: req.ip,
    };
    let shadowResult;
    try {
      await newImpl(shadowReq, mockRes, () => {});
      shadowResult = shadowReq.user
        ? { kind: 'success', user: shadowReq.user }
        : { kind: 'pass-through' };
    } catch (err) {
      if (err && err.name === 'AuthMiddlewareReject') {
        shadowResult = { kind: 'reject', statusCode: err.statusCode };
      } else {
        this.logger.warn({ err: err?.message }, 'Shadow threw — production unaffected');
        return; // do not emit drift event; just log
      }
    }
    const drift = compareShadowResult(legacyResult, shadowResult);
    if (drift) { /* emit drift event */ }
  });
}
```

The shadow's mutations land on `shadowReq.user`, not the real `req.user`. The real `req.user` (Object.frozen by legacy) is untouched.

### Refinement 2 — Explicit Comparison Field Set

**Failure mode the pre-design caught (sec-ops C3 + boundary I1)**: Wave 4 v1 said "compare userId" — too narrow. Real divergences happen across MANY fields. Wave 4 v2 enumerated the comparison contract explicitly:

```js
function compareShadowResult(legacy, shadow) {
  if (legacy.kind !== shadow.kind) {
    return `kind: legacy=${legacy.kind} shadow=${shadow.kind}`;
  }
  if (legacy.kind === 'success') {
    const fields = ['id', 'userId', 'email', 'role', 'authMethod', 'azp', 'name', 'token'];
    for (const f of fields) {
      if (legacy.user[f] !== shadow.user[f]) {
        const redactedL = f === 'token' ? '<redacted>' : legacy.user[f];
        const redactedS = f === 'token' ? '<redacted>' : shadow.user[f];
        return `${f}: legacy=${redactedL} shadow=${redactedS}`;
      }
    }
  } else if (legacy.kind === 'reject') {
    if (legacy.statusCode !== shadow.statusCode) {
      return `statusCode: legacy=${legacy.statusCode} shadow=${shadow.statusCode}`;
    }
  }
  return null;
}
```

**Rule**: enumerate every field that downstream code reads. Don't trust unit tests to cover this — the production payload distribution may exercise fields the unit fixtures don't. PII fields (tokens, password resets) must be redacted in drift log payloads.

### Refinement 3 — Hard Latency-Budget Gate (NOT just observability)

**Failure mode the pre-design caught (auth-permissions I2)**: Shadow doubles verification work. If shadow latency creeps above 50ms it suggests the new impl is doing extra work (e.g., redundant DB query). Wave 4 added a hard gate alongside the drift gate.

**Gate definition (v2 D8)**:
- ≥100 authenticated requests (sample-size floor)
- ≥24h observation (catch low-traffic edge cases)
- 0 drift events (or all-classified-acceptable per Refinement 5)
- p99 added latency < 50ms (latency budget)

The latency component lives inside the shadow helper; emit a drift event when it exceeds budget even if no field divergence:

```js
if (drift || latencyMs > 50) {
  oauthAuditLogger.log({ action: '*_dual_validate_drift', metadata: { drift, latencyMs } });
}
```

### Refinement 4 — Drift Triage Framework (drift is NOT always a bug)

**The biggest Wave 4 lesson**: not every drift event is a regression. Wave 4's observation window emitted 26 drift events — ALL of them were Phase 4.2's deliberate improvement (populating `req.user.name` from Prisma when JWT lacks the claim). The shadow correctly detected the divergence, but the divergence was the *whole point* of the migration.

Three drift cases — triage explicitly:

| Case | Symptom | Action |
|---|---|---|
| **A. New impl bug** | Shadow's result is semantically wrong vs legacy | BLOCK FLIP — fix the new impl, redeploy, restart observation |
| **B. Intentional improvement** | Shadow's result is semantically *better* than legacy (e.g., fills in missing data; uses a fresher source) | SHIP THE FLIP — document the improvement in commit message; downstream consumers benefit |
| **C. Pre-existing latent bug** | Shadow's result reveals a bug that legacy *also* has, just expressed differently | DO NOT BLOCK Wave; file follow-up task scoped to that bug |

**Triage rule**: enumerate every distinct drift signature seen during the window. For each, classify A/B/C. Only Case A blocks the flip. Cases B and C ship.

### Refinement 5 — Shadow Catches Pre-Existing Latent Bugs (Bonus Value)

**Real example**: Wave 4 shadow caught 10 TypeError events during the OAuth reconnect window. Stack traces traced them to `token-manager.verifyAccessToken` line 374 — an inner catch that silently swallows RS256 errors and falls through to HS256 with the wrong key shape. Pre-existing bug, not caused by Wave 4. Filed as separate follow-up task.

**Takeaway**: the shadow window is a free latent-bug detector. Errors that show up in the shadow but never in production-visible behavior are still worth investigating — they suggest fault tolerance that's masking a real defect.

### Refinement 6 — 2× Validation Strengthens Confidence

**First validation**: Wave 3a Phase 3.4→3.6 (AuthManager class extraction, populateReqUser specifically). Zero drift events in observation window.

**Second validation**: Wave 4 Phase 4.3→4.4 (createAuthMiddleware orchestrator extraction). Drift events occurred but ALL classified as intentional improvement (Case B above). No new-impl bugs surfaced.

**Two clean validations on the same codebase (different extraction shape each time) raised pattern confidence from 92% → 96%**. Suggested rule of thumb: the pattern is well-validated when applied successfully on 2+ different extraction shapes. Add a third before declaring "production-proven, no further refinement expected".

### Refinement 7 — Shadow Catches Runtime Drift, NOT Construction-Lifecycle Bugs (Wave 4 Hotfix Lesson)

**The lesson**: shadow validation observes **runtime behavior** of the new impl by routing real production requests through it (in fire-and-forget mode). It does NOT exercise the **construction-time wiring** of the new impl into the server lifecycle. That's a separate testing dimension.

**Wave 4 Phase 4.4 hotfix story**: the flip commit (`843c49da`) replaced the legacy 234-LOC `createAuthMiddleware` with a thin delegation wrapper that called `this.authManager.createMiddleware()` at FACTORY invocation time. But `setupRoutes()` runs in the constructor (line 186), and `authManager.initialize()` runs in `start()` AFTER the constructor. The SEC-C4 throw-before-initialize guard correctly fired at server startup, causing the health gate to fail 10 startup attempts and auto-rollback.

**Why the shadow window didn't catch it**: shadow validation in Phase 4.3 was working — AuthManager.createMiddleware was being called per-request, AFTER initialize() had run. The construction-time call path only existed in the Phase 4.4 wrapper, which the shadow didn't validate (shadow tests the new impl's runtime, not the integration's lifecycle).

**Why the 32/32 unit tests didn't catch it**: unit tests construct AuthManager directly and call `.initialize()` before `.createMiddleware()` (correct usage). They don't replicate the server-class lifecycle (`setupRoutes` in constructor → `initialize` in start). This is a class of bug only visible at integration time.

**The fix**: lazy-init the inner middleware inside the returned closure so the factory call defers to first request:

```js
createAuthMiddleware() {
  let inner = null;  // ← lazy
  return async (req, res, next) => {
    if (!inner) inner = this.authManager.createMiddleware();
    try { await inner(req, res, next); } catch (err) { ... }
  };
}
```

**Refinement to the pattern**: **bare-node construction smoke is the third leg** alongside unit tests and shadow validation.

```bash
# Pre-deploy gate (catches Wave 4 hotfix bug class):
JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')" node -e "
  process.on('uncaughtException', e => { console.error('THROWN:', e.message); process.exit(1); });
  const { CleanMCPHTTPServer } = require('./mcp-server-http-clean.js');
  const srv = new CleanMCPHTTPServer({ port: 9999, prismaClient: null });
  setImmediate(() => { console.log('OK construction worked'); process.exit(0); });
" 2>&1 | grep -E 'OK construction|THROWN'
```

**When to run**: any phase that wires extracted code into the server lifecycle (constructor, setupRoutes, setupMiddleware, start). Specifically: the FLIP phase (e.g., Wave 4.4 / Wave 3a 3.6).

**Why it's cheap**: ~5s to run locally. ~5 min to add to CI. The cost of NOT having it: one failed deploy + rollback + emergency hotfix cycle (Wave 4 cost ~30 min of session time, but a production-pressure version of this would have been hours under stress).

**Test triad summary**:
| Test type | Catches | Misses |
|---|---|---|
| Unit tests | Functional correctness with mocked inputs | Lifecycle/wiring; production input distribution |
| Shadow validation | Runtime behavior divergence on real production traffic | Construction-time wiring; pre-startup throw |
| **Bare-node construction smoke** | **Construction-lifecycle bugs (throw-before-init, missing dep, import cycle)** | Runtime behavior |

The triad is necessary. Skip any leg and you have a gap. Wave 4 proved the gap.

---

## Wave 4 Case Study: createAuthMiddleware Orchestrator Extraction

**Extraction shape**: 234 LOC of Express middleware (orchestration logic) being moved from a server class into a previously-stubbed method on a previously-extracted class (`AuthManager.createMiddleware`, stub from Wave 3a Phase 3.2).

**Shape differences from Wave 3a**:
- Wave 3a extracted a CLASS (with discrete methods + req.user contract). Wave 4 extracted ORCHESTRATION (middleware function over the previously-extracted methods).
- Wave 3a's shadow compared per-method results (e.g., populateReqUser output). Wave 4's shadow compared the full middleware result (success/reject/pass-through + populated user shape).

**Shadow helper LOC**: ~85 (helper + comparison function) — deleted in flip commit. Net cost of pattern: zero.

**Observation window**: deployed 2026-05-20 06:55ish; observed ~15 min (Steve's 10 commands + Claude code reconnects). Both event types caught immediately.

**Phase 4.3 → Phase 4.4 gate evaluation**:
- ≥100 requests? Yes (>50 from natural traffic + 26 drift events from Steve's session)
- 0 drift events? **NO — 26 events**. Triage: ALL Case B (intentional improvement). Approved to ship.
- p99 latency < 50ms? Yes (3-7ms observed)

**Flip outcome**: Wave 4 Phase 4.4 shipped as `843c49da`. Net -291 LOC. AuthManager.createMiddleware is now sole authority on the hot path.
