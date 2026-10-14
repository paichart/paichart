# Program Requirements — Trading Namespace Write Access to `acme-app-logs`

- Authored in: Log archive write — requirements spec · Specification
- Iteration: 20261008-2117 · 2026-10-08

> ⚠️ "Authored in" is where this document was WRITTEN, not where the program it describes RUNS. Those are normally different phases, and may be different POVs. The running phase is chosen by whoever launches the program, after this document exists — so it is not knowable here, and a header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- 2 legs (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of one — these are two distinct domains, not two phases of one protocol:
  1. **kubernetes-gitops** (UPSTREAM) on the `trading` namespace's pods (derivation surface only, read-only), described in `topology.json`.
  2. **terraform-iac** (DOWNSTREAM) on the `acme-app-logs` bucket policy (Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`).
- Any Kubernetes resource other than the pods of the `trading` namespace (including creation of any NetworkPolicy object — the kubernetes-gitops leg changes nothing on the cluster per its declared scope); any cloud resource other than the `acme-app-logs` bucket policy; the bucket's `tags`/`tags_all` attributes (accepted fixture drift, excluded from this program by its own objective); and creation of either the namespace or the bucket (both legs report a gap rather than create their target) are explicitly **out of scope**.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of the `trading` namespace | (declared — item 2: "The target namespace is `trading`.") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | every running pod in the `trading` namespace; the leg reports the literal membership criterion it applied in its own deliverable | (declared — item 5: "The derivation's population is every running pod in the namespace of item 2, and the leg reports, in its own published deliverable (report.md), the literal criterion it applied.") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list — each running pod's address exactly | (declared — item 14: "The derived value is expressed as a host list - each running pod's address exactly.") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap — report a gap, produce no value | (declared — item 15: "If no running pod is found in the namespace of item 2, the cluster leg reports a gap and produces no value (gap).") |
| kubernetes-gitops.target-absent *(added — the leg's own existence branch has no slot in the standard rows below since this leg is not an authorisation leg, but the branch is real and governs the leg's objective)* | the declared namespace does not exist | gap | gap — report a gap; never create the namespace | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace.") |
| terraform-iac.target | which surface of the leg's service does it act on | — | the bucket policy of `aws_s3_bucket.app_logs` (bucket `acme-app-logs`), workspace `prod` | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`); it is the log archive.") |
| approver.plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com.") |
| approver.kubernetes-gitops | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com.") |
| gate.kubernetes-gitops.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg | (declared — item 9: "sits before the cluster leg (before-leg)") |
| approver.terraform-iac | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com.") |
| gate.terraform-iac.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "sits after the producer and before the consumers (after-producer-before-consumers)") |

### A leg that grants or removes access (authorisation) — terraform-iac only

The kubernetes-gitops leg grants and removes no access (item 1: "The cluster leg grants and removes no access and changes nothing; it only derives... The bucket is the only enforcer.") and so carries no rows in this block.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the bucket's objects, no key-prefix limit | (declared — item 4: "On the bucket, the authorised resource is its objects, with no key-prefix limit.") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination | source-address-range: the admitted principal is the source-address value produced by the kubernetes-gitops leg (no VPC endpoint declared) | (declared — item 11: "The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces (items 1 and 5).") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless; the premise that pod source addresses reach the bucket unchanged (no address translation on the path) is recorded as **UNTESTED** | (declared — item 12: "the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path.") |
| terraform-iac.granted-action | what the admitted principal may do | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only.") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded | preserve — the leg adds only its own statement and changes no other | (declared — item 18: "Existing statements on the bucket policy are preserved (preserve): the leg adds only its own statement and changes no other.") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act — author against the declared receiver regardless | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act).") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create — a new policy holding only this grant | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only this grant.") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap — report a gap; never create the bucket | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket.") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer | Allow statements only, no Deny statement; the package states what else, if anything, the change affects | (declared — item 21: "On the bucket, the leg adds Allow statements only and no Deny statement; its package states what else, if anything, the change affects.") |

### A leg that changes routes (routing)

Not applicable — neither leg adds, suppresses, filters, withdraws, or replaces a route or its advertisement. (The bucket policy filters *traffic*, which is authorisation, not routing.)

## Decisions needed from the owner

Every row above is `(declared — item N: ...)`. **None.**

## Why this is sequenced — the design rationale, read before questioning the DAG

> Is every value the downstream domain needs knowable before the upstream domain runs?
>  - Yes ⇒ parallel; the values belong in the interface contract.
>  - No ⇒ sequenced; the value must ride a DAG edge (inter-pipeline chaining).

