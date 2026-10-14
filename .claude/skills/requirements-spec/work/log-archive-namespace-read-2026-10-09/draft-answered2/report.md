> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — log-archive namespace-scoped read restriction (DRAFT for human review)

- Authored in: Log archive access control · Requirements
- Iteration: Run 20261010-0835 · 2026-10-10

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

This is a draft for a person to review. It is not approved and not ready to launch.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct
  DOMAIN or a PHASE of one — see the definition above; do not call two phases of one protocol two
  domains:
  1. **kubernetes-gitops** (UPSTREAM) on the Kubernetes namespace `trading`, described in `topology.json`. It reads pods and publishes a host list. It writes nothing to the cluster.
  2. **terraform-iac** (DOWNSTREAM) on `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`). It writes the restriction on the bucket's own policy from the host list produced by the kubernetes-gitops leg.
- The following are explicitly **out of scope**:
  - any namespace, Terraform resource, workspace or bucket other than the declared ones
  - any write to the cluster
  - any action other than `s3:GetObject`
  - the bucket's tags
  - the pods' network path to the bucket: the program neither creates nor verifies it
  - applying any change

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | namespace `trading` | (declared — item 1: "acts on the Kubernetes namespace `trading`") |
| terraform-iac.target | which surface of the leg's service does it act on | — | `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs`; the restriction is written on the bucket's own policy | (declared — item 2: "acts on the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)"); (declared — item 2: "the restriction is written on the bucket's own policy") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | pods in `trading` whose `status.phase` is `Running` at the leg's read; readiness is ignored | (declared — item 4: "the pods in the declared namespace whose phase is Running at the time of the leg's read; readiness is not a criterion") |
| kubernetes-gitops.host-network-member | whether a pod on the host's network is a member | include · exclude | exclude: a pod with `spec.hostNetwork: true` is not a member; an absent field is not `true` | (declared — item 4: "pods on the host's network are excluded") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list: every address of every member, one entry per address | (declared — item 5: "The published set is a host list") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: the kubernetes-gitops leg publishes a gap report and no host list; the terraform-iac leg writes no policy | (declared — item 19: "the outcome is gap: the cluster leg publishes a gap report and no host list"); (declared — item 19: "the cloud leg, having no host list, writes no policy") |
| kubernetes-gitops.carrier | what the cluster leg writes to the cluster | read-and-publish · write-to-cluster | read-and-publish: the leg writes nothing to the cluster | (declared — item 13: "The cluster leg is read-and-publish") |
| approver.program-plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com") |
| approver.kubernetes-gitops-change | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "The cluster (`kubernetes-gitops`) change gate is approved by josh.allen@paichart.com") |
| approver.terraform-iac-change | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "The cloud (`terraform-iac`) change gate is approved by jacob.wilcox@paichart.com") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg: approves the method before the kubernetes-gitops leg runs | (declared — item 9: "The cluster gate's position is before-leg") |
| gate.terraform-iac-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers: approves the host list produced by the kubernetes-gitops leg before the terraform-iac leg uses it | (declared — item 10: "The cloud gate's position is after-producer-before-consumers") |

### A leg that grants or removes access (authorisation)

