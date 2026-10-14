> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — log-archive-bucket-write

- Authored in: Log archive write — requirements spec · Specification
- Iteration: Run 20261008-2043 · 2026-10-08

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- **2 legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of
  one — these are two distinct domains (kubernetes-gitops, terraform-iac), not two phases of one
  protocol:
  1. **kubernetes-gitops** (UPSTREAM) on the pods of namespace `trading`, described in `topology.json`.
  2. **terraform-iac** (DOWNSTREAM) on the bucket policy of Terraform resource `aws_s3_bucket.app_logs`
     (bucket `acme-app-logs`, workspace `prod`).
- Out of scope, explicitly: any Kubernetes namespace other than the declared target namespace; any
  Terraform resource other than the declared bucket resource; the bucket's `tags`/`tags_all`
  attributes (declared out of scope — known triaged drift / synthetic test fixtures); any access
  grant wider than the exact admitted principal and granted action declared below.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of namespace `trading` (read-only — the leg grants/removes no access and changes nothing, item 1) | declared — item 2: "The target namespace is `trading`." |
| kubernetes-gitops.population | which members of the class the derivation reads | — | every running pod in the namespace of item 2 | declared — item 5: "every running pod in the namespace of item 2" |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list — each running pod's address exactly | declared — item 14: "expressed as a host list — each running pod's address exactly" |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap — the cluster leg reports a gap and produces no value | declared — item 15: "the cluster leg reports a gap and produces no value (gap)" |
| kubernetes-gitops.target-absent *(added — this leg's own target namespace, though the leg is not an authorisation leg)* | the declared namespace itself does not exist | gap · create-target | gap — the cluster leg reports a gap; it never creates the namespace | declared — item 16: "the cluster leg reports a gap (gap); it never creates the namespace" |
| approver.plan | who approves the program plan gate | — | Steve Terry, steve.terry@paichart.com | declared — item 6: "The program plan gate is approved by steve.terry@paichart.com." |
| approver.kubernetes-gitops | who approves the kubernetes-gitops change gate | — | Josh Allen, josh.allen@paichart.com | declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com." |
| approver.terraform-iac | who approves the terraform-iac change gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com." |
| gate.kubernetes-gitops.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg | declared — item 9: "sits before the cluster leg (before-leg)" |
| gate.terraform-iac.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | declared — item 10: "sits after the producer and before the consumers (after-producer-before-consumers)" |
| terraform-iac.target | which surface of the leg's service does it act on | — | the bucket policy of `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace `prod`) | declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`); it is the log archive." |

### A leg that grants or removes access (authorisation) — terraform-iac only

*(kubernetes-gitops carries no rows here: item 1 declares it "grants and removes no access and changes nothing.")*

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the bucket's objects, with no key-prefix limit | declared — item 4: "the authorised resource is its objects, with no key-prefix limit." |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination | source-address-range — the admitted principal is the source-address value the cluster leg produces; no VPC endpoint is declared | declared — item 11: "admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces (items 1 and 5). No VPC endpoint is declared." |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless — records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path | declared — item 12: "the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path." |
| terraform-iac.granted-action | what the admitted principal may do | — | s3:PutObject only | declared — item 13: "The admitted pods may perform s3:PutObject only." |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded | preserve — the leg adds only its own statement and changes no other | declared — item 18: "Existing statements on the bucket policy are preserved (preserve): the leg adds only its own statement and changes no other." |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act — the bucket leg still authors against the receiver of item 4 | declared — item 20: "the bucket leg still authors against the receiver of item 4 (act)." |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create — the leg creates one holding only this grant | declared — item 19: "the leg creates one (create) holding only this grant." |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap — the bucket leg reports a gap; it never creates the bucket | declared — item 17: "the bucket leg reports a gap (gap); it never creates the bucket." |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer | Allow statements only, no Deny statement; the package states what else, if anything, the change affects | declared — item 21: "the leg adds Allow statements only and no Deny statement; its package states what else, if anything, the change affects." |

### A leg that changes routes (routing)

Not applicable. Neither leg in this program adds, suppresses, filters, withdraws, or replaces
advertised routes — kubernetes-gitops only derives a value, and terraform-iac is an authorisation leg
(a bucket policy filters *access*, not *routes*). This section is intentionally empty.

## Decisions needed from the owner

none — every row above is declared, citing a numbered design decision verbatim. There is no OPEN,
derived, or forced row in this document.

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — applied explicitly:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No.** The terraform-iac leg's admitted-principal value (the host list of running-pod
addresses, design decisions 11 and 14) is Kubernetes-scheduler-assigned pod state: pod addresses are
allocated at pod creation/rescheduling and change whenever the workload restarts, scales, or the
namespace is rebuilt. This value cannot be pinned in a static interface contract or agreed in advance
in `topology.json`, because it does not exist as a fixed fact of the estate — it exists only as the
live output of the kubernetes-gitops leg's own derivation at run time. The Program Architect
(topology.json + this file, no live state access) structurally cannot know it up front. If guessed or
pinned prematurely, every pod reschedule after authoring would silently break the authorised access —
or worse, leave a stale address admitted after the pod that held it is gone.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** All three approvers below are TRANSCRIBED from the approver
mapping declared in this program's objective (items 6–8) and marked `(declared)`.

