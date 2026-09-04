# Signal Design Protocol (Fact vs. Verdict)

> **Protocol 10** | **Version**: 1.2 | **Created**: 2026-05-29 | **Updated**: 2026-07-19 (calibration-study method — how a verdict earns or loses gate authority) | **Applied by**: `architectural-review-specialist`

**Purpose**: A decision framework for any **client-facing signal an AI consumer will act on** — error messages, `nextSteps`, `_meta` hints, `retryable`/`disposition` flags, recovery guidance, confidence scores, suggested delays. It forces a written classification (fact vs. verdict) and a blast-radius weighting *before* the signal ships, so the platform never replaces a misleading signal with another unvalidated one.

---

## Executive Summary

An MCP tool's response is not data for a developer to inspect — it is an **input to a reasoner's decision loop** the platform does not control. The reasoner acts on what we say and **cannot distinguish our facts from our verdicts**. That asymmetry makes some signals safe and others quietly dangerous.

- **Fact** — a verifiable truth (`executionTime: 30000`, `recentSuccessRate: 92`, `errorType: "ETIMEDOUT"`). Wrong only as a bug: findable, fixable, bounded.
- **Verdict** — a judgment layered on facts (`disposition: "transient"`, "the service is down", a confidence score, a suggested retry delay). Can be wrong **even when every fact is correct**, because it predicts an unknown. Fails silently, for a whole class of cases, eroding trust across the surface.

**Default: ship facts. Earn verdicts.** A verdict is safe only once it is *validated* — measured against outcomes with a known error rate. The path is: ship the fact → the fact generates the data → if the data supports it, the verdict is earned.

---

## When to Use This Protocol

Apply the lens whenever a change **adds or alters what a tool tells an AI client about a failure, a recovery path, or a state the client should reason about**. Concrete triggers:

- A new field in a tool response's `_meta`, error body, `nextSteps`, or success metadata that the client is expected to act on.
- A new flag whose name implies a judgment (`disposition`, `recommendation`, `verdict`, `retryable`, `confidence`, `severity`, `suggestedRetryDelayMs`).
- Reworded recovery guidance / error categorisation (GS3 / GS7 surface).
- Any signal derived from a heuristic, threshold, model output, or average rather than a directly-observed value.

If the change only touches data a deterministic, developer-controlled consumer reads (an internal REST client, a dashboard), the lens is optional — the danger is specific to autonomous reasoners that treat the signal as authoritative.

---

## The Assessment Procedure

For each signal the change introduces or modifies:

