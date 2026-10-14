> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — trading namespace → log-archive bucket

- Authored in: Log archive write — requirements spec · Specification
- Iteration: 20261008-2140 · 2026-10-08

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

---

## Program scope

- **2 legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of
  one — see the definition above; do not call two phases of one protocol two domains:
  1. **kubernetes-gitops** (—) on the `trading` namespace, described in `topology.json`.
  2. **terraform-iac** (DOWNSTREAM) on the Terraform resource `aws_s3_bucket.app_logs` (bucket
     `acme-app-logs`) in workspace `prod`.
- **Any resource other than the declared target namespace or target bucket; creation of either the
  namespace or the bucket if either is found absent; any Deny statement on the bucket policy; any
  VPC endpoint policy (none is declared for this program); and application of the resulting change
  packages (apply is out-of-band and human-gated)** are explicitly **out of scope**. Neither leg acts
  on or changes the bucket's existing tags — known drift, triaged by the owner as synthetic test
  fixtures, accepted, out of scope for this change.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the `trading` namespace | (declared — item 2: "The target namespace is `trading`.") |
| terraform-iac.target | which surface of the leg's service does it act on | — | the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`) | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`); it is the log archive.") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | every pod in the `trading` namespace whose `status.phase` is exactly `Running`; readiness is not a criterion | (declared — item 5: "every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list — each selected pod's address exactly, no aggregation | (declared — item 14: "expressed as a host list - each running pod's address exactly") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | report a gap; produce no value | (declared — item 15: "If no running pod is found in the namespace of item 2, the cluster leg reports a gap and produces no value (gap).") |
| kubernetes-gitops.target-absent | the declared target itself does not exist | gap · create-target | report a gap; never create the namespace | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace.") |
| approver.program-plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com.") |
| approver.kubernetes-gitops-change | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com.") |
| approver.terraform-iac-change | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com.") |
| gate.kubernetes-gitops-change.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg | (declared — item 9: "The kubernetes-gitops change gate sits before the cluster leg (before-leg)") |
| gate.terraform-iac-change.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "The terraform-iac change gate sits after the producer and before the consumers (after-producer-before-consumers)") |

### A leg that grants or removes access (authorisation) — terraform-iac

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the bucket's objects, with no key-prefix limit | (declared — item 4: "the authorised resource is its objects, with no key-prefix limit") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination | source-address-range: the source-address value published by the kubernetes-gitops leg's host-list deliverable | (declared — item 11: "The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces (items 1 and 5). No VPC endpoint is declared.") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless; record as UNTESTED the premise that pod source addresses reach the bucket unchanged, with no address translation on the path | (declared — item 12: "the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path") |
| terraform-iac.granted-action | what the admitted principal may do | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only.") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded | preserve — add only this leg's own statement, change no other | (declared — item 18: "Existing statements on the bucket policy are preserved (preserve): the leg adds only its own statement and changes no other.") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act — author against the receiver of item 4 even if the bucket holds no objects today | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act).") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create — a new policy document holding only this grant | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only this grant.") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap — report; never create the bucket | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket.") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer | Allow statements only, no Deny statement; the change package states explicitly what else, if anything, the change affects; existing bucket tags are left untouched | (declared — item 21: "The bucket leg adds Allow statements only and no Deny statement, and the bucket leg's change package states what else, if anything, the change affects."; item 22: "Neither leg acts on or changes the bucket's existing tags") |

## Decisions needed from the owner

