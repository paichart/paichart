# VT-15 — cross-domain evidence contract: unconditional harvest block, honest empty-pool classification

**Status**: VERIFIED 2026-08-16 | Re-verify trigger: `terraform-iac` protocol bump touching the
Derivation-evidence section, or any change to `computeContainmentDisposition`'s
`no-derived-values-block` arm
**Layer**: pipeline
**Round type**: functional

## Objective

Two falsifiable claims, tested together because the second only matters if the first holds:

1. A domain newly ported into the derivation-evidence contract (`terraform-iac` v1.2.0) emits its
   `## Harvested Allocations` block **unconditionally** — including on an objective that derives
   nothing, where emitting the block is pure cost to the agent and omitting it would be invisible.
2. The mechanical tier classifies the resulting **empty pool honestly**: benign, with a reason
   distinct from "no block emitted" — so a non-deriving objective is neither false-blocked nor
   silently indistinguishable from a leg that ignored the contract.

Wrong behaviors explicitly ruled out: the run must not be **blocked** by the containment fact
(the pre-fix disposition classified this exact shape `blocking / 'refusal-or-drop'` — a false
refusal verdict on the commonest Terraform objective class); and it must not classify
`needs-node-c` (an empty pool has no audit-vs-refusal ambiguity to escalate).

Why this round exists: until this port, the mechanical containment tier was anchored to a marker
only the network-provisioning protocol emitted. A standalone Terraform leg deriving a subnet CIDR
from harvested VPC state was classified **benign** — indistinguishable from a leg with nothing to
derive. Extending the contract cross-domain required proving the extension does not false-block the
non-deriving majority first; the deriving direction is a later round.

## Method

1. Bring up the LocalStack Terraform rig (the same estate as prior rounds: `aws_s3_bucket.app_logs`
   plus an in-state `random_password` secret), fronted by the read-only `state_list`/`state_pull`
   service, self-provisionable from the published descriptor.
2. **Author the expected observables before the run** (the table below is transcribed from the
   pre-run document, not reconstructed).
3. Create one PIPELINE task with a **non-deriving** objective — the protocol's own recommended
   shape: *"Add versioning and a public-access-block to the acme-app-logs S3 bucket in the prod
   workspace (protocol: terraform-iac)"* — descriptor URL in the body. Execute; no other input.
4. Read the machine record: the harvester's final output, the author's package, the reviewer's
   terminal verdict, and the `derivationContainment` fact stamped in the run's `pipeline-index.json`.

No fault is injected; this is the green-path round for the ported contract.

## Config

- Protocol: `terraform-iac` **v1.2.0** (the Derivation-evidence port: Phase-0 unconditional
  harvest block with a stated pool boundary; Phase-1 derived-values block; Phase-2 evidence-carry
  mandatory-when/forbidden-otherwise; Phase-3 construct-never-copy)
- Descriptor: `descriptors/terraform-readonly-descriptor.json` (this repository, raw URL)
- Objective: as in Method step 3 — S3-only scope, nothing derivable
- Run label: **Run 20260816-0734**

## Expected observables

| # | Observable | Expected |
|---|---|---|
| 1 | Harvester final output | carries `## Harvested Allocations` — emitted despite nothing to list |
| 2 | Block content | parses as an empty set (S3-only scope has no CIDR/ASN); the surrounding prose names the workspace read |
| 3 | Design output | no `## Derived Values` block |
| 4 | Author package | no `## Pre-existing Allocations` section (evidence is FORBIDDEN when nothing is derived — an evidence block with no derivation to support invites invention) |
| 5 | `derivationContainment` fact | `checked: false`, `reason: 'no-derived-values-block'`, `harvestedCount: 0` — parsed-empty, provably distinct from block-absent |
| 6 | `containmentDisposition` | **`benign / 'harvested-pool-empty'`** — not `blocking`, not `needs-node-c`, and not the block-absent reason `'nothing-to-derive'` |
| 7 | Reviewer | terminal `## VERDICT:` block; approval gates on verdict direction |
| 8 | Pipeline outcome | approved and not parked by containment |
| 9 | Registration lifecycle | service self-provisioned from the descriptor and torn down at synthesis; registry identical before/after |

The pre-run document also pre-committed the failure interpretations — in particular that
observables 5+6 are what distinguish "the contract bound" from "the contract was ignored": both
endings are green, with **different reasons** (`harvested-pool-empty` vs `nothing-to-derive`).
A run that only checked "did it pass" could not tell them apart.

## Results

Run 20260816-0734, ~3m45s end to end, all four legs green. **9/9 observables met**, the decisive
ones byte-exact:

- The harvester ended its output with the block and restated the rule's rationale unprompted:
  *"No CIDR or ASN values were observed in the S3-only scope … Per protocol: this block is
  unconditional when Phase 0 runs; the empty result is …"* — the contract **bound on its first
  live exposure**.
- The stamped fact: `reason: 'no-derived-values-block'`, `harvestedCount: 0`,
  `containmentDisposition: { disposition: 'benign', reason: 'harvested-pool-empty',
  inputs: { harvestedCount: 0, violationCount: 0, unsupportedCount: 0 } }`.
- Reviewer terminal block verbatim: `## VERDICT: APPROVED / Blocking issues: none / Confidence: 94`;
  pipeline approved at 93; nothing fabricated (observables 3/4 both absent, as required).
- Registration torn down; registry identical before and after. The in-state secret was never read
  at all — the narrow-read discipline scoped the harvest to the S3 objective, which is a stronger
  outcome than the expected redaction (the secret had no path into any context).

The counterfactuals this round retires are code states, not hypotheticals: on the disposition
logic as it stood two weeks earlier, this exact green run would have stamped
**`blocking / 'refusal-or-drop'`** — a false refusal verdict — and on an intermediate state,
`needs-node-c` on every bucket-shaped objective. The reclassification (an empty pool has no
refusal ambiguity; a non-empty pool with no derivation **escalates rather than asserts refusal**)
shipped with regression pins before this run exercised it.

One observation worth recording against this project's own measured base rate (numbered prose
checks skipped in two consecutive earlier rounds, by two different mechanisms): this prose
contract bound on first exposure. The plausible difference is its shape — it **narrows an existing
behavior** ("end your output with…") rather than adding a skippable checking tier.

## Conclusion

**Verified live.** The evidence contract extends cross-domain without false-blocking non-deriving
objectives, and the empty-pool/absent-block distinction is real and observable in the stamped fact.
Honest bounds: this round validates the **benign path only**. The deriving direction for a
Terraform leg (non-empty pool + a derived value → the containment arithmetic actually firing),
the consuming-leg discharge in a live program, and the non-empty-pool `needs-node-c`
classification remain unexercised live and are listed for future rounds.

## Enforcement

- `computeContainmentDisposition`'s arm order and all three new reasons are pinned by incident-style
  fixtures (the rewritten refusal specimen + discharge / fail-closed ×2 / clause-1-dominance /
  zero-pool tests) in the platform's containment suite — which is published verbatim as the test
  suite of the open-source [`@paichart/containment-checks`](../../packages/containment-checks/)
  package (v0.2.1), byte-parity-gated against the platform canonical.
- The terraform protocol's Phase-0 clause carries the emission rule and the pool-boundary wording;
  protocol text is version-stamped and the decision log in [`ARCHITECTURE.md`](../ARCHITECTURE.md)
  records the bump.
