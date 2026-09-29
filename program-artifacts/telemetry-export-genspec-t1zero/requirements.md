# Program Requirements

> **Status: DRAFT SPECIFICATION — for human review.** This document is not approved, not final, and does not authorise execution of any program, change package, or release. Its writing rules have been spliced into the section below and checked byte-identical to canonical (`requirements-rules.py --check`). The program it describes is planned and launched separately, by a person, after this draft is reviewed.

- Authored in: Telemetry Export Authorisation — Cross-Domain (v2) · Specify: Objective → Requirements
- Iteration: Run 20260929-2311 · 2026-09-29

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- **4 legs** (pipelines). The `network-provisioning` leg runs first; the three consuming legs
  (`kubernetes-gitops`, `terraform-iac`, `observability-config`) each depend on its output and run in
  **parallel with one another** once it completes — the program as a whole is SEQUENCED with respect
  to the producer, not a single linear chain across all four legs (see *Why this is sequenced*, below,
  for the full DAG):
  1. **network-provisioning** (UPSTREAM) on the fabric's read-only device and interface inventory, described in `topology.json`.
  2. **kubernetes-gitops** (DOWNSTREAM) on the receiver pods in the declared Kubernetes namespace.
  3. **terraform-iac** (DOWNSTREAM) on the declared archive bucket's policy document.
  4. **observability-config** (DOWNSTREAM) on the declared OTLP ingress's sender-restriction configuration.
- Any Kubernetes namespace other than the one declared as the cluster target; any storage resource
  other than the declared archive target; any listener on the observability stack other than the
  declared OTLP ingress; any fabric interface whose description does not carry the declared exporter
  marker; and the **application (execution)** of any produced change package in any domain — are
  explicitly **out of scope**.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| network-provisioning.target | which surface of the leg's service does it act on | — | every device and interface reachable via the fabric's read-only service descriptor | (declared — item 5: "the fabric's exporter addresses are the IPv4 addresses of interfaces whose description marks them as telemetry exporters") |
| kubernetes-gitops.target | which surface of the leg's service does it act on | — | the Kubernetes namespace `trading` | (declared — item 1: "the Kubernetes namespace \`trading\`. No other namespace is in scope.") |
| terraform-iac.target | which surface of the leg's service does it act on | — | the S3 bucket managed by Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` | (declared — item 2: "the S3 bucket managed by Terraform resource \`aws_s3_bucket.app_logs\` in workspace \`prod\`. No other storage resource is in scope.") |
| observability-config.target | which surface of the leg's service does it act on | — | the observability stack's OTLP ingress on TCP 4317 and TCP 4318 | (declared — item 4: "the observability stack's OTLP ingress in front of the collector, on TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP). No other listener is in scope.") |
| network-provisioning.population | which members of the class the derivation reads | — | interfaces whose description carries the declared exporter marker literal, across every device in the fabric's inventory | (declared — item 5: "interfaces whose description marks them as telemetry exporters. No other fabric address is an exporter address.") |
| network-provisioning.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | the smallest CIDR block, aligned to a valid prefix boundary, containing every one of the fabric's exporter addresses (one aligned prefix) | (declared — item 6: "the fabric leg computes the smallest CIDR block, aligned to a valid prefix boundary, that contains every one of the fabric's exporter addresses.") |
| network-provisioning.inputs-empty | the derivation's inputs are empty | gap | gap — report that no interface across the fabric's inventory carries the declared exporter marker; produce no derived range | (forced — item 5: "No other fabric address is an exporter address.") → gap — a substitute population is outside item 5's declaration |
| approver.plan | who approves this gate | — | Josh Allen (josh.allen@paichart.com) | (declared — item 7: "program plan — Josh Allen (josh.allen@paichart.com)") |
| approver.fabric-exporter-value | who approves this gate | — | Steve Terry (steve.terry@paichart.com) | (declared — item 7: "fabric exporter value (network-provisioning) — Steve Terry (steve.terry@paichart.com)") |
| approver.kubernetes-change-method | who approves this gate | — | Jacob Wilcox (jacob.wilcox@paichart.com) | (declared — item 7: "Kubernetes change method (kubernetes-gitops) — Jacob Wilcox (jacob.wilcox@paichart.com)") |
| approver.cloud-storage-change-method | who approves this gate | — | Josh Allen (josh.allen@paichart.com) | (declared — item 7: "cloud storage change method (terraform-iac) — Josh Allen (josh.allen@paichart.com)") |
| approver.observability-change-method | who approves this gate | — | Jacob Wilcox (jacob.wilcox@paichart.com) | (declared — item 7: "observability change method (observability-config) — Jacob Wilcox (jacob.wilcox@paichart.com)") |
| gate.fabric-exporter-value.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 8: "the fabric exporter value gate sits after the fabric leg and before the three consuming legs.") |
| gate.kubernetes-change-method.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 8: "Each of the Kubernetes, cloud storage and observability change-method gates sits AFTER its own leg and approves that leg's produced change package before the program completes; it does not block the leg's authoring.") |
| gate.cloud-storage-change-method.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 8: "Each of the Kubernetes, cloud storage and observability change-method gates sits AFTER its own leg and approves that leg's produced change package before the program completes; it does not block the leg's authoring.") |
| gate.observability-change-method.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion | (declared — item 8: "Each of the Kubernetes, cloud storage and observability change-method gates sits AFTER its own leg and approves that leg's produced change package before the program completes; it does not block the leg's authoring.") |

