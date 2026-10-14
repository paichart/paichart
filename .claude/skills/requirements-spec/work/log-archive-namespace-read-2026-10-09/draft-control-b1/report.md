# Program Requirements — Log archive read restriction to `trading`-namespace pods (DRAFT for human review)

- Authored in: Log archive access control · Requirements
- Iteration: Run 20261010-0135 · 2026-10-10

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

> **DRAFT** — for human review at the program plan gate; not approved, not final.

---

## Program scope

- 2 **legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct
  DOMAIN or a PHASE of one — see the definition above; do not call two phases of one protocol two
  domains:
  1. **kubernetes-gitops** (UPSTREAM) on the Kubernetes namespace `trading`, described in `topology.json`. The leg reads and publishes only.
  2. **terraform-iac** (DOWNSTREAM) on the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`), acting on the bucket's own policy.
- These are two protocols on two target classes, so two domains. They are sequenced by a value only the upstream leg can produce.
- **Explicitly out of scope:** any other namespace; any write to the cluster; any other Terraform resource, workspace or bucket; any S3 action other than `s3:GetObject`; the bucket's tags (item 20); any bucket setting other than its policy; and applying any change.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the Kubernetes namespace `trading` | (declared — item 1: "acts on the Kubernetes namespace `trading`") |
| terraform-iac.target | which surface of the leg's service does it act on | — | `aws_s3_bucket.app_logs`, workspace `prod` (bucket `acme-app-logs`), written on the bucket's own policy | (declared — item 2: "acts on the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)") · (declared — item 2: "the restriction is written on the bucket's own policy") |
| kubernetes-gitops.population | which members of the class the derivation reads | — | pods in `trading` with `status.phase` `Running` at the time of the read. Readiness is ignored. Host-network pods are excluded. The report.md states the literal criterion and the read time | (declared — item 4: "the pods in the declared namespace whose phase is Running at the time of the leg's read") · (declared — item 4: "readiness is not a criterion") · (declared — item 4: "pods on the host's network are excluded") |
| kubernetes-gitops.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list | (declared — item 5: "The published set is a host list.") |
| kubernetes-gitops.carrier | whether the leg writes to its target or only reads and publishes | read-and-publish · write to the cluster | read-and-publish; writes nothing to the cluster | (declared — item 13: "The cluster leg is read-and-publish") |
| kubernetes-gitops.inputs-empty | the derivation's inputs are empty | gap | gap: publish a gap report and no host list. The terraform-iac leg then writes no policy | (declared — item 19: "the outcome is gap: the cluster leg publishes a gap report and no host list") |
| approver.program-plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com.") |
| approver.kubernetes-gitops-change | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "change gate is approved by josh.allen@paichart.com.") |
| approver.terraform-iac-change | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "change gate is approved by jacob.wilcox@paichart.com.") |
| gate.kubernetes-gitops-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg: approves the method before the kubernetes-gitops leg runs | (declared — item 9: "The cluster gate's position is before-leg") |
| gate.terraform-iac-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers: approves the host list produced by the kubernetes-gitops leg before the terraform-iac leg uses it | (declared — item 10: "position is after-producer-before-consumers") |

### A leg that grants or removes access (authorisation)

Only the terraform-iac leg grants or removes access. The kubernetes-gitops leg's authorisation rows are not-applicable and are listed in the owner block.

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | the whole bucket `acme-app-logs`: every object (`<bucket ARN>/*`) | (declared — item 3: "The restriction governs the whole bucket.") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: source address in the host list produced by the kubernetes-gitops leg. No identity and no network path | (declared — item 11: "The cloud leg's admitted principal is source-address-range") · (declared — item 11: "no identity and no network path is admitted") |
| terraform-iac.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless: write the policy. Record as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation | (declared — item 14: "the cloud leg acts regardless (act-regardless)") |
| terraform-iac.granted-action | what the admitted principal may do (actions, ports) | — | `s3:GetObject` only | (declared — item 12: "The admitted pods may perform `s3:GetObject` only.") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve-bounded: every existing statement unchanged. The bound is an explicit Deny of `s3:GetObject` only, for source addresses not in the host list (the same list the Allow uses). If more than one Terraform resource manages the policy: gap, no consolidation | (declared — item 15: "Existing allowances on the bucket's policy are preserve-bounded") · (declared — item 15: "If more than one Terraform resource manages the bucket's policy, the cloud leg reports a gap and does not consolidate them.") |
| terraform-iac.target-empty | the receiver selector/surface matches nothing now | act · gap | act: an empty bucket still gets the restriction | (declared — item 18: "If the bucket holds no objects, the cloud leg will act") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create a policy holding only the Allow and the Deny | (declared — item 16: "If no policy governs the bucket, the cloud leg will create one") |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | gap: report it and create nothing | (declared — item 17: "If the declared bucket does not exist, the outcome is gap") |
| terraform-iac.collateral | what else on the target changes because enforcement now applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | no exception. The Deny stops every other reader's `s3:GetObject`, including roles, users, admins, the account root and services acting on someone's behalf. It does not affect writes, listing or policy changes. The package names the effect and lists the overridden statements. Tags untouched | (declared — item 20: "No exception is made for any other reader; the effect is stated, not worked around.") |

### A leg that changes routes (routing)

Neither leg adds, suppresses, filters, withdraws or replaces routes. A bucket policy filters traffic, which is authorisation, so this program has no routing rows.

## Decisions needed from the owner

kubernetes-gitops.receiver — which workload/resource on the target is authorised — options: — — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.target-absent — the declared target itself does not exist — options: gap · create-target — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)
kubernetes-gitops.collateral — what else on the target changes because enforcement now applies — options: per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) — governs: none — tier: not-applicable — read-and-publish leg; neither grants nor removes access on its target (item 13)

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No, so the program is sequenced.**

The terraform-iac leg's Allow and Deny both need the host list: the addresses of the pods in `trading` that meet item 4's criterion when the kubernetes-gitops leg reads them. The cluster assigns those addresses at scheduling time. They change whenever a pod is restarted, rescheduled, scaled or replaced, so they are live state read at run time and cannot be pinned in `topology.json` or a contract. The Program Architect has no live state access and cannot know them. If the list were guessed up front, the policy would admit addresses that belong to no counted pod, and its Deny would refuse the pods the program exists to admit.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`. A gate the objective names no approver for is
written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN — the human sees it
in *Decisions needed from the owner*. Never pick a name
from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE — and two generations over one roster
assigned four of five gates to different people.

**Declared approvers confirmed on the POV team** — the platform routes a gate only to a MEMBER; a declared
approver who is not one silently falls to the POV owner, so a board meant to show several approvers shows one:
- Program plan approver is Steve Terry steve.terry@paichart.com (declared): member (POV owner)
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
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry, steve.terry@paichart.com (declared) |
| kubernetes-gitops change | **intent / method**: which namespace, which pods count, how the host list is derived | the program plan gate | the kubernetes-gitops leg | Josh Allen, josh.allen@paichart.com (declared) |
| terraform-iac change | **produced value**: the host list produced by the kubernetes-gitops leg | the kubernetes-gitops leg | the terraform-iac leg | Jacob Wilcox, jacob.wilcox@paichart.com (declared) |

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
- The terraform-iac leg depends on **its own gate** AND on **the kubernetes-gitops leg**, and its gate also depends on the kubernetes-gitops leg. Edges:
  - `program plan gate → kubernetes-gitops change gate → kubernetes-gitops`
  - `kubernetes-gitops → terraform-iac change gate → terraform-iac`
  - `kubernetes-gitops → terraform-iac` (direct edge carrying the host list)
  - `program plan gate → terraform-iac`

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

- Harvest the pods in namespace `trading` **read-only** (`kubernetes-gitops.target`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — 2026-10-10T01:38Z (UTC), Phase 0 harvest of requirements Run 20261010-0135**: a pod enumeration of `trading` plus per-pod detail reads through the read-only Kubernetes service. They confirmed that at least one pod was `Running` and did not set `spec.hostNetwork: true`.

- The leg reads the pods' addresses and publishes them, and writes nothing to the cluster (`kubernetes-gitops.carrier`). It selects pods per `kubernetes-gitops.population` and publishes them per `kubernetes-gitops.representation`.
- **Derivation:**
  - A pod counts when `status.phase` is `Running` at the read. Readiness is ignored.
  - A pod is on the host's network when `spec.hostNetwork` is `true`, and such pods are excluded. A pod that omits the field counts as off the host's network, because `false` is the API default.
  - A pod's addresses are `status.podIPs[].ip`, or `status.podIP` when `podIPs` is absent. Each address becomes one single-host entry (a bare address, `/32` or `/128`), deduplicated. No ranges.
  - The report.md states the literal criterion applied and the UTC read time (item 4).
- **If the harvest returns no counted pods** (none found, namespace absent, or all excluded): apply `kubernetes-gitops.inputs-empty`. Publish a gap report naming what was absent (no `Running` pod off the host's network in `trading`) and what would have to exist. Publish no host list and never a substitute.
- **The deliverable MUST publish, explicitly and prominently**: either the host list produced by the kubernetes-gitops leg from its own read, as `published-hosts.txt` (one entry per line), or the gap report. Either way it includes the criterion and the read time. It also carries the **input block** (each pod's name, phase, `spec.hostNetwork` as read or "absent", its addresses, and whether it counted and why) and the **result block**. The downstream leg depends on what this leg PRODUCES at run time, not on what you read while authoring.
- **Validation (mechanical)**: re-read the namespace and re-apply the rule:
  ```
  kubectl get pods -n trading -o json \
    | jq -r '.items[] | select(.status.phase=="Running") | select((.spec.hostNetwork // false)|not)
             | (if .status.podIPs then (.status.podIPs|map(.ip)) else [.status.podIP // empty] end) | .[]' \
    | sort -u | diff - <(sort -u published-hosts.txt); echo "exit=$?"
  grep -vE '^[0-9]{1,3}(\.[0-9]{1,3}){3}(/32)?$|^[0-9A-Fa-f:]+(/128)?$' published-hosts.txt; echo "exit=$?"
  ```
  Expected:
  - First command: no diff lines, then `exit=0`. The published list equals the recomputation, and every re-obtained input lies inside it.
  - Second command: no lines, then `exit=1`.
  - If pods changed after the published read time, the first command is run instead against the input block: re-apply the rule to it and compare. Expected: identical sets.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
  Here: the list holds exactly the counted pods' addresses, one single-host entry each.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic example: counted pods at `198.51.100.4` and `198.51.100.5` are two entries, never `198.51.100.4/31`. A host-network pod reports its node's address (say `192.0.2.10`), and admitting it admits the whole node. A non-`Running` pod may still show an address, so test the phase first.
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

- Harvest `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`), and every resource managing its policy, **read-only** (`terraform-iac.target`). Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — 2026-10-10T01:38Z (UTC), Phase 0 harvest of requirements Run 20261010-0135**: a state address listing and a state pull of workspace `prod` through the read-only Terraform service. They confirmed that the declared resource address is present.
- Write the restriction on the bucket's own policy, covering the whole bucket (`terraform-iac.receiver`):
  - an Allow of `s3:GetObject` (`terraform-iac.granted-action`) for source addresses in the chained host list, naming no identity (`terraform-iac.admitted-principal`);
  - a Deny of `s3:GetObject` only for source addresses not in the same list the Allow uses (`terraform-iac.existing-grant`);
  - every existing statement unchanged.

  Tags are untouched. The output is a change package, never an applied change.
- **Exemplar policy** (every line, in order). The added Sids must not already occur in the policy:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      <every existing statement, unchanged, in order — none under terraform-iac.enforcer-absent>,
      { "Sid": "<ALLOW_SID>", "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject",
        "Resource": "<BUCKET_ARN>/*",
        "Condition": { "IpAddress": { "aws:SourceIp": ["<HOST_1>", "<…each published host>"] } } },
      { "Sid": "<DENY_SID>", "Effect": "Deny", "Principal": "*", "Action": "s3:GetObject",
        "Resource": "<BUCKET_ARN>/*",
        "Condition": { "NotIpAddress": { "aws:SourceIp": ["<HOST_1>", "<…the same entries>"] } } }
    ]
  }
  ```
  **Forbidden in the added statements:**
  - any action other than `s3:GetObject`;
  - any identity in `Principal`;
  - any condition key other than `aws:SourceIp`;
  - any entry wider than one host, or not in the chained list.

  **Forbidden in the package as a whole:** edits to existing statements, and changes to tags.
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): the bucket must see each counted pod's own address as `aws:SourceIp` on the pod's request path, with no address translation. If this leg's own harvest cannot confirm that, apply `terraform-iac.principal-unseen`: the policy is written and the premise is recorded as UNTESTED. Where the objective declares the program does not create or verify that attribute's carrier, the branch still exists: it records the premise as UNTESTED and lists it under the package's **UNTESTED premises** — never drop the branch.
- **Existence assumption** (*Writing rules* #6), decided by this leg's own harvest:
  - Bucket absent: apply `terraform-iac.target-absent`.
  - More than one Terraform resource manages the bucket's policy (a bucket-policy resource and a non-empty inline policy each count): apply the gap clause of `terraform-iac.existing-grant`.
  - No policy governs the bucket: apply `terraform-iac.enforcer-absent`.
  - Exactly one policy governs it: apply `terraform-iac.existing-grant`.
  - The bucket holds no objects: apply `terraform-iac.target-empty`.
  - Wherever a policy is written: apply `terraform-iac.collateral`. The leg names this effect in its package.
- It consumes the host list produced by the kubernetes-gitops leg **as chained**. It does **not** re-derive it and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
  - If §6 carries the `kubernetes-gitops.inputs-empty` gap report instead, the leg writes no policy and reports that, citing that row.
- **If this leg's own harvest returns no declared bucket**: apply `terraform-iac.target-absent` (gap, create nothing). A bucket with no objects is not a null case: `terraform-iac.target-empty` (act). The
  🔴 **STATE THE NULL CASE** clause under Pipeline 1 is not derivation-specific — it was earned by a
  *downstream* author improvising against a brief that presupposed a block its harvest never produced.
- **The deliverable MUST publish, explicitly and prominently**:
  - the full proposed policy (`policy.json`) and the harvested policy (`existing-policy.json`, `{"Statement": []}` if none);
  - the two added Sids;
  - the managing-resource count and the branch it selected;
  - the item 20 effect statement and the list of existing statements whose `s3:GetObject` the Deny overrides;
  - the **UNTESTED premises**;
  - the apply order and a rollback plan.

  No further leg consumes from this one.
- **Validation (mechanical)**, run on the package. `chained-hosts.txt` is the list as §6 carried it:
  ```
  # V1 / V2 — Allow and Deny lists equal the chained list
  jq -r --arg s "$ALLOW_SID" '.Statement[]|select(.Sid==$s)|.Condition.IpAddress["aws:SourceIp"]|(if type=="array" then .[] else . end)' policy.json | sort -u | diff - <(sort -u chained-hosts.txt); echo "exit=$?"
  jq -r --arg s "$DENY_SID" '.Statement[]|select(.Sid==$s)|.Condition.NotIpAddress["aws:SourceIp"]|(if type=="array" then .[] else . end)' policy.json | sort -u | diff - <(sort -u chained-hosts.txt); echo "exit=$?"
  # V3 — shape of the two added statements
  jq -c --arg a "$ALLOW_SID" --arg d "$DENY_SID" '[.Statement[]|select(.Sid==$a or .Sid==$d)|{Effect,Action:([.Action]|flatten),Principal,Keys:[.Condition|to_entries[]|.key+":"+(.value|keys|join(","))]}]|sort_by(.Effect)' policy.json
  # V4 — existing statements unchanged; V5 — nothing else added
  diff <(jq -S --arg a "$ALLOW_SID" --arg d "$DENY_SID" '[.Statement[]|select(.Sid!=$a and .Sid!=$d)]' policy.json) <(jq -S '.Statement // []' existing-policy.json); echo "exit=$?"
  echo $(( $(jq '.Statement // []|length' existing-policy.json) + 2 )); jq '.Statement|length' policy.json
  # V6 — managing-resource count
  terraform show -json | jq '[..|objects|select(.type? and .values?)|select((.type=="aws_s3_bucket_policy" and .values.bucket=="acme-app-logs") or (.type=="aws_s3_bucket" and .values.bucket=="acme-app-logs" and ((.values.policy // "")!="")))]|length'
  # V7 — existing Allow statements granting s3:GetObject (overridden by the Deny)
  jq -c 'def m($p): "s3:GetObject"|test("^"+($p|gsub("\\*";".*")|gsub("\\?";"."))+"$";"i");
    [(.Statement // [])|to_entries[]|.value as $s|select($s.Effect=="Allow")
     |select(($s|has("Action") and ([$s.Action]|flatten|any(m(.)))) or ($s|has("NotAction") and (([$s.NotAction]|flatten|any(m(.)))|not)))
     |{index:.key,sid:($s.Sid // null)}]' existing-policy.json
  ```
  Expected:
  - **V1, V2:** no diff lines, then `exit=0`.
  - **V3:** `[{"Effect":"Allow","Action":["s3:GetObject"],"Principal":"*","Keys":["IpAddress:aws:SourceIp"]},{"Effect":"Deny","Action":["s3:GetObject"],"Principal":"*","Keys":["NotIpAddress:aws:SourceIp"]}]`.
  - **V4:** no diff lines, then `exit=0`.
  - **V5:** two lines with the same integer.
  - **V6:** the count the package reports. At 2 or more, the package is a gap report with no policy, and V1–V5 and V7 are not run.
  - **V7:** exactly the overridden-statements list the package names (`[]` when no policy existed).
- **Post-apply (operator, out of band; the apply happens after the program, so it cannot be witnessed before the run):** `aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text | jq -S . | diff - <(jq -S . policy.json); echo "exit=$?"`. Expected: `exit=0`.
- **Comparison to perform after apply:** a `get-object` from a counted pod succeeds, and one from any other address prints `AccessDenied`. This cannot be witnessed by this program: it rests on the UNTESTED premise, and an empty bucket defers it until an object exists (item 18).

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Cluster target: namespace `trading` (item 1)
- Cloud target: `aws_s3_bucket.app_logs`, workspace `prod`, bucket `acme-app-logs`, on the bucket's own policy (item 2), covering the whole bucket (item 3)
- Population: phase `Running` at the read; readiness ignored; host-network pods excluded (item 4)
- Representation: a host list (item 5)
- Granted action: `s3:GetObject` only (item 12)
- Admission: source address via `aws:SourceIp`; no identity, no network path (item 11)
- Existing allowances: preserve-bounded, with a Deny over the same list (item 15)

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list. The kubernetes-gitops leg produces it, and it is chained into the terraform-iac leg's §6 over the direct edge, approved at the terraform-iac change gate.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the host list in the terraform-iac package's Allow and in its Deny each exactly equals the host list produced by the kubernetes-gitops leg — the chained value, not a guess, not a recomputation;
2. coverage: every address of every pod the kubernetes-gitops input block marks as counted is in the published list, and every published entry belongs to such a pod;
2b. tightest-correct: re-apply item 4's criterion to the kubernetes-gitops input block. The result must equal the published list, each entry must be a single host, and no excluded pod may contribute. Do not take the stated value on trust;
3. no widening: the two added statements cover `s3:GetObject` only, admit by `aws:SourceIp` only and name no identity. Existing statements are unchanged, nothing else is added, and no tag changes;
4. **chaining coverage** — the downstream leg received the upstream leg's **real** deliverable, not a
   fallback and not nothing. The counters (`predecessors === chainCapablePredecessors`,
   `degradedPredecessors === 0`, `notChained []`) are **platform facts the program gate computes
   mechanically**; no reviewer tool exposes them, so Node C does not re-derive them and does not block
   for being unable to read them. Node C checks what its own chained context shows: every leg appears
   as a predecessor, each carrying its `report.md` deliverable — not an upstream output marked as a
   fallback, and not missing.
5. the terraform-iac deliverable carries the item 20 effect statement, the overridden-statements list and the item 14 UNTESTED premise. Where a gap branch applied, it carries the gap report and no policy instead.

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

The terraform-iac leg cannot check the host list against its own state. It is SATISFIED when all three hold:
1. The kubernetes-gitops derivation was machine-checked with no defect.
2. Checks 1, 2, 2b and 3 pass on the chained value.
3. Check 4 confirms the real deliverable was received.

⚠️ **When you write a status note for a mechanism like this, write it honestly.** If it has shipped
but never actually fired, say **"SHIPPED BUT NEVER YET EXERCISED — do not read this as working"** and
list what would count as evidence. *Earned: an earlier revision of this clause claimed a machine-gated
release that had never once occurred; the run cited as proof had cleared via a judgement branch while
shipping a defect.*

## Open questions

none

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 84