none — every row above is declared (item 1–22 collectively answer every row; none is derived, forced, or OPEN in this run).

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No — sequenced.** The terraform-iac leg's admitted-principal value is the host list of
addresses of the `trading` namespace's `Running` pods (design rows `kubernetes-gitops.population`,
`kubernetes-gitops.representation`, `terraform-iac.admitted-principal`). Pod addresses are assigned
by the cluster's network layer at pod-creation time and are not stable across pod or namespace
rebuilds — a pod rescheduled, restarted, or recreated receives a new address. This is not a value
that could be pinned in a static interface contract: the Program Architect, which reads only
`topology.json` and this file with no live state access, structurally cannot know it, and a value
written here today would be stale the moment any pod in the namespace is rebuilt. The value must
therefore be produced by the kubernetes-gitops leg at its own run time and ride the DAG edge into the
terraform-iac leg, which is forbidden from re-deriving it (see Pipeline 2 objective).

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan gate approver is Steve Terry, steve.terry@paichart.com (declared) — member (OWNER)
- kubernetes-gitops change gate approver is Josh Allen, josh.allen@paichart.com (declared) — member (SALES_ENGINEER)
- terraform-iac change gate approver is Jacob Wilcox, jacob.wilcox@paichart.com (declared) — member (SALES_ENGINEER)

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry (declared) |
| kubernetes-gitops change | the method — which namespace, which pods count, how the host-list value is derived — before any of it runs (intent/method kind) | the program plan gate | the kubernetes-gitops leg | Josh Allen (declared) |
| terraform-iac change | the value produced by the kubernetes-gitops leg (the host list of `Running`-pod addresses), once it exists (produced-value kind) | the kubernetes-gitops leg (its producer) | the terraform-iac leg | Jacob Wilcox (declared) |

⚠️ **Write "the value produced by X", never a bare "the PRODUCED value".** A bare "PRODUCED" has no
producer, and the phrase that follows it usually attaches the value to the CONSUMER's artifact
("the produced range *as an ingress source*"), which reads as the consuming leg's own output and
forces the gate after that leg. Then the gate approves work already finished.
*Earned 2026-09-17 (telemetry-export-four-domain): the Approvals table said "the PRODUCED range as an
ingress source" while the sentence below it said the pipeline waits on its own gate. Both readings
were defensible, the Program Architect flagged the contradiction as an Open Question and asked for
confirmation before plan approval, the plan gate was approved without answering it, and all four
change packages were produced with zero domain approvals.*

⚠️ **A gate wired after the leg it was meant to govern is a RECORD, not a control**, and an
intent/method gate in that position is close to meaningless — approving a method after the work is
done changes nothing. If a gate cannot block anything, say so deliberately or move it.

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point:
a program exists precisely because the halves are approved by different people. That is a check on the
DECLARED mapping, never a licence to reassign: if the declaration puts one person on both halves, keep it as
declared and raise it as an open question.

**Then state the dependency consequence explicitly** — do not leave a planner to infer the DAG from
the prose above, because two readings of the same sentence produce two different graphs:
- This program is sequenced: the terraform-iac leg depends on **both** its own gate (terraform-iac
  change gate) **and** the kubernetes-gitops leg, and the terraform-iac change gate itself also
  depends on the kubernetes-gitops leg. Write `kubernetes-gitops leg → terraform-iac change gate`
  **and** `kubernetes-gitops leg → terraform-iac leg`. Separately, the kubernetes-gitops leg depends
  on its own gate: `kubernetes-gitops change gate → kubernetes-gitops leg`, and the program plan gate
  blocks every leg: `program plan gate → kubernetes-gitops leg`, `program plan gate → terraform-iac leg`.

  ⚠️ **This is not a design choice, and the second edge is not redundancy.** An approval gate
  carries approval, not data: it is template-less and produces no deliverable, so a downstream leg
  whose only dependency is its gate receives an EMPTY chained context and cannot see the value it
  exists to consume. Inter-pipeline chaining walks DIRECT dependency edges only. The gate edge
  decides **when** the leg may start; the direct edge is **how the value reaches it**.

  *Earned twice, in opposite directions. `igp-migration-t1-triangle` stated "each phase waits on
  BOTH its own gate AND the previous pipeline" and ran correctly. `telemetry-export-four-domain`
  said the downstream legs do NOT take a direct edge and that the value "reaches the leg through
  the gate" — an invented mechanism — and three rounds were planned from it before a leg escalated
  (2026-09-18). An earlier version of this line offered both as valid alternatives; only one is.*

## Pipeline 1 objective — kubernetes-gitops (UPSTREAM)

- Harvest the `trading` namespace's pods **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — Phase 0 harvest (task: "Phase 0: Harvest cluster namespace + cloud bucket
  state", confidence 92)**: the `trading` namespace exists and was readable; its pod population was
  read by two independent calls (`list_resources` and `list_resource_names`) that agreed on count,
  confirming a complete, non-truncated read of the namespace at harvest time — this confirms the
  namespace-exists premise this leg's objective depends on, not any pod value or count, both of
  which are dynamic and must be recomputed at run time.
