> ⚠ **NOT RELEASED — quality gate: needs-revision**
> This document is the composed draft deliverable exactly as produced; the run's release gate did not clear it. The verdict and its blocking reasons are stamped on the pipeline task (quality-gate metadata and final comment).

# Program Requirements — trading namespace → acme-app-logs bucket write program

- Authored in: Log archive write — requirements spec · Specification
- Iteration: Run 20261008-2236kw6qr · 2026-10-08

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- **2 legs** (pipelines), executed **IN SEQUENCE**. A leg is either a distinct DOMAIN or a PHASE of
  one — here both legs are distinct domains:
  1. **kubernetes-gitops** (UPSTREAM) on namespace `trading`, described in `topology.json`.
  2. **terraform-iac** (DOWNSTREAM) on bucket `acme-app-logs` (`aws_s3_bucket.app_logs`, workspace `prod`).
- **Any Kubernetes object other than the pods of namespace `trading`, any Terraform resource other than
  `aws_s3_bucket.app_logs`, the bucket's existing tags, and the application (apply) of either change** is
  explicitly **out of scope**.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| cluster.target | which surface of the leg's service does it act on | — | namespace `trading` — its pods, read-only; the leg acts on nothing and changes nothing | (declared — item 2: "The target namespace is `trading`") |
| bucket.target | which surface of the leg's service does it act on | — | the bucket policy of `aws_s3_bucket.app_logs` (bucket `acme-app-logs`, workspace `prod`) — the sole enforcer | (declared — item 3: "The target bucket is the Terraform resource `aws_s3_bucket.app_logs` in workspace `prod` (bucket `acme-app-logs`)") |
| cluster.namespace-absent | the declared namespace does not exist | gap · create | gap — report a gap; never create the namespace | (declared — item 16: "If the namespace of item 2 does not exist, the cluster leg reports a gap (gap); it never creates the namespace") |
| cluster.population | which members of the class the derivation reads | — | every pod in `trading` whose `status.phase == Running`, excluding any pod with `hostNetwork: true`; readiness is not a criterion | (declared — item 5: "every pod in the namespace of item 2 whose phase is Running; readiness is not a criterion; a pod with hostNetwork: true is excluded") |
| cluster.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | a host list — each qualifying pod's address exactly, one entry per pod, no aggregation | (declared — item 14: "The derived value is expressed as a host list - each running pod's address exactly") |
| cluster.inputs-empty | the derivation's inputs are empty | gap | gap — report a gap naming that no Running, non-hostNetwork pod exists in `trading`; produce no value; author nothing | (declared — item 15: "If no running pod is found in the namespace of item 2, the cluster leg reports a gap and produces no value (gap)") |
| approver.plan | who approves this gate | — | Steve Terry, steve.terry@paichart.com | (declared — item 6: "The program plan gate is approved by steve.terry@paichart.com") |
| approver.kubernetes-gitops | who approves this gate | — | Josh Allen, josh.allen@paichart.com | (declared — item 7: "The kubernetes-gitops change gate is approved by josh.allen@paichart.com") |
| approver.terraform-iac | who approves this gate | — | Jacob Wilcox, jacob.wilcox@paichart.com | (declared — item 8: "The terraform-iac change gate is approved by jacob.wilcox@paichart.com") |
| gate.kubernetes-gitops.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | before-leg | (declared — item 9: "The kubernetes-gitops change gate sits before the cluster leg (before-leg)") |
| gate.terraform-iac.position | when this gate sits | before-leg · after-leg-before-completion · after-producer-before-consumers | after-producer-before-consumers | (declared — item 10: "The terraform-iac change gate sits after the producer and before the consumers (after-producer-before-consumers)") |

