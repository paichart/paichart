> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — trading namespace → log-archive bucket (write restriction)

- Authored in: Log archive write — requirements spec · Specification
- Iteration: Run 20261008-2330 · 2026-10-08
- Document status: **DRAFT for human review.** It has not been approved and is not ready to launch. It stays structurally incomplete until a person splices in the writing rules and runs the conformance check.

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. They are two distinct domains: two protocols, two target classes.
  1. **kubernetes-gitops** (UPSTREAM) on namespace `trading`, described in `topology.json`. This leg is read-only. It derives a value and changes nothing.
  2. **terraform-iac** (DOWNSTREAM) on Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`). This leg authors the bucket-policy change, and the bucket is the only enforcer.
- The following are explicitly **out of scope**:
  - any namespace other than `trading`;
  - any cloud resource other than the declared bucket and the single Terraform resource that manages its policy;
  - any change to any cluster object, including network or egress policy objects;
  - creating the namespace or the bucket;
  - any VPC endpoint;
  - any bucket action other than `s3:PutObject`;
  - the bucket's existing tags;
  - applying any change. Every apply is out-of-band and human-gated.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of namespace `trading`. The leg only reads them. | (declared — item 2: "The target namespace is `trading`") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | every pod in `trading` whose phase is Running. Readiness is not a criterion. A pod with `hostNetwork: true` is excluded, and each excluded pod is listed in the leg's deliverable. | (declared — item 5: "every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion; a pod with hostNetwork: true is excluded") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: each selected pod's address exactly, with every entry a single host | (declared — item 14: "expressed as a host list - each running pod's address exactly") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: if no Running pod is found in `trading`, the leg produces a gap report and no value | (declared — item 15: "If no running pod is found in the namespace of item 2, the cluster leg reports a gap and produces no value (gap)") |
| kubernetes-gitops.target-absent | the declared target itself does not exist | gap · create-target | gap. The namespace is never created. | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace") |
| kubernetes-gitops.population-all-excluded | Running pods exist in `trading` but every one is excluded by the `hostNetwork` rule | gap · publish-empty | OPEN | OPEN — item 15 covers "no running pod is found", and no item states the outcome when Running pods exist but all are excluded; options: gap · publish-empty |
| terraform-iac.target | which surface of the leg's service does it act on | — | the policy of the bucket backed by Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`) | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)") |
| approver.program-plan | who approves this gate | — | steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.terraform-iac-change | who approves this gate | — | jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg | (declared — item 9: "The kubernetes-gitops change gate sits before the cluster leg (before-leg)") |
| gate.terraform-iac-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "The terraform-iac change gate sits after the producer and before the consumers (after-producer-before-consumers)") |

### A leg that grants or removes access (authorisation)

Only the terraform-iac leg is an authorisation leg. The kubernetes-gitops leg grants and removes no access (item 1), so its authorisation rows do not apply. They are listed as not-applicable under *Decisions needed from the owner*.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the bucket's objects, with no key-prefix limit (object ARN `arn:aws:s3:::acme-app-logs/*`) | (declared — item 4: "the authorised resource is its objects, with no key-prefix limit") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range. The admitted addresses are the host list produced by the kubernetes-gitops leg. A request from a listed address is admitted under any identity or none. | (declared — item 11: "The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces"); (declared — item 11: "any requester whose request arrives from a listed address is admitted, under any identity or none") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless. The leg records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path. | (declared — item 12: "the leg acts regardless (act-regardless)") |
| terraform-iac.granted-action | what the admitted principal may do (actions, ports) | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve-bounded. No existing statement is changed. The bound is the item-21 Deny: after the change, `s3:PutObject` is allowed only from a listed address. | (declared — item 18: "Existing statements on the bucket policy are preserved, bounded (preserve-bounded)") |
| terraform-iac.policy-managers-multiple | more than one Terraform resource manages the bucket's policy | gap · consolidate | gap. The leg does not consolidate them. | (declared — item 18: "If more than one Terraform resource manages the bucket's policy, the bucket leg reports a gap and does not consolidate them") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act. The leg authors against the receiver even when the bucket holds no objects. | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act)") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create. The new policy holds only the two item-21 statements. | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only the statements of item 21") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap. The bucket is never created. | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | Every writer whose request does not arrive from a listed address loses `s3:PutObject` on the bucket. The change package states this, and states every other effect of the change, if any. | (declared — item 21: "every other writer of the bucket loses write access, and the bucket leg's change package states this and what else, if anything, the change affects") |
| terraform-iac.existing-tags | the bucket's existing tags | leave-unchanged · change | leave-unchanged. Neither leg acts on or changes them. | (declared — item 21: "neither leg acts on or changes them") |

