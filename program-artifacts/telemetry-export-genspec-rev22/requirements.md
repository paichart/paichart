# Program Requirements — Telemetry Export Authorisation — Cross-Domain

- Authored in: Telemetry Export Authorisation — Cross-Domain · Specify: Objective → Requirements
- Iteration: Run 20260928-0658 · 2026-09-28

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- 4 legs (pipelines), executed **IN SEQUENCE** — precisely: the FABRIC leg runs first and derives the value the other three require. CLUSTER, CLOUD, and OBSERVABILITY each depend on FABRIC directly and via its gate, but not on one another, so they may execute concurrently once that dependency clears. A leg is either a distinct DOMAIN or a PHASE of one — this program is four domains, not four phases or four devices:
  1. **FABRIC** (UPSTREAM) on the fabric's devices, described in `topology.json`.
  2. **CLUSTER** (DOWNSTREAM) on the declared Kubernetes namespace target.
  3. **CLOUD** (DOWNSTREAM) on the declared archive-bucket target.
  4. **OBSERVABILITY** (DOWNSTREAM) on the declared OTLP ingress target.
- Explicitly **out of scope**: applying any of the produced change packages (apply is human-gated and out-of-band in every domain, always); any resource, namespace, workload, bucket, or listener other than the declared target in each domain; any port on the receiver pods other than TCP 4317 and TCP 4318 (other ports belong to the receiver workload's own owner); any listener other than the declared OTLP ingress in the observability stack.

## Design decisions

| decision | rule or named target | source |
|---|---|---|
| Cluster target | the Kubernetes namespace `trading`; no other namespace is in scope | (declared) |
| Archive target | the S3 bucket managed by Terraform resource `aws_s3_bucket.app_logs` in workspace `prod`; no other storage resource is in scope | (declared) |
| Receiver selector | pods in the cluster target labelled `app.kubernetes.io/component: telemetry-receiver`, reachable on TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP); the policy selects only those pods and must not select any other workload in the namespace | (declared) |
| Exporter population | the fabric's exporter addresses are the IPv4 addresses of interfaces whose description field marks them as telemetry exporters; no other fabric address is an exporter address; the FABRIC leg reports the exact marker text it applied | (declared) |
| Range representation | the smallest CIDR block, aligned to a valid prefix boundary, that contains every one of the fabric's exporter addresses; that block is the range the other three legs authorise | (declared) |
| Archive write scope | the exporter range is authorised for `s3:PutObject` on objects in the archive bucket only — no read, list, or delete | (declared) |
| Gate approvers | one named approver per gate — see Approvals section | (declared) |
| Receiver readiness | the Kubernetes policy is authored against the declared receiver selector whether or not any pod matches it today, including a namespace holding no matching pods at all; the count of matching pods (including zero) is reported, not treated as an error | (declared) |
| Existing-authorisation handling — receiver surfaces | on the receiver pods and the observability OTLP ingress, the exporter range is the only permitted sender; any other sender allowance on those specific surfaces is replaced, not kept; rules for other workloads and for listeners other than the declared ingress are untouched | (declared) |
| Existing-authorisation handling — archive bucket | the change to the archive bucket policy is additive: the exporter range gains `s3:PutObject` and nothing else; existing statements for other principals or purposes are kept; no statement may grant the exporter range more than `s3:PutObject` | (declared) |
| Observability target | the observability stack's OTLP ingress in front of the collector, on TCP 4317 and TCP 4318; no other listener is in scope | (declared) |
| Receiver pod isolation | on the receiver pods, the policy authorises only TCP 4317 and TCP 4318 from the exporter range; selecting those pods isolates them for every other port; allowances for other ports (probes, metrics, administration) belong to the receiver workload's owner, not to this program | (declared) |

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — applied explicitly:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
> **No** — the exporter range depends on which fabric interfaces currently carry the exporter-marking
> description and what IPv4 addresses they hold. This is live fabric state, not configuration fixed in
> advance: interfaces can be added, removed, re-addressed, or re-marked independently of this document.
> It cannot be pinned in a static artifact or agreed in a contract, and the Program Architect — which
> reads only `topology.json` and this file, with **no live state access** — structurally cannot know it.
> ⇒ **sequenced**; the value must ride a **DAG edge** (inter-pipeline chaining).