### A leg that grants or removes access (authorisation) — `kubernetes-gitops`

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.receiver | which workload/resource on the target is authorised | — | pods in `trading` labelled `app.kubernetes.io/component: telemetry-receiver` | (declared — item 3: "the pods in \`trading\` labelled \`app.kubernetes.io/component: telemetry-receiver\`, on TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP).") |
| kubernetes-gitops.admitted-principal | who is admitted, and by which attribute | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: sender's source address must lie in the exporter range produced by `network-provisioning` | (declared — item 9: "on the Kubernetes receiver pods and the observability stack's OTLP ingress, the admitted sender is identified by its source address, which must lie in the exporter range of item 6.") |
| kubernetes-gitops.principal-unseen | harvest cannot confirm the enforcer sees the admitted attribute | gap · act-regardless | gap — report a gap naming what is unconfirmed; author nothing that depends on it | (declared — item 16: "on the Kubernetes receiver pods and the observability stack's OTLP ingress, if the leg's own harvest cannot confirm that the enforcer sees the sender's source address on the path the exporter traffic takes, the leg reports a gap naming what is unconfirmed and authors nothing that depends on it.") |
| kubernetes-gitops.granted-action | what the admitted principal may do | — | TCP 4317 and TCP 4318 only | (declared — item 10: "on the Kubernetes receiver pods and on the observability stack's OTLP ingress, the exporter range is authorised for TCP 4317 and TCP 4318 only.") |
| kubernetes-gitops.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace — the exporter range is the only permitted sender; any other sender allowance is replaced | (declared — item 11: "on the receiver surfaces — the pods the declared receiver selector selects, and the observability stack's OTLP ingress on TCP 4317 and TCP 4318 — the exporter range is the only permitted sender; any other sender allowance on those surfaces is replaced, not kept.") |
| kubernetes-gitops.target-empty | receiver selector matches nothing now | act · gap | act — author against the declared selector regardless; report the matching pod count, zero included | (declared — item 12: "the Kubernetes policy is authored against the declared selector whether or not any pod matches it today, including when the namespace holds no pods at all; the leg reports the number of pods the selector matches, and a zero is reported, not treated as an error.") |
| kubernetes-gitops.enforcer-absent | no policy object governs the receiver yet | create · gap | create | (declared — item 13: "where a leg's harvest finds no policy object governing its receiver, the leg creates one.") |
| kubernetes-gitops.target-absent | declared target does not exist | gap · create-target | gap — report what is absent; create nothing | (declared — item 14: "if a declared target does not exist — the namespace, the bucket or the OTLP ingress — the leg reports a gap naming what is absent and creates nothing.") |
| kubernetes-gitops.collateral | what else changes because enforcement applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | deny — selecting the receiver pods isolates them for every other port; no allowance is added for any other port | (declared — item 15: "on the receiver pods the policy authorises only TCP 4317 and TCP 4318 from the exporter range. Selecting those pods isolates them for every other port; the policy adds no allowance for any other port, and the Kubernetes leg states that isolation effect in its package.") |

### A leg that grants or removes access (authorisation) — `terraform-iac`

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which workload/resource on the target is authorised | — | objects in the declared bucket | (declared — item 10: "the admitted principal is authorised for \`s3:PutObject\` on objects in that bucket only — no read, list, or delete.") |
| terraform-iac.admitted-principal | who is admitted, and by which attribute | source-address-range · named-identity · network-path · combination (state each part) | combination — the IAM role `arn:aws:iam::000000000000:role/telemetry-exporter-writer`, only when the request arrives through VPC endpoint `vpce-0a1b2c3d4e5f60718` from a source address in the exporter range (`aws:SourceVpce` + `aws:VpcSourceIp`; `aws:SourceIp` not used) | (declared — item 9: "On the archive bucket, the admitted principal is the IAM role arn:aws:iam::000000000000:role/telemetry-exporter-writer, and only when its request arrives through the VPC endpoint vpce-0a1b2c3d4e5f60718 from a source address in the exporter range (conditions aws:SourceVpce and aws:VpcSourceIp); aws:SourceIp is not used.") |
| terraform-iac.principal-unseen | harvest cannot confirm the enforcer sees the admitted attribute | gap · act-regardless | act-regardless — author the policy regardless; record the arrival-path premise as UNTESTED in the leg's gap report | (declared — item 16: "On the archive bucket the policy is authored regardless: the IAM role and the VPC endpoint are provisioned outside this program, so the cloud storage leg records the premise that requests arrive through that endpoint from the exporter range as UNTESTED and names it in its gap report.") |
| terraform-iac.granted-action | what the admitted principal may do | — | `s3:PutObject` only — no read, list, or delete | (declared — item 10: "On the archive bucket, the admitted principal is authorised for \`s3:PutObject\` on objects in that bucket only — no read, list, or delete.") |
| terraform-iac.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | preserve-bounded — existing statements for other principals/purposes are kept; no statement may grant the exporter range more than `s3:PutObject` | (declared — item 11: "On the archive bucket the change is additive: the admitted principal gains \`s3:PutObject\` and nothing else; existing statements for other principals or purposes are kept, and no statement may grant the exporter range more than \`s3:PutObject\`.") |
| terraform-iac.target-empty | receiver matches nothing now | act · gap | act — author the policy whether or not the bucket holds any objects; the grant applies to writes from then on | (declared — item 12: "The cloud storage policy is authored whether or not the bucket holds any objects; the grant applies to writes from then on.") |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | create | (declared — item 13: "where a leg's harvest finds no policy object governing its receiver, the leg creates one.") |
| terraform-iac.target-absent | declared target does not exist | gap · create-target | gap — report what is absent; create nothing | (declared — item 14: "if a declared target does not exist — the namespace, the bucket or the OTLP ingress — the leg reports a gap naming what is absent and creates nothing.") |
| terraform-iac.collateral | what else changes because enforcement applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | additive only — no existing statement is modified | (declared — item 15: "On the archive bucket the change is additive and modifies no existing statement; the cloud storage leg states that in its package.") |

