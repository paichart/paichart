# VT-04 — A needs-revision child blocks the program release, keyed on OUTCOME not score

**Status**: VERIFIED 2026-07-15 (two independent live occurrences) | Re-verify trigger: any change to the program release-gate AND-rule
**Layer**: program
**Round type**: functional (negative path)

## Objective

`programReleasable` is a deterministic AND over the child quality-gate facts. The claim: a child
whose quality gate reads **needs-revision** forces `programReleasable: false` — and the gate reads the
**outcome**, not just the reviewer score, so a high reviewer score cannot rescue a needs-revision
outcome. Explicitly ruled out: a program that releases with a non-approved child because the child's
numeric score happened to be high.

## Method

1. Run a two-pipeline program where one leg's own reviewer returns **needs-revision** (organically or
   by objective design), ideally with a **high** reviewer score attached, and the other leg approved.
2. Observe the program's stamped release facts and which leg limits them.

## Config

- Two-pipeline (network + terraform) programs; the occurrences used the T3 and T4b-v2 runs.
- Protocol: `pov-program` v1.0.1+ (MIN aggregation) → the D5 AND-rule reads `outcome`.

## Expected observables

- `programReleasable: false` whenever any child's quality-gate `outcome` is needs-revision.
- The program `qualityGate.reviewerScore` is the **MIN** across children.
- The blocked leg is named; the approved leg's work is preserved (not discarded).
- Critically: a needs-revision child with a reviewer score **≥ 85** still blocks — the gate keys on
  `outcome`, and `outcome` is not derivable from the score alone.

## Results

**Occurrence 1 — T3 (2026-07-15, program `cmrlimjzz…`):** the terraform leg's Plan Policy Reviewer
honestly gated **needs-revision / 72** (network leg approved / 92). The program SYNTHESIZE read the
structured facts and stamped `programReleasable: false`, `qualityGate: needs-revision / 72` (MIN),
named the limiting leg, and completed honestly — no override, no auto-approve around the red leg.

**Occurrence 2 — T4b-v2 (2026-07-15, program `cmrlwk92b…`), the sharper test:** the terraform leg came
back **needs-revision with reviewer score 95** (network leg approved / 92). The program stamped
`programReleasable: false` and `qualityGate.reviewerScore` = MIN = 92. **The 95 did not save the leg**
— because its `outcome` was needs-revision. This is the exact discrimination the claim needs: the gate
reads outcome, not just score ≥ 85. The network leg's approved work was preserved.

## Conclusion

**Verified live, twice**, including the decisive high-score-needs-revision case. A non-approved child
blocks the program regardless of how high its numeric score is, because the release AND-rule consumes
the outcome fact.

## Enforcement

- Protocol: `pov-program` v1.0.1+ (D5 AND-rule reads outcome; program confidence/score = MIN).
- CI pins: `test:nonterminal-family` and `test:cc7-contract-guard` guard the release-fact plumbing;
  the outcome-vs-score discrimination is exercised by the coverage-fact tests in
  `test:nonterminal-family`.
- Residual: none specific to this claim; the coverage-fact consumer that complements the outcome gate
  is verified separately in VT-05/VT-06.
