# VT-06 — An end-to-end program releases only when every machine fact says so

**Status**: VERIFIED 2026-07-16 (live lab validation + a curated demo exhibit) | Re-verify trigger: pov-program or pipeline-orchestrator major bump
**Layer**: program
**Round type**: functional (green path)

## Objective

The positive counterpart to the failure rounds: a program with two healthy legs runs end-to-end and
is stamped **`programReleasable: true`** — and every fact behind that stamp is inspectable and
correct. The claim under test is specifically that release is a *deterministic function of machine
facts* (child outcomes, reviewer verdicts, coverage facts, MIN confidence), not a narrative judgement.
"Completed" is not the bar; **releasable by the facts** is.

## Method

1. Run a two-pipeline program (network provisioning + Terraform IaC) with both descriptors valid and
   no injected faults.
2. Release the plan gate once (human).
3. Verify the full release fact-set: every child outcome, the reviewer verdict, the coverage facts,
   the engine-computed confidence, and the composed deliverable.

## Config

- Two-pipeline program; validation used `meridian-t4f`, and the curated demo uses `meridian-demo-ex1`.
- Protocol: `pov-program` v1.0.7 + `pipeline-orchestrator` v3.9.0 (the non-terminal-family batch build).

## Expected observables

- Each child quality gate: `outcome: approved`. (The reviewer score is recorded alongside as a fact;
  since 2026-07-18 it is not a gate input — the recorded run predates that and also cleared the
  then-active ≥ 85 bar.)
- Coverage facts on the synthesis nodes: `predecessors === chainCapablePredecessors`,
  `degradedPredecessors: 0`, `notChained: []` — every chain-capable predecessor chained its real
  `report.md`.
- The **settledness proof**: a downstream consumer is queued *after* its predecessor's deliverable
  commits, not before.
- `programConfidence` = the engine-computed **MIN** of the legs' confidences.
- `programReleasable: true`; a composed program deliverable extracted; and (the safety invariant) no
  change actually applied to the live infrastructure.

## Results

**Lab validation — T4f (2026-07-16, program `cmrmnadk7…`):** this run live-validated the whole
non-terminal-family batch. Coverage facts on both synthesis nodes read `predecessors: 2 /
chainCapablePredecessors: 2 / degradedPredecessors: 0` — the never-executing hold node sat in the raw
edge count but NOT the gate denominator (no false-block). The **settledness proof landed as an
84-millisecond margin**: the network leg's `report.md` committed at 22:31:11.042, and the producer
execution was created at 22:31:11.126 — 84ms *after* the deliverable, versus 13.5 seconds *before* it
on the pre-fix build (VT-05, F18). Engine-computed `programConfidence: 45` = MIN(network 92, terraform
45). (T4f's terraform leg escalated on unrelated rig drift, so its own headline was a correct
*block* — but every green-path fact above was validated on its healthy leg and the coverage machinery.)

> **Note (2026-07-18, re-cut complete)**: the exhibit POV has been re-curated — the verification-round proving-ground runs are removed, and the evidence-flow round's clean pass is installed as **Exhibit 5** (VT-09). The walkthrough below is current.

**Curated green run — Demo Exhibit 1 (2026-07-16, program `cmrmr35q2…`), the clean end-to-end:** both
legs approved / 92; program integration reviewer VERDICT APPROVED, no blocking issues, confidence 93;
coverage facts `chainCapablePredecessors: 2 / degradedPredecessors: 0 / notChained: []`;
engine-computed `programConfidence: 90` = MIN(90, 94); `programReleasable: true`; composed program
deliverable extracted. This is — on the record — the **first program run to reach a genuine
programReleasable: true** through the same gate that blocked the failure rounds. The change was never
applied: the designed Loopback7 interface does not exist on the switches.

**Honest footnote:** the demo green run's network-leg synthesis step truncated twice on the model's
output-token ceiling and was re-executed by the operator (third attempt completed) — a known engine
limitation documented and diagnosed separately; the reviewer's approved/92 verdict was on record from
the first pass and no gate was softened.

## Conclusion

**Verified live.** A healthy program reaches `programReleasable: true` only when every child outcome
is approved, the reviewer verdict is approved, coverage is clean, and the settledness margin is
positive — the same deterministic gate that said NO to the failure rounds said YES to this one. That
symmetry is the claim.

## Enforcement

- Protocol: `pov-program` v1.0.7 + `pipeline-orchestrator` v3.9.0.
- CI pins (every commit): `test:nonterminal-family` (settledness predicate, coverage facts,
  engine-computed confidence), `test:reactor-race-guard`, `test:cc7-contract-guard`,
  `test:chained-context-signal`.
- Residual: the output-ceiling truncation on heavy synthesis turns is a known engine limitation under
  active fix (raise the ceiling + make a truncation a first-class fact); it forces an operator
  re-execute but never softens a gate or fabricates a completion.