1. **Classify: fact or verdict?** Is it a verifiable truth, or a judgment/prediction about an unknown (the future, an upstream's true state, a cause)? If a reader could in principle check it against an observation right now, it's a fact. If it requires inference, it's a verdict. *When unsure, treat it as a verdict* — that triggers the harder bar.
2. **Score the blast radius.** How many clients read it × how often × how silently × how reversibly. Recovery/error signals are maximal on all four (every client, every failure, silently believed, acting wrongly wastes or abandons work).
3. **For a fact:** ship it, provided the framing is honest along three axes: **precision** (don't claim more certainty than the value supports — an average framed as "first failure" overstates), **scope** (don't imply "recent" if the value is lifetime — or vice versa), and **freshness** (a stale aggregated number sitting next to a live signal in the same response must not contradict it). A fact whose *name* implies one thing and whose *value* delivers another is halfway to a verdict — it silently misleads the same way. State what it is, plainly. (Worked example: "fact-framing honesty" below.)
4. **For a verdict, ask: is it validated?**
   - **Validated** (measured against outcomes, known error rate) → it may ship, carrying its confidence honestly.
   - **Unvalidated** (intuition thresholds, untested heuristic, no production distribution data) → **do not ship the verdict.** Ship the underlying **fact** instead — it is the data input a future validated verdict is built from — and record the verdict as *deferred pending instrumentation*, with the specific data needed to earn it.
5. **Sanity-check against the originating failure.** If the signal exists to prevent a past incident, confirm the new signal would not *re-create* that incident when wrong (the classic trap: a recovery verdict that, in the exact failure shape, confidently points the client the wrong way). A fix that can reproduce the bug it fixes is rejected, not deferred.

## Decision Rubric (quick reference)

| Signal type | Validated? | Blast radius | Decision |
|---|---|---|---|
| Fact (precision honestly framed) | n/a | any | **Ship** |
| Fact (framing misleads — precision, scope, or freshness) | n/a | any | Reframe (rename / rescope / pair with a scope-honest sibling), then ship |
| Verdict | Yes | any | **Ship** (carry confidence) |
| Verdict | No | low (dev-controlled consumer) | Ship with caveat, or instrument |
| Verdict | No | high (AI consumer acts on it) | **Ship the fact; defer the verdict** |
| Any signal that can re-create the failure it addresses | — | — | **Reject** |

---

## Earning or Retiring a Verdict — the Calibration-Study Method

The Assessment Procedure says *ship the fact, defer the verdict until it is validated "against outcomes with a known error rate."* That is the whole game — but it leaves two questions the recovery-signals example did not have to answer, because that verdict was deferred at design time:

1. **How do you actually EARN a deferred verdict** once the fact has generated data? "Measured against outcomes" is a claim; this is the measurement.
2. **What about a verdict that was already shipping AND already gating** — one born as a gate input without ever passing the bar? (The recovery-signals case caught the verdict *before* it shipped; this catches one *after*.)

A **calibration study** answers both. It is the measurement instrument behind "validated," and it runs identically in both directions: to promote a recorded fact to gate authority, or to demote a gate input that never earned it back to a recorded fact. Five steps:

1. **Corpus.** Collect the signal's values paired with **known ground-truth outcomes** — cases where you can say independently whether the thing the signal predicts was actually true. (A reviewer's confidence vs. whether the reviewed work was actually defective; a `transient` flag vs. whether the retry actually succeeded.) The corpus must span both outcome classes; a signal only ever seen on successes proves nothing.
2. **Controlled pair.** Find or construct **two cases with equivalent inputs but divergent signal values** — ideally with *opposite* downstream verdicts. This isolates the signal from everything upstream: if the inputs are equivalent and the signal still swings, the swing is noise the consumer would have acted on. (Verify equivalence mechanically — byte-compare the inputs; do not eyeball it.)
3. **Separation test.** Ask the only question that matters: **does the signal's value distinguish good outcomes from bad ones?** Plot the signal for the defective cases against the clean ones. If the two distributions overlap — if a "good" value and a "bad" value are drawn from the same band — the signal carries **no separation**, i.e. no information beyond the verdict direction it is attached to. Separation, not plausibility, is the bar.
4. **Ruling.** Gate authority is granted **only on demonstrated separation.** If the signal separates with a known error rate, it may become a conjunct / auto-consumption input, carrying that error rate honestly. If it does not, it stays a **recorded fact** — still stamped, still shown in tooltips, still greppable — but **never a gate conjunct, threshold, or auto-consumed decision.** A number that gates without separation is a verdict wearing a fact's clothes.
5. **Transitive sweep.** If the ruling **retires** a threshold, deny it at **every tier in one sweep.** A threshold enforced at an inner tier re-imposes itself through an outer tier's "all children passed" conjunct even after the outer copy is removed. Grep the threshold's every textual home (per-domain protocol copies, role guidance, GUI render conditions, forensics recompute formulas) and prove zero survivors before committing — one surviving `>= N` makes the "removed everywhere" claim silently false.

**Not a CI gate, and not automatic.** Separation is a statistical judgement over a corpus, not a greppable property — the study is a deliberate investigation, run when a verdict is proposed for authority or when a shipped gate signal is doubted. The transitive-sweep step (5) *is* mechanically checkable and must be proven before write (Protocol 11 Part C).