This block applies to the terraform-iac leg only. The kubernetes-gitops rows are listed as not-applicable in the owner block.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the whole bucket: `arn:aws:s3:::acme-app-logs/*` | (declared — item 3: "The restriction governs the whole bucket") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: the host list produced by the kubernetes-gitops leg; no identity and no network path is admitted | (declared — item 11: "The cloud leg's admitted principal is source-address-range: the pods' addresses, as the host list of item 5"); (declared — item 11: "no identity and no network path is admitted") |
| terraform-iac.request-path | the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in (asked when admitted-principal admits by address) | direct · private-endpoint · translated | private-endpoint | (declared — item 21: "through a private endpoint of the storage service (private-endpoint)") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless: write the policy, and record the no-translation premise as UNTESTED | (declared — item 14: "the cloud leg acts regardless (act-regardless)") |
| terraform-iac.granted-action | what the admitted principal may do (actions, ports) | — | `s3:GetObject` only | (declared — item 12: "The admitted pods may perform `s3:GetObject` only") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve-bounded: every existing statement is kept unchanged. The bound is a Deny of `s3:GetObject` only, for any request whose source address is not in the host list the Allow uses. More than one managing Terraform resource → gap, with no consolidation. | (declared — item 15: "Existing allowances on the bucket's policy are preserve-bounded"); (declared — item 15: "If more than one Terraform resource manages the bucket's policy, the cloud leg reports a gap and does not consolidate them") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act | (declared — item 18: "If the bucket holds no objects, the cloud leg will act") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create a policy holding only the Allow and the Deny | (declared — item 16: "If no policy governs the bucket, the cloud leg will create one"); (declared — item 16: "it creates a policy holding only the Allow and the Deny of item 15") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap: create nothing | (declared — item 17: "If the declared bucket does not exist, the outcome is gap") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests); here the enforcer is a bucket policy | No exception for any other reader. The package names the Deny's effect and lists the existing statements whose `s3:GetObject` the Deny now overrides. | (declared — item 20: "No exception is made for any other reader; the effect is stated, not worked around"); (declared — item 20: "The cloud leg names this effect in its package and lists the existing statements whose `s3:GetObject` the Deny now overrides") |
| terraform-iac.out-of-policy-grants | what happens to read allowances other readers hold outside the bucket's policy | — | not exempted: the Deny overrides them; nothing outside the bucket's policy changes | (declared — item 20: "The Deny of item 15 stops every other reader of the bucket's objects from using `s3:GetObject`"); (declared — item 2: "the restriction is written on the bucket's own policy") |
| terraform-iac.existing-tags | whether either leg acts on the bucket's existing tags | — | neither leg acts on or changes them | (declared — item 20: "neither leg acts on or changes them") |

### A leg that changes routes (routing)

Neither leg changes routes. The bucket policy filters requests, which is authorisation, not routing. The routing rows are listed as not-applicable in the owner block.

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): grants or removes no access
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): grants or removes no access
kubernetes-gitops.request-path — the path the admitted senders' requests take to the enforcer — options: direct · private-endpoint · translated — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): admits no principal
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): grants or removes no access
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): grants or removes no access
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): grants or removes no access
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13); its empty case is kubernetes-gitops.inputs-empty
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): grants or removes no access
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13); a namespace yielding no pod is kubernetes-gitops.inputs-empty
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: no Pipeline 1 clause — tier: not-applicable — read-and-publish leg (item 13): applies no enforcement
kubernetes-gitops.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no Pipeline 1 clause — tier: not-applicable — the leg adds no advertised covering route
kubernetes-gitops.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no Pipeline 1 clause — tier: not-applicable — not a routing leg: changes no route
terraform-iac.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: no Pipeline 2 clause — tier: not-applicable — the leg adds no advertised covering route
terraform-iac.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: no Pipeline 2 clause — tier: not-applicable — not a routing leg: a bucket policy changes no route

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No — the program is sequenced.** The terraform-iac leg needs the host list: the addresses of the member pods in `trading` at the moment of a read.
- The cluster assigns those addresses when it schedules a pod. They change whenever a pod is restarted, rescheduled or rolled out.
- Membership depends on each pod's phase at the read.
- The value is therefore live state. It cannot be written into the objective or a static artifact. The Program Architect reads only `topology.json` and this file and has no live state access, so it cannot know the value.

This is a derivation, not a lookup: the membership rule decides which pods count. If the list were guessed up front, the policy would pin addresses that may belong to no pod, or to another workload. The Deny would then block the namespace's real pods, and the Allow would admit whatever later holds a pinned address.