### A leg that changes routes (routing)

No leg in this program adds, suppresses, filters, withdraws or replaces a route. The terraform-iac leg filters traffic through a bucket policy, which is authorisation, not routing. The kubernetes-gitops leg changes nothing. The routing rows of both legs are therefore not applicable. They are listed as not-applicable under *Decisions needed from the owner*.

## Decisions needed from the owner

kubernetes-gitops.population-all-excluded — Running pods exist in `trading` but every one is excluded by the `hostNetwork` rule — options: gap · publish-empty — governs: Pipeline 1 objective, null outcome (every Running pod excluded) — tier: blocking
kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg grants and removes no access on its target (item 1); the bucket is the only enforcer
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg grants and removes no access on its target (item 1)
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg grants and removes no access on its target (item 1); no enforcer sits on this leg
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg grants and removes no access on its target (item 1)
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg grants and removes no access and changes nothing (item 1)
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg authorises no receiver (item 1); its empty-input case is kubernetes-gitops.inputs-empty
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: Pipeline 1 objective — tier: not-applicable — the cluster leg creates no policy object; the bucket is the only enforcer (item 1)
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: Pipeline 1 objective — tier: not-applicable — no enforcement applies on the cluster; the leg changes nothing (item 1)
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 1 objective — tier: not-applicable — the leg adds no advertised covering route; it changes nothing (item 1)
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 1 objective — tier: not-applicable — the leg is not a routing leg; it changes no route
terraform-iac.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 2 objective — tier: not-applicable — the leg adds no advertised covering route; its change is a bucket policy (traffic authorisation, not routing)
terraform-iac.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 2 objective — tier: not-applicable — the leg is not a routing leg; it changes no route

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel.** It is applied explicitly here, with the answer recorded below:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.**

The terraform-iac leg's Allow and Deny statements are keyed on the admitted source addresses (items 11 and 21). Those addresses are the host list the kubernetes-gitops leg derives from live pod state (items 1, 5 and 14).

A pod's address is assigned by the cluster when the pod is scheduled. It changes whenever a pod is rescheduled, restarted onto a new sandbox, scaled, or the environment is rebuilt. Which pods count also changes at run time, because phase and `hostNetwork` are both read live.

So the value cannot be pinned in a static artifact or agreed in a contract. The Program Architect reads only `topology.json` and this file, with **no live state access**, so it structurally cannot know the value.

This is a derivation, not a lookup:
- the population rule (item 5) decides membership;
- the representation rule (item 14) decides the form;
- the null rule (item 15) decides what happens when nothing qualifies.

A host list guessed up front would have two failure modes:
- **Wrong today:** the Allow statement admits addresses that belong to no qualifying pod (wider than declared), and the Deny locks out pods that do qualify.
- **Right today, wrong at run time:** the same two failures appear once the pods change.

Either way, every gate downstream would grade a policy against a value nobody derived.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it in *Decisions needed from the owner*. Never pick a name from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster assigned four of five gates to different people.

**Declared approvers confirmed on the POV team.** The platform routes a gate only to a MEMBER; a declared approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one. Membership was checked against the POV team on 2026-10-08:
- Program plan approver is Steve Terry steve.terry@paichart.com (declared) — member
- kubernetes-gitops change approver is Josh Allen josh.allen@paichart.com (declared) — member
- terraform-iac change approver is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

Both columns are filled for every gate:

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | steve.terry@paichart.com (declared) |
| kubernetes-gitops change | **intent / method**: which namespace, which pods count, and how the value is derived, before the kubernetes-gitops leg runs (item 9) | the program plan gate | the kubernetes-gitops leg | josh.allen@paichart.com (declared) |
| terraform-iac change | **produced value**: the host list produced by the kubernetes-gitops leg, once it exists, before the terraform-iac leg uses it (item 10) | the kubernetes-gitops leg (the producer) | the terraform-iac leg | jacob.wilcox@paichart.com (declared) |

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
declared and raise it as an open question. *(Here the two domain gates have distinct declared approvers.)*