**No.** The value the terraform-iac leg consumes — the host list of running-pod addresses — is a live Kubernetes fact: pods in a ReplicaSet-backed workload are rescheduled on restart, rollout, or node eviction, and each rescheduled pod is assigned a fresh address by the cluster's pod-network allocator. This is not a value that can be pinned in `topology.json` or agreed in a static interface contract at plan time: the Program Architect reads only `topology.json` and this file, with no live cluster access, and structurally cannot know which addresses will be running when the kubernetes-gitops leg actually executes. The value must therefore be produced at run time by the kubernetes-gitops leg and carried forward on a DAG edge (inter-pipeline chaining) into the terraform-iac leg's §6 Pipeline Context.

If someone guessed this value up front — e.g. hardcoding today's addresses into the plan, or widening the grant to a CIDR assumed to cover "wherever the pods happen to land" — a pod restart occurring any time between authoring and the bucket leg's execution would silently invalidate the grant: stale addresses no longer backed by any pod would remain admitted (an unnecessary residual grant) while the pods actually running at execution time would be denied `s3:PutObject` and the application would fail writes with no policy error pointing at the cause. Deriving the value at execution time, immediately before it is consumed, is what keeps the grant's recipient set correct against whichever pods are actually running at that moment.

## Approvals — one gate per domain, plus the program plan gate

Approvers are DECLARED, never chosen. Every approver below is transcribed from the design decisions above and marked (declared).

