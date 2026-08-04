# VT-10 — Release gated on facts, not confidence scores: the green pass under the demoted-confidence regime

**Status**: VERIFIED 2026-07-18 (live lab validation, written at test time); **RE-VERIFIED 2026-08-04**
after the containment batch — the named trigger fired twice over (pov-program 1.0.29, network 1.2.4, and
substantial changes to the derivation-containment fact itself). Run 25 reached `programReleasable: true`
on mechanical facts with every new check armed and none firing. ⚠️ **This re-verification was written
from stamped artifacts a day after the run, not at test time** — see the honesty note in that section.
| Re-verify trigger: pov-program or any domain-protocol major bump; any change to the derivation-containment
fact, the agent-results summary surfacing, or the program gate formula.

## Claim under test

After a reviewer-calibration study showed that a reviewer's numeric confidence carries **verdict
direction, not correctness** (the same defect was approved at 92 and blocked at 45 on byte-identical
inputs), the platform removed confidence numbers from release-gate semantics at every tier and made
two *facts* load-bearing instead: the mechanical **derivation-containment check** (recomputed against
harvested device state, anchored to named source artifacts) and the integration reviewer's own
recomputation. This test verifies the whole regime end-to-end on a healthy run: the facts are
emitted, surfaced, retrieved, and **cited in the release computation** — and a program reaches
`programReleasable: true` with no confidence threshold anywhere in the chain.

## One principle, applied twice

Both halves of this regime come from a single rule: **the model never self-certifies what it cannot
reliably do.** A reviewer's confidence score is the model grading its own correctness — the
calibration study proved it can't (it approved a real defect at 92/100). Subnet arithmetic is the
same class of thing: a `/31` prefix covers exactly two addresses — `10.99.0.0` and `10.99.0.1` — so a
design that picks `.1` and `.2` and claims `10.99.0.0/31` covers both is *wrong*, because `.2` falls
outside that block. An LLM reviewer approved that exact error at confidence 92; a deterministic check
rejects it every time. So the platform lets the model **design** the addressing and **reason** about
the change, but the arithmetic that gates release is recomputed **in code, against harvested ground
truth — never taken on the model's word.** Confidence out of the gate and containment checked in code
are the same decision.

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


---

# Re-verification — Run 25, 2026-08-04

**Task**: `cmsdt6tkx0003yxom1ncoraiy` — "Westpac sequenced telemetry-export authorization (Run 25)",
COMPLETED 2026-08-03 22:36 UTC.

⚠️ **Honesty note, and it is the reason this section exists in this form.** Every other round in this
series was written up *at test time*, which is a standing rule here precisely because a reconstruction
inherits the writer's hindsight. **This one was not.** It is reconstructed from stamped artifacts a day
later. The facts below are machine-stamped and independently checkable, and nothing here is recalled
rather than read — but this round committed no observables in advance, so it cannot carry the same weight
as VT-01..VT-14. It is recorded as **evidence that the claim still holds**, not as a fresh test of it.

## Why the trigger fired

VT-10's re-verify trigger names *"pov-program or any domain-protocol major bump; any change to the
derivation-containment fact"*. Between the original verification and this run, **all three** moved:

- `pov-program` → 1.0.29, `network-provisioning` → 1.2.4, `terraform-iac`/`kubernetes-gitops` → 1.0.5,
  `pipeline-orchestrator` → 1.4.0.
- The containment fact gained a mechanised `consumed-value-mismatch` class, a new
  `derived-value-orphaned` class, and `containmentDisposition` — a structured
  `blocking | benign | needs-node-c` arm with its inputs carried alongside.

A green pass therefore had to be re-demonstrated on a build where substantially more could block it.

## Stamped facts

```
programReleasable        : true
programConfidence        : 91      ·  confidenceScore: 88
legs                     : network P1 + terraform-iac P2 — both APPROVED
derived aggregate        : 10.99.0.0/31, MATCHING across both legs
Node C integration review: APPROVED, 0 blocking
```

## What this does and does not show

**Does**: the claim survives the containment batch. Release was reached on mechanical facts — matching
derived aggregates across two independently-run legs, containment clean, an integration review with zero
blocking issues — with every new check armed and **none of them firing**. The two legs agreeing on
`10.99.0.0/31` is the load-bearing fact: the aggregate was derived twice, in different domains, and
matched.

**Does not**: prove the new checks work. A clean run exercises the *negative* path only — it shows they
do not fire spuriously, which is a real and easily-underrated property (a containment class that blocks
correct work is worse than none), but it is not evidence they block when they should. That evidence is
VT-12 (`prefix-not-minimal`), VT-13 (the conjunct blocking while every other signal said release) and
VT-14 (`unsupported` acted on at program tier) — all reached by **manufacturing the input error, never
the verdict**.

**Unresolved, and recorded rather than guessed**: this run's two legs are also the first legs under the
new validation-shape constraint (fenced blocks per command; tables forbidden). The running tally in
`cline_docs/follow-ups/session-residuals-2026-08-04.md` reads *"2 legs measured post-change, both green"*
without naming which run produced them, so **whether these two are those two, or two more, cannot be
settled without reading the artifacts.** Not counted here in either direction.