**Dependency consequence, stated explicitly.** Notation: `A → B` means B depends on A, so B cannot start until A completes.
- `Program Architect → program plan gate`
- `program plan gate → kubernetes-gitops change gate`, and `program plan gate → every leg`
- `kubernetes-gitops change gate → kubernetes-gitops leg`. This is the before-leg method gate (item 9).
- `kubernetes-gitops leg → terraform-iac change gate`. This is the produced-value gate, which sits after its producer (item 10).
- `terraform-iac change gate → terraform-iac leg`
- `kubernetes-gitops leg → terraform-iac leg`. This **direct edge** carries the host list.

  The downstream leg depends on **its own gate** AND on **the upstream leg**, and the gate also depends on the upstream leg.

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

- **Harvest (read-only):** the namespace `trading` and every pod in it, **read-only**. For each pod the leg reads phase, `spec.hostNetwork` and `status.podIP`. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-08:** the authoring-time harvest of Run 20261008-2330 Phase 0 was read. It used `k8s-rig-readonly`: `list_resource_names` for pods in `trading`, then `get_resource` per pod. It confirmed two properties: the namespace exists, and at least one pod in it meets the item-5 criterion. This is a pointer and a property only; the run must re-establish both from its own harvest.
- **The leg grants and removes no access and changes nothing** (item 1). Its deliverable contains no change to any cluster object.
- **Derivation:**
  - **Selection** (`kubernetes-gitops.population`): select every pod in `trading` whose phase is `Running`, whatever its readiness. Exclude every pod whose spec sets `hostNetwork: true`. A pod whose spec does not set `hostNetwork` is not excluded.
  - **Representation** (`kubernetes-gitops.representation`): emit each selected pod's address (`status.podIP`) exactly. The result is a host list in which every entry is a single host (`/32` for IPv4, `/128` for IPv6), with no summarisation.
