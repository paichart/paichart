# Program Requirements — trading namespace write access to the log archive bucket

- Authored in: Log archive write — requirements spec · Specification
- Iteration: 20261008-2300v9 · 2026-10-08

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

> **DRAFT SPECIFICATION — for human review at the program plan gate. Not approved, not final, not ready to launch.**

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of one. Do not call two phases of one protocol two domains. Here the two legs are two distinct domains: two protocols, two target classes.
  1. **kubernetes-gitops** (UPSTREAM) on Kubernetes namespace `trading`, described in `topology.json`. This leg changes nothing. It derives the value the terraform-iac leg consumes (`kubernetes-gitops.work`).
  2. **terraform-iac** (DOWNSTREAM) on the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`). It authors the bucket-policy change. The bucket is the only enforcer.
- The following are explicitly **out of scope**:
  - any namespace other than `trading`;
  - any cloud resource other than the declared bucket and the Terraform resource that manages that bucket's policy;
  - any S3 action other than `s3:PutObject`;
  - any change on the cluster;
  - creating the namespace or the bucket;
  - consolidating several policy-managing resources into one;
  - the bucket's existing tags (`terraform-iac.existing-tags`);
  - creating, changing or verifying the network path, address translation or any VPC endpoint between the pods and the bucket;
  - **applying** any change.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | Kubernetes namespace `trading` | (declared — item 2: "The target namespace is `trading`") |
| kubernetes-gitops.work | what the leg does on its target | derive-only · change | derive-only: it derives, from the namespace's pods, the value the terraform-iac leg consumes. It grants, removes and changes nothing. | (declared — item 1: "it only derives, from the namespace's pods, the value the cloud leg consumes") |
| terraform-iac.target | which surface of the leg's service does it act on | — | `aws_s3_bucket.app_logs` in Terraform workspace `prod` (bucket `acme-app-logs`) | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | Every pod in namespace `trading` whose `status.phase` is `Running`. Readiness is not a criterion. A pod with `spec.hostNetwork: true` is excluded, and each excluded pod is listed in the leg's deliverable. The leg's own published deliverable states the literal criterion it applied. | (declared — item 5: "every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion; a pod with hostNetwork: true is excluded") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: each population pod's address exactly, one entry per address, never summarised into a prefix | (declared — item 14: "expressed as a host list - each running pod's address exactly") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: a gap report naming what was absent; no value is produced | (declared — item 15: "If no running pod is found in the namespace of item 2, the cluster leg reports a gap and produces no value (gap)") |
| kubernetes-gitops.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap; never create the namespace | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace") |
| approver.program-plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.terraform-iac-change | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg: it approves the method (which namespace, which pods count, how the value is derived) before the kubernetes-gitops leg runs | (declared — item 9: "sits before the cluster leg (before-leg)") |
| gate.terraform-iac-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers: it approves the host list produced by the kubernetes-gitops leg, once it exists, before the terraform-iac leg uses it | (declared — item 10: "sits after the producer and before the consumers (after-producer-before-consumers)") |

### A leg that grants or removes access (authorisation) — terraform-iac

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the objects of bucket `acme-app-logs`, with no key-prefix limit (`arn:aws:s3:::acme-app-logs/*`) | (declared — item 4: "the authorised resource is its objects, with no key-prefix limit") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: any requester whose request arrives from an address in the host list produced by the kubernetes-gitops leg, under any identity or none. No VPC endpoint is declared. | (declared — item 11: "The bucket admits by source address (source-address-range)") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless: author the change, and record as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path | (declared — item 12: "the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path") |
| terraform-iac.granted-action | what the admitted principal may do (actions, ports) | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only") |
| terraform-iac.added-statements | which statements the leg adds to the bucket policy | — | exactly one Allow statement for `s3:PutObject` from the listed addresses, and exactly one Deny statement for `s3:PutObject` from any other address | (declared — item 21: "The bucket leg adds one Allow statement for s3:PutObject from the listed addresses and one Deny statement for s3:PutObject from any other address") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve-bounded: no existing statement is changed. The bound is the Deny of `terraform-iac.added-statements`: after the change, `s3:PutObject` is allowed only from a listed address. | (declared — item 18: "Existing statements on the bucket policy are preserved, bounded (preserve-bounded)") |
| terraform-iac.policy-managers-multiple | more than one Terraform resource manages the bucket's policy | gap · consolidate | gap: report a gap and do not consolidate them | (declared — item 18: "If more than one Terraform resource manages the bucket's policy, the bucket leg reports a gap and does not consolidate them") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act: the leg still authors against the receiver of `terraform-iac.receiver` | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act)") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create: a policy holding only the two statements of `terraform-iac.added-statements` | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only the statements of item 21") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap: report a gap; never create the bucket | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer (this enforcer is an S3 bucket policy; no option enum is asserted for it here) | Every other writer of the bucket loses write access. The change package states this, and states what else, if anything, the change affects. | (declared — item 21: "every other writer of the bucket loses write access, and the bucket leg's change package states this and what else, if anything, the change affects") |
| terraform-iac.existing-tags | what the legs do with the bucket's existing tags | change · leave | leave: neither leg acts on or changes them | (declared — item 21: "The bucket's existing tags are known drift, triaged by the owner: synthetic test fixtures, out of scope for this change, accepted; neither leg acts on or changes them") |

The kubernetes-gitops leg grants and removes no access (item 1). Its authorisation rows are therefore deleted, apart from `kubernetes-gitops.target-absent`, which is kept above because its null branch cites it. Each deleted row is listed under *Decisions needed from the owner*.

### A leg that changes routes (routing)

No leg in this program adds a covering route, or suppresses, filters, withdraws or replaces routes. The terraform-iac leg filters traffic through a bucket policy, which is authorisation, not routing. The routing rows are deleted for both legs and listed under *Decisions needed from the owner*.

## Decisions needed from the owner

<!-- one line per row that is not simply declared:
<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable -->
kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: Pipeline 1 objective (no clause; row deleted; the empty-population case is governed by kubernetes-gitops.inputs-empty) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 1 objective (no clause; row deleted) — tier: not-applicable — the leg is not a routing leg: it adds, suppresses, filters, withdraws or replaces no route
terraform-iac.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: Pipeline 2 objective (no clause; row deleted) — tier: not-applicable — the leg adds no advertised covering route
terraform-iac.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: Pipeline 2 objective (no clause; row deleted) — tier: not-applicable — the leg is not a routing leg: it filters traffic through a bucket policy (authorisation) and adds, suppresses, withdraws or replaces no route

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.**

The terraform-iac leg needs **the host list produced by the kubernetes-gitops leg**: the addresses Kubernetes has assigned to the population pods in `trading` at the moment of that leg's read.

- **It cannot be known up front.** A pod address is allocated when the pod is scheduled. It changes whenever a pod is restarted, rescheduled, scaled or rolled out. So the value cannot be pinned in a static artifact or agreed in a contract. The Program Architect reads only `topology.json` and this file, with **no live state access**, so it structurally cannot know the value.
- **It is a design decision, not a lookup.** Which pods count (item 5) and how the value is expressed (item 14) are owner choices. The kubernetes-gitops change gate approves that method before the leg runs (item 9). The terraform-iac change gate then approves the value it produced, before the bucket uses it (item 10).
- **What goes wrong if someone guesses it.** Suppose a host list is pinned at authoring time or guessed in a contract. The Deny of `terraform-iac.added-statements` then blocks writes from the real pods, which are the writers the program exists to admit. The Allow then admits whatever later holds a stale address, in any namespace and under any identity (item 11). The value has to be read from live state by the producing leg and passed along the DAG edge.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- program plan approver is Steve Terry steve.terry@paichart.com (declared): member (POV owner)
- kubernetes-gitops change approver is Josh Allen josh.allen@paichart.com (declared): member
- terraform-iac change approver is Jacob Wilcox jacob.wilcox@paichart.com (declared): member

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

Fill the table with both columns, never just the first:

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry (declared) |
| kubernetes-gitops change | **intent / method**: which namespace, which pods count, how the value is derived (`gate.kubernetes-gitops-change.position`) | the program plan gate | the kubernetes-gitops leg | Josh Allen (declared) |
| terraform-iac change | **produced value**: the host list produced by the kubernetes-gitops leg (`gate.terraform-iac-change.position`) | the kubernetes-gitops leg | the terraform-iac leg | Jacob Wilcox (declared) |

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
- `program plan gate → kubernetes-gitops change gate → kubernetes-gitops leg`.
- Sequenced, so both edges are spelled out for the downstream terraform-iac leg. The downstream leg depends on **its own gate** AND on **the upstream leg**, and the gate also depends on the upstream leg. Write `kubernetes-gitops leg → terraform-iac change gate` AND `kubernetes-gitops leg → terraform-iac leg`, plus `terraform-iac change gate → terraform-iac leg`.

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

- Harvest the namespace `trading` and the pods in it **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-08, authoring run 20261008-2300v9**: the authoring pipeline's Phase 0 harvest, task "Harvest cluster + bucket state (trading namespace / acme-app-logs)", read the pod list of namespace `trading`. It confirmed two properties: the namespace exists, and at least one pod in it meets the population criterion of `kubernetes-gitops.population`. This is a pointer and a property only. The leg's own harvest decides both again at run time.

- **Work (`kubernetes-gitops.work`)**: derive the host list the terraform-iac leg consumes. The leg grants nothing, removes nothing, changes nothing on the cluster, and ships no manifest.
- **Derivation**:
  - Population (`kubernetes-gitops.population`): every pod in `trading` with `status.phase == "Running"`; readiness is not a criterion; a pod with `spec.hostNetwork: true` is excluded.
  - Representation (`kubernetes-gitops.representation`): a host list, holding each population pod's `status.podIP` exactly, one entry per address, sorted and de-duplicated.
  - The deliverable states the literal criterion it applied, and lists by name each pod excluded under the hostNetwork clause.
- **If the namespace `trading` does not exist**: apply `kubernetes-gitops.target-absent`. Report a gap naming the absent namespace, and never create it.
- **If the harvest returns no population pods**: apply `kubernetes-gitops.inputs-empty`. This covers two cases: no pod in `trading` has phase `Running`, or every `Running` pod is excluded under the hostNetwork clause. Report a gap naming exactly what was absent (pods in `trading` meeting the criterion of `kubernetes-gitops.population`). Produce no value, and NEVER a substitute value.
- **The deliverable MUST publish, explicitly and prominently**:
  - (a) **the host list produced by the kubernetes-gitops leg**, under the rule of `kubernetes-gitops.population` and `kubernetes-gitops.representation`, as `hosts.txt` (one address per line, sorted);
  - (b) the literal criterion it applied;
  - (c) the excluded-pod list, `excluded.txt` (one pod name per line, sorted; empty when none);
  - (d) its input block, `inputs.json`: for EVERY pod in `trading`, its `name`, `uid`, `phase`, `hostNetwork` (absent read as `false`) and `podIP`, produced by the projection below;
  - (e) the apply-order statement: "this leg applies nothing; the only change in this program is the terraform-iac bucket-policy change, applied out-of-band by a person after the terraform-iac change gate";
  - (f) rollback: "none — this leg changes nothing".

  The downstream leg depends on what this leg PRODUCES at run time, not on what you read while authoring.
- **Validation (mechanical)**: these steps give the read that gets the inputs again, then the rule applied again.
  1. Projection, which produces the input block. It is the same projection applied to the read-only service's pod list for `trading`:
     ```
     kubectl get pods -n trading -o json \
       | jq -S '[.items[] | {name:.metadata.name, uid:.metadata.uid, phase:.status.phase, hostNetwork:(.spec.hostNetwork // false), podIP:.status.podIP}] | sort_by(.name)'
     ```
  2. Rule applied again to the published input block:
     ```
     jq -r '.[] | select(.phase=="Running" and .hostNetwork!=true) | .podIP' inputs.json | sort -u | diff - hosts.txt
     ```
     Expected: no output, exit status `0`.
  3. Exclusions applied again:
     ```
     jq -r '.[] | select(.phase=="Running" and .hostNetwork==true) | .name' inputs.json | sort | diff - excluded.txt
     ```
     Expected: no output, exit status `0`.
  4. Live read applied again, run immediately after the leg publishes:
     ```
     kubectl get pods -n trading -o json | jq -r '.items[] | select(.status.phase=="Running" and (.spec.hostNetwork // false)!=true) | .status.podIP' | sort -u | diff - hosts.txt
     ```
     Expected: no output, exit status `0`. That means the published value equals what the live read gives, and every input read again lies inside it.
     - If step 4 prints lines, run step 1 and `diff` it against `inputs.json`.
     - If every difference involves a pod `uid` absent from `inputs.json`, or a pod since deleted, the value is stale, not wrongly derived. The leg derives it again before the terraform-iac change gate.
     - Any other difference is a derivation defect.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
  For this leg, the tightest-correct property is that the host list holds exactly the population's addresses. Each entry is one address, not a prefix. There are no duplicates and no address of a pod outside the population.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
  For this leg, the rule picks nothing from a pool: every population pod contributes its address. The only legitimate stop is `kubernetes-gitops.inputs-empty` or `kubernetes-gitops.target-absent`, and the leg names which pods it read.
- ⚠️ **Verify by arithmetic, never by eyeballing.** The trap here is summarising. Item 14 asks for a host list, so a prefix is a defect even when it covers exactly the same addresses. The example below uses synthetic documentation addresses:
  - `192.0.2.10` and `192.0.2.11` form an aligned pair. `192.0.2.10/31` covers exactly those two, and is still wrong here because it is not a host list.
  - `192.0.2.11` and `192.0.2.12` are adjacent but sit across a boundary. Their minimal cover is `192.0.2.8/29`, which takes in six addresses that are not population members.
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
  For this leg, the null cases are `kubernetes-gitops.inputs-empty` and `kubernetes-gitops.target-absent`, stated above.
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
  The rule worked on synthetic inputs (reference data only):

  | pod (synthetic) | phase | ready | hostNetwork | podIP | outcome |
  |---|---|---|---|---|---|
  | `a` | Running | true | absent | `192.0.2.10` | in host list as `192.0.2.10` |
  | `b` | Running | false | absent | `192.0.2.11` | in host list as `192.0.2.11` (readiness is not a criterion) |
  | `c` | Running | true | true | `198.51.100.7` (the node's) | excluded; listed in `excluded.txt` |
  | `d` | Pending | false | absent | none | not in the population |
  | `e` | Succeeded | false | absent | `192.0.2.12` | not in the population |

  Result: `hosts.txt` = `192.0.2.10`, `192.0.2.11`, and the terraform-iac leg writes these as `192.0.2.10/32`, `192.0.2.11/32`. `excluded.txt` = `c`.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- Harvest the Terraform state of `aws_s3_bucket.app_logs` in workspace `prod`, and every resource in that workspace's state that manages that bucket's policy, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — 2026-10-08, authoring run 20261008-2300v9**: the authoring pipeline's Phase 0 harvest, task "Harvest cluster + bucket state (trading namespace / acme-app-logs)", read workspace `prod` state. It confirmed that the resource address `aws_s3_bucket.app_logs` is present and names bucket `acme-app-logs`. This is a pointer and a property only. The leg's own harvest decides every existence branch below again.
- **Work**: author a change package for the policy of bucket `acme-app-logs`.
  - It adds the two statements of `terraform-iac.added-statements`, which grant only the action of `terraform-iac.granted-action` on the receiver of `terraform-iac.receiver`.
  - It admits under `terraform-iac.admitted-principal`: Principal `"*"`, conditioned only on the request's source address being in the consumed host list.
  - The policy is absent from harvested state, so the shape is given here as a COMPLETE exemplar (every line, in order, placeholders intact):
    ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        <every pre-existing statement, byte-for-byte unchanged — none when terraform-iac.enforcer-absent applies>,
        {
          "Sid": "<ALLOW_SID named in the change package>",
          "Effect": "Allow",
          "Principal": "*",
          "Action": "s3:PutObject",
          "Resource": "arn:aws:s3:::acme-app-logs/*",
          "Condition": {
            "IpAddress": {
              "aws:SourceIp": ["<one entry per address of the consumed host list, as address/32 for IPv4 or address/128 for IPv6>"]
            }
          }
        },
        {
          "Sid": "<DENY_SID named in the change package>",
          "Effect": "Deny",
          "Principal": "*",
          "Action": "s3:PutObject",
          "Resource": "arn:aws:s3:::acme-app-logs/*",
          "Condition": {
            "NotIpAddress": {
              "aws:SourceIp": ["<the same entries as the Allow statement>"]
            }
          }
        }
      ]
    }
    ```
  - **Forbidden in the two added statements**:
    - any action other than `s3:PutObject`, including `s3:*` and `s3:Put*` (`terraform-iac.granted-action`);
    - any Resource other than `arn:aws:s3:::acme-app-logs/*`: the bucket ARN alone, a key prefix, or `*` (`terraform-iac.receiver`);
    - any `aws:SourceIp` entry with a prefix length other than `/32` (IPv4) or `/128` (IPv6) (`kubernetes-gitops.representation`);
    - `NotPrincipal`, `NotAction` and `NotResource`;
    - any condition key that presupposes a VPC endpoint (`aws:SourceVpce`, `aws:SourceVpc`, `aws:VpcSourceIp`), because item 11 declares none;
    - any change to the bucket's tags (`terraform-iac.existing-tags`).
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): on the path from the pods in `trading` to the bucket, the bucket must see each request's source address as the address the host list records for the sending pod.
  - If this leg's own harvest cannot confirm that, apply `terraform-iac.principal-unseen`. Author the change regardless, and list the premise "the pods' source addresses reach the bucket unchanged, with no address translation on the path" under the package's **UNTESTED premises**.
- **Existence assumption** (*Writing rules* #6): each branch is decided by this leg's own harvest.
  - If the bucket itself is absent, apply `terraform-iac.target-absent`.
  - If more than one Terraform resource manages the bucket's policy, apply `terraform-iac.policy-managers-multiple`, naming each managing resource address.
  - If the bucket carries no policy, apply `terraform-iac.enforcer-absent`.
  - If it carries a policy, apply `terraform-iac.existing-grant`.
  - If the bucket holds no objects, apply `terraform-iac.target-empty`.
- **Consumed value**: it consumes **the host list produced by the kubernetes-gitops leg**, **as chained** after the terraform-iac change gate has approved it. It does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no target**: if the declared bucket does not exist, apply `terraform-iac.target-absent`. If the receiver of `terraform-iac.receiver` matches nothing (no objects), apply `terraform-iac.target-empty`. The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **The change package MUST state, explicitly and prominently**:
  - (a) the collateral of `terraform-iac.collateral`: every writer whose request arrives from an address outside the host list loses `s3:PutObject` on the bucket, plus whatever else, if anything, the change affects;
  - (b) the **UNTESTED premises** list;
  - (c) the Sids of the two added statements;
  - (d) the apply-order statement: "the kubernetes-gitops leg applies nothing; this bucket-policy change is applied out-of-band by a person, after the terraform-iac change gate";
  - (e) a rollback plan that restores the pre-change policy state.

  No further leg consumes from this one.
- **Validation (mechanical)**: run in workspace `prod` against the package's plan file `plan.out`, its rendered post-change document `after.json`, and the chained `hosts.txt`. `$POLICY_ADDR` is the Terraform address of the resource that manages the bucket's policy. `$ALLOW_SID` and `$DENY_SID` are the Sids the package names.
  1. Only the policy resource changes:
     `terraform show -json plan.out | jq -r '.resource_changes[] | select(.change.actions != ["no-op"]) | .address'`
     Expected: exactly one line, `$POLICY_ADDR`.
  2. Tags untouched:
     `terraform show -json plan.out | jq -e '.resource_changes[] | select(.address=="aws_s3_bucket.app_logs") | .change.before.tags == .change.after.tags'`
     Expected: `true`, exit status `0`.
  3. The rendered document is the planned document:
     `diff <(terraform show -json plan.out | jq -S --arg a "$POLICY_ADDR" '.resource_changes[] | select(.address==$a) | .change.after.policy | fromjson') <(jq -S . after.json)`
     Expected: no output, exit status `0`.
  4. Existing statements preserved, and nothing added beyond the two statements. This covers both the create branch and the preserve-bounded branch:
     `diff <(terraform show -json plan.out | jq -S --arg a "$POLICY_ADDR" '.resource_changes[] | select(.address==$a) | (.change.before.policy | if . == null or . == "" then "{\"Statement\":[]}" else . end) | fromjson | .Statement | sort_by(tostring)') <(jq -S --arg x "$ALLOW_SID" --arg y "$DENY_SID" '.Statement | map(select(.Sid!=$x and .Sid!=$y)) | sort_by(tostring)' after.json)`
     Expected: no output, exit status `0`.
  5. Each added statement appears exactly once:
     `jq --arg x "$ALLOW_SID" --arg y "$DENY_SID" '[([.Statement[]|select(.Sid==$x)]|length), ([.Statement[]|select(.Sid==$y)]|length)]' -c after.json`
     Expected: `[1,1]`.
  6. Allow shape:
     `jq -c --arg s "$ALLOW_SID" '.Statement[] | select(.Sid==$s) | {e:.Effect, a:([.Action]|flatten), r:([.Resource]|flatten), p:.Principal, c:(.Condition|keys), k:(.Condition.IpAddress|keys)}' after.json`
     Expected: `{"e":"Allow","a":["s3:PutObject"],"r":["arn:aws:s3:::acme-app-logs/*"],"p":"*","c":["IpAddress"],"k":["aws:SourceIp"]}`.
  7. Deny shape:
     `jq -c --arg s "$DENY_SID" '.Statement[] | select(.Sid==$s) | {e:.Effect, a:([.Action]|flatten), r:([.Resource]|flatten), p:.Principal, c:(.Condition|keys), k:(.Condition.NotIpAddress|keys)}' after.json`
     Expected: `{"e":"Deny","a":["s3:PutObject"],"r":["arn:aws:s3:::acme-app-logs/*"],"p":"*","c":["NotIpAddress"],"k":["aws:SourceIp"]}`.
  8. Allow addresses are exactly the consumed host list:
     `diff <(jq -r --arg s "$ALLOW_SID" '.Statement[] | select(.Sid==$s) | .Condition.IpAddress["aws:SourceIp"] | [.] | flatten | .[]' after.json | sed -E 's#/(32|128)$##' | sort -u) hosts.txt`
     Expected: no output, exit status `0`.
  9. Deny addresses equal Allow addresses:
     `diff <(jq -r --arg s "$ALLOW_SID" '.Statement[]|select(.Sid==$s)|.Condition.IpAddress["aws:SourceIp"]|[.]|flatten|.[]' after.json | sort) <(jq -r --arg s "$DENY_SID" '.Statement[]|select(.Sid==$s)|.Condition.NotIpAddress["aws:SourceIp"]|[.]|flatten|.[]' after.json | sort)`
     Expected: no output, exit status `0`.
  10. Every entry is one host:
      `jq -r --arg s "$ALLOW_SID" '.Statement[]|select(.Sid==$s)|.Condition.IpAddress["aws:SourceIp"]|[.]|flatten|.[]' after.json | grep -Evc '/(32|128)$'`
      Expected: `0`.
  11. Operator-captured pre-change baseline. Terraform state cannot prove the live bucket carries no policy, or no statement outside state. So immediately before apply, run `aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text > baseline.json` and compare it with the plan's before-document:
      `diff <(jq -S . baseline.json) <(terraform show -json plan.out | jq -S --arg a "$POLICY_ADDR" '.resource_changes[]|select(.address==$a)|.change.before.policy|fromjson')`
      - Expected: no output, exit status `0`.
      - Or, when the plan's before-document is null or empty: the `get-bucket-policy` command exits non-zero with `NoSuchBucketPolicy` on stderr.
      - Any other result means state is stale. Do not apply. Refresh state, re-harvest and re-author.
  12. Rollback check, after a rollback: run the same `get-bucket-policy` command and `diff` it against `baseline.json`. Expected: no output. In the create branch, expected: the command exits non-zero with `NoSuchBucketPolicy`.
  - **Effect after apply.** This is a comparison to perform, labelled as such; it cannot be witnessed by this program. Apply is out-of-band, and the path premise of `terraform-iac.principal-unseen` is untested by declaration (item 12), so whether listed pods can write and others cannot is not observable before or during the program run. After a person applies the change, the comparison is:
    - `aws s3api put-object --bucket acme-app-logs --key <probe key> --body <empty file>` from a pod in the population: expected exit status `0` with an `ETag` in the output.
    - The same command from a host outside the host list: expected non-zero exit with `AccessDenied`.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Namespace: `trading` (item 2).
- Bucket: Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs` (item 3).
- Receiver: `arn:aws:s3:::acme-app-logs/*`, objects with no key-prefix limit (item 4).
- Granted action: `s3:PutObject` only (item 13).
- Admission attribute: request source address; principal any identity or none; no VPC endpoint (item 11).
- Added statements: one Allow from listed addresses, one Deny from any other address (item 21).
- Representation of the crossing value: a host list, one single-address entry per population pod (item 14).
- Approvers and gate positions: items 6–10.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list. It is produced by the kubernetes-gitops leg, approved at the terraform-iac change gate, and chained into the terraform-iac leg's §6. It is settled before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The address set in both added statements of the terraform-iac leg's policy document exactly equals the host list produced by the kubernetes-gitops leg, as chained. It is the chained value, not a guess and not a recomputation. Pipeline 2 validation steps 8 and 9 show this: no output.
2. Every address in that host list is the `podIP` of a pod that the kubernetes-gitops leg's published input block records in `trading` with phase `Running` and `hostNetwork` not `true`. Every such pod's address is in the list. Pipeline 1 validation steps 2 and 3 show this: no output.
2b. Each entry is a single host: `/32` IPv4 or `/128` IPv6 in the policy, and a bare address in `hosts.txt`. There are no duplicates (`sort hosts.txt | uniq -d` prints nothing) and no summarised prefix. Recompute this from the input block; do not take the stated value on trust. Pipeline 2 validation step 10 prints `0`.
3. No widening and no collision:
   - The Allow grants `s3:PutObject` only, on `arn:aws:s3:::acme-app-logs/*` only, to `"*"`, conditioned only on `IpAddress`/`aws:SourceIp`.
   - The Deny covers `s3:PutObject` from every address outside the list.
   - No pre-existing statement changed.
   - The plan changes only the policy resource and no tags.
   Pipeline 2 validation steps 1, 2, 4, 6 and 7 give their stated outputs.
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
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
  producer's summary) is invisible to a check that reads legs. If a check requires a statement
  (e.g. the apply-order declaration), require it IN EACH leg's objective so it appears in each leg's
  report. *Earned: FW-A3.3 — Node C correctly rejected because the apply order appeared only in the
  producer's deliverable, which its leg-scoped context could not see (VT-18).*
  In this program, both leg objectives require the apply-order statement: Pipeline 1 item (e) and Pipeline 2 item (d).

### Consuming-leg attribution — when a downstream leg legitimately cannot self-check

The terraform-iac leg consumes the host list but cannot check it against its own state, because it has no view of the cluster. The SATISFIED condition is the property that the host list in the bucket policy is the population's addresses. It requires:
1. The kubernetes-gitops leg's derivation was machine-checked with no defect (Pipeline 1 validation steps 2–4).
2. The program-tier checks 1, 2, 2b and 3 above pass on the chained value.
3. Chaining coverage (check 4) confirms the real deliverable was received.

This author cannot attest that the attribution path has ever fired. Treat it as **SHIPPED BUT NEVER YET EXERCISED — do not read this as working** until a program run shows all three conditions recorded for this program.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

- **The host list goes stale when pods are rescheduled. No option in this program changes that.** The host list (item 14) is a point-in-time value. When a pod in `trading` is restarted, rescheduled, scaled or rolled out after apply, the Deny of item 21 blocks writes from its new address until the program runs again. No item declares how the list is kept current. This document requires one derivation and one change package. Keeping the list current is not specified.
- **Named gap: the leg's view of an existing policy comes from Terraform state.** State cannot prove that the live bucket carries no policy, or no statement added outside Terraform. Pipeline 2 validation step 11 turns this into a pre-apply baseline comparison rather than an assumption.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 84