The gate positions require the same order:
- The kubernetes-gitops gate approves the method before any address is read (item 9).
- The terraform-iac gate approves the produced list after it exists and before it is used (item 10).

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan: Steve Terry steve.terry@paichart.com (declared) — member (owner)
- kubernetes-gitops change: Josh Allen josh.allen@paichart.com (declared) — member
- terraform-iac change: Jacob Wilcox jacob.wilcox@paichart.com (declared) — member

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 **This is the most expensive thing to get wrong in this section, and stating only one half is how
it goes wrong.** A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan | the Program Architect | every leg | Steve Terry, steve.terry@paichart.com (declared) |
| kubernetes-gitops change | method: which namespace, which pods count, how the host list is derived | the program plan gate | the kubernetes-gitops leg | Josh Allen, josh.allen@paichart.com (declared) |
| terraform-iac change | produced value: the host list produced by the kubernetes-gitops leg | the kubernetes-gitops leg | the terraform-iac leg | Jacob Wilcox, jacob.wilcox@paichart.com (declared) |

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

**Dependency consequence:**
- `program plan gate → kubernetes-gitops change gate → kubernetes-gitops leg`
- The downstream leg depends on **its own gate** AND on **the upstream leg**: `kubernetes-gitops leg → terraform-iac change gate`, AND `kubernetes-gitops leg → terraform-iac leg`, AND `terraform-iac change gate → terraform-iac leg`.

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
- **Preconditions verified — 2026-10-10:** the Run 20261010-0835 Phase 0 harvest (its pod-list read of `trading`) confirmed that at least one pod in the namespace has phase `Running` and is not on the host's network.

- **Work:** read-and-publish (`kubernetes-gitops.carrier`). The leg reads the pods of `trading` (`kubernetes-gitops.target`) and publishes their addresses. It writes nothing to the cluster.
- **Derivation** (`kubernetes-gitops.population`, `kubernetes-gitops.host-network-member`, `kubernetes-gitops.representation`), applied to **one** read:
  - A pod is a member when `status.phase == "Running"` and `spec.hostNetwork` is not `true`. Readiness and every other condition are ignored.
  - The host list is every address in each member's `status.podIPs`, or `status.podIP` where `podIPs` is absent: one per line, no prefix length, de-duplicated with `LC_ALL=C sort -u`.
  - The report.md states the literal criterion on a line beginning `Criterion applied: `, and the UTC read time on a line beginning `Read time: ` (item 4).
- **If the harvest returns no member pod** (none is found, or every one is excluded): apply `kubernetes-gitops.inputs-empty`.
  - Publish a gap report and no host list. The report names what was absent: no `Running`, non-host-network pod in `trading` at the read time.
  - Publish no substitute value.
- **The deliverable MUST publish, explicitly and prominently:**
  - the host list produced by this leg, selected by the rules above at this leg's own read;
  - the criterion line and the read-time line;
  - the captured read, unaltered, as `pods-read.json`.

  Under `kubernetes-gitops.inputs-empty`, it publishes the gap report instead. The downstream leg depends on what this leg PRODUCES at run time.
- **Validation (mechanical).** Save the published host list as `hosts.txt`.
  ```
  # V1 recompute from the captured read → expect: MATCH
  jq -r '.items[] | select(.metadata.namespace == "trading")
    | select(.status.phase == "Running") | select((.spec.hostNetwork // false) != true)
    | ((.status.podIPs // [{"ip": .status.podIP}]) | .[].ip) | select(. != null)' pods-read.json \
    | LC_ALL=C sort -u | diff - hosts.txt > /dev/null && echo MATCH || echo MISMATCH
  # V2 read scoped to the namespace → expect: ["trading"]
  jq -c '[.items[].metadata.namespace] | unique' pods-read.json
  # V3 criterion and read-time lines → expect: 1 then 1
  grep -c '^Criterion applied: ' report.md; grep -c '^Read time: ' report.md
  # V4 single addresses only → expect: 0
  grep -cvE '^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$' hosts.txt
  # V5 no manifest (writes nothing) → expect: 0
  grep -cE '^(apiVersion|kind):' report.md
  # V6 inputs-empty branch only → expect: GAP-RECORDED
  test ! -s hosts.txt && grep -qF 'kubernetes-gitops.inputs-empty' report.md && echo GAP-RECORDED
  ```