The FABRIC leg's derivation is not a lookup because the marked-interface population is not fixed in
configuration written in advance — it is discovered from live interface descriptions at harvest time,
and the covering computation depends on exactly which addresses that discovery returns. If a downstream
leg (or the Program Architect) assumed the range up front — from a prior run's value, or from a
convention such as "the block the exporters usually sit in" — it would authorise a range stale the
moment an interface is added, removed, re-addressed, or re-marked: either an authorisation gap (a new
exporter cannot reach the receiver/archive) or a range wider than the current live population (a
rejectable defect under the minimality rule below). Sequencing forces every downstream authorisation to
be computed against what the FABRIC leg actually found, not what someone assumed it would find.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver mapping
declared in this program's objective, and marked `(declared)`.

**Declared approvers confirmed on the POV team**:
- program plan is Josh Allen josh.allen@paichart.com (declared) — confirmed member [PROJECT_MANAGER]
- fabric exporter value is Steve Terry steve.terry@paichart.com (declared) — confirmed member [OWNER]
- Kubernetes change method is Jacob Wilcox jacob.wilcox@paichart.com (declared) — confirmed member [SALES_ENGINEER]
- cloud storage change method is Josh Allen josh.allen@paichart.com (declared) — confirmed member [PROJECT_MANAGER]
- observability change method is Jacob Wilcox jacob.wilcox@paichart.com (declared) — confirmed member [SALES_ENGINEER]

Josh Allen and Jacob Wilcox each hold two gates. This is per the declared approver mapping and is
intentional — it is not raised here as an anomaly.

### Every gate declares WHAT it approves and WHEN it sits — and the two must agree

🔴 A gate has a KIND, and the kind fixes the moment:

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Josh Allen (declared) |
| fabric exporter value | the exporter range produced by the FABRIC leg | the FABRIC leg | the CLUSTER, CLOUD, and OBSERVABILITY legs | Steve Terry (declared) |
| Kubernetes change method | the method in the change package produced by the CLUSTER leg | the CLUSTER leg | the (out-of-band, human) apply of the Kubernetes change | Jacob Wilcox (declared) |
| cloud storage change method | the method in the change package produced by the CLOUD leg | the CLOUD leg | the (out-of-band, human) apply of the cloud storage change | Josh Allen (declared) |
| observability change method | the method in the change package produced by the OBSERVABILITY leg | the OBSERVABILITY leg | the (out-of-band, human) apply of the observability change | Jacob Wilcox (declared) |

⚠️ **Write "the value produced by X", never a bare "the PRODUCED value".** A bare "PRODUCED" has no
producer and gets bound to whichever reading a downstream reader prefers, forcing the gate into the
wrong position. Here: "the exporter range **produced by the FABRIC leg**" — never a bare "the produced
range".

⚠️ **A gate wired after the leg it was meant to govern is a RECORD, not a control.** The three
change-method gates deliberately sit after their own leg (they approve a drafted method before it is
applied, and apply is out-of-band, not a DAG leg) — this is the correct position for an intent/method
gate whose "leg it governs" is the out-of-band apply, not the authoring leg itself.

⚠️ **A gate the producing team can release for itself is not a gate.** This is a check on the DECLARED
mapping, never a licence to reassign — see the approver note above; the declaration stands as written.