Declared approvers confirmed on the POV team (platform routes a gate only to a member; all three below are confirmed members of this POV's team as of this authoring):
- Program plan approver is Steve Terry, steve.terry@paichart.com (declared) — member (OWNER)
- kubernetes-gitops change approver is Josh Allen, josh.allen@paichart.com (declared) — member (SALES_ENGINEER)
- terraform-iac change approver is Jacob Wilcox, jacob.wilcox@paichart.com (declared) — member (SALES_ENGINEER)

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| intent / method | how the work will be done, before it is done | the plan gate | the leg it governs |
| produced value | a concrete value that already exists | the leg that PRODUCES that value | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry (declared) |
| kubernetes-gitops change | the method — which namespace, which pods count, how the value is derived (intent/method gate) | the program plan gate | the kubernetes-gitops leg | Josh Allen (declared) |
| terraform-iac change | the value produced by the kubernetes-gitops leg — the host list of running-pod addresses (produced-value gate) | the kubernetes-gitops leg (its producer) | the terraform-iac leg | Jacob Wilcox (declared) |

Dependency consequence (sequenced — both edges spelled out):
- `program plan gate → kubernetes-gitops gate` (the method gate runs after the plan gate).
- `kubernetes-gitops gate → kubernetes-gitops leg` (the leg runs only after its method is approved).
- `kubernetes-gitops leg → terraform-iac gate` (the produced-value gate runs after its producer).
- `kubernetes-gitops leg → terraform-iac leg` (direct edge: the downstream leg needs the produced host list itself, not merely the gate's approval).
- `terraform-iac gate → terraform-iac leg` (the leg depends on its own gate).

⚠️ The gate edge decides WHEN the terraform-iac leg may start; the direct edge from the kubernetes-gitops leg is HOW the host list reaches it. A terraform-iac leg wired to depend only on its gate would receive an empty chained context and have no value to consume.

## Pipeline 1 objective — kubernetes-gitops (UPSTREAM)

- Harvest the running pods of the `trading` namespace, read-only. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- Preconditions verified — at the Phase 0 Requirements State Harvester's harvest (this pipeline run, confidence 92/100): the `trading` namespace was reachable, and its pod population was confirmed completely enumerable via two independent read calls that agreed with each other. This leg re-runs its own harvest at execution time to derive the live membership; the precondition confirms enumerability only, not today's membership.
- The work: this leg makes **no changes** to the cluster (per `kubernetes-gitops.target`'s scope under item 1) — it is a derive-only leg. The bucket is the program's only enforcer.
- The derivation: apply the membership criterion "pod phase is Running AND every readiness condition (including `Ready` and `ContainersReady`) is True" (`kubernetes-gitops.population`) to every pod in the `trading` namespace, and express the result as a host list of each qualifying pod's address exactly (`kubernetes-gitops.representation`). Report the literal criterion applied, in the deliverable, per item 5.
- If the harvest returns no running pods: apply `kubernetes-gitops.inputs-empty` — report a gap naming that no pod in the `trading` namespace satisfied the Running+Ready criterion at execution time, and produce no host-list value. Never substitute an address from elsewhere.
- If the `trading` namespace itself does not exist at execution time: apply `kubernetes-gitops.target-absent` — report a gap; never create the namespace.
- The deliverable MUST publish, explicitly and prominently: the host list produced by `kubernetes-gitops.representation` applied to `kubernetes-gitops.population` — the exact set of running pods' addresses at this leg's own execution time. The terraform-iac leg depends on what this leg produces at run time, never on any address read while authoring this document.
- Validation (mechanical): re-run the pod enumeration against the `trading` namespace, re-apply the Running+Ready criterion, and republish — expected: the published host list is set-equal to the recomputation (every recomputed address is in the published list, and every published address is in the recomputation). Never the address literals or the count.

### ⚠️ This leg derives a value the downstream leg consumes

- The computation is shown in the design: the deliverable carries, per candidate pod, its name, its phase, and its readiness conditions, plus the re-runnable enumeration command and the literal set it returns — never a sentence stating the conclusion.
- Tightest-correct property (the host-list equivalent of minimality): the published set is exact set equality against the Running+Ready criterion — a pod satisfying the criterion but omitted, or a pod failing the criterion but included, is a REJECTABLE defect even if nothing else is violated.
- Re-selection first, escalation last: if a candidate pod's readiness is ambiguous on first read (e.g. a condition flips mid-query), re-query that pod before excluding or including it; escalate only if the cluster API itself is unreachable after retry — never declare "no pods" from a single inconclusive read.
- ⚠️ Verify by arithmetic, never by eyeballing — synthetic example: a pod at phase `Pending` with `Ready=False` must NOT be counted even if its container has zero restarts and it is expected to become ready shortly; only a pod whose phase is `Running` AND whose `Ready` and `ContainersReady` conditions are both `True` at the moment of the read qualifies. A pod that was running a moment ago and has since terminated does not qualify either — the criterion is evaluated fresh at execution time, not against a cached view.
- Verify member-by-member before publishing: every pod in the published list independently satisfies Running+Ready, and no pod satisfying Running+Ready is left out.
- ⚠️ Verify the premise before writing the objective: the Phase 0 harvest already confirmed the `trading` namespace is reachable and its pods enumerable — that premise holds; this leg's own re-harvest at execution time reconfirms it live.
- 🔴 State the null case: already stated above (`kubernetes-gitops.inputs-empty`, `kubernetes-gitops.target-absent`) — gap, no substitute value, ever.
- 🔴 Run your own rule: at execution time, apply the stated criterion to at least one individual pod from the live harvest and confirm, by that single worked application, that the criterion includes or excludes it as the published list says — before publishing the full set.
- 🔴 The machine check is a floor, not the bar: matching the recomputation satisfies the mechanical validation, but the requirement is satisfied only when the published set is the actual, currently-running, currently-ready pod population — not merely a set that happens to match a second read taken at nearly the same instant.

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- Harvest the `acme-app-logs` bucket (`aws_s3_bucket.app_logs`, workspace `prod`) and its policy, read-only. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- Preconditions verified — at the Phase 0 Requirements State Harvester's harvest (this pipeline run, confidence 92/100): the declared bucket exists in Terraform state, and its `policy` attribute is readable without redaction. This leg re-reads the policy at its own execution time to decide its existence-assumption branch below; the precondition confirms readability only, not which branch applies today.
- The work: author a change package that adds a single Allow statement to the bucket's policy, admitting `s3:PutObject` (`terraform-iac.granted-action`) against the bucket's objects with no key-prefix limit (`terraform-iac.receiver`), from the source-address principal produced by the kubernetes-gitops leg (`terraform-iac.admitted-principal`).
- Admitted-principal premise (`terraform-iac.admitted-principal`): the bucket's enforcement point must see each pod's real source address, unmodified, on the network path the request takes to reach S3 — no NAT or other address translation between pod egress and the bucket. This leg's own Terraform-state harvest has no visibility into the network path and structurally cannot confirm this. Apply `terraform-iac.principal-unseen` = act-regardless: proceed with the grant, and record "the pods' source addresses reach the bucket unchanged, with no address translation on the path" as an **UNTESTED premise** in the package's UNTESTED-premises list.
- Existence assumption (cite each row's id; never state which branch is true today — this leg decides at its own execution time): if this leg's own harvest finds no policy governing the bucket, apply `terraform-iac.enforcer-absent` → create a new policy holding only this grant. If it finds an existing policy, apply `terraform-iac.existing-grant` → preserve every existing statement verbatim, adding only this leg's new statement. If the declared bucket itself does not exist, apply `terraform-iac.target-absent` → report a gap; never create the bucket.
- This leg consumes the host list produced by the kubernetes-gitops leg **as chained** — it does not re-derive it and is forbidden from recomputing it. Containment of that host list against the kubernetes-gitops leg's declared population is discharged upstream and re-verified at the program tier (Acceptance, checks 1/2/2b below).
  - If §6 does not carry the kubernetes-gitops leg's host list at this leg's execution time: escalate. Do not guess, do not substitute, do not proceed.
- If this leg's own harvest finds the bucket's objects (the declared receiver) currently empty: apply `terraform-iac.target-empty` → act — author the grant against the declared receiver regardless (per item 20).
- No further leg consumes a value from this leg; it is the program's final (DOWNSTREAM) leg.

## Design constraints — split across the contract and the DAG

Static → the interface contract (knowable up front, agreed before either leg runs):
- target namespace: `trading`
- target bucket: `aws_s3_bucket.app_logs` (bucket `acme-app-logs`), workspace `prod`
- granted action: `s3:PutObject` only
- authorised receiver: the bucket's objects, no key-prefix limit
- admission mechanism: source-address-range (no VPC endpoint)

Runtime → the DAG edge (not knowable up front — see rationale above):
- the host list of running-pod addresses — produced by the kubernetes-gitops leg, chained into the terraform-iac leg's §6, settled before the terraform-iac leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per Writing rules #1 and #2) and a rollback plan.
- Apply is out-of-band and human-gated in every domain. This program produces approved change packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the host list consumed by the terraform-iac leg exactly equals the host list produced by the kubernetes-gitops leg — the chained value, not a guess, not a recomputation;
2. every address in the consumed host list is a member of the population the kubernetes-gitops leg declared (every pod satisfying its stated Running+Ready criterion against the `trading` namespace at its own execution time) — containment;
2b. the tightest-correct property — recompute the kubernetes-gitops leg's own re-obtained harvest against the stated criterion and confirm set equality (not mere containment) with the published host list; do not take the stated list on trust;
3. no-widening / no-collision — the bucket-policy statement the terraform-iac leg adds names only `s3:PutObject` and only the consumed host-list addresses as its principal condition; it neither widens to a broader range, a wildcard principal, or additional actions, nor replaces or removes any pre-existing statement on the policy;
4. chaining coverage — the terraform-iac leg received the kubernetes-gitops leg's real deliverable, not a fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`, `notChained []`) are platform facts the program gate computes mechanically; no reviewer tool exposes them, so Node C does not re-derive them and does not block for being unable to read them. Node C checks what its own chained context shows: the kubernetes-gitops leg appears as a predecessor, carrying its `report.md` deliverable — not an upstream output marked as a fallback, and not missing.

🔴 ⚠️ THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE. If a new requirement needs a number, it APPENDS (5, 6, ...).

Note these checks are properties, not hardcoded values — they stay valid when the environment is rebuilt.

⚠️ Require evidence where its reader looks, not only where it is convenient to write: the kubernetes-gitops leg's literal membership criterion (item 5's requirement) must appear in the kubernetes-gitops leg's own report, because Node C's chained context is leg deliverables, not a program-level summary.

### Consuming-leg attribution — the terraform-iac leg cannot self-check the host list

The terraform-iac leg has no visibility into the Kubernetes cluster and cannot independently verify that the host list it consumes is the correct running-pod population. This attribution is **SATISFIED** when, and only when: (1) the kubernetes-gitops leg's derivation was machine-checked with no defect (its own set-equality validation, above, passed); (2) the program-tier checks 1, 2, 2b, and 3 above pass on the chained value; and (3) chaining coverage (check 4) confirms the terraform-iac leg received the kubernetes-gitops leg's real deliverable. Absent all three, the terraform-iac leg's grant is not attributable to a verified population and the package is not acceptance-ready.

## Open questions

None — every design decision above is declared, and the one harvested gap (absence of a cluster-side NetworkPolicy in the `trading` namespace) does not bear on this program, since item 1 confirms the kubernetes-gitops leg performs no authorisation and the bucket is the program's sole enforcer.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

---

**Status note for the reviewer and the owner**: this is a **DRAFT SPECIFICATION for human review only**. It is structurally incomplete until a person splices the writing rules into the section above (`requirements-rules.py --insert`) and runs the conformance check. No program described here has been launched or approved; the program plan gate, and every change-gate above, remains to be exercised by its declared approver.

Confidence: 90 — Solid; every design-decision row traces to a quoted, numbered item in the task's declared blocks and is cross-checked against the Phase 0 harvest (bucket/namespace existence, policy readability, pod enumerability) without restating any harvested value as a static fact. The two points withheld: (1) I added one row (`kubernetes-gitops.target-absent`) not explicit in the template's standard "Every leg" list, to give item 16's namespace-absent branch a citable id — a reasonable extension per the role guidance's "add a row for any further decision," but a Reviewer could read it as scope creep; (2) the non-Kubernetes `collateral` answer (item 21) is declared cleanly, but I could not mechanically verify the Terraform/S3 enforcer has no analogous "isolation" side-effect the way the role guidance flags for Kubernetes NetworkPolicy — I assert none applies based on domain knowledge of S3 bucket policies, not a harvested check.