- **Rollback:** none is required, because the leg writes nothing (item 13). The package states this.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
  Here, the tightest-correct result is exactly the members' addresses. Any prefix or extra address is the defect.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** For a host list, the trap is membership. Synthetic example:
  - Pod A: `Running`, no `hostNetwork` field, address A1 → A1 is in the list.
  - Pod B: `Running`, `hostNetwork: true`. Its reported address is the node's own, so including it would admit every process on that node → excluded.
  - Pod C: `Pending`, address C1 → excluded.
  - Pod D: `Running`, dual-stack, addresses D4 (IPv4) and D6 (IPv6) → both are in the list.

  The list is A1, D4 and D6, and nothing else.
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

- Harvest `aws_s3_bucket.app_logs` in workspace `prod`, and every Terraform resource there that manages the policy of `acme-app-logs`, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — 2026-10-10:** the Run 20261010-0835 Phase 0 harvest (`state_list` and `state_pull` of `prod`) confirmed that the declared resource is present in state. The descriptor reads Terraform state only: not the live policy, the objects, or the request path.
- **Work:** on the bucket's own policy (`terraform-iac.target`), over `arn:aws:s3:::acme-app-logs/*` (`terraform-iac.receiver`), write two statements:
  - an **Allow** of `s3:GetObject` (`terraform-iac.granted-action`) for source addresses in the host list produced by the kubernetes-gitops leg (`terraform-iac.admitted-principal`);
  - the bounding **Deny** of `s3:GetObject` only, for source addresses not in that same list (`terraform-iac.existing-grant`).

  The address is read from the attribute the private-endpoint path carries, `aws:VpcSourceIp` (`terraform-iac.request-path`). Each host becomes one entry: `/32` for IPv4, `/128` for IPv6. No member is added or removed. Write every line of this exemplar, in order:
  ```json
  {"Sid": "AllowGetObjectFromPublishedHosts", "Effect": "Allow", "Principal": "*",
   "Action": "s3:GetObject", "Resource": "arn:aws:s3:::acme-app-logs/*",
   "Condition": {"IpAddress": {"aws:VpcSourceIp": ["<host-1>/32", "<host-2>/32"]}}},
  {"Sid": "DenyGetObjectFromAnyOtherSource", "Effect": "Deny", "Principal": "*",
   "Action": "s3:GetObject", "Resource": "arn:aws:s3:::acme-app-logs/*",
   "Condition": {"NotIpAddress": {"aws:VpcSourceIp": ["<host-1>/32", "<host-2>/32"]}}}
  ```
  **Forbidden in the new statements:**
  - `aws:SourceIp`: it does not carry the pod's address on this path.
  - `aws:SourceVpce` and `aws:SourceVpc`: they admit a network path (item 11).
  - any `…IfExists` operator.
  - `NotPrincipal`, or any `Principal` other than `"*"` (item 11).
  - any action other than `s3:GetObject` (items 12 and 15).
  - any other `Resource`.
  - any entry wider than a single address.
- **Collateral** (`terraform-iac.collateral`, `terraform-iac.out-of-policy-grants`): the leg names this effect in its package.
  - The Deny stops every other reader's `s3:GetObject`: other roles and users, administrators and the account root, and services that read on someone's behalf.
  - Writes, listing and changing the policy are unaffected, so access can be restored by editing the policy.
  - The package lists, as **Overridden statements**, the existing statements whose `s3:GetObject` the Deny now overrides.
  - Tags are not acted on or changed (`terraform-iac.existing-tags`).
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the bucket must see each listed pod's own address in `aws:VpcSourceIp` on the private-endpoint path (`terraform-iac.request-path`). If this leg's own harvest cannot confirm it, apply `terraform-iac.principal-unseen`:
  - Write the policy.
  - Record "the pods' source addresses reach the bucket unchanged, with no address translation on the path" under **UNTESTED premises**.