**The dependency consequence, stated explicitly:**
- FABRIC → fabric exporter value gate.
- FABRIC → CLUSTER (direct edge). FABRIC → CLOUD (direct edge). FABRIC → OBSERVABILITY (direct edge).
- fabric exporter value gate → CLUSTER. fabric exporter value gate → CLOUD. fabric exporter value gate → OBSERVABILITY.
- Each of CLUSTER, CLOUD, and OBSERVABILITY depends on **both** its own gate (the shared "fabric
  exporter value" gate) **and** on FABRIC directly.

  ⚠️ **This is not a design choice, and the second edge is not redundancy.** An approval gate carries
  approval, not data: it is template-less and produces no deliverable, so a downstream leg whose only
  dependency is its gate receives an EMPTY chained context and cannot see the exporter range it exists
  to consume. Inter-pipeline chaining walks DIRECT dependency edges only. The gate edge decides **when**
  a leg may start; the direct edge is **how the value reaches it**.

- CLUSTER's own gate (Kubernetes change method) depends on CLUSTER (it approves what CLUSTER produced)
  and blocks only the out-of-band apply of the Kubernetes change — not any further leg in this DAG. The
  same pattern holds for CLOUD → cloud storage change method, and OBSERVABILITY → observability change
  method.

## Pipeline 1 objective — FABRIC (UPSTREAM)

- Harvest fabric interface state **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time of this authoring run**: at least one fabric
  interface carries a description marking it as a telemetry exporter, and every marked interface
  exposes a reachable IPv4 address (pointer: Phase 0 harvest, fabric domain section).
- Identify, from this leg's own live harvest, every interface across the fabric's devices whose
  description field marks it as a telemetry exporter (per the declared exporter-population decision);
  collect the IPv4 address of each such interface. No other fabric address is an exporter address.
- **Derivation**: compute the smallest CIDR block, aligned to a valid prefix boundary, that contains
  every one of the collected exporter addresses. That block is the range published for the three
  downstream legs.
- **If the harvest returns no interfaces carrying the exporter marker**: produce a gap report stating
  that no exporter-marked interfaces were found on the described devices, and do not publish a derived
  range. The three downstream legs then have nothing to authorise and must themselves report that as a
  named gap — never invent a placeholder range.
- **The deliverable MUST publish, explicitly and prominently**: the derived exporter range (the
  smallest aligned CIDR block covering every interface carrying the exporter marker), the exact
  description-field marker text this leg applied to select the population, and the count of interfaces
  that matched. The three downstream legs depend on what this leg publishes at run time, not on any
  value read while authoring this document.
- **Validation (mechanical)**: re-run the same interface harvest against the fabric's devices (e.g.
  `show interfaces description` per device, or the equivalent structured read from the descriptor),
  filter to interfaces whose description matches the marker text this leg itself reported, extract
  their IPv4 addresses, and recompute the minimal aligned CIDR covering them. Expected output: the
  recomputed range is byte-identical to the range this leg published, and every re-obtained address
  lies inside it.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

- **Show the computation** in the deliverable: the inputs, the arithmetic, and the result's coverage.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs.
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* — not
  the whole pool. Select another and recompute. Escalate only after establishing that no valid option
  exists **anywhere**, and name which candidates you tested. *"Impossible" concluded from a handful of
  candidates is a **defect, not an escalation*** — it blocks the downstream legs on a false premise.
- ⚠️ **Verify by arithmetic, never by eyeballing.** For this domain: two exporter addresses that are
  numerically adjacent (e.g. synthetic `10.0.0.5` and `10.0.0.6`) do **not** automatically summarize to
  a `/31` — they must fall on an aligned boundary (a `/31` covers an aligned pair such as `10.0.0.4` and
  `10.0.0.5` only); an unaligned pair's minimal cover is the next size up, which will also swallow at
  least one address that is not an exporter. Always compute the boundary, never assume adjacency implies
  a valid aggregate.
- **Verify member-by-member** before publishing: every collected exporter address is inside the derived
  result, and nothing foreign is.
- ⚠️ **Verify the PREMISE before writing the objective — reachability is not sufficiency.** Probing
  that the fabric descriptor answers proves the devices are alive, not that any interface actually
  carries the exporter marker. This leg's own harvest, not a prior assumption, decides whether the
  premise holds.
- 🔴 **STATE THE NULL CASE, always** — done above: no exporter-marked interfaces ⇒ a gap report, never
  a substitute range.
