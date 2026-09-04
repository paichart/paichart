# Program Composition Catalog

> **Purpose**: the companion to [`PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md`](./PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md).
> The playbook is the *procedure* (how to take one program use-case from seam-triage → shipped). This is
> the *map*: **which composition SHAPES exist, the axes that select one, what transfers between them, and a
> worked entry per candidate.** Add an entry here before you start Phase 2 on a new program use-case.
>
> **Who maintains it**: pipeline-harness-specialist, as program use-cases are triaged. Sibling map for the
> *inside* of a leg: [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md).

## Composition is shape-agnostic

A "program" is not a network thing, or a firewall thing. It's a **shape**:

> **one design artifact → the Program Architect computes a plan + a binding interface contract → a human
> gates the plan → N domain pipelines run (parallel or sequenced) against the shared contract → a program
> integration reviewer (Node C) proves they cohered from structured facts → a deterministic
> `programReleasable` fact → a human release decision.**

Any objective that spans **multiple approval/vendor/tool boundaries over a shared design** is a candidate.
The seam test (playbook Phase 1) is the gate — *does it even need a program?*; this catalog is the worked
answer to the follow-up — *which shape?*.

## The shapes (the whole map)

| Shape | One-liner | Coordination | Gates | Proven? |
|---|---|---|---|---|
| **S0 — single pipeline** (NOT a program) | zero boundaries; one designer holds the whole path in-context | §6 intra-pipeline chaining | one | ✅ shipped (2-device demos) |
| **S1 — parallel program + shared contract** | N legs, different vendor/team, constants knowable up front | **declarative** — the interface contract | plan gate + per-team gates | ✅ **live-proven** (default program shape) |
| **S2 — sequenced program + DAG chaining** | a downstream leg needs an upstream leg's *designed output* | **runtime** — DAG edges + inter-pipeline `report.md` chaining | plan gate + per-team gates | ✅ **live-proven** — 17 runs, 16 COMPLETED, 6 releasable, most recent 2026-08-03 (measured 2026-08-08) |
| **S3 — grouped / hybrid** | > 8 devices, or mixed parallel+sequenced legs | contract for the parallel slice, DAG edges for the sequenced slice; legs may be multi-device pipelines | plan gate + per-team gates | 🟡 composition of S0-inside-S1/S2 |
| **S4 — sequenced program + APPLIED-STATE interdependency** | a downstream leg needs the upstream leg's change to be **live on the target**, not merely designed (a migration phase, a staged cutover) | **the environment itself** — a human applies at the gate, the next leg RE-HARVESTS the changed world | plan gate + **apply gates** | ✅ **live-proven** — IGP-T1 R10, 2026-08-25 (VT-19): 4 phases applied and verified on live Arista cEOS |

**S0 is on the map on purpose** — it's the null result of the seam test. Most objectives that *feel* like a
program are S0 (a few same-vendor devices, one team). Don't pay for program machinery you don't need.

⚠️ **The `Proven?` column goes stale silently — re-measure it, don't trust it.** It said S2 was at
"first run = validation round" while 17 sequenced runs had happened, which would have steered a shape
choice away from the best-exercised path. Re-measure with:

```sql
SELECT CASE WHEN title ILIKE '%sequenced%' THEN 'S2' ELSE 'other' END AS shape,
       count(*) AS runs,
       count(*) FILTER (WHERE status = 'COMPLETED') AS completed,
       count(*) FILTER (WHERE metadata->>'programReleasable' = 'true') AS releasable
FROM tasks WHERE type = 'PIPELINE' AND title ILIKE '%(protocol: pov-program)%' GROUP BY 1;
```

(Shape is inferred from the title here because nothing stamps it. If that ever matters more than it
does today, stamping the shape at CREATE would make this measurable rather than inferred.)

### S4 is not S2 with extra steps

S2 and S4 both sequence legs behind DAG edges, and the platform runs them identically — which is
exactly why the distinction is worth stating, because the OPERATOR's duty and the RISK are different.

| | S2 — designed-output | S4 — applied-state |
|---|---|---|
| what crosses the edge | the upstream leg's **document** (`report.md`, chained into §6) | the upstream leg's **change, live on the target** |
| how the downstream leg sees it | reads its predecessor's deliverable | **re-harvests the device/environment** |
| what a gate means | approve a document | **apply it, verify it, then release** |
| a defect released at a gate | is in a document — the fix is a re-run | **is in the environment** — the fix is a device operation (rollback), and the next leg will design against it |
| the operator | reviews | **is part of the data path** |