- **If the namespace does not exist:** produce a gap report naming the missing namespace, and publish no value. The namespace is never created (`kubernetes-gitops.target-absent`).
- **If the harvest returns no Running pod in `trading`:** produce a gap report naming what was absent (a pod in phase `Running` in `trading`) and what would have to exist. Publish no value and never a substitute value (`kubernetes-gitops.inputs-empty`).
- **If Running pods exist but every one is excluded by the `hostNetwork` rule:** produce a gap report naming the undecided row `kubernetes-gitops.population-all-excluded`.
- **The deliverable MUST publish, explicitly and prominently:**
  - (a) the host list produced by the kubernetes-gitops leg under the item-5 rule;
  - (b) the literal selection criterion it applied, in its own published deliverable (report.md), as item 5 requires;
  - (c) every excluded pod, by name, or the statement that none was excluded;
  - (d) the input block: the harvested pod records the derivation read.

  The downstream leg depends on what this leg PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical):** these checks run against the leg's own saved input block (`pods-input.json`, the `kubectl get pods -n trading -o json` output it derived from). They are therefore deterministic and immune to pod churn after the harvest.
  ```
  jq -r '.items[] | select(.status.phase=="Running" and ((.spec.hostNetwork // false) != true)) | .status.podIP' pods-input.json | sort -u > recomputed.txt
  sort -u published-host-list.txt | diff - recomputed.txt && echo MATCH
  ```
  Expected: `MATCH`, with no diff lines.
  ```
  jq -r '.items[] | select(.status.phase=="Running" and .spec.hostNetwork==true) | .metadata.name' pods-input.json | sort -u | diff - <(sort -u published-excluded-pods.txt) && echo MATCH
  ```
  Expected: `MATCH`.
  ```
  grep -vxFf recomputed.txt published-host-list.txt; echo "exit=$?"
  ```
  Expected: `exit=1`. No published address lies outside the recomputation.
  ```
  kubectl get pods -n trading -o json | jq -S '[.items[] | {n:.metadata.name, p:.status.phase, h:(.spec.hostNetwork // false), ip:.status.podIP}] | sort_by(.n)' | diff - <(jq -S '[.items[] | {n:.metadata.name, p:.status.phase, h:(.spec.hostNetwork // false), ip:.status.podIP}] | sort_by(.n)' pods-input.json) && echo MATCH
  ```
  This live freshness check expects `MATCH` when it runs immediately after the harvest. If it shows a diff, the pods have changed since the harvest: the host list must be re-derived. It is not a derivation defect.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs. For this host list the tightest-correct result has three properties: every entry is a single host, every entry is the address of a selected pod, and no entry is anything else.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise. Here, a pod that fails the item-5 criterion rules out that pod only, never the namespace.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** The examples below use synthetic values from the TEST-NET-1 documentation range:
  - **Do not summarise the list.** Pods at `192.0.2.5` and `192.0.2.6` are adjacent, but their smallest common prefix is `192.0.2.4/30`. That prefix also admits `192.0.2.4` and `192.0.2.7`, which belong to no selected pod.
  - **A prefix is not a host list.** Even an aligned pair such as `192.0.2.4` and `192.0.2.5` must stay two single-host entries (`192.0.2.4/32`, `192.0.2.5/32`). Its `/31` may cover the same two addresses, but it is a prefix, not a host list.
  - **Never use the node's address.** A pod's `status.hostIP` is its node's address, for example `198.51.100.10`. Publishing it in place of `status.podIP` admits every process on that node.

  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and
  nothing foreign is.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An
  objective naming inputs the target does not hold is unsatisfiable, and the leg will either escalate
  (correct) or find a value somewhere (plausible and wrong). Probing that the service ANSWERS proves
  it is alive, not that it holds what you are about to ask about. Read a harvest — a fresh one or a
  prior run's — before writing the derivation clause.
  *Earned: 2026-09-20 — an objective asked for a cover over harvested private subnet CIDRs in a
  workspace holding two resources and no subnets. All three endpoints had been probed and answered.*
- 🔴 **STATE THE NULL CASE, always.** Say what the correct outcome is when the harvest yields no
  inputs. An objective that only describes the success path forces improvisation at the worst layer:
  the brief a harness composes at CREATE runs BEFORE the harvest, so it presupposes the derivation
  and instructs a later agent to carry forward a block that may never exist. A named null outcome
  ("produce a gap report; author nothing") is satisfiable; silence is not.
  *Earned: 2026-09-20 — the Design correctly declined to derive from an empty harvest, and the Author,
  holding a brief that demanded the block, imported a range from an unrelated pipeline and authored a
  policy permitting writes from switch loopback addresses. Its reviewer graded the import a
  non-blocking observation and approved at 92; the harness gate escalated and refused to release.
  Re-run with the null case stated, it produced a correct gap report on the first attempt.*
- 🔴 **RUN YOUR OWN RULE. A stated derivation rule and the value it publishes are two artifacts, and
  nothing else checks they agree.** Apply the rule you wrote, literally and step by step, to one
  input, and confirm it produces the value you published — including the WIDTH of the result. Every
  other instruction here verifies the VALUE (is it minimal, is it contained, does it trace to a
  harvested input); this one verifies the RULE. A rule that does not produce its own output ships a
  correct-looking value with a wrong method, and every downstream tier that "recomputes using the
  stated convention" then fails against a value that is actually right.
  *Earned 2026-09-21: an authoring pass wrote "zero-pad each octet to 4 hex digits and concatenate",
  which yields 16 hex digits, and published a well-formed 12-digit identifier — one group shorter
  than its own rule produces. The published value was correct; the stated method could not have
  produced it. Its own reviewer check said "recompute using the stated convention", which would have
  mismatched a correct value. Two other passes over the same objective used a self-consistent
  convention and agreed with each other, so this is a per-run slip, not a general one — which is
  exactly why a mechanical self-check belongs here rather than a house convention.*
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- **Harvest (read-only):**
  - Terraform workspace `prod`, **read-only**;
  - the resource `aws_s3_bucket.app_logs`, including its policy attribute;
  - every Terraform resource in that workspace that manages the policy of bucket `acme-app-logs`.

  Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — 2026-10-08:** the authoring-time harvest of Run 20261008-2330 Phase 0 was read. It used `terraform-rig-readonly`: `state_list`, then `state_pull` on `aws_s3_bucket.app_logs`. It confirmed one property: the declared resource address exists in workspace `prod` state. This is a pointer and a property only; the run decides every branch below from its own harvest.
