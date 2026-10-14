# Program Requirements — Telemetry Export Authorisation (Cross-Domain, v2)

- Authored in: Telemetry Export Authorisation — Cross-Domain (v2) · Specify: Objective → Requirements
- Iteration: Run 20260929-1948 · 2026-09-29

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- **4 legs** (pipelines). The **network-provisioning** leg runs first; the **kubernetes-gitops**,
  **terraform-iac**, and **observability-config** legs consume its output and run **in parallel with
  one another** once it and its change gate complete. Each leg is a distinct DOMAIN (a different
  protocol/target class), not a device count and not a tidiness split:
  1. **network-provisioning** (—) on the network fabric, described in `topology.json`. Service
     descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
  2. **kubernetes-gitops** (downstream) on the Kubernetes cluster. Service descriptor:
     `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
  3. **terraform-iac** (downstream) on the cloud storage bucket. Service descriptor:
     `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
  4. **observability-config** (downstream) on the observability stack's ingestion-admission surface.
     Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- Out of scope, stated as classes: any resource other than the declared exporter-source population on
  the fabric; any namespace/workload other than the declared receiving target on the cluster; any
  bucket/resource other than the declared target bucket; any listener or configuration file on the
  observability stack other than the declared sender-admission surface; and **applying** any of the
  three produced change packages — apply is out-of-band and human-gated in every domain, in every run.

## Design decisions