- 🔴 **RUN YOUR OWN RULE.** Apply the stated derivation rule literally to the collected addresses and
  confirm the result it produces — including its width — matches what is published. A rule that cannot
  reproduce its own published output ships a correct-looking value with a wrong method.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is not evidence the
  derivation is correct — the checker verifies containment, not that the requirement was met.

## Pipeline 2 objective — CLUSTER (DOWNSTREAM)

- Harvest pods and NetworkPolicies in the declared namespace **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time**: a full, unfiltered pod listing for the
  namespace was read and returned successfully (pointer: Phase 0 harvest, cluster domain section),
  confirming the namespace is reachable and pod-enumerable, and that any zero-match result against the
  declared receiver selector reflects genuine cluster state rather than a truncated or partial read.
- Author a Kubernetes NetworkPolicy selecting exactly the pods in the declared namespace carrying the
  declared receiver label, permitting ingress on TCP 4317 and TCP 4318 from the exporter range only,
  and isolating those pods from all other ingress ports per the declared receiver-pod-isolation decision.
- **Existence assumption** (per the declared receiver-readiness decision, not a branch on today's
  state — the policy is authored regardless of the match count): if this leg's own harvest finds an
  existing NetworkPolicy already selecting the declared receiver pods, its TCP 4317/4318 ingress rules
  are replaced to authorise exactly the exporter range; if none exists, a new NetworkPolicy is created.
  Rules for other pods, and any existing rule on the receiver pods governing a port other than
  4317/4318, are left untouched.
- Consumes the exporter range **as chained** from the FABRIC leg — this leg does **not** re-derive it,
  and is forbidden from recomputing it. Containment for that value is discharged upstream and
  re-verified at the program tier.
  - **If §6 does not carry it**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest returns no pods matching the declared receiver selector**: per the
  declared receiver-readiness decision this is **not** an error or a gap outcome — the NetworkPolicy is
  authored against the declared selector regardless, and the zero count is published as a fact in the
  deliverable.
- **The deliverable MUST publish, explicitly and prominently**: the complete NetworkPolicy manifest,
  the count of pods it currently matches (including zero), and an explicit statement of its isolation
  effect on the receiver pods' other ports.

**Exemplar stanza** (required in full — no existing NetworkPolicy exists in this namespace's current
harvest to imitate; every line, in order, placeholders intact):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: <POLICY_NAME>
  namespace: trading
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/component: telemetry-receiver
  policyTypes:
    - Ingress
  ingress:
    - from:
        - ipBlock:
            cidr: <EXPORTER_RANGE>
      ports:
        - protocol: TCP
          port: 4317
        - protocol: TCP
          port: 4318
