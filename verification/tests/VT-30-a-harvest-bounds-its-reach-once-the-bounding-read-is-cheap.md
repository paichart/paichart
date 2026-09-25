# VT-30 — a harvest bounds its own reach, unprompted, once the bounding read is cheap

**Status**: ✅ VERIFIED 2026-09-23 (single live round against a known-failed control; figures re-checked
against the persisted records 2026-09-25). Re-verify trigger: any change to the kubernetes-gitops Phase 0
containing-population clause, the orchestrator's brief-scope rule, or the k8s read-only service's
`list_resource_names` tool.
**Layer**: pipeline (standalone `kubernetes-gitops`)
**Round type**: functional — a fix validated live against a same-rig control that had failed the day before

**Date:** 2026-09-23. **POV:** Requirements Generator — Validation, phase *3 — Run the Generated Spec*.
**Pipeline task** `cmudm6oxu0005yxpeksz61wt7`. **Control:** `cmudc2mwf00fyyxl7x6ei8nab` (2026-09-22).

## Objective

A Kubernetes NetworkPolicy author must be able to state what a namespace-wide selector actually reaches.
In the control, it could not: its harvest read the namespace's pods through a label-scoped query, the
result was truncated, and its reviewer refused the claim *"0 other workloads harvested in `trading`"* —
true of the query it ran, unevidenced about the namespace.

**Claim under test:** with three shipped changes in place, a pipeline bounds the reach of its policy from
evidence of the WHOLE namespace **without being told to** — no instruction in the task, and no protocol
text that names the tool it needs.

Ruled out explicitly: a pass that depends on the task description mentioning population, census,
enumeration or the tool; a pass where the harvest still truncates on the population read; a pass where
the bounding claim is asserted rather than proven from harvested evidence.

## Method

1. Ship three changes, none of which names the others:
   - the k8s read-only service gains `list_resource_names` — identifiers without full object specs;
   - `kubernetes-gitops` **1.11.0**: Phase 0 must harvest the CONTAINING population of any selector a
     change relies on, and splits reads by axis — breadth (enumerate the population) vs depth (fetch one
     object in full). The clause describes only a SHAPE: *"whichever tool your descriptor declares that
     returns identifiers WITHOUT full object specs"* — it never names the tool;
   - `pipeline-orchestrator` **3.15.0**: a child's brief may not narrow below the protocol's scope.
2. Before launch, check the task description for contamination: no "population", "census",
   "enumerate", or the tool name.
3. Run one standalone `kubernetes-gitops` pipeline against the same rig and namespace as the control.
4. Compare the harvester's tool calls, read sizes and truncations, and the Author's bounding claim, with
   the control's.

**Reproducible:** the Kubernetes lab, including the read-only service and `list_resource_names`, is
published in [`usecases/kubernetes-lab/`](../../usecases/kubernetes-lab/).

⚠️ **The control and the test are not the same shape.** The control's step ran as one leg of a program;
the test is a standalone pipeline. Same rig, same namespace, same workload, one day apart — a
before/after, not a controlled experiment.

## Config

`kubernetes-gitops` 1.11.0 · `pipeline-orchestrator` 3.15.0 · the published k8s read-only service with
`list_resource_names` · namespace `trading` in the published lab.

## Expected observables

- Harvester: population reads go through the identifiers-only tool; **zero** full-spec population reads.
- No population read truncated; any remaining truncation is a DEPTH read of a single object.
- The Author's package states the namespace's workload population and bounds the selector's reach
  FROM it.
- Reviewer approves with no blocking issue.

## Results

**Outcome:** leg `approved`, reviewer score **88**, reviewer `approved: true`, **0 blocking**; evidence
grading **7** verified-against-evidence / **2** accepted-from-claims. The task description contained none
of the four contamination terms.

**Harvester, test vs control:**

| | control (2026-09-22) | this round (2026-09-23) |
|---|---|---|
| pod read | `list_resources` + label selector | `list_resource_names`, unscoped |
| population read size / outcome | 27,646 chars — **truncated, ~29% seen** | every read 2,066–2,861 chars — **clean** |
| identifier-only population reads | 0 | **11** `list_resource_names` (+1 `list_secret_names`) |
| full-spec population reads (`list_resources`) | yes | **0** |
| truncated population reads | the one that mattered | **0** |

Kinds enumerated namespace-wide: pods, services, networkpolicies, poddisruptionbudgets, resourcequotas,
limitranges, deployments, replicasets, statefulsets, daemonsets, ingresses.

**The remaining truncations are depth reads, and correct:** the descriptor fetch (8,141 chars — no
narrower form exists; paging is the recovery) and two `get_resource` reads of single pods (13,759 each —
one full object, fetched deliberately). Breadth clean, depth legitimately large: the split the protocol
change drew.

**The Author** carries a section headed *"Full workload census (`trading`) — bounds Target 1's
`podSelector: {}` reach"*, concluding that the empty selector is namespace-wide by definition **but the
harvested census proves the current pod population is exactly two pods of one workload** — so today its
reach equals the more specific selector. The control asserted the bound; this round proves it.

*(Correction, 2026-09-25: the internal note this document grew from counted "12 calls to
`list_resource_names`". The persisted record shows 11, plus one call to the sibling identifiers-only tool
`list_secret_names` — 12 identifier-only reads in all.)*

## Conclusion

**Verified live, once**, against a same-rig control. The fix closed the defect on first attempt with no
instruction in the task and no tool name in the protocol: the agent recognised the tool from the shape the
protocol described and its descriptor declared.

What it qualifies. Before this round, the strongest general finding in this area was that *detection*
obligations bind while *production* obligations do not: the same author clause failed 1 in 8, while a
detection clause fired first time at the reviewer. This round is a production obligation that bound on
first attempt. The qualifier it earns: **a production obligation binds when the action it demands is
cheap and available.** The earlier clause asked authors to quote a bounding extension that, in this
environment, could not be obtained — the narrowest pod read the service offered was 3.4× the tool-result
cap. An unsatisfiable obligation reads as an ignored one. That is why the tool shipped before the clause.

## Enforcement

- **Shipped in:** `kubernetes-gitops` ≥ 1.11.0 (Phase 0 containing-population + breadth/depth split) and
  `pipeline-orchestrator` ≥ 3.15.0 (the brief may not narrow below the protocol's scope); the published
  lab's `list_resource_names`.
- **CI pins: none dedicated.** The behaviour rests on protocol text and a tool's presence. The only
  automated check touching it keeps the tool's name OUT of agent-facing protocol text
  (`test:no-rig-identifiers`), which is what makes "the protocol never names the tool" hold. Stated
  plainly because a claim guarded by nothing but prose is weaker than one guarded by a test.
- **Residual limitations, with triggers:**
  - **One round.** Re-measure the truncation-recovery rate after at least 10 kubernetes legs have run on
    `list_resource_names` (the largest truncation source was removed the day of this round).
  - **Kubernetes only.** Network, terraform and observability carry no equivalent bound-the-reach
    property, and it does not port verbatim: their sets are open by construction (a CIDR, a wildcard
    resource), so "quote the bounding extension" is unsatisfiable there. Trigger: the first
    set-valued change in those domains whose reach a reviewer cannot bound.
  - **Fabrication residual.** The clause fires on the ABSENCE of a bounding extension, so an author that
    invents a plausible census would satisfy it. A platform-witnessed `harvestScope` fact is specified
    and deliberately unbuilt (no consumer yet). Trigger: a fabricated census found by hand, or a second
    instance in any domain.
  - **Not tested here:** cross-pipeline value delivery, program gates, `programReleasable` — those are
    VT-29's and later rounds' territory.