- **Existence assumption** (*Writing rules* #6). The leg's own harvest decides the branch:
  - The bucket is absent → `terraform-iac.target-absent`.
  - No policy governs the bucket → `terraform-iac.enforcer-absent`.
  - One Terraform resource manages the policy → `terraform-iac.existing-grant`: write in that resource and keep every existing statement unchanged.
  - More than one manages it → `terraform-iac.existing-grant`: report the gap.
  - No objects, or object presence is unreadable → `terraform-iac.target-empty`.

  Because the harvest reads state only, also record two premises under **UNTESTED premises**: "no policy is attached to the bucket outside Terraform", and "public-access blocking accepts a `"*"` Allow under an address condition".
- **Consumed value:** the host list produced by the kubernetes-gitops leg, **as chained**. This leg does **not** re-derive it, and is forbidden from recomputing it. Containment is discharged **upstream** and re-verified at the program tier.
  - If §6 carries that leg's gap report instead of a list: apply `kubernetes-gitops.inputs-empty` — write no policy and report the gap.
  - **If §6 carries neither**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no target:**
  - The bucket is empty → `terraform-iac.target-empty` (act).
  - The bucket is absent → `terraform-iac.target-absent` (gap; create nothing).

  The 🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **The report.md MUST carry:**
  - the consumed host list, verbatim, attributed to the kubernetes-gitops leg;
  - the planned statements;
  - **UNTESTED premises**;
  - **Overridden statements** (`[]` when there are none);
  - the effect statement.

  No further leg consumes from this leg.
- **Validation (mechanical)**, in the `prod` configuration directory `$TF_DIR`, with the chained list saved as `hosts.txt`:
  ```
  terraform -chdir="$TF_DIR" workspace select prod && terraform -chdir="$TF_DIR" plan -out=change.tfplan
  terraform -chdir="$TF_DIR" show -json change.tfplan > plan.json
  jq '[.resource_changes[] | select(.change.actions != ["no-op"])]' plan.json > changes.json
  for S in before after; do jq --arg s "$S" '.[0].change[$s] | (.policy? // "") | if . == "" then [] else (fromjson | .Statement | if type == "object" then [.] else . end) end' changes.json > $S.json; done
  LC_ALL=C awk '{ print ($0 ~ /:/) ? $0 "/128" : $0 "/32" }' hosts.txt | LC_ALL=C sort -u > expected-cond.txt
  J='jq -c -n --slurpfile b before.json --slurpfile a after.json'
  # T1 one resource changes, none deleted → expect: [1,0]
  jq -c '[length, ([.[] | select(.change.actions | index("delete"))] | length)]' changes.json
  # T2 existing kept, removed, added → expect: [0,2]
  $J '[($b[0] - $a[0] | length), ($a[0] - $b[0] | length)]'
  # T3 shapes → expect: [["Allow","*",["s3:GetObject"],"arn:aws:s3:::acme-app-logs/*",["IpAddress"],["aws:VpcSourceIp"]],["Deny","*",["s3:GetObject"],"arn:aws:s3:::acme-app-logs/*",["NotIpAddress"],["aws:VpcSourceIp"]]]
  $J '($a[0] - $b[0]) | sort_by(.Effect) | map([.Effect, .Principal, ([.Action] | flatten), .Resource, (.Condition | keys), (.Condition | to_entries[0].value | keys)])'
  # T4 both lists equal the chained list → expect: Allow MATCH, Deny MATCH
  for E in Allow Deny; do $J -r --arg e "$E" '($a[0] - $b[0])[] | select(.Effect == $e) | .Condition | to_entries[0].value["aws:VpcSourceIp"] | [.] | flatten | .[]' | LC_ALL=C sort -u | diff - expected-cond.txt > /dev/null && echo "$E MATCH" || echo "$E MISMATCH"; done
  # T5 no forbidden token → expect: 0
  $J '$a[0] - $b[0]' | grep -cE '"aws:SourceIp"|"aws:SourceVpce?"|IfExists|"NotPrincipal"|"s3:\*"'
  # T6 tags unchanged → expect: true
  jq '[.resource_changes[] | select(.address == "aws_s3_bucket.app_logs") | (.change.before.tags == .change.after.tags)] | all' plan.json
  # T7 overridden statements → expect: the package's Overridden statements list, same order ([] if empty)
  jq -c '[.[] | select(.Effect == "Allow") | select([.Action] | flatten | any(. == "s3:GetObject" or . == "s3:Get*" or . == "s3:*" or . == "*")) | (.Sid // "(no Sid)")]' before.json
  # T8 premises recorded → expect: PRESENT
  grep -qF 'UNTESTED premises' report.md && echo PRESENT
  # T9 gap branches only (target-absent, multiple managers, inputs-empty) → expect: GAP-RECORDED
  test ! -e change.tfplan && grep -qF '<the row id applied>' report.md && echo GAP-RECORDED
  ```
- **Rollback:**
  - The package carries `before.json` (`[]` when no policy existed) and a rollback change that restores exactly those statements.
  - Check: save the rollback plan's statements as `rollback-after.json`, then run `jq -n --slurpfile b before.json --slurpfile r rollback-after.json '$b[0] == $r[0]'`. Expected output: `true`.
- **Post-apply effect — a comparison to perform, labelled as such.** Apply is out-of-band and human-gated, so the program never witnesses the applied effect.
  - After a person applies the change, run `aws s3api get-object --bucket acme-app-logs --key <an existing key> /dev/null` from an unlisted host. Expected output contains `AccessDenied`.
  - Success from a listed pod is the UNTESTED premise above.

## Design constraints — split across the contract and the DAG

**Static → declared in the objective** (knowable up front, agreed before either leg runs; this program has no separate interface contract):
- Namespace: `trading` (item 1)
- Cloud target: `aws_s3_bucket.app_logs`, `prod`, `acme-app-logs`, on the bucket's own policy (item 2)
- Scope: the whole bucket (item 3)
- Membership rule (item 4)
- Representation: a host list (item 5)
- Action: `s3:GetObject` only (item 12)
- Request path: private-endpoint, read through `aws:VpcSourceIp` (item 21)
- Approvers (items 6–8)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list: produced by the kubernetes-gitops leg, chained into the terraform-iac leg's §6, and approved at the terraform-iac change gate before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The host list in the terraform-iac leg's Allow and Deny conditions equals, as a set, the host list produced by the kubernetes-gitops leg. This is the chained value, not a recomputation.
2. Every listed address belongs to a pod that the kubernetes-gitops leg's captured read shows in `trading`, `Running`, and off the host's network. Every such pod's addresses are listed.
2b. Recompute the list from that captured read with the stated rule. It equals the published list: no extra address, and no entry wider than a single address.
3. No widening in the new statements:
   - principal `"*"` only;
   - `s3:GetObject` only;
   - the bucket's objects only;
   - no `…IfExists`, no `aws:SourceIp`, no endpoint or network condition;
   - identical lists in the Allow and the Deny;
   - every pre-existing statement unchanged.
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. The terraform-iac report lists the item 14 premise under **UNTESTED premises**, unless its own harvest confirmed the request path.
6. The terraform-iac report names the Deny's effect. Its **Overridden statements** equal the pre-existing statements that allowed `s3:GetObject`.
7. Under `kubernetes-gitops.inputs-empty`, no host list was published and no policy was written.
8. The kubernetes-gitops report carries the `Criterion applied:` and `Read time:` lines.

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

The terraform-iac leg cannot verify the host list against its own state, because Terraform state holds no pod addresses. Its consumption is **SATISFIED** when all of these hold:
1. The kubernetes-gitops leg's V1 printed `MATCH` and its V2 printed `["trading"]`.
2. Checks 1, 2, 2b and 3 pass on the chained value.
3. Check 4 confirms that the real deliverable was received.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

1. **Gap — a policy attached outside Terraform.** The Terraform-state descriptor cannot see one, and writing the Terraform-managed policy would replace it rather than preserve it. The owner may declare that none exists, or supply a read of the live policy.
2. **Gap — public-access blocking.** It is unknown whether bucket- or account-level blocking settings will reject a `"*"` Allow under an `aws:VpcSourceIp` condition.
3. **Host-list currency.** Pods that are later replaced get addresses outside the list, and the Deny blocks their reads until the program is re-run. Keeping the list current is outside this program.
4. **Unsigned requests.** Because no identity is admitted (item 11), unsigned requests from listed addresses over the endpoint are permitted `s3:GetObject`.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 84