### A leg that grants or removes access (authorisation) — `observability-config`

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which workload/resource on the target is authorised | — | the OTLP ingress listeners fronting the collector on TCP 4317 and TCP 4318 | (declared — item 4: "the observability stack's OTLP ingress in front of the collector, on TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP).") |
| observability-config.admitted-principal | who is admitted, and by which attribute | source-address-range · named-identity · network-path · combination (state each part) | source-address-range: sender's source address must lie in the exporter range produced by `network-provisioning` | (declared — item 9: "on the Kubernetes receiver pods and the observability stack's OTLP ingress, the admitted sender is identified by its source address, which must lie in the exporter range of item 6.") |
| observability-config.principal-unseen | harvest cannot confirm the enforcer sees the admitted attribute | gap · act-regardless | gap — report a gap naming what is unconfirmed; author nothing that depends on it | (declared — item 16: "on the Kubernetes receiver pods and the observability stack's OTLP ingress, if the leg's own harvest cannot confirm that the enforcer sees the sender's source address on the path the exporter traffic takes, the leg reports a gap naming what is unconfirmed and authors nothing that depends on it.") |
| observability-config.granted-action | what the admitted principal may do | — | TCP 4317 and TCP 4318 only | (declared — item 10: "on the Kubernetes receiver pods and on the observability stack's OTLP ingress, the exporter range is authorised for TCP 4317 and TCP 4318 only.") |
| observability-config.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded (state the bound) | replace — the exporter range is the only permitted sender; any other sender allowance is replaced | (declared — item 11: "on the receiver surfaces — the pods the declared receiver selector selects, and the observability stack's OTLP ingress on TCP 4317 and TCP 4318 — the exporter range is the only permitted sender; any other sender allowance on those surfaces is replaced, not kept.") |
| observability-config.target-empty | receiver/listener carries no configuration for the declared ports | act · gap | gap — report what is absent; add no listener or configuration of its own | (declared — item 12: "If the declared OTLP ingress carries no configuration for TCP 4317 and TCP 4318, the observability leg reports a gap naming what is absent and adds no listener or configuration of its own.") |
| observability-config.enforcer-absent | no sender-restriction mechanism governs the receiver yet | create · gap | create | (declared — item 13: "where a leg's harvest finds no policy object governing its receiver, the leg creates one.") |
| observability-config.target-absent | declared target does not exist | gap · create-target | gap — report what is absent; create nothing | (declared — item 14: "if a declared target does not exist — the namespace, the bucket or the OTLP ingress — the leg reports a gap naming what is absent and creates nothing.") |
| observability-config.collateral | what else changes because enforcement applies | per enforcer (Kubernetes: allow-named-ports · deny · leave-to-workload-manifests) | senders other than the exporter range lose access to TCP 4317 and TCP 4318; other listeners are untouched | (declared — item 15: "On the OTLP ingress, senders other than the exporter range lose access to TCP 4317 and TCP 4318 and other listeners are untouched; the observability leg states that effect in its package.") |

## Decisions needed from the owner

none — every design-decision row above is declared or forced; no row is OPEN.

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel:** Is every value the downstream domains need knowable
before the upstream domain runs?
 - **Yes** ⇒ parallel; the values belong in the interface contract.
 - **No** ⇒ sequenced; the value must ride a DAG edge.

**Answer: No**, for the fabric-to-consumers edge. The exporter range (`network-provisioning.representation`)
is a derivation performed against **live fabric interface state at run time** — which interfaces carry
the declared exporter marker, and what their addresses are, can change independently of this document
(an interface can be relabelled, added, or removed on the fabric without this objective changing). The
Program Architect, which reads only `topology.json` and this document with **no live state access**,
structurally cannot know this value in advance; pinning it here would freeze it at authoring time and
go stale the moment the fabric changes — exactly the failure this program exists to prevent. The value
must therefore ride a DAG edge: the `network-provisioning` leg publishes it, and each of the three
consuming legs receives it as chained context at run time.

Once the `network-provisioning` leg's output is published and its gate is approved, the three consuming
legs (`kubernetes-gitops`, `terraform-iac`, `observability-config`) have **no dependency on one
another** — none needs a value only another of them produces — so they run in parallel with each
other. The program's sequencing is **producer-before-consumers**, not a single linear chain across all
four legs.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is transcribed from the approver mapping
declared in this program's objective (item 7), and marked `(declared)`.

**Declared approvers confirmed on the POV team:**
- program plan is Josh Allen josh.allen@paichart.com (declared) — member (PROJECT_MANAGER)
- fabric exporter value (network-provisioning) is Steve Terry steve.terry@paichart.com (declared) — member (OWNER)
- Kubernetes change method (kubernetes-gitops) is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member (SALES_ENGINEER)
- cloud storage change method (terraform-iac) is Josh Allen josh.allen@paichart.com (declared) — member (PROJECT_MANAGER)
- observability change method (observability-config) is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member (SALES_ENGINEER)

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| intent / method | how the work will be done, before it is done | the plan gate | the leg it governs |
| produced value | a concrete value that already exists | the leg that PRODUCES that value | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Josh Allen (declared) |
| fabric exporter value | the value produced by the `network-provisioning` leg (the derived exporter range) | the `network-provisioning` leg | the three consuming legs (`kubernetes-gitops`, `terraform-iac`, `observability-config`) | Steve Terry (declared) |
| Kubernetes change method | the method used to produce the `kubernetes-gitops` leg's change package | the `kubernetes-gitops` leg | program completion (does not block the leg's own authoring) | Jacob Wilcox (declared) |
| cloud storage change method | the method used to produce the `terraform-iac` leg's change package | the `terraform-iac` leg | program completion (does not block the leg's own authoring) | Josh Allen (declared) |
| observability change method | the method used to produce the `observability-config` leg's change package | the `observability-config` leg | program completion (does not block the leg's own authoring) | Jacob Wilcox (declared) |