- **The work:**
  - Author a Terraform change to the policy of bucket `acme-app-logs`. The receiver is `arn:aws:s3:::acme-app-logs/*`, the bucket's objects with no key-prefix limit (`terraform-iac.receiver`).
  - Add exactly two statements, and nothing else (`terraform-iac.granted-action`, item 21):
    - **Allow**: Sid `AllowPutObjectFromTradingPods`, Principal `"*"`, Action `s3:PutObject`, Resource the receiver, Condition `IpAddress` on `aws:SourceIp` equal to the chained host list.
    - **Deny**: Sid `DenyPutObjectFromOtherAddresses`, Principal `"*"`, Action `s3:PutObject`, Resource the receiver, Condition `NotIpAddress` on `aws:SourceIp` equal to the same list.
  - Each chained address appears as a single-host entry (`/32` IPv4, `/128` IPv6).
  - The Principal `"*"` follows from `terraform-iac.admitted-principal`: a request from a listed address is admitted under any identity or none (item 11).
  - The change touches no tag (`terraform-iac.existing-tags`).
- **Exemplar stanza: the create branch, complete.** Every line appears, in order. Placeholders are in angle brackets.
  ```hcl
  resource "aws_s3_bucket_policy" "<NAME_CHOSEN_BY_LEG>" {
    bucket = aws_s3_bucket.app_logs.id
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Sid       = "AllowPutObjectFromTradingPods"
          Effect    = "Allow"
          Principal = "*"
          Action    = "s3:PutObject"
          Resource  = "${aws_s3_bucket.app_logs.arn}/*"
          Condition = {
            IpAddress = {
              "aws:SourceIp" = [<EACH_CHAINED_ADDRESS_AS_SINGLE_HOST>]
            }
          }
        },
        {
          Sid       = "DenyPutObjectFromOtherAddresses"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:PutObject"
          Resource  = "${aws_s3_bucket.app_logs.arn}/*"
          Condition = {
            NotIpAddress = {
              "aws:SourceIp" = [<EACH_CHAINED_ADDRESS_AS_SINGLE_HOST>]
            }
          }
        }
      ]
    })
  }
  ```
  On the existing-grant branch, the same two statement objects are appended to the existing managing resource's `Statement` array, and every existing statement stays byte-unchanged.
- **Forbidden tokens in the change.** None of the following may appear:
  - wildcard actions: `s3:*`, `s3:Put*`, `s3:PutObject*`;
  - any action other than `s3:PutObject` in the added statements;
  - VPC-endpoint condition keys: `aws:SourceVpce`, `aws:SourceVpc`, `aws:VpcSourceIp` (no VPC endpoint is declared);
  - a Resource carrying a key prefix;
  - any address entry wider than a single host;
  - a `tags` or `tags_all` argument;
  - `force_destroy`;
  - a new `aws_s3_bucket` resource.
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the bucket must see each pod's own address as the request's source address (`aws:SourceIp`) on the path from the pods to the bucket, with no address translation.
  - If this leg's own harvest cannot confirm it, apply `terraform-iac.principal-unseen`: act regardless.
  - In that case, record the premise *"the pods' source addresses reach the bucket unchanged, with no address translation on the path"* under a section of the change package headed **UNTESTED premises**.
