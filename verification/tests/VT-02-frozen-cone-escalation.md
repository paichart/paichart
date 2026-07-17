# VT-02 — A program with a non-runnable leg escalates to a human; it never hangs and never silently composes

**Status**: VERIFIED 2026-07-16 (live production run) | Re-verify trigger: pov-program protocol major bump
**Layer**: program
**Round type**: failure-injection

## Objective

When one child pipeline of a program **can never run** — its binding interface contract is missing at
execution time — the program must (1) refuse to execute that child loudly, (2) reach its synthesis
step anyway, and (3) escalate to a human, naming the failing leg, with the healthy legs' work
preserved. Explicitly ruled out: hanging forever with the program in progress (the original defect
this round exposed), and silently composing a deliverable around the missing leg.

## Method

1. Create a two-pipeline program (network provisioning + Terraform IaC) from the public design
   artifacts below; assign the Pipeline Harness; execute.
2. Let the Program Architect produce the plan + interface contract, and the plan-approval gate +
   child roster be created. Verify both pipeline children carry the interface contract.
3. **Inject the fault post-gate**: remove one leg's `inputContext.interfaceContract` (simulating a
   contract lost after human approval — the worst-case silent-composition setup), then release the
   approval gate.
4. Observe.

## Config

- topology-as-code: `https://raw.githubusercontent.com/paichart/paichart/main/program-artifacts/meridian-t4bprime/topology.json`
- requirements: `https://raw.githubusercontent.com/paichart/paichart/main/program-artifacts/meridian-t4bprime/requirements.md`
- Protocol: `pov-program` v1.0.6+ (escalation semantics), platform can-never-run handling as below.

## Expected observables

- The stripped leg is **refused before any execution row exists** (`INTERFACE_CONTRACT_MISSING`), and
  is marked `executionStatus: FAILED` with `metadata.cannotRun` + an explanatory comment — it is never
  left silently "open".
- Its downstream cone (composition/review tasks that depend on it) is marked terminal with
  `metadata.blockedByUpstreamFailure` naming the failed dependency — distinguishing casualties from
  the root cause.
- The healthy leg runs to completion; its work is preserved.
- The program re-enters synthesis (a third execution) and **escalates**: a comment naming the ROOT
  failing leg with recovery guidance, `qualityGate: { outcome: "escalated" }`,
  `programReleasable: false`, and the program left awaiting a human decision.
- Negative control (separate round, VT-03): a program whose approval gate is simply never released
  parks indefinitely with NONE of the above firing — the can-never-run machinery is anchored on a
  refused execution attempt, so an awaiting-human gate can never be misclassified.

## Results

**Defect first (published deliberately).** The initial run of this round (2026-07-15) found the
escalation was *structurally unreachable*: the refused leg stayed open, its cone never became
terminal, and the program hung in progress indefinitely — the designed escalation prose existed but
nothing could trigger it. This was recorded as a finding, designed out with a three-specialist review
panel, fixed, and re-run.

**Re-run on the fixed build (2026-07-15/16, production):** contract stripped post-gate on the
Terraform leg → within seconds the leg read `FAILED` with `cannotRun` + comment, and both downstream
tasks read `FAILED` with `blockedByUpstreamFailure` naming the leg. The network leg completed its
real-device provisioning work (preserved). Its completion retriggered the program, whose synthesis
step escalated exactly as specified: comment naming the Terraform leg as root with
restore-and-re-run guidance, `qualityGate {reviewerScore: 0, outcome: "escalated"}`,
`programReleasable: false`, program awaiting the human. No hang; no partial composition.

The gate-never-released negative control also passed: a 32-minute observation window over a parked
program showed zero queued work, zero status marks, and zero misfires from the can-never-run
machinery.

## Conclusion

**Verified live.** A program child that can never run produces a loud, attributed failure and a
human escalation with healthy work preserved — under the exact fault (post-approval contract loss)
where silent composition would be most damaging. The failure mode this round originally exposed
(permanent hang) is fixed and pinned.

## See it live

> **Note (2026-07-18)**: the live-exhibit environment is being re-cut — the current exhibit POV has been serving as the proving ground for an expanded verification round (evidence-flow hardening), and a freshly curated demo environment will replace it. The exhibit walkthroughs below describe the curated runs and will re-link when the refreshed environment is published.

A curated, permanent version of this exact round runs in the public demo POV **"pAIchart Verified
Delivery — Live Exhibits (Meridian Trading Fabric)"** as **Exhibit 2**. A read-only demo account can
open:

- **The commentary** (stable landing point): the *Results & Cross-Reference* phase → *"Exhibit 2
  results — the frozen cone, escalated with attribution"* → the assessment task. It lists the observed
  machine facts and points at the artifacts below.
- **The machine record** (untouched): the *Program Runs* phase → stage *"Program: Exhibit 2
  frozen-cone escalation"* — the refused Terraform leg (FAILED / `cannotRun`), both cone casualties
  (FAILED / `blockedByUpstreamFailure`), the completed network leg, and the program's escalation
  comment naming the root leg.

The demo run reproduced this document's expected observables exactly, with one honest addition: the
surviving network leg's own reviewer independently gated it needs-revision/35 on genuine validation
issues — so the escalation comment blocks on that leg too, not only on the stripped one. The gate
graded the work in front of it.

## Enforcement

- Protocol: `pov-program` v1.0.6+ (root-vs-casualty escalation semantics; v1.0.7 adds the coverage
  facts verified in VT-05/VT-06).
- CI pin (run on every commit): `test:cc7-contract-guard` (12 assertions — contract guard + the
  can-never-run marking, cone walk, retrigger wiring, terminal predicates unchanged).
- Behavioral round (database-level, re-run on any protocol or engine change to this path — not part
  of per-commit CI): reproduces this round's topology end-to-end (11 assertions, including refusal
  idempotency and the parked-gate exclusion).
- Residual: a program-level watchdog for hang classes with *no* event anchor is deliberately deferred
  (no such class is known); the trigger to build it is documented.