- The leg grants and removes no access and changes nothing on any target (`kubernetes-gitops.target`
  — item 1: "it only derives... the bucket is the only enforcer"). It is a pure derivation: at its own
  run time, it reads the literal `status.phase` of every pod currently in the `trading` namespace,
  selects exactly those pods whose phase is `Running` (`kubernetes-gitops.population` — readiness is
  **not** a criterion: a pod with phase `Running` and a failing Ready condition still qualifies), and
  publishes each selected pod's address exactly as a host list — one address per entry, no
  aggregation, no CIDR compression, no deduplication beyond what distinct pod addresses naturally
  provide (`kubernetes-gitops.representation`).
- The leg's published deliverable must state, in its own report, the literal membership criterion it
  applied (`status.phase == "Running"`, readiness not evaluated) — this is a declared transparency
  requirement, not optional commentary.
- **If the harvest returns no `Running` pods in the namespace**: apply `kubernetes-gitops.inputs-empty`
  — the leg reports a gap naming that no pod in the namespace had phase `Running` at run time, and
  produces no host-list value. It never substitutes a different population or a cached/prior value.
- **If the `trading` namespace does not exist at run time**: apply `kubernetes-gitops.target-absent` —
  the leg reports a gap naming that the namespace was not found; it never creates the namespace.
- **The deliverable MUST publish, explicitly and prominently**: the host list produced per
  `kubernetes-gitops.representation` — the addresses of every pod that satisfied
  `kubernetes-gitops.population` at the leg's own run time. The downstream (terraform-iac) leg
  depends on what this leg PRODUCES at run time, not on what was read during authoring of this
  document.
- **Validation (mechanical)**: re-list every pod in the `trading` namespace at validation time, filter
  to those whose `status.phase` is exactly `Running`, collect their addresses, and diff against the
  published host list — expected: the diff is empty (the published set equals exactly the set of
  `Running`-pod addresses observed at validation time; no address is missing and none is foreign).
  Example command form: `kubectl get pods -n trading -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.status.podIP}{"\n"}{end}' | sort` compared against the published, sorted host list — expected output: identical, zero-line diff.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block (the filtered
  pod list by name) and the result block (the host list), plus the re-runnable check above followed
  by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** For a host-list representation, the
  tightest-correct property is **exactness**: the published set contains every address of a pod
  satisfying `kubernetes-gitops.population` and **no** address of any pod that does not — not a
  superset (which would over-authorise bucket writes to a pod that should not have them) and not a
  subset (which would under-authorise a pod that should). A published list wider or narrower than
  this exact set is a **REJECTABLE defect even when it violates nothing else**.
- **Re-selection FIRST, escalation LAST.** If a candidate pod's address cannot be determined (e.g. no
  IP assigned yet at read time), that rules out *that candidate* only — recompute the host list from
  the remaining pods that do satisfy `kubernetes-gitops.population` and do carry an assigned address.
  Escalate only if the leg cannot determine phase or address for the namespace at all, and name which
  pods were tested.
- ⚠️ **Verify by arithmetic, never by eyeballing.** Domain-specific trap, synthetic example: a pod
  whose phase is literally `Running` but which carries a `deletionTimestamp` (mid-termination) is
  still phase `Running` per `kubernetes-gitops.population` — readiness and termination-in-progress are
  not criteria — so it still qualifies and its address still belongs in the host list; excluding it
  because it "looks like it's going away" is a defect against the stated rule, not a safety
  improvement.
- **Verify member-by-member** before publishing: every address in the host list traces to a pod
  currently in the `trading` namespace with phase `Running`, and no address outside that set appears.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** The
  Phase 0 harvest confirmed the `trading` namespace is reachable and holds at least one pod at
  harvest time, so the success branch of this objective is not hypothetical; the gap branches
  (`inputs-empty`, `target-absent`) are stated because namespace/pod population is dynamic and may
  differ at the leg's own run time.
- 🔴 **STATE THE NULL CASE, always.** Stated above: no `Running` pods ⇒ gap, no value; namespace
  absent ⇒ gap, no creation. Both are named outcomes, not silence.