- **Existence assumption** (*Writing rules* #6). The leg's own harvest decides the branch:
  - The bucket of item 3 is absent from workspace state: apply `terraform-iac.target-absent` (a gap report, and the bucket is never created).
  - No Terraform resource manages the bucket's policy: apply `terraform-iac.enforcer-absent` (create one holding only the two item-21 statements).
  - Exactly one resource manages it: apply `terraform-iac.existing-grant` (preserve-bounded).
  - More than one resource manages it: apply `terraform-iac.policy-managers-multiple` (a gap report, with no consolidation).
  - The bucket holds no objects: apply `terraform-iac.target-empty` (author regardless).
- **Consumed value:** the leg consumes the host list produced by the kubernetes-gitops leg **as chained**. It does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**, or carries the upstream leg's gap report instead of a host list, the leg escalates. It does not guess, does not substitute and does not proceed.
- **Null outcomes for this leg's own harvest:**
  - No bucket is found: apply `terraform-iac.target-absent`.
  - The receiver matches no object: apply `terraform-iac.target-empty`.

  The 🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **Collateral, published in the change package** (`terraform-iac.collateral`): the package states that every writer whose request does not arrive from a listed address loses `s3:PutObject` on the bucket. It also states every other effect of the change, or "none".
- **No further leg consumes from this one.**
- **Validation (mechanical, pre-apply on the plan).** The prerequisites are `published-host-list.txt` (as chained) and `pre-policy.json`, which is the policy document from the leg's harvest, or `{"Statement":[]}` when none exists.
  ```
  terraform -chdir=<prod root> workspace select prod
  terraform -chdir=<prod root> plan -out=tfplan
  terraform -chdir=<prod root> show -json tfplan > plan.json
  ```
  1. Exactly one resource manages the bucket's policy in the plan. The leg extracts its planned `policy` value to `policy.json` and publishes the extraction command.
     ```
     jq '[.planned_values.root_module | .. | objects | select(.type? and ((.type=="aws_s3_bucket_policy" and .values.bucket=="acme-app-logs") or (.type=="aws_s3_bucket" and .values.bucket=="acme-app-logs" and ((.values.policy // "") != ""))))] | length' plan.json
     ```
     Expected: `1`.
  2. Allow statement shape.
     ```
     jq -r '.Statement[] | select(.Sid=="AllowPutObjectFromTradingPods") | [.Effect, (.Principal|tostring), (.Action|tostring), (.Resource|tostring), ([.Condition|to_entries[]|.key+":"+(.value|keys|join(","))]|join(";"))] | @tsv' policy.json
     ```
     Expected: `Allow	*	s3:PutObject	arn:aws:s3:::acme-app-logs/*	IpAddress:aws:SourceIp`
  3. Deny statement shape: the same command with Sid `DenyPutObjectFromOtherAddresses`.
     Expected: `Deny	*	s3:PutObject	arn:aws:s3:::acme-app-logs/*	NotIpAddress:aws:SourceIp`
  4. Address sets equal the chained list, each as a single host.
     ```
     awk '{print ($0 ~ /:/) ? $0"/128" : $0"/32"}' published-host-list.txt | sort -u > expected-ips.txt
     for s in AllowPutObjectFromTradingPods DenyPutObjectFromOtherAddresses; do jq -r --arg s "$s" '.Statement[] | select(.Sid==$s) | .Condition[] | .["aws:SourceIp"] | if type=="string" then [.] else . end | .[]' policy.json | sort -u | diff - expected-ips.txt && echo "$s MATCH"; done
     ```
     Expected: `AllowPutObjectFromTradingPods MATCH` and `DenyPutObjectFromOtherAddresses MATCH`.
  5. Existing statements are preserved byte-for-byte.
     ```
     diff <(jq -S '[.Statement[] | select(.Sid!="AllowPutObjectFromTradingPods" and .Sid!="DenyPutObjectFromOtherAddresses")]' policy.json) <(jq -S '.Statement' pre-policy.json) && echo PRESERVED
     ```
     Expected: `PRESERVED`. On the create branch, `pre-policy.json` holds no statements, so the comparison is against `[]`.
  6. No tag is touched by the authored diff.
     ```
     git diff <base> -- '*.tf' | grep -E '^[+-][^+-].*\btags(_all)?\b'; echo "exit=$?"
     ```
     Expected: `exit=1`. Known tag drift can appear in a plan independently of this change, which is why this check reads the authored diff.
  7. The required package sections are present.
     ```
     grep -c -E '^#+ (UNTESTED premises|Collateral)' report.md
     ```
     Expected: `2`.

  **Post-apply** (out-of-band, run by the operator): `aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text > policy.json`, then checks 2–5 again. Expected: identical outputs.
- **Rollback plan:**
  - **Existing-grant branch:** restore the managing resource's policy to `pre-policy.json`.
  - **Create branch:** remove the created policy resource.
  - **Verification:** `aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text | jq -S .Statement` then returns the `pre-policy.json` statements. On the create branch, the command instead fails with `NoSuchBucketPolicy`.

## Design constraints — split across the contract and the DAG

**Static → the interface contract.** These values are knowable up front and agreed before either leg runs. They are declared values, reference data rather than evidence:
- Target namespace: `trading` (item 2)
- Target bucket: Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs` (item 3)
- Receiver: `arn:aws:s3:::acme-app-logs/*`, with no key-prefix limit (item 4)
- Granted action: `s3:PutObject` only (item 13)
- Admission attribute: source address, `aws:SourceIp`, under any identity or none, with no VPC endpoint (item 11)
- Representation: a host list, one single-host entry per selected pod (item 14)
- Population rule: phase `Running`, readiness ignored, `hostNetwork: true` excluded (item 5)
- Approvers: the plan, kubernetes-gitops change and terraform-iac change gates, as declared in items 6–8

**Runtime → the DAG edge.** This value is not knowable up front; see the rationale section:
- The host list is produced by the kubernetes-gitops leg. It is chained into the terraform-iac leg's §6 over the direct edge, and settled (approved at the terraform-iac change gate) before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The `aws:SourceIp` set in both the Allow and the Deny statement of the terraform-iac leg equals exactly the host list published by the kubernetes-gitops leg, each entry as a single host. It is the chained value, not a guess and not a recomputation.
2. Every address in the host list published by the kubernetes-gitops leg is the `status.podIP` of a pod in that leg's input block that meets the item-5 criterion. Every such pod's address is in the list.
2b. Every entry is a single host (`/32` or `/128`), and the list has no duplicates and no prefix wider than one host. Recompute it from the kubernetes-gitops leg's input block by applying the item-5 rule; do not take the stated value on trust.
3. Nothing is widened and nothing collides:
   - the added statements grant only `s3:PutObject` on `arn:aws:s3:::acme-app-logs/*`;
   - exactly two statements are added;
   - every pre-existing statement is unchanged;
   - the Deny covers `s3:PutObject` from every address outside the list;
   - no tag and no cluster object is changed.
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. The kubernetes-gitops leg's report.md states the literal selection criterion it applied, and lists every excluded pod or states that none was excluded.
6. The terraform-iac leg's report.md carries an **UNTESTED premises** section whenever its own harvest did not confirm the admitted-principal premise. It also carries a **Collateral** section stating that every other writer loses `s3:PutObject`, plus any other effect.

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
  producer's summary) is invisible to a check that reads legs. If a check requires a statement
  (e.g. the apply-order declaration), require it IN EACH leg's objective so it appears in each leg's
  report. *Earned: FW-A3.3 — Node C correctly rejected because the apply order appeared only in the
  producer's deliverable, which its leg-scoped context could not see (VT-18).*

### Consuming-leg attribution — when a downstream leg legitimately cannot self-check

The terraform-iac leg consumes the host list but has no access to cluster state, so it cannot verify the list against its own harvest. Its consumption is SATISFIED when all three of the following hold:
1. The kubernetes-gitops leg's derivation was machine-checked with no defect: its Pipeline 1 validation outputs all read as expected.
2. Program-tier checks 1, 2, 2b and 3 pass on the chained value.
3. Chaining coverage (check 4) confirms the terraform-iac leg received the kubernetes-gitops leg's real deliverable.

## Open questions

- **Address churn versus a frozen host list.** Items 14 and 21 combine to freeze the pods' addresses into the policy at derivation time. A pod in `trading` that is rescheduled or replaced after the kubernetes-gitops leg runs gets an address outside the list, and the Deny then blocks its `s3:PutObject`. The program defines no refresh. The owner should confirm this is acceptable or declare a refresh mechanism.
- **Tag drift in a plan.** Item 21 declares the bucket's tags to be known drift that neither leg changes. A plan run against workspace `prod` may still propose reverting that drift, independently of this change. The change package does not carry any tag change, and how the out-of-band apply excludes the drift is outside this program. The owner should confirm the apply procedure.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 80