**Declared approvers confirmed on the POV team:**
- Program plan gate approver is Steve Terry steve.terry@paichart.com (declared) — member (OWNER)
- kubernetes-gitops change gate approver is Josh Allen josh.allen@paichart.com (declared) — member (SALES_ENGINEER)
- terraform-iac change gate approver is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member (SALES_ENGINEER)

### Every gate declares WHAT it approves and WHEN it sits

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry (declared) |
| kubernetes-gitops change | the method — which namespace, which pods count toward the population, and how the derived host-list value is computed (item 9: intent/method gate) | the program plan gate | the kubernetes-gitops leg | Josh Allen (declared) |
| terraform-iac change | the value produced by the kubernetes-gitops leg (the host list of running-pod addresses), once it exists (item 10: produced-value gate) | the kubernetes-gitops leg (the producer of that value) | the terraform-iac leg | Jacob Wilcox (declared) |

**Dependency consequence**, spelled out so a planner does not have to infer the DAG:
- The terraform-iac leg depends on **its own gate** AND on **the kubernetes-gitops leg**, and the
  terraform-iac gate also depends on the kubernetes-gitops leg. Write both edges:
  `kubernetes-gitops leg → terraform-iac gate` AND `kubernetes-gitops leg → terraform-iac leg`.
  The gate edge decides *when* terraform-iac may start; the direct edge is *how* the host-list value
  reaches it (an approval gate carries approval, not data, and produces no deliverable to chain).
- The kubernetes-gitops leg depends on its own gate, which depends on the program plan gate.

## Pipeline 1 objective — kubernetes-gitops (UPSTREAM)

- Harvest the pods of namespace `trading` **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — at the Phase 0 harvest (Run 20261008-2043)**: the Requirements State
  Harvester's cluster-domain read confirmed namespace `trading` exists and holds at least one pod
  reachable via per-pod `get_resource` reads.
- The leg enumerates every pod in namespace `trading`, applies the running-pod criterion of design
  decision 5, and reports the **literal criterion it applied** in its own `report.md` (item 5's own
  requirement, not optional).
- The derivation: for every pod satisfying the running-pod criterion, read its pod address; the
  resulting set of addresses is the host list this leg publishes — see derivation notes below.
- **If the namespace of item 2 does not exist** (`kubernetes-gitops.target-absent`, item 16): report a
  gap; never create the namespace.
- **If the harvest returns no running pods** (`kubernetes-gitops.inputs-empty`, item 15): the leg
  reports a gap and produces no value — never a substitute address.
- **The deliverable MUST publish, explicitly and prominently**: the host list of every running pod's
  address in namespace `trading`, as selected by the criterion of design decision 5 and expressed per
  design decision 14 (`kubernetes-gitops.representation`) — named by its rule and its producer (this
  leg), never by the addresses current at authoring time.
- **Validation (mechanical)**: re-enumerate the namespace's pods and re-apply the running-pod
  criterion (`status.phase == "Running"`); expected output: the published host list is set-equal to
  the freshly computed set of addresses for pods currently satisfying the criterion in namespace
  `trading` — e.g. `kubectl get pods -n trading -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.status.podIP}{"\n"}{end}'`
  (or the equivalent read-only call on the descriptor) must return exactly that set, order-independent.

### Derivation notes for kubernetes-gitops (host list — not an aggregate prefix)

- The computation is shown in the DESIGN: the deliverable carries the full input set (every address
  of a pod satisfying the criterion) and the result set (the host list, item 14) as the **same** set —
  a host list is each running pod's address exactly, so verification is set-equality, not a
  minimal-cover computation. The CIDR-aggregation/minimality traps described elsewhere in this
  template's writing-rules region do **not** apply here, because item 14 rules out any aggregated
  representation; this is stated explicitly so no reviewer expects a minimal-prefix check on this leg.
- Verify member-by-member before publishing: every running pod's address is in the published list,
  and no non-running or foreign address is.
- State the null case: if the namespace yields zero running pods, apply
  `kubernetes-gitops.inputs-empty` (item 15) — gap, no value published, never an unrelated substitute.
- Run your own rule: apply the stated criterion to each pod found and confirm the resulting set
  matches the published list exactly before publishing.

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- Harvest the policy state of bucket resource `aws_s3_bucket.app_logs` (bucket `acme-app-logs`,
  workspace `prod`) **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — at the Phase 0 harvest (Run 20261008-2043)**: the Requirements State
  Harvester's cloud-domain read confirmed the bucket resource exists in workspace `prod` and read its
  current policy attribute.
