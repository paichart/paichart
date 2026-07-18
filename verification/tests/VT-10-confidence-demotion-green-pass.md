# VT-10 — Release gated on facts, not confidence scores: the green pass under the demoted-confidence regime

**Status**: VERIFIED 2026-07-18 (live lab validation, written at test time) | Re-verify trigger:
pov-program or any domain-protocol major bump; any change to the derivation-containment fact, the
agent-results summary surfacing, or the program gate formula.

## Claim under test

After a reviewer-calibration study showed that a reviewer's numeric confidence carries **verdict
direction, not correctness** (the same defect was approved at 92 and blocked at 45 on byte-identical
inputs), the platform removed confidence numbers from release-gate semantics at every tier and made
two *facts* load-bearing instead: the mechanical **derivation-containment check** (recomputed against
harvested device state, anchored to named source artifacts) and the integration reviewer's own
recomputation. This test verifies the whole regime end-to-end on a healthy run: the facts are
emitted, surfaced, retrieved, and **cited in the release computation** — and a program reaches
`programReleasable: true` with no confidence threshold anywhere in the chain.

## Method

1. Run the two-pipeline sequenced program (network provisioning → Terraform IaC) against the live
   switch fabric — same objective class as VT-09, under the updated protocols (confidence demoted;
   containment fact mandatory in the gate; authors forbidden to self-verify; reviewers required to
   construct their own containment arithmetic).
2. Release the three human approval gates only after the full roster exists; touch nothing else.
3. Verify from the run's artifacts (not its narratives): the per-leg containment facts, the program
   synthesizer's retrieval calls and gate computation, the author/reviewer contract behavior, and the
   final release facts.

## Expected observables — all seen

- **Network leg** (the deriving leg): mechanical containment fact `checked: true, violations: []`,
  with the harvest and derivation source artifacts named. The design selected a clean address pair
  and derived its minimal covering aggregate; the fact confirms no harvested allocation is covered
  by the aggregate outside its declared members.
- **Terraform leg** (a consuming leg — it derives nothing): containment fact reads the benign
  `not checked (no-derived-values-block)`. The release computation classifies this correctly per the
  gate's published taxonomy rather than treating "not checked" as either a pass or a failure.
- **The facts reached the decision-maker**: the program synthesizer's per-leg retrievals returned a
  compact `Facts:` line carrying reviewer verdict and containment fact (head-slice-safe — no verbose
  payload needed), and its gate computation **quotes the containment fact per leg**, including the
  benign-reason argument for the consuming leg.
- **No confidence threshold anywhere**: legs gate on the reviewer's terminal VERDICT (approved / no
  blocking issues); the program gates on outcomes, the containment facts, the integration reviewer's
  verdict, and chained-coverage facts. Reviewer scores are recorded beside the outcomes as
  uninterpreted facts (92/92 on this run).
- **Anti-theater contracts held**: the change package carried only the two structured evidence
  blocks (verbatim, source-named) plus the engine's required terminal confidence line — no
  self-authored verification table, no self-score attached to claims; the reviewer built its own
  span/membership check and correctly did **not** flag the engine's terminal line (the carve-out).
- **Zero interventions**: from gate release to settlement the cascade self-ran — legs sequenced,
  deliverable chained, producer and integration reviewer completed, release facts stamped:
  `programReleasable: true`, program confidence = MIN across children (88).

## Why this run was earned, not lucky

The regime it validates was hardened by three immediately preceding adversarial rounds, each of
which found and fixed a real defect before this pass: a probe run proved the containment fact was
being silently dropped by a response formatter (fixed, then observed present); an
infrastructure-outage run proved a bailing pipeline could freeze its program forever (fixed — the
platform now terminalizes a self-declared dead-end and escalates naming the true root, validated
live); and an honest-block run caught the containment taxonomy misclassifying non-deriving legs
(fixed, and this run shows the corrected benign classification). The green pass is the first run on
which every one of those nets was armed — and none fired.

## Enforcement

- Protocols: `pov-program` v1.0.12 (gate formula + taxonomy + transitive root attribution),
  domain protocols with verdict-direction approval rules, orchestrator v3.9.1 (mandatory bail stamp).
- CI pins (every commit): derivation-containment suite (incident fixtures + the reason-ordering
  pin), the non-terminal-family pins (pre-flight-bail branch + cone attribution), the
  execution-artifacts parity suite (summary-fact hoisting incl. pipeline artifacts).
- Residual: the confidence numbers remain recorded facts; any future consumer that wants to *act*
  on them must first demonstrate calibration — the study that demoted them is the standing bar.