```

Forbidden tokens: no `podSelector: {}` (matches every workload in the namespace, not only the declared
receiver); no `ports` entries beyond 4317/4318; no `ipBlock` other than `<EXPORTER_RANGE>` as chained
from the FABRIC leg; no `Egress` policyType.

- **Validation (mechanical)**: `kubectl get networkpolicy -n trading -o yaml` — expected output: exactly
  one NetworkPolicy selecting `app.kubernetes.io/component: telemetry-receiver`, with
  `ingress[].from[].ipBlock.cidr` equal to the exporter range this leg's deliverable published, ports
  limited to 4317/4318 TCP, and no other ingress rule present. Then
  `kubectl get pods -n trading -l app.kubernetes.io/component=telemetry-receiver -o name | wc -l` —
  expected output: a count equal to the number this leg's deliverable reported (zero is a valid
  expected value).

## Pipeline 3 objective — CLOUD (DOWNSTREAM)

- Harvest the Terraform state for the declared archive-bucket resource **read-only**. Service
  descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time**: the Terraform state for the declared workspace
  was pulled successfully and the named resource's policy attribute was read (pointer: Phase 0 harvest,
  cloud domain section), confirming the resource is reachable and its policy attribute is inspectable.
- Author an S3 bucket policy statement granting `s3:PutObject` on objects in the declared bucket to
  principals within the exporter range, and no other action.
- **Existence assumption**: if this leg's own harvest finds the bucket's policy attribute empty or
  absent, a new bucket policy is created containing the statement described above (absence is the
  expected starting point for a bucket that has never had a policy attached, not an escalation); if it
  finds an existing policy, a new statement is added granting the exporter range `s3:PutObject` only,
  and every existing statement for any other principal or purpose is preserved unchanged. No statement
  may grant the exporter range any action beyond `s3:PutObject`.
- Consumes the exporter range **as chained** from the FABRIC leg — does not re-derive it. Containment
  discharged upstream, re-verified at program tier.
  - **If §6 does not carry it**: escalate.
- **If this leg's own harvest returns no resource matching the declared Terraform target**: produce a
  gap report naming that the declared resource could not be found in the workspace state, and do not
  author a policy against a guessed resource.
- **Unprovable absence**: whether any other principal currently holds `s3:PutObject` (or any other
  action) on this bucket, beyond what this leg's own harvest of the policy attribute shows, cannot be
  proven absent by a harvest. This deliverable's statement of "no other conflicting grant" is a
  **declared absence** scoped to the bucket policy document alone — it does not cover bucket ACLs, IAM
  policies attached to other principals, or org-level SCPs, none of which are in scope for this harvest.

**Exemplar stanza** (required in full — the harvested policy attribute is empty and there is no
existing statement to imitate; every element, in order, placeholders intact):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowExporterRangePutObject",
      "Effect": "Allow",
      "Principal": "<EXPORTER_PRINCIPAL>",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*",
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": "<EXPORTER_RANGE>"
        }
      }
    }
  ]
}
```

Forbidden tokens: no `"Action": "s3:*"` or any action other than `s3:PutObject` in the new statement; no
bucket-level `Resource` ARN without a trailing `/*`; no removal or modification of any pre-existing
`Statement` array entry.

- **Validation (mechanical)**: re-pull the Terraform state for the resource (or
  `aws s3api get-bucket-policy --bucket <BUCKET_NAME>`) and parse the `Statement` array — expected
  output: exactly one statement with `Effect: Allow`, `Action: s3:PutObject`, `Resource` scoped to
  `<bucket ARN>/*`, and `Condition.IpAddress.aws:SourceIp` equal to the exporter range this leg's
  deliverable published; every statement present in the pre-change policy (if any) is still present
  unchanged.

## Pipeline 4 objective — OBSERVABILITY (DOWNSTREAM)

- Harvest the OTLP ingress configuration in front of the collector **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — at Phase 0 harvest time**: the ingress configuration fronting the
  collector was read successfully and both the declared TCP 4317 and TCP 4318 server blocks were
  located (pointer: Phase 0 harvest, observability domain section), confirming the declared listeners
  exist and are configured.
- Restrict the sender set on the declared OTLP ingress (TCP 4317 and TCP 4318 only) to the exporter
  range, replacing whatever sender rule currently governs each of those two listeners.
- **Existence assumption**: if this leg's own harvest finds a listener's current sender rule
  unrestricted, that rule is replaced outright; if it finds an existing sender restriction already in
  place, that restriction is replaced to authorise exactly the exporter range — on these two declared
  listeners only. No other listener's configuration is touched.
- Consumes the exporter range **as chained** from the FABRIC leg — does not re-derive it. Containment
  discharged upstream, re-verified at program tier.
  - **If §6 does not carry it**: escalate.
- **If this leg's own harvest returns no configuration for one or both declared listeners**: produce a
  gap report naming which listener's configuration could not be located, and do not author a sender
  restriction against a guessed listener.

**Exemplar stanza** (required in full for both declared listener blocks; every line, in order,
placeholders intact):

```
server {
    listen <PORT>;   # <PORT> is 4317 or 4318 per the declared listener
    allow <EXPORTER_RANGE>;
    deny all;
    proxy_pass <EXISTING_UPSTREAM>;
    # any other existing directives specific to this block are preserved unchanged
}
```