- The leg authors a change to the bucket's policy granting `s3:PutObject` (item 13,
  `terraform-iac.granted-action`) on the bucket's objects with no key-prefix limit (item 4,
  `terraform-iac.receiver`) to the principal admitted by source address (item 11,
  `terraform-iac.admitted-principal`) — the host list chained from the kubernetes-gitops leg —
  preserving every existing statement (item 18, `terraform-iac.existing-grant`) and adding Allow
  statements only, no Deny (item 21, `terraform-iac.collateral`).
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the bucket's policy engine must
  see the pods' source address unchanged on the path from pod to bucket (no NAT, no proxy rewriting
  the source) for the source-address condition to match admitted traffic. This leg's own read-only
  Terraform-state harvest has no path-tracing capability and cannot confirm that premise — apply
  `terraform-iac.principal-unseen` (item 12): **act-regardless**.
  - **UNTESTED premises**: the pods' source addresses reach the bucket unchanged, with no address
    translation anywhere on the path. This premise is recorded as UNTESTED, not verified by this
    program, per item 12.
- **Existence assumption** (*Writing rules* #6): if this leg's own harvest finds the bucket carries no
  policy, apply `terraform-iac.enforcer-absent` (item 19) — create one holding only this grant; if it
  finds an existing policy, apply `terraform-iac.existing-grant` (item 18) — preserve every existing
  statement, add only this one; if the bucket itself is absent, apply `terraform-iac.target-absent`
  (item 17) — gap, never create the bucket. Which of these is true today is a harvest-time finding,
  never stated here.
- This leg consumes the host list produced by kubernetes-gitops **as chained** — it does **not**
  re-derive it, and is forbidden from recomputing it. Correctness of that value is discharged
  **upstream** and re-verified at the program tier (see Acceptance).
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest finds the bucket holds no objects**: apply `terraform-iac.target-empty`
  (item 20) — act; still author against the receiver of item 4.
- No further leg consumes from this one — terraform-iac is the terminal leg of this program.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Granted action: `s3:PutObject` only (item 13) — fixed regardless of environment state.
- Authorised resource: the bucket's objects, with no key-prefix limit (item 4) — fixed.
- Existing-statement treatment: preserve, never replace (item 18) — fixed.
- Statement polarity: Allow only, no Deny (item 21) — fixed.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list of running-pod addresses (item 14) — produced by kubernetes-gitops, chained into
  terraform-iac's §6, settled before the terraform-iac leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs and a rollback
  plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the consumed value in the terraform-iac leg's change package exactly equals what the
   kubernetes-gitops leg produced — the chained value, not a guess, not a recomputation;
2. every address in the consumed host list is present as a distinct admitted source-address entry in
   the bucket-policy statement the terraform-iac leg authors — no address missing;
2b. the tightest-correct property — recompute from the chained value that the admitted set in the
   authored statement is **exactly** the published host list (no superset: no wildcard, no CIDR
   standing in for the explicit list) — since item 14 mandates a host-list representation, any range
   wider than the exact list is a REJECTABLE defect even though it violates nothing else;
3. no-widening/no-collision — the authored statement grants only `s3:PutObject` on the bucket's
   objects to the admitted principal, no other action, no other resource, and it does not overwrite or
   collide with any preserved existing statement;
4. **chaining coverage** — the terraform-iac leg received the kubernetes-gitops leg's **real**
   deliverable (its published host list), not a fallback and not nothing. The platform-computed
   counters (`predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []`) are facts the program gate computes mechanically; Node C does not re-derive them,
   and checks instead what its own chained context shows — every leg appears as a predecessor
   carrying its deliverable.

These check numbers are fixed and may not be renumbered, merged, or substituted; a new requirement
appends (5, 6, ...).

### Consuming-leg attribution — terraform-iac cannot self-check the chained value

terraform-iac has no cluster access and cannot independently verify whether the host list it receives
correctly reflects namespace `trading`'s running pods. Its consumption of that value is attributed
correct when, and only when: (1) the kubernetes-gitops leg's derivation was machine-checked with no
defect (its own Validation step, above); (2) the program-tier checks 1–3 above pass on the chained
value; and (3) chaining coverage (check 4) confirms the real deliverable was received.

## Open questions

none.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

---

Confidence: 90/100 — Solid and fully declared: every design-decision row traces to a numbered objective item (no OPEN or forced rows), and all three declared approvers were confirmed as POV team members via `pov.details`. One flagged assumption: `kubernetes-gitops.target-absent` (namespace-absence, item 16) is not one of the fixed rows the protocol lists for a non-authorisation producer leg (target-absent is specified only for authorisation legs) — I added it as a custom row under the protocol's "add a row for any further decision the document relies on" allowance rather than omitting item 16 or forcing it into an ill-fitting slot; a reviewer may want this placement double-checked against the template contract.