### A leg that grants or removes access (authorisation) — the terraform-iac (`bucket`) leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| bucket.receiver | which workload/resource on the target is authorised | — | the bucket's objects, with no key-prefix limit (`arn:aws:s3:::acme-app-logs/*`) | (declared — item 4: "the authorised resource is its objects, with no key-prefix limit") |
| bucket.admitted-principal | who is admitted, and by which attribute the enforcer recognises them | source-address-range · named-identity · network-path · combination | source-address-range — any requester whose request arrives from an address in the host list the cluster leg produces, under any identity or none, recognised by request source IP (`aws:SourceIp`) | (declared — item 11: "The bucket admits by source address (source-address-range): the admitted principal is the source-address value the cluster leg produces") |
| bucket.principal-unseen | the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path | gap · act-regardless | act-regardless — act regardless, and record as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path | (declared — item 12: "the leg acts regardless (act-regardless) and records as UNTESTED the premise that the pods' source addresses reach the bucket unchanged, with no address translation on the path") |
| bucket.granted-action | what the admitted principal may do | — | `s3:PutObject` only | (declared — item 13: "The admitted pods may perform s3:PutObject only") |
| bucket.existing-grant | other allowances already on the same surface | replace · preserve · preserve-bounded | preserve — add only this leg's statement and change no other; if more than one Terraform resource manages the bucket's policy, report a gap and do not consolidate | (declared — item 18: "Existing statements on the bucket policy are preserved (preserve): the leg adds only its own statement and changes no other") |
| bucket.target-empty | the receiver selector/surface matches nothing now | act · gap | act — author the grant against the objects receiver even when the bucket holds no objects | (declared — item 20: "If the bucket holds no objects, the bucket leg still authors against the receiver of item 4 (act)") |
| bucket.enforcer-absent | no policy object governs the receiver yet | create · gap | create — if the bucket has no policy, create one holding only this grant | (declared — item 19: "If the bucket has no policy yet, the leg creates one (create) holding only this grant") |
| bucket.target-absent | the declared target itself does not exist | gap · create-target | gap — report a gap; never create the bucket | (declared — item 17: "If the bucket of item 3 does not exist, the bucket leg reports a gap (gap); it never creates the bucket") |
| bucket.collateral | what else on the target changes because enforcement now applies | per enforcer (S3 bucket policy: an Allow grants only and never implicitly denies) | adds a single Allow statement only and no Deny; an S3 bucket-policy Allow grants access and never implicitly removes existing access, so no other access changes; existing statements preserved (see `bucket.existing-grant`); the change package states what else, if anything, the change affects | (declared — item 21: "The bucket leg adds Allow statements only and no Deny statement, and the bucket leg's change package states what else, if anything, the change affects") |

### A leg that changes routes (routing)

Not applicable — neither leg adds, suppresses, filters, withdraws or replaces any route or its
advertisement. (Filtering of request traffic on the bucket is authorisation, not routing, and is
captured in the authorisation block above.) No routing rows apply.

## Decisions needed from the owner

<!-- one line per row that is not simply declared:
<row id> — <question> — options: <enum> — governs: <which leg clause> — tier: blocking | confirm | default | not-applicable -->
none

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

**Answer: No ⇒ sequenced.** The terraform-iac (bucket) leg needs the host list of admitted source
addresses, and that list is the set of addresses of the qualifying pods in namespace `trading` —
assigned by the scheduler at pod start and reassigned on every reschedule, restart or environment
rebuild. It is not knowable before the kubernetes-gitops (cluster) leg runs and cannot be pinned in a
static artifact or agreed in the interface contract.

{{RATIONALE}} — The derivation is the host list of every qualifying pod's address (the rule is in
`cluster.population` / `cluster.representation`). It is a design decision rather than a lookup because
pod addresses are allocated at scheduling time and change whenever a pod is rescheduled; the Program
Architect (which reads only `topology.json` + this file, with **no live state access**) structurally
cannot know them. If someone guessed the addresses up front, the bucket policy would admit stale or
wrong source addresses — authorising the wrong workloads, or admitting nothing at all — with every
gate still green, because nothing downstream re-derives the list from the cluster.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver
mapping declared in this program's objective, and marked `(declared)`.

**Declared approvers confirmed on the POV team:**
- Program plan gate approver is Steve Terry steve.terry@paichart.com (declared) — member.
- kubernetes-gitops change gate approver is Josh Allen josh.allen@paichart.com (declared) — member.
- terraform-iac change gate approver is Jacob Wilcox jacob.wilcox@paichart.com (declared) — member.

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Steve Terry (declared) |
| kubernetes-gitops change | **how the value is derived** — which namespace, which pods count, how the host list is derived (intent/method) | the program plan gate | the kubernetes-gitops (cluster) leg | Josh Allen (declared) |
| terraform-iac change | **the value produced by the kubernetes-gitops (cluster) leg** — the host list of admitted source addresses, once it exists (produced value) | the kubernetes-gitops (cluster) leg that PRODUCES the host list | the terraform-iac (bucket) leg | Jacob Wilcox (declared) |