- 🔴 **RUN YOUR OWN RULE.** Before publishing, the leg must apply its own stated rule — read
  `status.phase` literally, select exactly `Running`, ignore readiness — to its own freshly-read pod
  set, and confirm the published host list is exactly what that rule, applied literally, produces;
  and confirm the output's format (one address per entry, no prefix notation, no compression) matches
  `kubernetes-gitops.representation`'s stated form. A rule that does not produce its own published
  output ships a correct-looking value with a wrong method.
- 🔴 **The machine check is a FLOOR, not the bar.** The mechanical diff above verifies containment
  against a fresh read — it does not by itself prove the rule was applied correctly upstream of that
  read. Satisfy the requirement; do not target the checker.

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- Harvest the Terraform resource `aws_s3_bucket.app_logs` (bucket `acme-app-logs`) in workspace `prod`
  **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — Phase 0 harvest (task: "Phase 0: Harvest cluster namespace + cloud bucket
  state", confidence 92)**: the `prod` workspace exists and `aws_s3_bucket.app_logs` is present in it
  and was readable; its `policy` attribute was read and found to carry no existing statements at
  harvest time — this confirms the target-exists premise this leg's objective depends on, not any
  policy content, which must be re-read at the leg's own run time since it may have changed.
- The leg authors a bucket-policy statement authorising the receiver of `terraform-iac.receiver` (the
  bucket's objects, no key-prefix limit) for the action of `terraform-iac.granted-action`
  (`s3:PutObject` only), admitting the principal described by `terraform-iac.admitted-principal` (the
  source-address value chained from the kubernetes-gitops leg), applying the existing-allowance
  treatment of `terraform-iac.existing-grant` (preserve all pre-existing statements; add only this
  leg's own), and the collateral treatment of `terraform-iac.collateral` (Allow only, no Deny; state
  explicitly in the change package what else, if anything, is affected; the bucket's existing tags are
  left untouched regardless of their content).
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the enforcer (the bucket policy
  evaluation at the S3 request layer) must see, unmodified, the literal source IP address of each
  inbound request on the path between the `trading` namespace's pods and the S3 endpoint, in order to
  match it against the chained host list via a source-address condition. If this leg's own harvest
  cannot confirm that the request path preserves source addresses unchanged end-to-end (no NAT, no
  proxying, no address translation between the cluster egress and the S3 endpoint), apply
  `terraform-iac.principal-unseen`: **act-regardless** — author the change as specified, and record,
  as an **UNTESTED premise** in the change package, that pod source addresses are assumed to reach the
  bucket unchanged with no address translation on the path. This premise is declared not-verified by
  the program (item 12); it is recorded as a named gap, never asserted as confirmed.
- **Existence assumption** (*Writing rules* #6): at this leg's own run time, if its harvest finds the
  bucket carries no policy, apply `terraform-iac.enforcer-absent` (create a new policy document
  holding only this grant); if it finds an existing policy, apply `terraform-iac.existing-grant`
  (preserve every existing statement, add only this leg's own); if the bucket itself is not found,
  apply `terraform-iac.target-absent` (report a gap; never create the bucket). This leg's own harvest
  at authoring time found no policy attached — that is a point-in-time observation, not a fact this
  objective may assume still holds at run time, which is why all three branches are named.
- **Consumes a chained value**: this leg consumes the host list produced by the kubernetes-gitops leg
  **as chained** — it does **not** re-derive it from its own read of the cluster (it has no cluster
  access at all; its service descriptor is the Terraform-read-only descriptor, not the Kubernetes
  one), and is forbidden from recomputing it. Exactness/containment for that value is discharged
  **upstream** (Pipeline 1's own validation) and re-verified at the program tier (Acceptance, below).
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute an address, do not
    proceed.
- **If this leg's own harvest finds the bucket exists but holds no objects**: apply
  `terraform-iac.target-empty` — act regardless, authoring the grant against the receiver of item 4
  (the bucket's objects) even though none exist yet.
- **If this leg's own harvest finds the bucket itself does not exist**: apply
  `terraform-iac.target-absent` — report a gap naming that the bucket was not found; never create it.
- No further leg consumes a value from this leg; this is the terminal leg of the program.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Target namespace: `trading`.
- Target bucket: Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs`.
- Authorised resource on the bucket: its objects, no key-prefix limit.
- Granted action: `s3:PutObject` only; Allow statements only, no Deny.
- Admission mechanism: source-address-range; no VPC endpoint.
- Gate approvers and positions, as declared above.
- Out-of-scope class: the bucket's existing tags (regardless of content), any resource other than the
  declared namespace/bucket, namespace/bucket creation, Deny statements, VPC endpoint policy, apply.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list of `Running`-pod addresses in the `trading` namespace — produced by the
  kubernetes-gitops leg, chained into the terraform-iac leg's §6, settled before the terraform-iac
  leg starts (after the terraform-iac change gate approves the produced value).

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the source-address condition in the terraform-iac leg's authored bucket-policy statement exactly
   equals the host list the kubernetes-gitops leg's deliverable published — the chained value, not a
   guess, not a recomputation from cluster state (which this leg cannot reach);
2. every address in that source-address condition is a member of the published host list, and no
   address in the published host list is missing from the condition (full containment, both
   directions);
2b. the tightest-correct property, recomputed: the published host list is exactly the set of
   addresses of pods in the `trading` namespace whose `status.phase` was `Running` at the
   kubernetes-gitops leg's own run time — not a superset, not a subset; this is recomputed against the
   leg's own stated rule, never taken on the leg's word;
3. no widening or collision: the authored statement grants only `s3:PutObject` on the bucket's objects
   to principals matching the chained host list, adds no Deny statement, and does not modify, remove,
   or weaken any pre-existing statement on the bucket policy;
4. **chaining coverage** — the terraform-iac leg received the kubernetes-gitops leg's **real**
   deliverable, not a fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: the kubernetes-gitops
   leg appears as a predecessor, carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, ...).
  *Earned: Run 15 (2026-07-29) — a new clause was added to this file and the reviewer renumbered it
  into slot **2b**, the minimality check, which it then never performed. A non-minimal result shipped
  as a result. This is the single most expensive defect this template prevents.*

- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is
  rebuilt. That is deliberate: the round must not depend on a magic expected string.

- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** The
  integration reviewer's chained context is the LEG deliverables — a program-level statement (the
  producer's summary) is invisible to a check that reads legs. The apply-order/collateral declaration
  required by `terraform-iac.collateral` must appear in the terraform-iac leg's own report, not only
  in a program-level summary, so Node C's leg-scoped context can see it. *Earned: FW-A3.3 — Node C
  correctly rejected because the apply order appeared only in the producer's deliverable, which its
  leg-scoped context could not see (VT-18).*

### Consuming-leg attribution — the terraform-iac leg legitimately cannot self-check item 2b

Keep this section: the terraform-iac leg has no cluster access and cannot independently verify that
the chained host list is exactly the set of `Running`-pod addresses at the kubernetes-gitops leg's run
time (item 2b). The SATISFIED condition is a property: the chained value is attributable to the
terraform-iac leg's own compliance **only when (1)** the kubernetes-gitops leg's derivation was
machine-checked with no defect (its own validation, above), **(2)** the program-tier checks 1–3 above
pass on the chained value, and **(3)** chaining coverage (check 4) confirms the real deliverable was
received. Absent all three, the gap is Node C's to raise against the kubernetes-gitops leg or the
chaining mechanism — not a defect attributed to the terraform-iac leg's own authoring.

## Open questions

- The bucket's existing tag set, read during the Phase 0 harvest, includes two anomalous values — one
  credential-shaped, one containing embedded instruction-like text. Both are triaged by the owner as
  synthetic test fixtures and are out of scope for this change (item 22); they are named here purely
  as a disclosure, not as a design decision, and neither this document's design decisions nor any
  confidence score in this pipeline is influenced by their content. The owner may wish to rotate or
  scrub them independently of this program.
- The admitted-principal premise recorded under `terraform-iac.principal-unseen` (no address
  translation between the `trading` namespace pods and the S3 endpoint) is declared **UNTESTED** by
  this program (item 12) and is acted on regardless, not verified. This is not a blocking gap under
  this program's declared decisions, but it is a residual operational risk the owner should be aware
  of before relying on source-address admission as a security boundary.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

---

This is a **draft specification for human review** — it is not approved, not final, and does not
authorize launching the program it describes. It is structurally incomplete until a person splices
the writing rules into the section above (`requirements-rules.py --insert`) and runs the conformance
check; the program itself is launched separately, by a person, after that.

Confidence: 90