**Dependency consequence, spelled out explicitly (sequenced, both edges given for each downstream leg):**
- `network-provisioning` → `fabric exporter value` gate (the gate depends on the leg that produces the value it approves).
- `fabric exporter value` gate → `kubernetes-gitops`, `fabric exporter value` gate → `terraform-iac`, `fabric exporter value` gate → `observability-config` (the gate blocks all three consuming legs from starting).
- `network-provisioning` → `kubernetes-gitops`, `network-provisioning` → `terraform-iac`, `network-provisioning` → `observability-config` (a **direct** edge in addition to the gate edge — the gate carries approval, not data; each consuming leg receives the published exporter range only via the direct dependency edge, per inter-pipeline chaining).
- `kubernetes-gitops` → Kubernetes change-method gate; `terraform-iac` → cloud storage change-method gate; `observability-config` → observability change-method gate (each of these three gates depends only on its own leg, blocks nothing further, and does not gate any other leg's start).

## Pipeline 1 objective — network-provisioning (UPSTREAM)

- Harvest the fabric's device and interface inventory **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time (this program's own requirements-authoring harvest)**: a scoped, per-device read of every interface and its description attribute across the fabric's inventory returned cleanly for every interface, confirming the exporter-marker check is conclusive across the fabric's full interface population.
- Apply the `network-provisioning.population` rule to every interface across the fabric's inventory, then apply the `network-provisioning.representation` rule to the resulting address set.
- **If the harvest returns no exporter addresses**: apply the `network-provisioning.inputs-empty` row — report a gap naming that no interface across the fabric's inventory carries the declared exporter marker, and produce no derived range. Never substitute a different population.
- **The deliverable MUST publish, explicitly and prominently**: the derived exporter range (per the `network-provisioning.representation` rule) and the population rule that produced it — named by rule and producer, never by today's computed literal. The three consuming legs depend on what this leg PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical)**: re-apply `network-provisioning.population` against a fresh read of the fabric's interface inventory, then re-apply `network-provisioning.representation` to the re-obtained set — expected: the published range equals the recomputation, and every re-obtained exporter address lies inside it.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than the requirement needs.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* — not the whole pool. Select another and recompute. Escalate only after establishing that no valid option exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** For CIDR aggregation: two addresses that are numerically adjacent do not necessarily summarize to a single block — e.g., synthetic addresses ending in `.1` and `.2` are adjacent but do NOT summarize to a `/31`; they straddle a boundary and their minimal cover is a `/30`, which swallows a neighbour address not in the original set. A `/31` covers an **aligned** pair only (e.g., synthetic `.4`/`.5`). Verify prefix alignment by binary arithmetic on each candidate boundary, never by inspecting the last octet.
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every input is inside the derived result, and nothing foreign is.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An objective naming inputs the target does not hold is unsatisfiable, and the leg will either escalate (correct) or find a value somewhere (plausible and wrong). Probing that the service ANSWERS proves it is alive, not that it holds what you are about to ask about. Read a harvest — a fresh one or a prior run's — before writing the derivation clause.
  *Earned: 2026-09-20 — an objective asked for a cover over harvested private subnet CIDRs in a workspace holding two resources and no subnets. All three endpoints had been probed and answered.*
- 🔴 **STATE THE NULL CASE, always.** Say what the correct outcome is when the harvest yields no inputs. A named null outcome ("produce a gap report; author nothing") is satisfiable; silence is not.
  *Earned: 2026-09-20 — the Design correctly declined to derive from an empty harvest, and the Author, holding a brief that demanded the block, imported a range from an unrelated pipeline and authored a policy permitting writes from switch loopback addresses.*
- 🔴 **RUN YOUR OWN RULE.** Apply the rule you wrote, literally and step by step, to one input, and confirm it produces the value you published — including the WIDTH of the result.
  *Earned 2026-09-21: an authoring pass wrote a rule that would have produced 16 hex digits and published a 12-digit identifier — one group shorter than its own rule produces.*
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your derivation is correct — the checker verifies containment, not that you met the requirement. **Satisfy the requirements; do not target the checker.**

## Pipeline 2 objective — kubernetes-gitops (DOWNSTREAM)