⚠️ **Write "the value produced by X", never a bare "the PRODUCED value".** A bare "PRODUCED" has no
producer, and the phrase that follows it usually attaches the value to the CONSUMER's artifact,
which reads as the consuming leg's own output and forces the gate after that leg. Then the gate
approves work already finished.

⚠️ **A gate wired after the leg it was meant to govern is a RECORD, not a control**, and an
intent/method gate in that position is close to meaningless — approving a method after the work is
done changes nothing. If a gate cannot block anything, say so deliberately or move it.

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point:
a program exists precisely because the halves are approved by different people. Here the three gates
carry three distinct declared approvers.

**Dependency consequence (the DAG):**
- `program plan gate → kubernetes-gitops change gate → cluster (kubernetes-gitops) leg` — the
  kubernetes-gitops gate is intent/method and sits before the leg it governs.
- The bucket (terraform-iac) leg depends on **its own gate** AND on **the upstream cluster leg**, and
  the gate also depends on the upstream leg. Write both edges explicitly:
  `cluster leg → terraform-iac change gate` AND `cluster leg → bucket leg`.

  ⚠️ **This is not a design choice, and the second edge is not redundancy.** An approval gate carries
  approval, not data: it is template-less and produces no deliverable, so a downstream leg whose only
  dependency is its gate receives an EMPTY chained context and cannot see the host list it exists to
  consume. Inter-pipeline chaining walks DIRECT dependency edges only. The gate edge decides **when**
  the bucket leg may start; the direct edge is **how the host list reaches it**.

## Pipeline 1 objective — kubernetes-gitops (UPSTREAM)

- Harvest the pods of namespace `trading` **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — at authoring time, from the Phase 0 harvest chained into this round
  (infra_state_harvester deliverable)**: the harvest confirmed that at least one pod in `trading` has
  `status.phase == Running` and does not set `hostNetwork: true` — i.e. the derivation has at least one
  input. A pointer and a property only; no addresses and no counts are carried forward.
- **The work**: derive, read-only, the host list of admitted source addresses from the pods of
  namespace `trading`. This leg grants and removes no access and changes nothing on the cluster (item 1);
  its only output is the derived value the bucket leg consumes.
