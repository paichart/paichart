# Multi-Specialist Dead-Code Deletion Pattern

**Type**: Process & Workflow Pattern (reduce-then-defer scope split)
**Confidence**: 95% (production-validated 2026-05-18)
**Status**: Active
**Created**: 2026-05-18 (extracted from U2 Path A + Path B v3)
**Last Updated**: 2026-05-18

---

## Problem

A specialist review finds that a code block has no consumers, but the same review also surfaces strategic improvements at adjacent sites that *touch* the dead code's neighborhood. The temptation is to bundle the deletion with the strategic refactor into one commit — but that:

1. Inflates the change surface (single commit becomes hard to review)
2. Adds risk to a verified-safe deletion (the strategic refactor's bugs become deletion's bugs)
3. Delays the deletion behind whatever blocks the refactor
4. Forces synchronous decision-making on strategic items that might benefit from separate review

## Pattern

**Ship the minimal deletion as its own commit. Defer all strategic work into a pre-scoped follow-up document with pre-loaded specialist roster.**

### Required conditions

- **N ≥ 2 specialists** independently confirm the code is dead via **static-analysis trace** (not log instrumentation, not "I think it's unused")
- Each specialist runs their discovery prompt before reviewing (`feedback_specialist_discovery_first`)
- The deletion is scoped to ≤ a few related files (single responsibility)
- All Critical findings from the review are either folded into the deletion OR captured in the follow-up with file:line refs

### Deliverables

1. **Deletion commit** — minimal change, follow-up docs link recorded in commit message
2. **Follow-up doc** at `cline_docs/follow-ups/<topic>-<date>.md` with:
   - Every site listed (per `feedback_phantom_canonical_audit`: re-grep, don't trust the headline)
   - Strategic findings grouped by theme
   - Pre-loaded specialist roster for next session
   - Open decisions tagged for the human to make before next session picks up
3. **Traceability matrix** at `cline_docs/reviews/<topic>-<date>/confidence-assessment-roundN.md` — every Critical/Important/Nice-to-have mapped to folded/deferred-with-reason/rejected-with-reason

### Per-round confidence math

- **Round 1**: scope is the original (ambitious) plan. Specialists surface that scope is wrong → recommend reduction.
- **v2 plan**: minimal scope. Re-review with same + fresh-eyes specialists.
- **Round 2**: target 95%+ post-edit projection. If achieved, no round 3 needed (`feedback_specialist_recommendation_audit` — but verify long-tail captured, not just headline).
- **v3 plan**: if the round 2 confidence assessment had headline-only treatment, audit the actual review files independently and fold the long-tail.

## Examples

### Production-validated executions

**U2 Path A** (commit `ec04a853`, 2026-05-18):
- Target: `oauth-service.ts:135-150` HS256 mint
- Specialists: oauth-multi-provider (round 0)
- Deletion: web-OAuth dead-code path
- Follow-up: `cline_docs/follow-ups/u2-mcp-oauth-validator-hs256-to-rs256-migration-2026-05-18.md`

**U2 Path B v3** (commit `9b2c2d08`, 2026-05-18):
- Target: `mcp-oauth-validator.js:511-533` HS256 mint
- Round 1: 4 specialists (oauth-multi-provider, oauth-multi-client, sec-ops, boundary-contract)
- Round 1 outcome: scope reduction (boundary-contract Critical #2+#3) → v2 plan
- Round 2: 5 specialists (sec-ops, architectural-review fresh-eyes, auth-permissions fresh-eyes, oauth-multi-provider, oauth-multi-client)
- Round 2 outcome: 96.6% post-edit projection
- v3 plan: long-tail audit found 15+ items missed in round 2 headline → folded into v3
- Final ship: 96.6% projection achieved, zero Critical findings
- Follow-up: `cline_docs/follow-ups/u2-audience-tightening-2026-05-18.md` (8 sites + 4 strategic themes + Option α decision recorded)
- Closure artifact: `cline_docs/closures/u2-path-b-v3-static-analysis-trace-2026-05-18.md`

## Anti-patterns

### Don't bundle deletion with strategic refactor

The U2 v1 plan (superseded) bundled the dead-code delete with 8 downstream consumer refactors + audience tightening + helper extraction. Round 1 review took 4 specialists × ~2 hours to surface that:
- The downstream sites don't depend on the upstream deletion
- The deletion alone is verified-safe via static analysis
- Strategic work needs its own session with its own decision points

**Cost of bundling**: 1 specialist round wasted on the wrong scope.

### Don't trust the headline summary of multi-specialist reviews

`feedback_specialist_recommendation_audit`: round 2's confidence assessment for U2 Path B v3 had headline-only treatment. An independent re-read of the 5 review files found 15+ items missed (3 stale-comment sites, 6 forward-looking tickets, 4 docs hygiene items, 2 commit-message context items). The headline 96.6% was correct; the action list under it was incomplete.

**Mitigation**: after each multi-specialist round, audit independently by reading every review file and building a finding-by-finding traceability matrix. The headline only tells you whether the deletion is safe — it doesn't tell you what else came out of the review.

### Don't run log-based canaries when static analysis can answer

`feedback_grep_before_instrumentation`: U2 Path B v1's Phase 0 prescribed a 24-48h instrumentation patch to observe whether `user.token` was ever consumed downstream. Boundary-contract round 1 resolved the question in minutes via a callback-handler trace.

**Mitigation**: in the round 1 commission prompt, explicitly require static-analysis trace before runtime canary. Runtime canary is a fallback when static analysis is inconclusive, not a default.

## When NOT to use

- **N = 1 specialist confidence**: get a second independent reviewer first
- **Dead code that touches a public API surface**: even if no internal consumers, external callers may exist
- **Dead code older than the current architecture era**: it may be load-bearing for migration paths not yet completed (check the JWT key rotation runbook for examples)
- **No follow-up doc would emerge**: if the strategic work is genuinely orthogonal (different file, different concern), file it as a separate ticket, not a "follow-up"

## Validations

- `feedback_dont_boil_ocean` — ship the minimal, defer the rest
- `feedback_grep_before_instrumentation` — static analysis over runtime canary
- `feedback_phantom_canonical_audit` — re-grep don't trust headlines
- `feedback_specialist_recommendation_audit` — audit the long-tail
- `feedback_specialist_discovery_first` — each specialist runs discovery before reviewing
- `feedback_prefer_more_specialists` — 3+ default, fresh-eyes valuable in round 2

## Related Patterns

- `post-change-specialist-review-pattern.md` — two-pass review (system-reviewer → domain)
- `specialist-knowledge-propagation-pattern.md` — closing the self-improvement loop
- `safe-modular-extraction-pattern.md` — the inverse: structuring refactors when they ARE on the critical path

---

**Pattern Status**: Production-validated (2 production deletions, 9 specialist reviews across 2 rounds)