### Worked Example — retiring the reviewer-confidence gate (2026-07-18)

The pipeline harness gated release on a reviewer's self-reported confidence: a leg was "approved" only if its Reviewer stamped `confidence >= 85`, and the program gate's `programReleasable` AND-ed those leg outcomes. That threshold was **a verdict that had never earned gate authority** — it shipped as a conjunct from day one on the intuition that "higher confidence = better review." The calibration study tested it:

1. **Corpus** — 16 archived reviewer verdicts across program runs 2–7, each pairable with known ground-truth (was the reviewed change actually defective? — established independently by the mechanical containment checker and by later runs).
2. **Controlled pair** — the same derivation defect (`10.99.0.0/31` claimed for members `.1`/`.2`) was **caught at confidence 45** (run 5, needs-revision) and **passed at confidence 92** (run 6, approved) by the same reviewer template. The frozen prompts were **byte-identical (10,049 bytes)**, same model / temperature / max-tokens, equivalent chained input. A **47-point swing with opposite verdicts on equivalent inputs** ⇒ the swing is the model, not a measurement.
3. **Separation test** — approvals on **defective** work carried confidences `88, 92, 92, 94`; approvals on **clean** work carried `92, 94, 94`. One band, 88–94; **five of seven approvals were exactly 92** (the model's house number for "I approve"). The distributions did not separate defective from clean at all.
4. **Ruling** — the number carries **verdict direction, not correctness.** Demoted from gate conjunct to recorded fact: `reviewerScore` is still stamped on `qualityGate` and shown in the GUI tooltip, but is **no gate input anywhere.** Gate authority moved to signals that *do* separate — the mechanical `derivationContainment` fact (recomputed against harvested ground truth) and Node C's independent recomputation.
5. **Transitive sweep** — removing `>= 85` at the program tier alone was **insufficient**: the program gate's `outcome === "approved"` conjunct re-imposed it, because a leg could only reach `approved` at `>= 85` in its **domain** protocol. Three domain-tier leg gates, the shared role guidance, and the GUI shield's green-threshold each still carried the number; all were swept in one commit and proven zero-survivor before the "confidence gates nothing, at any tier" claim was written.

The mirror image of the recovery-signals decision: that one **deferred** a verdict before it shipped; this one **retired** a verdict that had been gating unearned. Same instrument (the separation test), opposite directions. The green pass that followed (release stamped on facts, zero confidence thresholds in the chain) is the live confirmation.

Decision records: `cline_docs/reviews/evidence-flow-arc-2026-07/CALIBRATION-STUDY.md` (the study — corpus, the 45-vs-92 pair, the separation table) and `cline_docs/reviews/confidence-gate-demotion-2026-07-18/SYNTHESIS.md` (the demotion + transitive sweep, five-specialist reviewed). Cross-referenced from Protocol 13 (Program Workflow Evolution), whose "facts ship; verdicts are earned" step invokes this method.

---

## Who Applies It

- **Primary**: `architectural-review-specialist` — it owns design-decision validation and semantic-consistency review, and adjacent recovery decisions (e.g. the `resilient-call.js` timeout-exclusion). Signal classification is a design-review judgement, so it lives here.
- **Cross-referenced from**: `boundary-contract-specialist` (the tool→client response is a boundary; this lens is the *epistemic* axis complementary to its *completeness* axis) and `mcp-tool-architecture-specialist` (MCP tool output shape). Both point here; neither owns it.

## Why It Is Not a CI Gate

"Is this a fact or a verdict, and is the verdict earned?" is a semantic judgement, not a greppable property — an automated gate would give false confidence. The most a mechanical check earns is a **tripwire**: a discovery-prompt grep that surfaces *candidate* verdict-shaped fields (`disposition|recommendation|verdict|confidence|suggestedRetry`) newly added to client-facing responses and asks "did this pass the signal lens?" That is a prompt for human review, not a blocking check.

---

## Worked Example — the 2026-05-29 recovery-signals decision

The 2026-05-28 field-failure incident (a transient timeout a client followed to a wrong conclusion) produced five candidate Layer-2 signals. Run through the lens:

| Candidate | Classification | Decision |
|---|---|---|
| Timeout `nextSteps` stops pointing at the blind health check; states `/health` can't see the upstream | Fact | **Shipped** (`25dd8c9d`) |
| Honour the advertised `timeout` param (clamped); report `effectiveTimeout`/`requestedTimeout`/`timeoutClamped` | Fact (contract repair) | **Shipped** (`46562b6a`) |
| Surface the service's recent success rate on failure (`recentSuccessRate`) | Fact (existing `MCPTool.successRate` EMA) | **Shipped** (`46562b6a`) |
| Assert `transient`/`persistent` + `suggestedRetryDelayMs` | **Verdict, unvalidated** (EMA + intuition thresholds) | **Deferred** — would re-create the incident when wrong (a just-died upstream still carries a high EMA → "transient, retry" → retry into a dead service). Ship the fact; earn the verdict after instrumenting the success-rate distribution at timeout time. |
| Evict the connection + retry on a 2nd timeout | Verdict about connection state, wrong layer | **Rejected** — hub→service evict can't fix a service→upstream stale socket. |

Outcome: three facts shipped, the tempting verdict withheld, one idea rejected. Public case study: `paichart/tutorials/11-error-recovery-signals.md`. Decision record: `cline_docs/follow-ups/hub-recovery-signals-implementation-plan-2026-05-29.md`.

---

## Worked Example — fact-framing honesty (2026-05-30)

A day after the recovery-signals work landed, a *second* refinement closed a different gap: a shipped **fact** that misled by its framing.

The `services.health` response had carried `errorCount` for as long as the platform existed — a single number, no scope, no caveat. It was incremented on every failure (real call failures *and* background health pings) and never decremented. So `errorCount: 14069` on an external service reads "this service has had 14069 errors," implying recent quality. The truth: 14069 was the lifetime cumulative count, dominated by ~120 days of *phantom* failures from a probe-classification bug (the 404-as-failure miscount fixed earlier the same day). A client reading the field saw "terrible service"; the underlying reality, scoped to the last week of real calls, was "1 failure in 7 days."

Through the lens:
- It's a **fact** (the cumulative integer is verifiable) — not a verdict.
- But the **framing** is dishonest along two of the three axes:
  - **Scope**: the name `errorCount` carries no scope; a reasonable reader assumes "recent." The value delivered "lifetime."
  - **Freshness**: the cumulative number was contaminated by failures (the phantom 404s) that no longer reflected reality. The fact stayed stale even after the underlying input was fixed.

The fix wasn't to delete the field — that's a contract change with no clean upgrade path. The fix was to **add `errorCount7d`** (real call failures in the last 7 days, derived from the existing `mcp_interactions` records), surface both, and document the legacy field's lifetime semantic inline. The two facts now sit side by side; the honest one carries the meaning a client wants when they read "errors."

**The lesson generalises the lens.** Facts can mislead too — by *framing*, not just by being wrong. Same failure mode as a wrong verdict: the client acts on what the name suggests, not what the documentation says. The mitigation options:

- **Rename** to make the framing explicit (e.g. `errorCount` → `errorCountLifetime`).
- **Rescope** the field (change the meaning — contract change; usually only safe if no one depends on the original).
- **Pair** with a scope-honest sibling (`errorCount` lifetime + `errorCount7d` recent) — usually the safest if existing readers may depend on the original.

The same axes apply to **precision** (a probabilistic estimate framed as a deterministic value) and **freshness** (cf. the *recommendation:avoid* Postscript in `paichart/tutorials/11-error-recovery-signals.md`, where a stale aggregated EMA contradicted a live ping in the same response — that's the freshness axis).

Decision record / scaling lever: `cline_docs/follow-ups/interactions-retention-policy-2026-05-30.md` (retention as the right lever for the per-service `errorCount7d` query, not a composite index).

---

## Worked Example — a fact defeated by POSITION (2026-07-14)

The harness verdict-misread added a third failure axis to the lens: a fact can be perfectly framed and still
mislead because of **where it sits in the artifact**. A pipeline Reviewer's `result.json` carried its verdict
only inside a 12KB prose `finalResponse`; the SYNTHESIZE orchestrator reads that artifact through head-slice
caps (fetch 50KB → tool-loop 8KB), so the terminal `VERDICT: APPROVED` was cut from view and the orchestrator
re-manufactured a verdict from the visible opening — a provably false NEEDS-REVISION.

Through the lens:
- The fix shipped a **fact**: `reviewerVerdict` — a *transcription* of the reviewer's terminal `## VERDICT:`
  block (null when no well-formed block exists — never defaulted, or the field would fabricate the very
  false-negative it prevents; `approved` and `blocking` transcribed independently so inconsistent blocks stay
  visible).
- **Position is part of fact-framing honesty**: the field is emitted BEFORE `finalResponse` because consumers
  read through head-slice caps — a fact placed after a long prose field is a fact the consumer never sees.
  Field order is pinned by a parity-test assertion (`test-execution-artifacts-parity.ts`).
- **Ship the fact → it generates the data → earn the consumption**: a deterministic guard
  (`verdict-mismatch-guard.ts`) FLAGS a stamped `qualityGate.outcome` that contradicts the transcription
  (`verdictMismatch: true` + loud warn) but does not override — the orchestrator's rule also gates on
  confidence/escalation. The mismatch log is the evidence that earns (or refutes) Phase-2 deterministic
  consumption.

Decision record: `cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/finding.md` (three-specialist
reconciled review; the boundary-contract trace that found the truncation mechanism).

---

## Cross-references

- Public tutorial (the lens, narrated): `paichart/tutorials/11-error-recovery-signals.md`
- Field-failure diagnostic loop (the incident): `paichart/tutorials/02-addendum-the-field-failure-loop.md`
- Gold-standards (GS3 error categorisation, GS7 `nextSteps`): `paichart/tutorials/02-the-ten-gold-standards.md`
- Decision record + deferred verdict conditions: `cline_docs/follow-ups/hub-recovery-signals-2026-05-28.md` and `hub-recovery-signals-implementation-plan-2026-05-29.md`
- Earning the deferred verdict (live, instrumented): `cline_docs/follow-ups/hub-recovery-verdict-validation-2026-05-29.md` — the tracked analysis + keep-vs-remove logging decision
- Fact-framing honesty — retention policy follow-up (the scaling lever for the `errorCount7d` worked example): `cline_docs/follow-ups/interactions-retention-policy-2026-05-30.md`
- Calibration-study method worked example (retiring the reviewer-confidence gate): `cline_docs/reviews/evidence-flow-arc-2026-07/CALIBRATION-STUDY.md` + `cline_docs/reviews/confidence-gate-demotion-2026-07-18/SYNTHESIS.md`
- **This lens in production — the fact catalog**: `.claude/knowledge/patterns/agent-output-trustworthiness-defense-stack-pattern.md` is this protocol applied to agent-execution output: every detection signal is an **additive fact** in `result.json` (`errorCategory`, `protocolValidation`, `chainedContext`), never control flow — "the tool log is authoritative, the narrative is inspected." Its `chainedContext` ("coverage signal, NOT a cascade detector") and `confidenceCapped`+`originalConfidence` are worked fact-vs-verdict calls. When you ship a new fact here, that stack is where it lands and its Implementation Checklist is the how.
- Protocol 13 (Program Workflow Evolution): `.claude/knowledge/protocols/program-workflow-evolution-protocol.md` — its "facts ship; verdicts are earned" step invokes the calibration-study method here
- Applying specialist: `.claude/agents/architectural-review-specialist.md`