Forbidden tokens: no `allow all;` remaining in either declared block; no `allow` entry for any CIDR
other than `<EXPORTER_RANGE>`; no change to any directive in a listener block other than the two
declared; no change to `proxy_pass` or other pre-existing directives beyond inserting the `allow`/`deny`
pair.

- **Validation (mechanical)**: read back the ingress configuration for both declared listener blocks —
  expected output: each block contains exactly one `allow` line whose CIDR equals the exporter range
  this leg's deliverable published, immediately followed by `deny all;`, with no `allow all;` remaining
  in either block, and no line changed in any other listener block.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- Receiver ports: TCP 4317 (OTLP gRPC), TCP 4318 (OTLP HTTP).
- Archive write action: `s3:PutObject` only.
- Cluster target namespace: `trading`.
- Archive target resource: `aws_s3_bucket.app_logs` in workspace `prod`.
- Receiver selector: label `app.kubernetes.io/component: telemetry-receiver`.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- Exporter range — produced by the FABRIC leg, chained into the CLUSTER, CLOUD, and OBSERVABILITY
  legs' §6, settled before each of those legs starts (gated by "fabric exporter value").

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the exporter range consumed by each of the CLUSTER, CLOUD, and OBSERVABILITY legs exactly equals
   the range the FABRIC leg produced — the chained value, not a guess, not a recomputation;
2. every exporter address the FABRIC leg's own harvest reported as carrying the exporter marker lies
   inside the published range;
2b. the minimal aligned CIDR recomputed from the FABRIC leg's own reported marked-interface address set
   equals the published range exactly — not merely a superset;
3. none of the three downstream authorisations (the Kubernetes NetworkPolicy, the S3 bucket policy
   statement, the observability ingress allow rule) grant access to any sender outside the published
   exporter range, and none replace or narrow an existing allowance for a principal, workload, or
   listener outside its own declared scope;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — i.e. each of the CLUSTER, CLOUD, and OBSERVABILITY legs received the FABRIC leg's
   **real** deliverable, not a fallback and not nothing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, ...).

- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is
  rebuilt. That is deliberate: the round must not depend on a magic expected string.

- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** The
  integration reviewer's chained context is the LEG deliverables — a program-level statement is
  invisible to a check that reads legs. Each downstream leg's own deliverable, not only the FABRIC
  leg's, must restate the exporter range it received and the ports it authorised against, so the
  reviewer's leg-scoped context can see it directly.

### Consuming-leg attribution — CLUSTER, CLOUD, and OBSERVABILITY cannot self-check the exporter range

Each of these three legs consumes a value it cannot verify against its own domain's state (minimality
and coverage are fabric-domain properties). Attribution is **satisfied** only when: (1) the FABRIC
leg's derivation was machine-checked with no defect (per Pipeline 1's validation); (2) the program-tier
checks above (1, 2, 2b, 3) pass on the chained value; and (3) chaining coverage (check 4) confirms the
real deliverable was received. Where satisfied, a downstream leg's use of the exporter range is
attributed as verified through the upstream chain — never because that leg independently re-derived it.

⚠️ **Status: SHIPPED BUT NEVER YET EXERCISED for this program — do not read this as working.** This
program has not run; no execution has yet produced the facts this attribution path depends on. What
would count as evidence: a program run in which checks (1)–(3) above all pass and each downstream leg's
completion report cites the FABRIC leg's validated derivation rather than an independent
recomputation.

## Open questions

- All design decisions in this document are `(declared)`; none are OPEN.
- All five gates have a named, POV-team-confirmed approver; none are `UNASSIGNED`.
- Out-of-scope security finding (for the POV owner, not a program design decision): the Phase 0
  harvest of the archive bucket's Terraform tags returned a tag value containing an embedded
  prompt-injection attempt and a separate tag holding what appears to be an AWS-access-key-ID-shaped
  string. Neither was acted on by this pipeline or by this document. Recommend independent review, and
  rotation if the string is a live credential — unrelated to this program's authorisation objective.

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