The objective is plain-language prose with **no numbered items, no design decisions declared inline,
and no approver mapping declared inline.** No row below can therefore be sourced `(declared — item N)`.
Rows are sourced `(derived — basis: …)` only where a harvest read establishes a technical/architectural
fact the owner could not choose differently on this estate (e.g. which component structurally can
enforce); every row expressing an actual business or policy choice is **OPEN**.

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| network-provisioning.target | which surface of the fabric this leg acts on | — | the two directly-connected fabric devices carrying loopback interfaces in scope for the exporter population | (derived — basis: Phase-0 fabric harvest enumerated exactly two devices, directly connected, both carrying candidate loopback interfaces) |
| kubernetes-gitops.target | which namespace/workload on the cluster this leg acts on | — | **gap** — no dedicated telemetry-ingestion workload/namespace exists in the bounded Phase-0 probe (kube-system, local-path-storage, default, monitoring, observability, telemetry, telemetry-ingest) | OPEN — the objective does not name a receiving workload; the probe's empty result is named as a gap, not proof no such workload exists cluster-wide |
| terraform-iac.target | which bucket/resource this leg acts on | — | the Phase-0 harvest found exactly one storage-bucket resource in the harvested workspace, but nothing in the objective confirms it is the intended "central archive" | OPEN — confirm whether the harvested candidate bucket is the intended target, or a different bucket is meant |
| observability-config.target | which surface of the observability stack this leg acts on | — | the sender-admission ingress fronting the metrics-ingestion pipeline (not the ingestion pipeline itself) | (derived — basis: Phase-0 harvest of the ingestion pipeline's receiver configuration confirms it has no source-address control; a separate ingress proxy is the sole point on the path that does) |
| network-provisioning.population | which members of the class the derivation reads | — | select every fabric loopback interface whose `description` attribute equals the literal string `telemetry-exporter (existing allocation)` | (derived — basis: Phase-0 harvest found this description attribute present on a bounded subset of loopback interfaces and absent from every other interface surveyed, cleanly separating an exporter population from the rest of the fabric's interfaces) |
| network-provisioning.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | "one aligned prefix" is ruled out; OPEN between "a set of prefixes" and "a host list" | (derived, partially — basis: Phase-0 harvest shows the population is non-contiguous, so a single aligned cover would authorise addresses outside the population, violating "nothing wider than it"); the remaining choice between a prefix-set and a host list is OPEN |
| network-provisioning.inputs-empty | the derivation's inputs are empty | gap | gap — no substitute population may be used | OPEN structurally — no item declares a substitute population, and the Writing rules forbid substituting a value regardless; this is the only safe answer even though formally unsourced |
| approver.plan | who approves the program plan gate | — | UNASSIGNED — no approver declared | OPEN |
| approver.network-provisioning | who approves the network-provisioning change gate | — | UNASSIGNED — no approver declared | OPEN |
| approver.kubernetes-gitops | who approves the kubernetes-gitops change gate | — | UNASSIGNED — no approver declared | OPEN |
| approver.terraform-iac | who approves the terraform-iac change gate | — | UNASSIGNED — no approver declared | OPEN |
| approver.observability-config | who approves the observability-config change gate | — | UNASSIGNED — no approver declared | OPEN |
| gate.network-provisioning.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers — it approves the range this leg PRODUCES, so it must run after this leg and before the three consuming legs | fixed by gate KIND (see *Approvals*) — a structural fact of what the gate approves, not a business choice; not blocking on the owner |
| gate.kubernetes-gitops.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion — it approves the change package this leg PRODUCES | fixed by gate KIND; not blocking on the owner |
| gate.terraform-iac.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion — it approves the change package this leg PRODUCES | fixed by gate KIND; not blocking on the owner |
| gate.observability-config.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-leg-before-completion — it approves the change package this leg PRODUCES | fixed by gate KIND; not blocking on the owner |

### kubernetes-gitops (authorisation leg)

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| kubernetes-gitops.receiver | which workload/resource is authorised | — | undetermined — no candidate workload exists in the bounded probe | OPEN |
| kubernetes-gitops.admitted-principal | who is admitted, and by which attribute | source-address-range · named-identity · network-path · combination | undetermined | OPEN |
| kubernetes-gitops.granted-action | what the admitted principal may do | — | undetermined | OPEN |
| kubernetes-gitops.existing-grant | treatment of other allowances on the same surface | replace · preserve · preserve-bounded | undetermined | OPEN |
| kubernetes-gitops.target-empty | receiver selector matches nothing now | act · gap | undetermined | OPEN |
| kubernetes-gitops.enforcer-absent | no policy object governs the receiver yet | create · gap | undetermined | OPEN — never forced or derived per role guidance; the objective declares no cross-leg default |
| kubernetes-gitops.target-absent | the declared target itself does not exist | gap · create-target | undetermined | OPEN |
| kubernetes-gitops.collateral | what else changes once enforcement applies | allow-named-ports · deny · leave-to-workload-manifests | undetermined | OPEN — ⚠️ Kubernetes NetworkPolicy caveat: selecting the receiver with any Ingress policy isolates it for ALL ingress the policy set does not explicitly allow; a future declaration of "other ports untouched" would be INFEASIBLE and must be rejected as such, not transcribed |

### terraform-iac (authorisation leg)

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| terraform-iac.receiver | which resource is authorised | — | the same single candidate bucket named in `terraform-iac.target`, pending confirmation | OPEN |
| terraform-iac.admitted-principal | who is admitted, and by which attribute | source-address-range · named-identity · network-path · combination | undetermined | OPEN |
| terraform-iac.granted-action | what the admitted principal may do | — | undetermined | OPEN |
| terraform-iac.existing-grant | treatment of other allowances on the same surface | replace · preserve · preserve-bounded | undetermined | OPEN |
| terraform-iac.target-empty | receiver selector matches nothing now | act · gap | undetermined | OPEN |
| terraform-iac.enforcer-absent | no policy object governs the receiver yet | create · gap | undetermined | OPEN |
| terraform-iac.target-absent | the declared target itself does not exist | gap · create-target | undetermined | OPEN |
| terraform-iac.collateral | what else changes once enforcement applies | — | undetermined; any pre-existing ACL grants on the bucket unrelated to sender authorisation are out of scope of this decision | OPEN |

### observability-config (authorisation leg)

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| observability-config.receiver | which resource is authorised | — | the sender-admission ingress identified in `observability-config.target` | (derived — basis: same Phase-0 finding — the ingestion pipeline's receiver has no source-address control, so the ingress proxy is the only resource capable of being the receiver of this grant) |
| observability-config.admitted-principal | who is admitted, and by which attribute | source-address-range · named-identity · network-path · combination | undetermined | OPEN |
| observability-config.granted-action | what the admitted principal may do | — | undetermined | OPEN |
| observability-config.existing-grant | treatment of other allowances on the same surface | replace · preserve · preserve-bounded | undetermined | OPEN |
| observability-config.target-empty | receiver selector matches nothing now | act · gap | undetermined | OPEN |
| observability-config.enforcer-absent | no policy object governs the receiver yet | create · gap | undetermined | OPEN |
| observability-config.target-absent | the declared target itself does not exist | gap · create-target | undetermined | OPEN |
| observability-config.collateral | what else changes once enforcement applies | — | undetermined | OPEN |

## Decisions needed from the owner

- network-provisioning.target — which two fabric devices bound the exporter domain — options: n/a (derived) — governs: Pipeline 1 harvest scope — tier: confirm
- network-provisioning.population — whether the `telemetry-exporter (existing allocation)` description marker is the correct population selector — options: n/a (derived) — governs: Pipeline 1 population rule — tier: confirm
- network-provisioning.representation — set-of-prefixes vs host-list encoding of the derived range — options: a set of prefixes · a host list — governs: Pipeline 1 publish clause — tier: blocking
- network-provisioning.inputs-empty — confirm the no-substitute gap outcome — options: gap (only valid answer) — governs: Pipeline 1 null-outcome clause — tier: default
- kubernetes-gitops.target — which namespace/workload on the cluster receives exported telemetry (none currently exists) — options: name an existing target · authorise the program to provision one — governs: Pipeline 2 scope — tier: blocking
- kubernetes-gitops.receiver — which workload/resource is authorised — options: n/a, depends on target — governs: Pipeline 2 policy subject — tier: blocking
- kubernetes-gitops.admitted-principal — who is admitted and by which attribute — options: source-address-range · named-identity · network-path · combination — governs: Pipeline 2 policy ingress rule — tier: blocking
- kubernetes-gitops.granted-action — what the admitted principal may do — options: undeclared enum (ports/protocols) — governs: Pipeline 2 policy ingress rule — tier: blocking
- kubernetes-gitops.existing-grant — how to treat other allowances on the same surface — options: replace · preserve · preserve-bounded — governs: Pipeline 2 existence-assumption branch — tier: blocking
- kubernetes-gitops.target-empty — behaviour when the receiver selector matches nothing — options: act · gap — governs: Pipeline 2 null-outcome clause — tier: blocking
- kubernetes-gitops.enforcer-absent — behaviour when no policy governs the receiver yet — options: create · gap — governs: Pipeline 2 existence-assumption branch — tier: blocking
- kubernetes-gitops.target-absent — behaviour when the declared target does not exist — options: gap · create-target — governs: Pipeline 2 existence-assumption branch — tier: blocking
- kubernetes-gitops.collateral — how to handle NetworkPolicy's all-ingress isolation side effect — options: allow-named-ports · deny · leave-to-workload-manifests — governs: Pipeline 2 collateral clause — tier: blocking
- terraform-iac.target — confirm the harvested candidate bucket is the intended central archive, or name a different one — options: confirm candidate · name alternative — governs: Pipeline 3 scope — tier: blocking
- terraform-iac.receiver — which bucket resource is authorised — options: n/a, depends on target — governs: Pipeline 3 policy subject — tier: blocking
- terraform-iac.admitted-principal — who is admitted and by which attribute — options: source-address-range · named-identity · network-path · combination — governs: Pipeline 3 policy statement — tier: blocking
- terraform-iac.granted-action — what actions are granted — options: undeclared enum (e.g. object-write actions) — governs: Pipeline 3 policy statement — tier: blocking
- terraform-iac.existing-grant — how to treat other allowances on the same surface — options: replace · preserve · preserve-bounded — governs: Pipeline 3 existence-assumption branch — tier: blocking
- terraform-iac.target-empty — behaviour when the receiver selector matches nothing — options: act · gap — governs: Pipeline 3 null-outcome clause — tier: blocking
- terraform-iac.enforcer-absent — behaviour when no policy governs the bucket yet — options: create · gap — governs: Pipeline 3 existence-assumption branch — tier: blocking
- terraform-iac.target-absent — behaviour when the declared bucket does not exist — options: gap · create-target — governs: Pipeline 3 existence-assumption branch — tier: blocking
- terraform-iac.collateral — what else on the bucket changes once the policy applies — options: undeclared — governs: Pipeline 3 collateral clause — tier: blocking
- observability-config.target — confirm the ingress-proxy admission surface is the intended enforcement point — options: n/a (derived) — governs: Pipeline 4 scope — tier: confirm
- observability-config.receiver — confirm the same ingress is the authorised receiver — options: n/a (derived) — governs: Pipeline 4 policy subject — tier: confirm
- observability-config.admitted-principal — who is admitted and by which attribute — options: source-address-range · named-identity · network-path · combination — governs: Pipeline 4 allowlist rule — tier: blocking
- observability-config.granted-action — what protocols/ports are granted — options: undeclared enum — governs: Pipeline 4 allowlist rule — tier: blocking
- observability-config.existing-grant — how to treat other allowances on the same surface — options: replace · preserve · preserve-bounded — governs: Pipeline 4 existence-assumption branch — tier: blocking
- observability-config.target-empty — behaviour when the receiver selector matches nothing — options: act · gap — governs: Pipeline 4 null-outcome clause — tier: blocking
- observability-config.enforcer-absent — behaviour when no allowlist rule governs the receiver yet — options: create · gap — governs: Pipeline 4 existence-assumption branch — tier: blocking
- observability-config.target-absent — behaviour when the declared ingress surface does not exist — options: gap · create-target — governs: Pipeline 4 existence-assumption branch — tier: blocking
- observability-config.collateral — what else changes once the allowlist applies — options: undeclared — governs: Pipeline 4 collateral clause — tier: blocking
- approver.plan — who approves the program plan gate — options: name a POV team member — governs: program plan gate — tier: blocking
- approver.network-provisioning — who approves the network-provisioning change gate — options: name a POV team member — governs: network-provisioning gate — tier: blocking
- approver.kubernetes-gitops — who approves the kubernetes-gitops change gate — options: name a POV team member — governs: kubernetes-gitops gate — tier: blocking
- approver.terraform-iac — who approves the terraform-iac change gate — options: name a POV team member — governs: terraform-iac gate — tier: blocking
- approver.observability-config — who approves the observability-config change gate — options: name a POV team member — governs: observability-config gate — tier: blocking
- gate.network-provisioning.position — confirm after-producer-before-consumers — options: n/a (fixed by gate kind) — governs: DAG wiring — tier: default
- gate.kubernetes-gitops.position — confirm after-leg-before-completion — options: n/a (fixed by gate kind) — governs: DAG wiring — tier: default
- gate.terraform-iac.position — confirm after-leg-before-completion — options: n/a (fixed by gate kind) — governs: DAG wiring — tier: default
- gate.observability-config.position — confirm after-leg-before-completion — options: n/a (fixed by gate kind) — governs: DAG wiring — tier: default

## Why this is sequenced (then fanned out) — the design rationale

**The test:** Is every value the downstream domains need knowable before the upstream domain runs?
No — the exporter range is derived from the fabric's live loopback-interface state, which an operator
can add to, remove from, or re-label at any time, independent of this program. The Program Architect
(which reads only `topology.json` and this document, with no live-state access) structurally cannot
know that range up front. It must ride a DAG edge (inter-pipeline chaining) out of the
network-provisioning leg, never a static interface-contract field.

The three consuming legs (kubernetes-gitops, terraform-iac, observability-config) do not need any
value from one another — each independently authorises the same chained range on its own surface — so
once network-provisioning and its change gate complete, they run in parallel. Guessing the range up
front, or letting a downstream leg pin its own copy, would leave that copy stale the moment an operator
adds or removes a marked loopback: the authorised range would silently drift from the live fabric
state — exactly the failure the objective asks this program to prevent.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** The objective declares no approver mapping. Every gate below
is therefore **UNASSIGNED — no approver declared**, and its `approver.<gate>` row in *Design decisions*
is OPEN.

**Declared approvers confirmed on the POV team:** not applicable — no approver mapping is declared in
the objective, so there is nothing to confirm against the POV roster.

### Every gate declares WHAT it approves and WHEN it sits

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | UNASSIGNED — no approver declared |
| network-provisioning change | the range produced by the network-provisioning leg | the network-provisioning leg produces its range | kubernetes-gitops, terraform-iac, observability-config | UNASSIGNED — no approver declared |
| kubernetes-gitops change | the change package produced by the kubernetes-gitops leg | the kubernetes-gitops leg produces its change package | that leg's own (human-gated, out-of-band) apply | UNASSIGNED — no approver declared |
| terraform-iac change | the change package produced by the terraform-iac leg | the terraform-iac leg produces its change package | that leg's own (human-gated, out-of-band) apply | UNASSIGNED — no approver declared |
| observability-config change | the change package produced by the observability-config leg | the observability-config leg produces its change package | that leg's own (human-gated, out-of-band) apply | UNASSIGNED — no approver declared |

**Dependency consequence:** each of the three consuming legs depends on **both** its own change gate
**and** the network-provisioning leg, and the network-provisioning change gate itself also depends on
the network-provisioning leg:
- `network-provisioning → network-provisioning-change-gate`
- `network-provisioning → kubernetes-gitops`, `network-provisioning → terraform-iac`, `network-provisioning → observability-config` (direct edges — these carry the chained range; an approval gate carries approval, not data)
- `network-provisioning-change-gate → kubernetes-gitops`, `→ terraform-iac`, `→ observability-config` (approval-ordering edges)

⚠️ The direct edges are not redundant with the gate edges: the gate decides *when* a consuming leg may
start; the direct edge is *how* the chained range reaches it.

## Pipeline 1 objective — network-provisioning (upstream)

- Harvest the fabric's loopback interfaces **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — at Phase-0 harvest**: the Phase-0 read confirmed at least one fabric
  loopback interface carries a `description` attribute usable as a membership marker, and confirmed the
  descriptor was reachable and the service ACTIVE.
- Re-harvest the current state of every loopback interface on the in-scope fabric devices at run time
  (row `network-provisioning.target`); select the members whose `description` equals the literal string
  `telemetry-exporter (existing allocation)` (row `network-provisioning.population`); compute the
  tightest-correct cover of exactly those members, in the representation chosen against row
  `network-provisioning.representation` (a single aligned prefix is excluded).
- **If the harvest returns no addresses carrying the population marker**: apply row
  `network-provisioning.inputs-empty` — produce a gap report naming that no marked addresses were
  found; never substitute a different population or a default range.
- **The deliverable MUST publish, explicitly and prominently**: the range produced by the
  network-provisioning leg's derivation, described by the population rule and representation choice
  that produced it — never today's computed value stated as a literal, and never a count of members.
  Every consuming leg depends on what this leg publishes at ITS run time, not on what this document's
  authoring-time harvest observed.
- **Validation (mechanical)**: re-run the population selection against the fabric descriptor, then
  recompute the tightest-correct cover using the chosen representation — expected: the published range
  equals the recomputation, and every re-harvested marked address lies inside it, with none outside.

### Derivation requirements (this leg derives a value the three downstream legs consume)

- The deliverable's design section shows the computation: the input block (the selection rule applied,
  not the literal addresses it matched) and the result block (the representation format chosen, not the
  literal prefixes/hosts), plus the re-runnable check above followed by the literal text it prints.
- **Minimality is mandatory and mechanically checkable.** A result that authorises more than the
  minimal cover of the selected population is a rejectable defect even if nothing else is violated.
- **Re-selection before escalation.** If a candidate representation fails minimality or containment,
  that rules out the candidate, not the whole approach — try the next representation option before
  declaring the derivation impossible; escalate only after every option in
  `network-provisioning.representation`'s enum has been tried and failed.
- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic example (not this harvest's values): two
  addresses `10.0.0.1/32` and `10.0.0.2/32` are adjacent but do **not** summarise to a `/31` — they
  straddle a `/31` alignment boundary, and their minimal common cover is a `/30`, which also admits two
  addresses that are not in the population. A `/31` aggregate is only valid over an **aligned** pair.
- Verify member-by-member before publishing: every selected member lies inside the published result,
  and nothing outside the selection does.
- ⚠️ **The premise was checked before this objective was written**: Phase-0 confirmed the marker exists
  on a bounded, non-empty subset of interfaces — this derivation is not being asked to run over an empty
  or fabricated population.
- 🔴 **State the null case** (done above): a fabric harvest returning zero marked addresses produces a
  named gap, never an improvised substitute population.
- 🔴 **Run your own rule**: before publishing, apply the chosen representation rule by hand to one
  member of the re-harvested population and confirm it reproduces the published format and width; a
  rule that cannot reproduce its own output must not ship.
- 🔴 **The mechanical check above is a floor, not the bar**: passing it proves containment, not that the
  representation choice or population rule satisfies the objective — satisfy the requirement, don't
  target the checker.

## Pipeline 2 objective — kubernetes-gitops (downstream)

- Harvest the target namespace/workload **read-only** (row `kubernetes-gitops.target` — currently a
  named gap). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — at Phase-0 harvest**: the Phase-0 read confirmed the cluster descriptor
  was reachable and the service ACTIVE, and confirmed — via a bounded, named probe set — that no
  NetworkPolicy currently governs a telemetry-receiving workload in the namespaces probed. This is
  named as a gap, not proof that no such workload exists cluster-wide.
- Once the receiver is confirmed (rows `kubernetes-gitops.target`, `.receiver`), create or update a
  NetworkPolicy selecting the receiver, admitting only the principal defined by
  `kubernetes-gitops.admitted-principal` — sourced from the range **chained from the
  network-provisioning leg**, never re-derived — and permitting only the actions in
  `kubernetes-gitops.granted-action`.
- **Existence assumption** (this leg's own run-time harvest decides the branch): if it finds no
  NetworkPolicy governing the receiver, apply row `kubernetes-gitops.enforcer-absent`; if it finds one,
  apply `kubernetes-gitops.existing-grant`; if the receiver's namespace/workload itself does not exist,
  apply `kubernetes-gitops.target-absent`. Never assert which branch is true here.
- **Consumed value**: this leg consumes the network-provisioning leg's published range **as chained**
  — it must not re-derive or recompute it. Containment for that value is discharged upstream and
  re-verified at the program tier (Node C, below).
  - **If §6 does not carry it**: escalate; do not guess, substitute, or proceed.
- **If this leg's own harvest returns no matching receiver**: apply row
  `kubernetes-gitops.target-empty`.
- **Collateral** (row `kubernetes-gitops.collateral`, currently OPEN): note explicitly that selecting
  the receiver with any Ingress NetworkPolicy isolates it for **all** ingress not explicitly allowed by
  some policy — a future instruction to "leave other ports untouched" cannot be implemented as stated
  and must be raised as infeasible, not transcribed.

## Pipeline 3 objective — terraform-iac (downstream)

- Harvest the target bucket **read-only** (row `terraform-iac.target` — a single candidate found,
  unconfirmed). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — at Phase-0 harvest**: the Phase-0 read confirmed the Terraform workspace
  descriptor was reachable and the service ACTIVE, and confirmed the candidate bucket resource carries
  no bucket policy today — named as an enforcer-absent baseline, not asserted as the state at run time.
- Once the target bucket is confirmed (rows `terraform-iac.target`, `.receiver`), create or update a
  bucket policy admitting only the principal in `terraform-iac.admitted-principal` — sourced from the
  range **chained from the network-provisioning leg**, never re-derived — granting only the actions in
  `terraform-iac.granted-action`.
- **Existence assumption** (this leg's own run-time harvest decides the branch): if it finds an
  empty/absent policy, apply `terraform-iac.enforcer-absent`; if it finds a non-empty policy, apply
  `terraform-iac.existing-grant`; if the declared bucket does not exist, apply
  `terraform-iac.target-absent`.
- **Consumed value**: consumes the network-provisioning leg's chained range without re-deriving it.
  - **If §6 does not carry it**: escalate; do not guess, substitute, or proceed.
- **If this leg's own harvest finds the target bucket resolves to nothing**: apply
  `terraform-iac.target-empty`.
- No further leg consumes this leg's output.

## Pipeline 4 objective — observability-config (downstream)

- Harvest the sender-admission ingress configuration **read-only** (row `observability-config.target`).
  Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — at Phase-0 harvest**: the Phase-0 read confirmed the observability
  descriptor was reachable and the service ACTIVE, and confirmed (via the ingestion pipeline's own
  receiver configuration) that the ingestion pipeline itself has no source-address control, establishing
  the ingress proxy in front of it as the only component on the path capable of admission control.
- Once the receiver is confirmed (rows `observability-config.target`, `.receiver`), update the ingress's
  sender-admission rules to admit only the principal in `observability-config.admitted-principal` —
  sourced from the range **chained from the network-provisioning leg**, never re-derived — permitting
  only the protocols/actions in `observability-config.granted-action`.
- **Existence assumption** (this leg's own run-time harvest decides the branch): if it finds no
  admission rule governing the receiver, apply `observability-config.enforcer-absent`; if it finds one,
  apply `observability-config.existing-grant`; if the declared ingress surface does not exist, apply
  `observability-config.target-absent`.
- **Consumed value**: consumes the network-provisioning leg's chained range without re-deriving it.
  - **If §6 does not carry it**: escalate; do not guess, substitute, or proceed.
- **If this leg's own harvest finds the receiver selector matches nothing**: apply
  `observability-config.target-empty`.
- No further leg consumes this leg's output.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- The four service descriptors named in *Program scope*.
- The domain-to-leg mapping (network-provisioning / kubernetes-gitops / terraform-iac /
  observability-config) and the requirement that each of the three downstream legs authorise **exactly**
  the range the network-provisioning leg's derivation rule produces — the rule is static even though the
  value it produces is not.

**Runtime → the DAG edge** (not knowable up front — see *Why this is sequenced*):
- The exporter range — produced by the network-provisioning leg, chained into the kubernetes-gitops,
  terraform-iac, and observability-config legs' §6, settled before each of those legs starts.

## Acceptance

- Each of the three downstream change packages must include deterministic validation with expected
  outputs and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the range consumed by each of the three downstream legs exactly equals the range published by the
   network-provisioning leg — the chained value, never a guess or a recomputation;
2. every member of the network-provisioning leg's own re-harvested population lies inside that
   consumed range, in each of the three downstream systems;
2b. the range is the tightest-correct cover of that re-harvested population — recomputed independently
   at this tier, not taken on the leg's word;
3. the range authorised in each downstream system does not extend beyond what minimality requires, and
   does not silently widen or collide with allowances the leg's `existing-grant` decision did not
   sanction;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — each of the three downstream legs received the network-provisioning leg's real
   deliverable, not a fallback and not nothing.

🔴 ⚠️ **The check numbers above are fixed and may not be renumbered, merged, or substituted.** A new
requirement appends as check 5, 6, … .

These are properties, not hardcoded values — they remain valid across an environment rebuild.

⚠️ Each downstream leg's own report must carry its own apply-order/consumption statement — a
program-level statement alone is invisible to a reviewer whose chained context is leg-scoped.

### Consuming-leg attribution — the three downstream legs cannot self-verify containment

Each of the three downstream legs consumes a value it has no independent means of verifying against its
own harvested state (none of them can see the fabric's loopback interfaces). A downstream leg's
authorisation is treated as satisfied when: (1) the network-provisioning leg's derivation was
machine-checked with no defect; (2) Node C checks 1, 2, and 2b above pass on the chained value; and
(3) chaining coverage confirms the real deliverable was received. **This mechanism is specified but has
not yet been exercised by any run of this program — do not read it as proven; the first execution is
the first evidence.**

## Open questions

- A resource tag on the Phase-0 harvest's candidate cloud target contained a prompt-injection string
  directed at automated agents; it was not acted on, but the tag itself should be reviewed and removed
  from the live resource independent of this program.
- The same resource carries a tag whose value matches the format of a plaintext cloud access-key ID,
  stored outside a secrets manager; this should be rotated/removed independent of this program.
- The objective supplies no design decisions and no approver mapping — see *Decisions needed from the
  owner* above for the complete blocking list; none of those items are restated here.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

---

This is a **DRAFT SPECIFICATION for human review** — it is not approved, not final, and does not
authorise launching a program. It is structurally incomplete until a person splices the writing rules
in (`requirements-rules.py --insert`) and runs the conformance check; the program it describes is
launched separately, by a person, after every blocking decision above is answered.

Confidence: 78 — Core specification is complete and internally consistent (4 domains correctly identified as one leg each, sequencing/gating/DAG wiring fully worked out, every genuine business decision left OPEN as instructed). Named gaps: two rows (network-provisioning.target, observability-config.target/receiver) rest on a "derived" classification for technical/architectural facts rather than strict OPEN, which is a reasoned but not risk-free interpretation of the task's "mark every row OPEN" instruction against the general role guidance on derived rows — flagged transparently in the source column for the Reviewer to check; the terraform-iac and kubernetes-gitops targets could not be corroborated by harvest at all and are carried as named gaps.