- **The derivation**: the population is every pod in `trading` whose `status.phase == Running`,
  excluding any pod with `hostNetwork: true` (its address is its node's), with readiness not a criterion
  (`cluster.population`). The value is expressed as a host list — each qualifying pod's address exactly,
  one entry per pod, no aggregation (`cluster.representation`). The leg lists each excluded pod and
  reports, in its own published `report.md`, the literal criterion it applied (item 5).
- **If the harvest returns no derivation inputs** (no Running, non-hostNetwork pod in `trading`): apply
  `cluster.inputs-empty` — report a gap naming exactly that no pod satisfies the Running /
  non-hostNetwork criterion in `trading`; produce no value; author nothing; NEVER a substitute value.
  Separately, if namespace `trading` does not exist, apply `cluster.namespace-absent` — report a gap;
  never create the namespace (item 16).
- **The deliverable MUST publish, explicitly and prominently**: the host list of admitted source
  addresses — named by its RULE (each `trading` pod whose phase is Running and that is not
  hostNetwork, its address exactly) and its PRODUCER (this kubernetes-gitops leg) — plus the list of
  excluded pods and the literal criterion applied. The downstream bucket leg depends on what this leg
  PRODUCES at run time, not on what was read while authoring.
- **Validation (mechanical)**: re-read the namespace's pods read-only —
  `kubectl -n trading get pods -o jsonpath='{range .items[?(@.status.phase=="Running")]}{.spec.hostNetwork}{" "}{.status.podIP}{"\n"}{end}'`
  — then drop every line whose first field is `true` and take the remaining `podIP` values. Expected:
  that set equals the published host list exactly (same members, no extras, no omissions), and each
  published address belongs to exactly one qualifying pod. Never pin the expected output to specific
  addresses or to how many there are — a check pinned to today's pods fails a correct run the day a
  pod reschedules.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **The computation is shown in the DESIGN.** The deliverable carries the input block (the qualifying
  pods) and the result block (the host list), plus the re-runnable check above followed by the literal
  text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** For a host list the tightest-correct
  property is: exactly the qualifying pods, no superset and no subset — no address of a non-qualifying
  pod, and no omission of a qualifying one. A result looser than that (e.g. a CIDR widened around the
  hosts) is a **REJECTABLE defect even when it violates nothing else**, because it admits more than the
  requirement needs.
- **Re-selection FIRST, escalation LAST.** If a candidate pod's membership is ambiguous, that rules out
  *that candidate*, not the whole population — resolve it and recompute. Escalate only after
  establishing the population genuinely cannot be determined, naming which pods were in doubt.
- ⚠️ **Verify by arithmetic, never by eyeballing.** A pod with `hostNetwork: true` reports its NODE's
  address as its `podIP`; including it would authorise the node and every other pod on that node, not
  the workload. A pod outside `Running` (e.g. `Pending`/`Succeeded`) may carry a stale or absent
  `podIP`. Synthetic example: a pod `example-xyz` that is `Running` with `hostNetwork: true` and
  `podIP 10.0.0.9` must be EXCLUDED, because `10.0.0.9` is the node address, not the pod's.
- **Verify member-by-member** before publishing: every qualifying pod's address is in the derived host
  list, and nothing foreign is.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An
  objective naming a population the namespace does not hold is unsatisfiable. Probing that the cluster
  ANSWERS proves it is alive, not that it holds qualifying pods. Read a harvest before relying on the
  derivation (done — see *Preconditions verified*).
- 🔴 **STATE THE NULL CASE, always.** The correct outcome when the harvest yields no qualifying pod is a
  gap report (`cluster.inputs-empty`) and no authored value — never an imported or substitute address.
- 🔴 **RUN YOUR OWN RULE.** Apply the published criterion literally to one pod and confirm it produces
  the host-list entry you published for that pod — including that the entry is the pod's own address and
  not its node's.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is not evidence the
  population is correct — it verifies membership of what you listed, not that you listed the right
  class. Satisfy the requirement; do not target the checker.

## Pipeline 2 objective — terraform-iac (DOWNSTREAM)

- Harvest the policy of bucket `acme-app-logs` (`aws_s3_bucket.app_logs`, workspace `prod`)
  **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — at authoring time, from the Phase 0 harvest chained into this round**: the
  harvest confirmed the Terraform resource `aws_s3_bucket.app_logs` is present in workspace `prod`. A
  pointer and a property only; the bucket's current policy state is handled as a branch below, not
  asserted here.
- **The work**: author a change package that adds to the bucket policy a single Allow statement granting
  `s3:PutObject` (`bucket.granted-action`) on the bucket's objects with no key-prefix limit
  (`bucket.receiver`, `arn:aws:s3:::acme-app-logs/*`) to requests arriving from the admitted source
  addresses (`bucket.admitted-principal`). Add an Allow only; add no Deny (`bucket.collateral`).
- **Admitted-principal premise** (`bucket.admitted-principal`): the attribute the enforcer must see is
  the request's source IP address (`aws:SourceIp`), on the network path the pod's request takes to S3.
  If this leg's own harvest cannot confirm the bucket sees the pods' source addresses unchanged on that
  path, apply `bucket.principal-unseen` → **act-regardless**: act, and record as UNTESTED the premise
  that the pods' source addresses reach the bucket unchanged, with no address translation (NAT/egress)
  on the path. List this under the package's **UNTESTED premises**. No VPC endpoint is declared (item 11).
- **Existence assumption** (*Writing rules* #6): if the leg's harvest finds no policy governing the
  bucket, apply `bucket.enforcer-absent` → create a policy holding only this grant; if it finds a
  policy, apply `bucket.existing-grant` → add only this statement and change no other (and, if more than
  one Terraform resource manages the bucket's policy, apply the gap branch: report a gap and do not
  consolidate); if the bucket resource itself is absent, apply `bucket.target-absent` → report a gap and
  never create the bucket. The leg does not state which branch is true today; its own harvest decides.
- **It CONSUMES a chained value**: it consumes the host list of admitted source addresses **as chained**
  from the kubernetes-gitops leg — it does **not** re-derive it, and is forbidden from recomputing it.
  Containment for that value is discharged **upstream** and re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no objects on the bucket**: apply `bucket.target-empty` → still
  author the grant against the objects receiver (`bucket.receiver`), item 20. If the declared bucket
  resource is absent, apply `bucket.target-absent` → report a gap (item 17).
- **No further leg consumes from this one** — the terraform-iac leg is the terminal leg; it publishes
  its change package and validation only. Its change package states the apply order (the cluster leg's
  method approved first, then its produced value, then this bucket change) so that fact appears in this
  leg's own `report.md` where a leg-scoped reviewer can see it.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before either leg runs):
- Granted action: `s3:PutObject` only (item 13).
- Authorised resource: the bucket's objects with no key-prefix limit — `arn:aws:s3:::acme-app-logs/*` (item 4).
- Admission attribute: request source IP (`aws:SourceIp`); Principal admitted under any identity or none (item 11).
- No VPC endpoint (item 11).

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The host list of admitted source addresses — produced by the kubernetes-gitops (cluster) leg,
  chained into the terraform-iac (bucket) leg's §6, settled before that leg starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the set of source addresses in the bucket policy's `aws:SourceIp` condition exactly equals the host
   list the kubernetes-gitops leg produced — the chained value, not a guess and not a recomputation;
2. every address the cluster leg published appears in the policy's `aws:SourceIp` condition, and the
   condition carries no address the cluster leg did not publish;
2b. the tightest-correct property — the `aws:SourceIp` set equals the published host list
   member-for-member, with no superset and no CIDR-widening of individual hosts; recompute it, do not
   take the stated value on trust;
3. the added statement is a single Allow granting only `s3:PutObject` on only the declared objects
   resource; no Deny is added; no other existing statement is modified or removed (no-widening /
   no-collision);
4. **chaining coverage** — the bucket leg received the cluster leg's **real** deliverable (its
   `report.md`), not a fallback and not nothing. Node C checks what its own chained context shows: every
   leg appears as a predecessor, each carrying its `report.md`.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, ...).

- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is
  rebuilt. That is deliberate: the round must not depend on a magic expected string.

- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** The apply
  order and the literal derivation criterion must appear in each leg's own objective so they land in
  each leg's `report.md`, which is the integration reviewer's leg-scoped context — the cluster leg
  reports the literal criterion it applied (item 5), and the bucket leg states the apply order in its
  change package.

### Consuming-leg attribution — the bucket leg cannot self-check the source addresses

The terraform-iac (bucket) leg has no visibility into the cluster's pods, so it cannot verify the
admitted source addresses against its own state. The SATISFIED condition is a property: the bucket
policy's `aws:SourceIp` set equals the host list chained from the cluster leg. Verification therefore
requires all three of: (1) the kubernetes-gitops leg's derivation was machine-checked with no defect
(its *Validation (mechanical)* above); (2) the program-tier checks 1, 2, 2b and 3 pass on the chained
value; and (3) chaining coverage (check 4) confirms the real cluster deliverable was received.

⚠️ **Status note, written honestly:** this attribution path is a design of this specification; it has
not been exercised by a run of this program. Do not read it as a proven, machine-gated release.
Evidence that it works would be a program run in which the bucket leg's `aws:SourceIp` set was shown
equal to the cluster leg's published host list via checks 1/2b on genuinely chained context, with
chaining coverage green.

## Open questions

- Not a requirement for this program (item 21 declares the bucket's existing tags out of scope and
  accepted as synthetic test fixtures, and neither leg reads or alters them): the Phase 0 harvest
  surfaced content anomalies in the bucket's existing tags — including a prompt-injection string and a
  credential-shaped value. Recommend the owner arrange independent security triage of the tags outside
  this requirements round. This is a pointer, not a decision this program acts on, and not a blocker.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

---

*This is a **draft specification for human review**. It is **structurally incomplete** until the
writing rules are spliced in by a person at publish time (`requirements-rules.py --insert`) and the
conformance check is run; the single `Confidence:` line below and the marker-only *Writing rules*
section are expected artefacts of that contract, removed/expanded by that mechanical post-pass. The
program this document describes is launched separately by a person, after the plan gate approves it —
nothing here is approved, final, or ready to launch.*

Confidence: 90/100 — All 19 design-decision rows and all three gates are declared verbatim in the objective and transcribed with contiguous-span citations; the one assumption flagged is the authoring DATE (2026-10-08, derived from the run-id prefix) and the inclusion of the tag-security note as a non-blocking pointer despite item 21's out-of-scope declaration.
