# Program Requirements — trading namespace → acme-app-logs bucket write restriction

- Authored in: Log archive write — requirements spec · Specification
- Iteration: 20261009-0002 · 2026-10-09
- Status: DRAFT for human review. Not approved. It cannot be launched until the writing rules are spliced in and the conformance check is run.

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct
  DOMAIN or a PHASE of one — see the definition above; do not call two phases of one protocol two
  domains:
  1. **kubernetes-gitops** (UPSTREAM) on namespace `trading`, described in `topology.json`. The objective calls this the "cluster leg". It changes nothing. It derives the host list the terraform-iac leg consumes.
  2. **terraform-iac** (DOWNSTREAM) on the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`). The objective calls this the "bucket leg" or "cloud leg". It is the program's only enforcer.
- The following are explicitly **out of scope**:
  - any namespace other than `trading`;
  - any cluster-side enforcement object (item 1: "The bucket is the only enforcer");
  - any bucket other than `acme-app-logs`;
  - any Terraform resource other than the declared bucket resource and the resource that manages its policy;
  - the bucket's existing tags (item 21);
  - creating the namespace or the bucket;
  - applying any change.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the pods of namespace `trading`, read only | (declared — item 2: "The target namespace is `trading`") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | every pod in `trading` whose phase is `Running`. Readiness is not a criterion. A pod with `hostNetwork: true` is excluded. | (declared — item 5: "every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion; a pod with hostNetwork: true is excluded") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: each selected pod's address exactly, never summarised | (declared — item 14: "expressed as a host list - each running pod's address exactly") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: a gap report naming what is absent. No value is produced. | (declared — item 15: "the cluster leg reports a gap and produces no value (gap)") |
| kubernetes-gitops.target-absent | the declared namespace itself does not exist | gap · create-target | gap: a gap report naming the absent namespace. The namespace is never created. | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace") |
| terraform-iac.target | which surface of the leg's service does it act on | — | the policy of bucket `acme-app-logs`, the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)") |
| approver.program-plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com") |
| approver.kubernetes-gitops | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.terraform-iac | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com") |
| gate.kubernetes-gitops.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg. It approves the method before the kubernetes-gitops leg runs. | (declared — item 9: "The kubernetes-gitops change gate sits before the cluster leg (before-leg)") |
| gate.terraform-iac.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers. It approves the host list produced by the kubernetes-gitops leg before the terraform-iac leg uses it. | (declared — item 10: "The terraform-iac change gate sits after the producer and before the consumers (after-producer-before-consumers)") |

### A leg that grants or removes access (authorisation)

The terraform-iac leg is an authorisation leg: it consumes a chained value into a policy condition and restricts who may write. The kubernetes-gitops leg grants and removes no access (item 1: "grants and removes no access and changes nothing"). Its authorisation rows are therefore deleted, and each one is listed as not-applicable in *Decisions needed from the owner*.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the objects of bucket `acme-app-logs`, with no key-prefix limit (`arn:aws:s3:::acme-app-logs/*`) | (declared — item 4: "On the bucket, the authorised resource is its objects, with no key-prefix limit") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range. A request is admitted when it arrives from an address in the host list produced by the kubernetes-gitops leg, under any identity or none. | (declared — item 11: "The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces (items 1 and 5); any requester whose request arrives from a listed address is admitted, under any identity or none") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless. The leg records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path. | (declared — item 12: "the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path") |
| terraform-iac.granted-action | what the admitted principal may do (actions, ports) | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve-bounded. No existing statement changes. The Deny statement bounds them: after the change, `s3:PutObject` is allowed only from a listed address. | (declared — item 18: "Existing statements on the bucket policy are preserved, bounded (preserve-bounded): the leg changes no existing statement, and the Deny of item 21 bounds them") |
| terraform-iac.policy-managers-multiple | more than one Terraform resource manages the bucket's policy | gap · consolidate | gap: a gap report naming the managing resources. They are not consolidated. | (declared — item 18: "If more than one Terraform resource manages the bucket's policy, the bucket leg reports a gap and does not consolidate them") |
| terraform-iac.deny-others | whether `s3:PutObject` from addresses outside the host list is denied | deny · leave | deny: one Deny statement for `s3:PutObject` from any address not in the host list | (declared — item 21: "one Deny statement for s3:PutObject from any other address") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act: the leg authors against the receiver even when the bucket holds no objects | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act)") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create: a policy holding only the Allow and Deny statements of item 21 | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only the statements of item 21") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap: a gap report naming the absent bucket. The bucket is never created. | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests; this enforcer is an S3 bucket policy) | every writer of the bucket other than a request from a listed address loses write access. The change package states this and states what else, if anything, the change affects. | (declared — item 21: "every other writer of the bucket loses write access, and the bucket leg's change package states this and what else, if anything, the change affects") |
| terraform-iac.tag-drift | what the change does to the bucket's existing tags | leave-unchanged · change | leave-unchanged. Neither leg acts on or changes the tags. | (declared — item 21: "neither leg acts on or changes them") |

### A leg that changes routes (routing)

Neither leg changes routes. The kubernetes-gitops leg changes nothing (item 1). The terraform-iac leg filters writes at a bucket policy, which is authorisation, not routing. The routing rows are deleted for both legs and listed as not-applicable in *Decisions needed from the owner*.

| id | question | options | rule or named target | source |
|---|---|---|---|---|

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: no kubernetes-gitops clause — tier: not-applicable — the kubernetes-gitops leg neither grants nor removes access on its target (item 1)
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no kubernetes-gitops clause — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no kubernetes-gitops clause — tier: not-applicable — the leg changes no routes
terraform-iac.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no terraform-iac clause — tier: not-applicable — the leg adds no advertised covering route
terraform-iac.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no terraform-iac clause — tier: not-applicable — the leg changes no routes

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

State *why* the value is not knowable up front. The strongest form is an objective test — e.g. *the
value changes on every environment rebuild, so it cannot be pinned in a static artifact or agreed in
a contract, and the Program Architect (which reads only `topology.json` + this file, with **no live
state access**) structurally cannot know it.*

**Answer: No. The program is sequenced.**

The terraform-iac leg needs the host list produced by the kubernetes-gitops leg: the address of every Running, non-`hostNetwork` pod in `trading` (items 5 and 14). The cluster assigns pod addresses when it schedules a pod. They change whenever a pod is rescheduled, restarted, scaled or rebuilt. The value can therefore be read only from live state at the moment the upstream leg runs. It cannot be pinned in `topology.json` or agreed in a contract, and the Program Architect has no live state access, so it structurally cannot know it.

It is a design decision rather than a lookup because the declared criterion decides membership: phase `Running`, readiness ignored, `hostNetwork: true` excluded. The method is approved before the leg runs (item 9), and the produced value is approved before it is used (item 10).

A guessed or stale host list fails in two directions at once. The Allow statement would admit whatever later holds a stale address. The Deny statement would lock out every real pod whose address was not guessed, so the log archive loses its intended writers while appearing correctly restricted.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
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

Fill the table with both columns, never just the first:

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry (declared) |
| kubernetes-gitops change | **intent / method**: which namespace, which pods count, and how the value is derived (item 9) | the program plan gate | the kubernetes-gitops leg | Josh Allen (declared) |
| terraform-iac change | **produced value**: the host list produced by the kubernetes-gitops leg, once it exists (item 10) | the kubernetes-gitops leg | the terraform-iac leg | Jacob Wilcox (declared) |

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
- The program is sequenced. The terraform-iac leg depends on **its own gate** AND directly on **the kubernetes-gitops leg**, and the terraform-iac change gate also depends on the kubernetes-gitops leg. The full edge set:
  - `program plan gate → kubernetes-gitops change gate`
  - `kubernetes-gitops change gate → kubernetes-gitops leg`
  - `kubernetes-gitops leg → terraform-iac change gate`
  - `kubernetes-gitops leg → terraform-iac leg`
  - `terraform-iac change gate → terraform-iac leg`

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

- Harvest the pods of namespace `trading` **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-09, Phase 0 of authoring run 20261009-0002**: the Phase 0 harvest's pod listing scoped to namespace `trading` (k8s read-only service, `list_resources` of pods in `trading`). It confirmed two properties: the namespace exists, and at least one pod in it has phase `Running` and does not carry `hostNetwork: true`.

- The leg grants and removes no access and changes nothing on the cluster (item 1). Its deliverable carries no manifest, no patch and no apply step. Its only output is the host list the terraform-iac leg consumes.
- **Definition used by every check below.** A pod's *address* is the value the cluster reports in that pod's `status.podIP`.
- **Derivation**:
  - The population follows `kubernetes-gitops.population`: every pod in `trading` whose `status.phase` is `Running`. Readiness is ignored. A pod whose `spec.hostNetwork` is `true` is excluded.
  - The representation follows `kubernetes-gitops.representation`: the host list is the set of addresses of the selected pods, one entry per address, never summarised into a prefix.
  - The deliverable lists each excluded pod by name, or states `none`.
  - The deliverable states, verbatim, the literal criterion it applied (item 5).
- **If the namespace `trading` does not exist**: apply `kubernetes-gitops.target-absent`. The deliverable is a gap report naming the absent namespace. No value is produced, and the namespace is not created.
- **If the harvest returns no Running pods in `trading` after the `hostNetwork` exclusion (none found, or every one excluded)**: apply `kubernetes-gitops.inputs-empty`. The deliverable is a gap report naming what was absent (a Running, non-`hostNetwork` pod in `trading`) and what would have to exist. No host list is published, and no substitute value is published.
- **The deliverable MUST publish, explicitly and prominently**:
  - the host list produced by the kubernetes-gitops leg under the rule above, as a fenced block with one address per line, sorted;
  - the literal criterion it applied;
  - the excluded-pod list.

  The downstream leg depends on what this leg PRODUCES at run time, not on what you read while authoring.
- **Validation (mechanical)**: re-read the pods of `trading`, then re-apply the criterion. Expected: the published host list equals the recomputation, and every re-obtained input lies inside it. Never the input literals or their count: a check pinned to today's inputs fails a correct run the day the environment changes. The commands below run against the same cluster state the leg harvested. A pod that starts or stops after the harvest calls for a new run, not a different expected output.
  1. Namespace present:
     ```
     kubectl get namespace trading -o jsonpath='{.metadata.name}'
     ```
     Expected output: `trading`. A `NotFound` error is the evidence for the `kubernetes-gitops.target-absent` gap report and nothing else.
  2. Host list recomputed. Save the published block as `hosts.txt`, then run:
     ```
     diff <(sort -u hosts.txt) <(kubectl get pods -n trading -o json \
       | jq -r '.items[] | select(.status.phase == "Running") | select((.spec.hostNetwork // false) != true) | .status.podIP' \
       | sort -u)
     ```
     Expected: no output, exit status `0`. `hosts.txt` is non-empty whenever a host list was published.
  3. Excluded pods recomputed. Save the published excluded list as `excluded.txt` (empty file when the deliverable states `none`), then run:
     ```
     diff <(sort excluded.txt) <(kubectl get pods -n trading -o json \
       | jq -r '.items[] | select(.status.phase == "Running") | select(.spec.hostNetwork == true) | .metadata.name' | sort)
     ```
     Expected: no output, exit status `0`.
  4. No single host is summarised:
     ```
     grep -c '/' hosts.txt
     ```
     Expected output: `0` (every entry is a bare address, never a prefix).
  5. Nothing changed on the cluster:
     ```
     grep -cE '^(apiVersion|kind):' report.md
     ```
     Expected output: `0`.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** For a host list, the trap is summarising, and the examples here use synthetic documentation addresses only:
  - `198.51.100.4` and `198.51.100.5` are an aligned pair whose minimal cover is `198.51.100.4/31`. A host list still publishes them as two entries, so a `/31` here is a defect.
  - `198.51.100.5` and `198.51.100.6` are adjacent but NOT aligned. Their minimal cover, `198.51.100.4/30`, would admit two addresses no pod holds.
  - A pod with `hostNetwork: true` reports its node's address as its own (for example, pod and node both at `192.0.2.10`). It is excluded by the criterion and never published.

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

- Harvest the state of `aws_s3_bucket.app_logs` in workspace `prod`, and every resource in that workspace that manages the policy of bucket `acme-app-logs`, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — 2026-10-09, Phase 0 of authoring run 20261009-0002**: the Phase 0 harvest's `state_list` and `state_pull` of `aws_s3_bucket.app_logs` in workspace `prod` (Terraform read-only service). It confirmed that the declared resource is present in that workspace's state and is the bucket item 3 names.
- **The work**: per `terraform-iac.deny-others`, `terraform-iac.granted-action` and `terraform-iac.receiver`, the bucket's policy gains exactly two statements:
  - one Allow for `s3:PutObject` on `arn:aws:s3:::acme-app-logs/*` for requests from an address in the host list produced by the kubernetes-gitops leg, under any identity or none (`terraform-iac.admitted-principal`);
  - one Deny for `s3:PutObject` on the same resource for requests from any address outside that list.

  Each chained address is written as a single-host CIDR (`/32` for IPv4, `/128` for IPv6). That is an encoding, not a recomputation: the address set is unchanged. The required shape, complete and in order, with placeholders intact:
  ```json
  {
    "Sid": "<ALLOW-SID>",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::acme-app-logs/*",
    "Condition": { "IpAddress": { "aws:SourceIp": [ "<HOST-1>/32", "<HOST-N>/32" ] } }
  },
  {
    "Sid": "<DENY-SID>",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::acme-app-logs/*",
    "Condition": { "NotIpAddress": { "aws:SourceIp": [ "<HOST-1>/32", "<HOST-N>/32" ] } }
  }
  ```
  Forbidden tokens in the two added statements:
  - `s3:*`, and any action other than `s3:PutObject` (item 13);
  - any `Resource` narrower than `arn:aws:s3:::acme-app-logs/*` (item 4) or naming another bucket;
  - `aws:SourceVpce`, `aws:SourceVpc` and `aws:VpcSourceIp`, because no VPC endpoint is declared (item 11);
  - any prefix wider than a single host (item 14).
- **Collateral** (`terraform-iac.collateral`): the change package states that every writer of `acme-app-logs` other than a request from a listed address loses write access. That includes the bucket owner's own principals and any service that delivers objects to the bucket from another address. The package also states what else, if anything, the change affects. The package states the apply order (only this leg applies a change).
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the bucket must see, as each request's source address, the address of the sending pod in `trading`, on the path from those pods to the bucket's endpoint. If this leg's own harvest cannot confirm it, apply `terraform-iac.principal-unseen`: the leg acts regardless and lists under the package's **UNTESTED premises** that the pods' source addresses reach the bucket unchanged, with no address translation on the path.
- **Existence assumption** (*Writing rules* #6), decided by this leg's own harvest:
  - If the bucket itself is absent, apply `terraform-iac.target-absent`.
  - If more than one Terraform resource manages the bucket's policy, apply `terraform-iac.policy-managers-multiple`.
  - If the bucket carries no policy, apply `terraform-iac.enforcer-absent`.
  - If it carries one, apply `terraform-iac.existing-grant`.
  - Whichever branch applies, the bucket's existing tags are governed by `terraform-iac.tag-drift`.
- It consumes the host list produced by the kubernetes-gitops leg **as chained**. It does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed. This includes the case where §6 carries the kubernetes-gitops leg's gap report instead of a host list.
- **If this leg's own harvest returns no bucket objects, or no bucket**:
  - bucket present but holding no objects: apply `terraform-iac.target-empty`;
  - declared bucket does not exist: apply `terraform-iac.target-absent`.

  The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- No further leg consumes from this one. This leg publishes no crossing value.
- **Validation (mechanical)**. The post-apply state cannot be witnessed before the run, because apply is out-of-band and human-gated. These checks therefore run against an operator-captured pre-change baseline of state and the leg's saved plan. After apply, the same commands run against `terraform show -json` of the applied state in place of `after-plan.json`.
  - **Setup**, in workspace `prod`:
    ```
    terraform workspace select prod
    terraform show -json > before-state.json
    terraform plan -out=tfplan && terraform show -json tfplan > after-plan.json
    SEL='select((.type == "aws_s3_bucket_policy" and .values.bucket == "acme-app-logs") or .address == "aws_s3_bucket.app_logs") | (.values.policy // "") | select(. != "") | fromjson | ([.Statement] | flatten)[]'
    jq -c "[.values.root_module.resources[] | $SEL] | unique" before-state.json > before-stmts.json
    jq -c "[.planned_values.root_module.resources[] | $SEL] | unique" after-plan.json > after-stmts.json
    jq -R -s -c 'split("\n") | map(select(length > 0) | if test(":") then . + "/128" else . + "/32" end) | sort' hosts.txt > H.json
    ```
    `hosts.txt` is the host-list block chained from the kubernetes-gitops leg.
  - **V2.1, no existing statement removed or altered:**
    ```
    jq -n --slurpfile b before-stmts.json --slurpfile a after-stmts.json '$b[0] - $a[0] | length'
    ```
    Expected output: `0`.
  - **V2.2, exactly two statements added:**
    ```
    jq -n --slurpfile b before-stmts.json --slurpfile a after-stmts.json '$a[0] - $b[0] | length'
    ```
    Expected output: `2`.
  - **V2.3, shape of the added statements:**
    ```
    jq -n -c --slurpfile b before-stmts.json --slurpfile a after-stmts.json --slurpfile h H.json '
      ($a[0] - $b[0])
      | map({e: .Effect, p: .Principal, a: ([.Action] | flatten), r: ([.Resource] | flatten),
             op: (.Condition | keys), key: (.Condition | to_entries[0].value | keys),
             ok: (([.Condition | to_entries[0].value | to_entries[0].value] | flatten | sort) == $h[0])})
      | sort_by(.e)'
    ```
    Expected output, exactly:
    `[{"e":"Allow","p":"*","a":["s3:PutObject"],"r":["arn:aws:s3:::acme-app-logs/*"],"op":["IpAddress"],"key":["aws:SourceIp"],"ok":true},{"e":"Deny","p":"*","a":["s3:PutObject"],"r":["arn:aws:s3:::acme-app-logs/*"],"op":["NotIpAddress"],"key":["aws:SourceIp"],"ok":true}]`
  - **V2.4, exactly one Terraform resource manages the bucket's policy after the change:**
    ```
    jq '[.planned_values.root_module.resources[] | select((.type == "aws_s3_bucket_policy" and .values.bucket == "acme-app-logs") or (.address == "aws_s3_bucket.app_logs" and ((.values.policy // "") != "")))] | length' after-plan.json
    ```
    Expected output: `1`.
  - **V2.5, no bucket created or destroyed, and no other resource changed:**
    ```
    jq '[.resource_changes[] | select(.change.actions != ["no-op"])] | all(.[]; (.change.actions | index("delete") | not) and ((.address == "aws_s3_bucket.app_logs" and .change.actions == ["update"]) or (.type == "aws_s3_bucket_policy" and .change.after.bucket == "acme-app-logs" and (.change.actions == ["create"] or .change.actions == ["update"]))))' after-plan.json
    ```
    Expected output: `true`.
  - **V2.6, the leg's change does not touch the bucket's tags** (`terraform-iac.tag-drift`). `<base>` is the commit the change was authored from, and `<change>` is the change's head:
    ```
    git diff --unified=0 <base> <change> -- '*.tf' | grep -E '^[+-][^+-]' | grep -E '\btags(_all)?\b'
    ```
    Expected: no output, exit status `1`.
  - **Where the leg ends in a gap report instead** (the target-absent or policy-managers-multiple branch), there is no plan to run these checks on. The gap report names the branch's row id, and the change package contains no `.tf` change:
    ```
    git diff --name-only <base> <change> -- '*.tf'
    ```
    Expected: no output.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Target namespace: `trading` (item 2)
- Target bucket: Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs` (item 3)
- Authorised resource: `arn:aws:s3:::acme-app-logs/*`, with no key-prefix limit (item 4)
- Granted action: `s3:PutObject` only (item 13)
- Admitted principal kind: source address, under any identity or none, with no VPC endpoint (item 11)
- Representation: a host list, each address written as a single-host CIDR in the policy (item 14)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list of Running, non-`hostNetwork` pod addresses in `trading` is produced by the kubernetes-gitops leg. It is chained into the terraform-iac leg's §6 and settled (approved at the terraform-iac change gate) before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The address set in the terraform-iac leg's Allow statement, and the one in its Deny statement, each exactly equal the host list the kubernetes-gitops leg published. This is the chained value, not a guess and not a recomputation.
2. Coverage and containment: every address in the host list belongs to a pod in `trading` that satisfies the criterion the kubernetes-gitops leg published (phase `Running`, not `hostNetwork: true`). No pod on the published excluded list contributes an address.
2b. The tightest-correct property, recomputed rather than taken on trust: every policy entry is a single host (`/32` or `/128`), never a wider prefix. The number of entries equals the number of distinct addresses in the published host list.
3. No widening and no collision:
   - the added Allow grants `s3:PutObject` only, on `arn:aws:s3:::acme-app-logs/*` only, conditioned on the host list only;
   - the Deny's address set is identical to the Allow's;
   - no existing statement is altered;
   - no other action, resource or bucket gains a grant;
   - the bucket's tags are unchanged.
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. The kubernetes-gitops leg's deliverable states the literal criterion it applied and lists each excluded pod (or states `none`), as item 5 requires.
6. Whenever its harvest did not confirm the premise, the terraform-iac leg's deliverable lists that premise under **UNTESTED premises**. The deliverable also states that every other writer of the bucket loses write access, and what else, if anything, the change affects.

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

The terraform-iac leg consumes the host list but has no access to the cluster, so it cannot verify the list against its own state. Its consumption is SATISFIED when all three hold:
1. The kubernetes-gitops leg's derivation was machine-checked with no defect (its validation steps 1–5 print their expected outputs).
2. Program-tier checks 1, 2, 2b and 3 pass on the chained value.
3. Chaining coverage (check 4) confirms the terraform-iac leg received the kubernetes-gitops leg's real deliverable.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

none

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 82