**Selection test:** ask whether the downstream leg could do its job from the upstream leg's document
alone. If yes, it is S2 — keep it S2, it is cheaper and has no apply risk. If the leg's whole purpose
is to observe what actually happened (parity verification, post-cutover validation, drift check),
only a fresh harvest can answer it, and you are in S4.

**What S4 costs you, stated honestly:**
- **The platform does not model apply.** A gate is a template-less ACTION task and the harness cannot
  tell what you did before completing it — so **nothing verifies that an apply actually happened**.
  Release a gate without applying and the next leg honestly reports the change absent, which is
  indistinguishable from the package being wrong. The discipline is entirely operator-side; the
  rituals are in `PROGRAM-OPERATOR-GATE-PLAYBOOK.md`.
- **Capture a pre-change baseline before every apply**, and for a destructive phase (removing a
  protocol, deleting a resource) snapshot the full config first. On IGP-T1 R10 that snapshot was the
  only independent check on a rollback the leg reviewer could grade only ACCEPTED-FROM-CLAIMS.
- **A leg reviewer cannot see the environment.** It reviews a document. Anything about live state is
  yours to verify at the gate.

## The axes that select a shape (generalized from firewall §4)

| Axis | → S0 | → S1 (parallel) | → S2 (sequenced) | → S3 (grouped/hybrid) |
|---|---|---|---|---|
| **Vendor/tool homogeneity** | one | multiple | multiple | multiple |
| **Team / approval boundaries** | one | multiple, per-team gates | multiple, per-team gates | multiple |
| **Kind of interdependency** | resolvable in one context | **declarative** (agreed constants) | **runtime** (needs upstream's designed output) | mixed |
| **Unit count vs the ≤8-leg cap** | any (one pipeline) | ≤ 8 | ≤ 8 | > 8 → group into segment-legs |
| **Dependency shape** | n/a | parallel, no edges | acyclic DAG (cycles → contract) | DAG + grouped legs |

Rules of thumb (identical logic to firewall §4, now shape-general):
- **Start at S0.** Escalate only when a real boundary (vendor, team, or a runtime dependency) forces it.
- **S1 is the default program.** Reach for it the moment vendor/team boundaries split the work AND the
  coordination is expressible as up-front constants.
- **S2 only for genuine runtime dependency.** If the interdependency can be a contract constant, prefer S1
  (parallelizes). Sequencing costs wall-clock — but it is **no longer the less-exercised path**: measured
  2026-08-08, S2 has **17 runs / 16 completed / 6 releasable**, and is now the most-exercised program shape.
  Prefer S1 on *parallelism*, not on maturity.
- **S3 when the path is wider than 8 or genuinely mixed.** Group devices into multi-device legs (S0-inside),
  wire the parallel slice by contract and only the truly-runtime slice by DAG edge.

## What transfers vs what is shape/use-case-specific

Decide the right column in playbook Phase 2–3 for each new program use-case. The split is stable:

**Transfers for free (composition-layer, already built — D1–D12 / CC1–CC8):**
- The **role triad** — Program Architect (`program_architect`, the one net-new role) → per-leg reviewers
  (reused `change_reviewer`, per-pipeline conformance) → Node C (reused `change_reviewer`, cross-leg). D1/D2.
- **Sibling-only edges in one program stage** (cross-stage edges silently don't fire). D3.
- **Template-less gates** as dependency nodes (reactor can't auto-queue → human `task.complete` is the only
  release). D4.
- The **structured interface-contract channel** + loud-fail-if-absent consumer. CC7 / D10.
- **Inter-pipeline chaining** (the PIPELINE-predecessor branch) + settledness predicate + coverage facts. CC2/CC2b.
- **`programReleasable`** = deterministic AND, facts-only; **`programConfidence`** = MIN across legs. D5.
- **Structured-facts-only authority** — no verdict re-derived from chained prose; single-POV fan-out under one
  `validatePOVAccess`. D10.
- **Ingestion validation** (SSRF allowlist + Zod + injection quarantine) on the two design-artifact URLs. CC8.

**Shape / use-case-specific (the real per-program work):**
1. **The two ingestion artifacts** — `topology.json` (the path/graph as code) + `requirements.md` (the intent). Every use-case authors its own.
2. **The contract's invariant set** — which constants are knowable up front (flow spec, naming, logging, addressing). Data-shaped, never prose.
3. **The DAG** — parallel (S1) vs which edges are genuinely runtime (S2) vs grouping (S3).
4. **The leg domains** — reuse an existing domain protocol, or config a new one (a *pipeline* use-case exercise per the domain catalog; rarely an engine change).
5. **Node C's conformance checks** — the use-case's own "did the slices cohere" facts (per-device slice equality, no asymmetric hole, consistent naming) + which cross-domain seams are **human-only, not machine-gated** (D6/D11).

## Why some program use-cases fit *better* than others

The composition wants each leg to be a clean approved-but-unapplied change package AND the cross-leg seam to
be machine-checkable. Use-cases where **every leg lands in a convergent reconciler** (Terraform `apply`,
Argo/Flux) and the seam is a **checkable invariant** (an address plan, a flow 5-tuple, a shared label) fit
best — the coordination is data, and Node C checks data. Use-cases whose cross-leg seam is a **judgement** (a
k8s CNI ↔ switch-underlay coherence opinion) fit too, but that seam is the **human's release verdict, never a
deterministic gate** (D11) — design it as an advisory, not a check.

---

## §Firewall — end-to-end security policy across a path (canonical worked entry)

The first fully-worked program use-case. `firewall-policy-use-case.md` + `firewall-examples/` are the detail;
here is its shape mapping:

| firewall approach | shape | why |
|---|---|---|
| Approach 1 — single pipeline, multi-device | **S0** | same vendor, one team; one designer holds the whole path |
| Approach 2 — parallel program + shared contract | **S1** | 3 vendors / 3 teams; no NAT ⇒ every constant knowable up front; **live-proven coordination** |
| Approach 3 — sequenced program + inter-pipeline chaining | **S2** | edge-FW designs a NAT ⇒ downstream legs need the post-NAT addresses (runtime) |
| a > 8-device path | **S3** | group into segment-legs (multi-device pipelines) under one program |

Teaching point the firewall entry contributes to the general map: **the SAME path is S0, S1, or S2 depending
only on vendor homogeneity, team boundaries, and whether a NAT introduces a runtime dependency** — the shape
is a property of the boundaries, not the domain.

## §Candidate program use-cases (triage stubs — flesh out before Phase 2)

| Use-case | Likely shape | The boundary that forces a program | The seam Node C checks | Notes |
|---|---|---|---|---|
| **Multi-cluster / multi-region GitOps rollout** | S1 (or S2 if a shared CRD/CRD-version must land first) | one team+tool per cluster/region, separate approvals | same app version + policy across clusters; no drift | legs = `kubernetes-gitops` pipelines; converges via Argo/Flux (strong terminus) |
| **Multi-account cloud landing zone** | S1, S2 if a hub account must exist before spokes | one team per account/OU, separate approvals | consistent guardrails/SCPs; hub-spoke routing coheres | legs = `terraform-iac`; `terraform apply` = native converge/rollback |
| **Hybrid network + cloud path** (on-prem FW ↔ cloud SG) | S1 with a **human-only cross-domain seam** | network team + cloud team, different tools | the flow is symmetric across the on-prem↔cloud boundary | the CNI↔underlay-class seam is **advisory, human release** (D11), not machine-gated |
| **DB schema + app-config coordinated change** | S2 | schema migration must land before the app-config leg matches it | app config references the new schema shape | runtime dep (post-migration shape) ⇒ sequenced |
| **IGP migration (OSPF→IS-IS)** — triaged 2026-08-21, GO | S2 (legs = *phases*, not devices; S3 if fleet > 8 forces device-grouping inside phases) | phase N+1 must design against phase N's *applied* live state — stronger than designed-output dependency; the apply gate + re-harvest is the mechanism | same NETs/metrics/level design across all phases (interface contract); parity verified before OSPF removal | legs = `network-provisioning` pipelines; full triage in PIPELINE-DOMAIN-FIT-CATALOG §IGP-Migration; skeleton in `cline_docs/igp-migration-design-2026-08-21/` |

These are stubs, not commitments — each needs its own seam-triage (does it really cross a boundary?) and, if a
new leg domain is involved, a pipeline-catalog entry first. Add the fleshed-out entry here when you triage it.

## See also

- Design procedure: [`PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md`](./PROGRAM-USE-CASE-DESIGN-PLAYBOOK.md)
- Run a program: [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md)
- Canonical worked entry: [`firewall-policy-use-case.md`](./firewall-policy-use-case.md) + `firewall-examples/`
- Leg-domain map: [`PIPELINE-DOMAIN-FIT-CATALOG.md`](./PIPELINE-DOMAIN-FIT-CATALOG.md)
- Rationale (D1–D12 / CC1–CC8): `cline_docs/reviews/program-architect-design-2026-07-15/design-proposal.md`