- Harvest the `trading` namespace, its pods, and any NetworkPolicy objects governing it, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time**: a scoped, labelled pod query against the `trading` namespace and an unscoped NetworkPolicy listing both returned cleanly (non-error), confirming the namespace is a reachable query surface and that a zero-result count from either query is a valid, harvestable outcome rather than a connectivity failure.
- Author a NetworkPolicy selecting exactly the receiver pods (`kubernetes-gitops.receiver`) in the declared namespace (`kubernetes-gitops.target`), admitting only senders whose source address lies in the exporter range produced by `network-provisioning` (`kubernetes-gitops.admitted-principal`), for the granted ports only (`kubernetes-gitops.granted-action`), replacing any other sender allowance on that surface (`kubernetes-gitops.existing-grant`).
- **Admitted-principal premise** (`kubernetes-gitops.admitted-principal`): the enforcer must see the sender's true source address, unmodified, on the path the exporter traffic actually takes to the receiver pods — if this leg's own harvest cannot confirm that, apply the `kubernetes-gitops.principal-unseen` row: report a gap naming what is unconfirmed and author nothing that depends on the unconfirmed premise.
- **Existence assumption** (*Writing rules* #6): if this leg's own harvest finds no NetworkPolicy object governing the receiver pods, apply `kubernetes-gitops.enforcer-absent` and create one; if it finds one already governing them, apply `kubernetes-gitops.existing-grant` and replace any other sender allowance on that surface; if the `trading` namespace itself does not exist, apply `kubernetes-gitops.target-absent` and create nothing.
- It consumes the exporter range produced by `network-provisioning` **as chained** — it does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no pods matching the declared receiver selector**: apply `kubernetes-gitops.target-empty` — author the policy against the declared selector regardless, reporting the number of matching pods including zero. If the namespace itself is absent, apply `kubernetes-gitops.target-absent` instead (gap, create nothing).
- No further leg consumes this leg's deliverable.
- **Validation (mechanical)**: `kubectl get networkpolicy -n trading -o json | jq '[.items[] | select(.spec.podSelector.matchLabels."app.kubernetes.io/component"=="telemetry-receiver")]'` — expected: exactly one NetworkPolicy object matches; its `spec.ingress` permits TCP 4317 and TCP 4318 only, sourced from an `ipBlock.cidr` equal to the range published by the `network-provisioning` leg's deliverable; and no other `from` entry is present in that ingress rule.

## Pipeline 3 objective — terraform-iac (DOWNSTREAM)

- Harvest the `aws_s3_bucket.app_logs` resource state and its current bucket policy (if any) in Terraform workspace `prod`, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time**: a scoped state read of the declared resource address returned successfully and named exactly one matching resource in the `prod` workspace, confirming the resource address resolves to a real object before any policy work is planned against it.
- Author (or amend) the bucket's policy document granting the admitted principal (`terraform-iac.admitted-principal`) `s3:PutObject` only (`terraform-iac.granted-action`) on objects in the declared bucket (`terraform-iac.receiver`), conditioned on the request arriving through the declared VPC endpoint from a source address in the exporter range produced by `network-provisioning`, applying the change additively and bounded (`terraform-iac.existing-grant`), modifying no existing statement (`terraform-iac.collateral`).
- **Admitted-principal premise** (`terraform-iac.admitted-principal`): per `terraform-iac.principal-unseen`, the policy is authored **regardless** of whether this leg's own harvest can confirm the IAM role and VPC endpoint are correctly configured to present that source address on that path — the premise that requests arrive through the declared VPC endpoint from the exporter range is recorded as **UNTESTED** and named in this leg's gap report; the program neither creates nor verifies the role or the endpoint.
- **Existence assumption** (*Writing rules* #6): if this leg's own harvest finds no existing policy statements on the bucket, apply `terraform-iac.enforcer-absent` and create the policy; if it finds existing statements, apply `terraform-iac.existing-grant` and add the new statement additively, modifying nothing else; if the declared bucket resource itself does not exist in the `prod` workspace, apply `terraform-iac.target-absent`: report a gap naming what is absent and create nothing.
- It consumes the exporter range produced by `network-provisioning` **as chained** — it does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest finds the bucket holds no objects today**: apply `terraform-iac.target-empty` — author the policy regardless; the grant applies to writes from then on.
- No further leg consumes this leg's deliverable.
- **Validation (mechanical)**: a read of the bucket's policy document state (e.g. `terraform state show` on the policy resource, or an equivalent policy-document read) — expected: the document contains exactly one statement whose `Principal` is the declared IAM role ARN, whose `Action` is `s3:PutObject` only, whose `Resource` is objects in the declared bucket only, and whose `Condition` block contains `aws:SourceVpce` equal to the declared VPC endpoint and `aws:VpcSourceIp` equal to the range published by the `network-provisioning` leg's deliverable — and that no statement in the document grants the exporter range any action beyond `s3:PutObject`.

## Pipeline 4 objective — observability-config (DOWNSTREAM)

- Harvest the observability stack's OTLP ingress configuration for TCP 4317 and TCP 4318, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time**: a read of the ingress configuration returned the declared listener's configuration for both TCP 4317 and TCP 4318 as real, non-empty configuration blocks, confirming the declared listener is a reachable, readable configuration surface.
- Restrict the declared OTLP ingress (`observability-config.target` / `observability-config.receiver`) so that only senders whose source address lies in the exporter range produced by `network-provisioning` are permitted on TCP 4317 and TCP 4318 (`observability-config.granted-action`), replacing any other sender allowance on that surface (`observability-config.existing-grant`), while every other listener is untouched (`observability-config.collateral`).
- **Admitted-principal premise** (`observability-config.admitted-principal`): the enforcer must see the sender's true source address, unmodified, on the path the exporter traffic actually takes to the ingress — if this leg's own harvest cannot confirm that, apply `observability-config.principal-unseen`: report a gap naming what is unconfirmed and author nothing that depends on the unconfirmed premise.
- **Existence assumption** (*Writing rules* #6): if this leg's own harvest finds the declared listener already carries a sender-restriction mechanism, apply `observability-config.existing-grant` and replace any other sender allowance with the exporter range; if it finds no such mechanism, apply `observability-config.enforcer-absent` and create one; if the OTLP ingress object itself does not exist, apply `observability-config.target-absent`: report a gap naming what is absent and create nothing.
- It consumes the exporter range produced by `network-provisioning` **as chained** — it does **not** re-derive it, and is forbidden from recomputing it. Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest finds the declared OTLP ingress carries no configuration at all for TCP 4317 and TCP 4318**: apply `observability-config.target-empty` — report a gap naming what is absent and add no listener or configuration of its own.
- No further leg consumes this leg's deliverable.
- **Validation (mechanical)**: a scoped read of the ingress configuration for the declared listener's TCP 4317 and TCP 4318 blocks — expected: the sender-restriction rules admit exactly one source range, equal to the range published by the `network-provisioning` leg's deliverable, deny every other source for those two ports, and no other listener's configuration in the same read differs from its state before this change.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- The four protocol tokens: `network-provisioning`, `kubernetes-gitops`, `terraform-iac`, `observability-config`.
- The declared targets: the `trading` namespace; the `aws_s3_bucket.app_logs` resource in workspace `prod`; the observability stack's OTLP ingress on TCP 4317 and TCP 4318.
- The granted actions and ports: TCP 4317, TCP 4318, and `s3:PutObject`.
- The admitted-principal identity for the archive leg: IAM role `arn:aws:iam::000000000000:role/telemetry-exporter-writer` via VPC endpoint `vpce-0a1b2c3d4e5f60718`.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The exporter range — produced by `network-provisioning`, chained into `kubernetes-gitops`'s, `terraform-iac`'s, and `observability-config`'s §6, settled before each of those legs starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules* #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the exporter range each of the three consuming legs authorises exactly equals the range published by the `network-provisioning` leg's deliverable — the chained value, not a guess, not a recomputation;
2. every exporter address the `network-provisioning` leg's own harvest reads at validation time lies inside the published range;
2b. the published range is the minimal aligned CIDR block containing that address set — recomputed independently by the reviewer, never taken on the `network-provisioning` leg's word;
3. no statement or rule in any of the three consuming legs' change packages admits a sender outside the published exporter range on the granted ports, and no statement grants an action or port beyond what item 10 declares;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`, `notChained []` — i.e. each downstream leg received the `network-provisioning` leg's **real** deliverable, not a fallback and not nothing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** If a new requirement needs a number, it **APPENDS** (5, 6, ...).
- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is rebuilt.
- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** Each of the three consuming legs' own change-package reports must state its isolation/collateral effect (`kubernetes-gitops.collateral`, `terraform-iac.collateral`, `observability-config.collateral`) **in its own leg's deliverable**, not only in a program-level summary — the integration reviewer's chained context is leg-scoped.

### Consuming-leg attribution — a downstream leg legitimately cannot self-check

Each of the three consuming legs consumes the exporter range as chained and cannot independently verify
its minimality or its containment of the fabric's exporter addresses against its own domain state — none
of the three has visibility into the fabric. The SATISFIED condition for such a leg's use of the value is
a property, not a self-check: (1) the `network-provisioning` leg's derivation was machine-checked with no
defect (Acceptance items 2 and 2b); (2) the program-tier checks above (items 1–4) pass on the chained
value as received by that leg; and (3) chaining coverage (item 4) confirms the leg received the
`network-provisioning` leg's real deliverable, not a fallback and not nothing.

## Open questions

- Item 7 declares that Josh Allen and Jacob Wilcox each hold two of the five gates, and states this is intentional. Per the general governance convention that a gate is normally released by someone other than the work's own producer, this is flagged for the owner's awareness — not as a row requiring an answer, since the objective already declares and intends this mapping.
- Infra hygiene: the Phase 0 harvest recorded a security finding (adversarial content embedded in a harvested resource tag on the archive target) and a secret-hygiene note (a secret-shaped tag value on the same resource), both disregarded by the Harvester and out of scope for this requirements document. See the Phase 0 harvest record for detail — this is an infra hygiene item for the owner, separate from the program this document specifies.

## Writing rules — read before authoring, they are the expensive part

*Rules version: 3 — 2026-09-25.* These govern how you write **every other section**. Every one was
earned by a failed or false-passing run.

1. ⚠️ **"Deterministic validation" means a reviewer can run it and compare, without judgement.**
   Every validation step is an **exact command** plus its **exact expected output** — the literal text
   or count you expect back. Prose like *"verify the loopback is up"*, *"confirm BGP advertises the
   aggregate"*, or *"check the policy is correct"* is a **REJECTABLE defect**, not a validation step:
   two reviewers could disagree on whether it passed.
   *Earned: Run 13's network leg was blocked for exactly this.*

2. ⚠️ **Ship every artefact your validation cites.** If a step invokes a policy/rule file (OPA,
   Conftest, tflint config, a test fixture), the change package must include that file's **complete,
   runnable contents**. Citing a check you did not ship is unrunnable, so it is not validation.
   *Earned: Run 10 was blocked for naming OPA/Conftest checks without shipping the rule files.*

3. 🔴 **State what must be TRUE. Do NOT name the measure that reports it.**
   Where a requirement can be written as a **property**, write the property — not the stamp shape, not
   the reason code, not the violation class, not `violations: []`. The **Program Architect** reads this
   file and composes every brief from it, so a machine pass-condition written here propagates into
   prompts **nobody inspects**, and becomes **a target an agent can aim at instead of the
   requirement**. Let the platform own the string.
   *Mechanism corrected 2026-09-21; the OBLIGATION is unchanged. This said "every agent reads this
   file". Measured: 0 of 197 change-package-author legs ever received this document, and the
   Architect is the only verbatim reader (66 of 92 executions). The hazard is WORSE than originally
   stated — the string reaches agents as a paraphrase nobody reviews.*
   *Earned: Run 15 (2026-07-29) — a leg met a published pass condition that was weaker than the
   requirement beside it, and shipped a defect. Declaring such a string "reference data" limits the
   damage; omitting it removes the temptation.*
   **Naming a measure is justified only when that state is the SUBJECT of the clause** and cannot be
   identified without it — and then say plainly that it is a state a leg legitimately lands in, never
   a bar to clear.

4. ⚠️ **Expected values stated in this document are reference data, NEVER evidence.** Where this file
   names an expected state, it describes the round's *intent* so a human can read the run. It is not
   an observation, and restating it is not a check. A tier must retrieve the **actual** value and
   construct its own finding.
   *Earned: Run 15 — Node C asserted a field's expected value, quoting the requirements, for a field
   that was **absent from the artifact entirely**.*

5. **Write properties, not hardcoded values**, wherever the environment can be rebuilt. If the rig
   re-randomizes, a magic expected string makes the round fail for the wrong reason.

6. ⚠️ **State every existence assumption a leg's objective rests on — as a BRANCH, never as today's
   state.** If a target resource may be ABSENT (a security group not yet created, an object tracked
   under another address), say what the leg does in each case: *"if the leg's own harvest finds no
   policy on the bucket, create one — absence is the expected starting point, not an escalation; if
   it finds one, modify it."* An unstated existence assumption is resolved by the design at runtime as
   an ambiguity — it costs retry generations, or worse, a guessed reconciliation. **Never write which
   branch is true today** (*"no policy exists"*, *"CREATE is the expected outcome"*): that is an
   observation of the environment, it goes false the moment anyone applies the change, and a program
   carries it forward as fact.
   *Earned: FW-A3.2/A3.3 — the same leg entered the retry band both rounds on exactly this
   ambiguity; FW-A3.5 stated it and the leg ran clean first-pass (VT-18). Rewritten 2026-09-25: the
   earlier wording asked for today's state, and a generated spec's "no enforcement point exists"
   reached a program's BINDING interface contract after the environment had gained one.*

7. ⚠️ **A constraint that exists only by convention does not exist for the agents.** Agents can
   honor any constraint observable in harvested facts or written here — nothing else. If a value is
   forbidden by operating convention but legal against every harvested fact (a subnet's zero
   address, a reserved-by-habit range), write the constraint or accept the value.
   *Earned: FW-A3.3 selected a pool containing the /24 zero address — legal against the harvest,
   off-convention, and invisible to every tier because the convention was written nowhere (VT-18).*

8. ⚠️ **State the platform dialect for any protocol ABSENT from harvested state.** A config author
   writing a protocol the target does not yet run has no harvested stanzas to imitate — it falls
   back to the textbook dialect, which is often another vendor's, and a reviewer with the same
   corpus gap approves it. If the target platform's syntax for the new protocol differs from the
   textbook form, write the platform's tokens as reference data (rule 4 applies), or accept that
   the first apply adjudicates them and may archive the round.
   *Earned: IGP-T1 R1 (2026-08-23) — an Arista EOS package carried two IOS-isms
   (`is-type level-2-only`, `metric-style wide`); the leg reviewer approved; the operator's EOS
   config-session entry rejected both, and the round was archived at its first apply gate.*
   **Prefer a positive exemplar over a negative token rule.** "Command X does not exist on this
   platform" is an omission-rule, and a generator's training prior re-inserts high-frequency
   tokens past it. A complete platform-native exemplar stanza (verified live where an operator
   can) converts generation into TRANSCRIPTION. Keep the negative list too — it is what a
   reviewer, an operator, and the platform's lint can all grep.
   *Earned: IGP-T1 R3 — with the negative dialect rules binding in its prompt, the author
   re-emitted the exact banned token R1 died on; the round was archived at its quality gate.*

   🔴 **WRITE THE EXEMPLAR — BUT DO NOT RELY ON IT HOLDING.** This rule used to end "...converts
   generation into transcription, WHICH HOLDS". That claim is now FALSIFIED and the correction is
   the most useful thing on this page. On IGP-T1 R11 the exemplar was present, complete, and
   BINDING in the leg's interface contract, under an explicit instruction to transcribe it — and
   the author silently dropped two of its lines. Its reviewer, carrying the same completeness rule,
   approved the package at 86/100 with no blocking issues. The omitted line left the routing
   protocol INACTIVE while the config entered, committed and displayed cleanly.
   What caught it was `dialect-lint`, which does not read.

   ⚠️ **One correction to that account, measured afterwards and worth more than the account itself.**
   This page used to say four guards were in force — protocol rule, role guidance, the exemplar, the
   reviewer — and that *all four* were prose that a language model bypassed. Three of those were
   genuinely in the author's prompt. **The exemplar was not.** The contract was binding on the LEG,
   but it was never delivered to the leg's own child tasks: the author received a harness-written
   paraphrase of it in its brief, **missing 7 of the exemplar's 10 lines** — and the reviewer's brief
   was missing 9 of 10. Measured across every archived leg that carried a contract, the same hole was
   universal: **7 of 7 legs lossy, 0 of N children ever holding the contract.** So the author did not
   ignore a complete exemplar; it faithfully transcribed an incomplete one. That is a mechanical
   defect, and it has since been fixed — the contract is now inherited verbatim by every child on its
   own structured channel, and briefs are forbidden from restating it.
   **The transferable lesson is the one that cost us the misdiagnosis: before concluding that a model
   ignored a rule, verify the rule was IN ITS PROMPT.** "Binding" is a property of a document; being
   *present* is a property of a prompt, and the two drift apart silently. A guard you believe is in
   force and that is merely absent produces evidence indistinguishable from a guard that was
   disobeyed — and it argues for exactly the wrong fix (write the prose more forcefully) while the
   real defect is that nothing was delivered.
   The rest of the account stands, and so does the conclusion: the reviewer DID hold the complete
   rule and still approved, and `dialect-lint` — which does not read — is what caught it.
   **So the exemplar's real value is not that an agent obeys it — it is that it is the SPECIFICATION
   the platform's lint checks against.** Nobody ever wrote "this line is required"; the lint derives
   every required line by decomposing this block. A better exemplar therefore buys you a better
   mechanical check, which is the part that actually holds. Write it carefully for that reason.
   *Earned: IGP-T1 R11 (2026-08-25) — dialect-lint's first live run, catching what four prose
   guards and one LLM reviewer had all passed.*
   **COMPLETENESS is half the rule, and the half that hides.** A required line of the exemplar that
   is ABSENT is as defective as a wrong token, and more dangerous: the config enters, commits and
   displays cleanly while the thing it configures stays INACTIVE. State completeness as a property —
   "the shape must appear COMPLETE, every line, in order" — and name the mechanism, never the line a
   prior round dropped.
   *Earned: IGP-T1 R7 — an omitted line left the protocol disabled; the package was banned-token
   clean and approved at 90/100 by a reviewer checking only the absence direction.*

9. ⚠️ **A validation target the harvest cannot see does not license prose.** When rule 1 demands a
   literal expected output for state the read-only service has no getter for, the author has two
   deterministic paths and must take (and name) at least one: derive the literal expectation from
   declared topology facts (identities, counts, states that are static by design — excluding and
   naming the dynamic fields), and/or mandate an operator-captured pre-change baseline of the exact
   command with a post-change byte-diff of the static fields. State the gap; never fabricate the
   baseline, and never describe the check in prose.
   *Earned: IGP-T1 R1+R2 — the same unharvestable check was handled well by one author (topology
   literals + operator capture) and as prose by the next, whose reviewer correctly blocked it; the
   deterministic shape was never written anywhere, so craft variance decided the round.*

10. ⚠️ **A `[NEUTRALIZED-...]` sanitizer marker seen in CHAINED context is a platform view-layer
    annotation — it is not evidence the marker exists in the document itself.** The platform
    sanitizes text at the boundary where one agent's output is chained into another's context, so
    a reviewer's view can carry a neutralization marker that the at-rest deliverable does not.
    A reviewer must report a marker as an OBSERVATION (naming where it appeared), never as a
    blocking document defect; deliverable hygiene is verified against the at-rest artifact by the
    program tier and the human operator, who can read the document as stored.
    *Earned: IGP-T1 R5 — a clean package's "System IDs..." paragraph false-positived an injection
    pattern at the chaining boundary; the reviewer, seeing the marker in its view, blocked a
    document that contained no marker at rest. The round was archived on a defect that did not
    exist.*

11. ⚠️ **Every validation step must be SATISFIABLE under the phase's own constraints.** Before you
    write an expected output, ask: *can this pass, GIVEN what this phase is required to do?* A step
    whose expected output is precluded by the phase's own requirement makes a CORRECT change look
    failed — the operator then rolls back good work, or "fixes" it by violating the requirement.
    Where a property can be observed several ways, state the PROPERTY and name an observable the
    phase does not preclude.
    *Earned: IGP-T1 R9 — a step required one protocol's routes to appear in the routing table while
    the same phase required the OTHER protocol to stay preferred, which guarantees they never
    install. The same defect recurred in that round's parity criterion, which compared installed
    routes during deliberate coexistence and reported failure on a healthy fabric.*

12. 🔴 **Writing rule 3 governs EVERY channel an agent reads — not just this file.** Task
    descriptions, gate comments, and run notes are all agent-readable contract. Naming a prior
    round's specific defect token there lets the agent satisfy the POINTER instead of the PROPERTY,
    and a round that then passes evidences only "the agent avoided the line it was told about".
    Name the property, name the mechanism, cite the earning round for provenance — never the token.
    *Earned: a round was superseded before its plan gate for exactly this, and re-run clean, which
    is the only reason its result was usable as evidence.*

13. ⚠️ **A value the evidence source does not directly carry must be labelled DERIVED, and its
    basis named.** Where a criterion requires such a value, the value is still legitimate — DERIVE
    it, then say it is derived and name what it was derived from. Never silently promote a
    derivation to a quotation, and never assert a blanket "every value here is a direct quote from
    tool output" over a table that contains one. Do NOT "solve" this by dropping the field or by
    switching to a source that merely prints the word: derive, disclose, and let the reviewer judge
    the derivation.
    🔴 **Check THIS document first.** If a deliverable spec tells the author to present such a value
    "as retrieved output", the author is doing what it was told and the defect is here, not in the
    agent. A requirement that asks for a value its own named evidence source cannot supply is the
    same class of defect as rule 11's unsatisfiable step.
    *Earned: IGP-T1 R15 and R16 — a derived value presented as a literal quote from a source that
    structurally cannot carry it. Where the topology makes the derivation trivially correct, the
    answer is RIGHT and only its stated provenance is wrong, which is exactly the shape a reviewer
    skims past: R16's reviewer blocked it, R15's did not and it shipped. The requirement itself had
    said "as retrieved output".*

14. ⚠️ **A numbered acceptance check keeps its NUMBER for the life of the program family, even
    when its property is narrowed.** Rounds are compared against each other, and "check 2 passed" is
    only meaningful if check 2 is the same check it was last round. When a topology or scope change
    makes a check's original property unobservable, do not renumber, delete, or silently substitute:
    keep the number, narrow the property HONESTLY, and state in the check itself that it is narrower
    and what a pass now evidences. Renumbering makes every prior round's result uncitable;
    substituting silently makes them wrong — a pass gets reported as evidence of a property nobody
    checked.
    *Earned: Run 15 (fabric expansion) — a new clause was added to a requirements file and the
    reviewer renumbered it into the slot held by the minimality check, which it then never
    performed; a non-minimal result shipped as approved. **A renumbering silently deletes a
    check.** The narrowing half was earned on IGP-T1's 2-node topology, where a check written for a
    richer fabric could not express its original property and kept its number with the narrowing
    stated, so the round stayed comparable.*

15. 🔴 **A crossing VALUE always names its producer. "the PRODUCED range" is not one value — it is two.**
    Wherever this file names a value that crosses between legs, write *"the range produced by the
    FABRIC leg"*, never a bare *"the PRODUCED range"*. A bare participle has no subject, and the
    phrase that follows it usually attaches the value to the CONSUMER's artifact (*"the produced range
    **as an ingress source**"*), which then reads as the consuming leg's own output. **Two readings of
    one sentence produce two different DAGs**, and a planner picks one without telling you which —
    unless it happens to notice.
    *Earned 2026-09-17 (telemetry-export-four-domain): the Approvals table said "the PRODUCED range as
    an ingress source" while the sentence four lines below said each downstream pipeline waits on its
    own gate. Both readings were defensible on the text. The Program Architect DID notice, chose one,
    flagged it as an Open Question and asked for confirmation before plan approval — the plan gate was
    released without answering it, and all four change packages were produced with zero domain
    approvals. The gates held the RELEASE, so nothing shipped; but an intent gate that runs after the
    work is a record, not a control.*
    **General form: a noun phrase that omits its subject gets bound to whoever reads it.** Apply it to
    crossing values first, because those decide the graph.
    ⚠️ **Do not over-generalise this to every role-agnostic sentence.** On the same run a role-agnostic
    *"show the computation in the deliverable"* was suspected of misdirecting the change-package author
    into a clause-(f) violation, and **measured not to** — the platform writes per-role task
    descriptions, and that instruction reached the architect and the reviewer but never the author.
    Verify that a sentence actually propagates to the role you think it misled before rewriting it.

    ### ✅ VALIDATED END TO END 2026-09-18 — and the same rule covers SCOPE WORDS, not just values

    A second instance of this family was found, fixed and **proven** on a live campaign, so the rule
    is no longer reasoning from one case.

    **The defect**: acceptance check 3 of a firewall program said *"no **hop** widens the flow."*
    "Hop" reads naturally as the DEVICE (edge / DMZ / core). It was also true of every match list
    WITHIN a device — and on an edge doing source-NAT that is two lists, a security ACL and a
    NAT-match ACL. Three rounds of the same program authored that one list three different widths:
    `tcp <partner> any eq 443` (destination too wide, **not caught**), the correct
    `tcp <partner> host <app> eq 443`, and `ip <partner> any`. The program reviewer blocked the third.
    The requirement was meticulous about the NAT POOL's minimality and silent about the NAT MATCH
    list, so which reading an author took was left to chance.

    **The fix was one definition** — no new obligation, no new constraint:
    > *"**Hop" here means every match list that selects traffic at that hop, NOT just the device.** ...
    > the check is on what the configuration PERMITS, not on what happens to reach it. Every selecting
    > list at a hop carries the same destination and port bounds as that hop's tightest one.*

    **The outcome, measured**: the next round went from `programReleasable: false` to **true**. The
    definition propagated with no human repeating it — the Architect's plan carried it, the leg's brief
    stated it as a named clause, the author **self-checked against it by name**, a second author in a
    different domain cited the same clause, and the program reviewer that had refused the round before
    approved with no blocking issues. Leg scores rose 85→88 and 84→90.

    🔴 **So the rule generalises past values: any term the acceptance checks TURN ON must be defined
    where it is used.** A value needs its producer; a scope word needs its extent. The test is the
    same one — *can this phrase be read two ways that produce different work?* — and the cost of
    leaving it is not a wrong answer, it is a **coin flip across rounds**, which is worse because it
    looks like craft variance and gets remediated at the wrong layer.

    ⚠️ **The discriminator that tells you which layer**: RECURRENCE. The same contract producing
    different results across rounds, from different authors, is an under-specified requirement and
    belongs here. A single slip — a transposed multiplication, a mis-scoped validation step — is craft
    and belongs in a re-run or in role guidance. Encoding a craft slip's specific answer into a
    requirement buys a green that proves nothing; it teaches to the test.

---
