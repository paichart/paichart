# Program Requirements — Telemetry Export Authorisation — Cross-Domain

- Authored in: Telemetry Export Authorisation — Cross-Domain · Specify: Objective → Requirements
- Iteration: 20260925-2248 · 2026-09-25

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.

---

## Program scope

- **4 legs** (pipelines), executed in a **SEQUENCED-THEN-PARALLEL** topology: the fabric leg runs
  first and derives the authorised range; once the fabric-value gate clears, the cluster, cloud, and
  observability legs run **IN PARALLEL relative to one another** — each depends only on its own
  method gate and on the direct edge from the fabric leg, not on each other. A leg is either a
  distinct DOMAIN or a PHASE of one; all four legs here are distinct domains (distinct protocols
  against distinct target classes) — none is a phase-split of another:
  1. **Fabric** (—, upstream) on the fabric estate reachable via the declared fabric service
     descriptor, described in `topology.json`.
  2. **Kubernetes** (downstream) on the namespace declared in Design decision #1.
  3. **Cloud storage** (downstream) on the Terraform-managed bucket declared in Design decision #2.
  4. **Observability ingress** (downstream) on the OTLP ingress layer reachable via the declared
     observability service descriptor.
- **Explicitly out of scope**: any namespace other than the one declared as the cluster target; any
  storage resource other than the one declared as the archive target; any workload in the cluster
  target other than pods matching the declared receiver label; any port, protocol, or listener other
  than the two declared OTLP ports; any operator or administrative access path into the observability
  stack that is not part of the declared sender-enforcement point; and — for every leg — execution or
  application of the change package it produces. This document specifies a program for human plan
  approval only; it is not a launched program.

## Design decisions

| decision | rule or named target | source |
|---|---|---|
| Cluster target | Kubernetes namespace `trading`; no other namespace in scope | (declared) |
| Archive target | S3 bucket managed by Terraform resource `aws_s3_bucket.app_logs` in workspace `prod`; no other storage resource in scope | (declared) |
| Receiver selection | Pods in the cluster target labelled `app.kubernetes.io/component: telemetry-receiver`, reachable on TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP); the authorisation policy must select only pods matching this label and must not select or isolate any other workload in the namespace | (declared) |
| Exporter population | The fabric's exporter addresses are the IPv4 addresses of interfaces whose description marks them as telemetry exporters; no other fabric address is an exporter address | (declared) |
| CIDR representation | The fabric leg computes the smallest CIDR block, aligned to a valid prefix boundary, containing every one of the fabric's exporter addresses; that block is the range the other three legs authorise | (declared) |
| Archive write scope | The exporter range is authorised for `s3:PutObject` on objects in the declared bucket only — no `s3:GetObject`, `s3:ListBucket`, or `s3:DeleteObject` | (declared) |

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — applied explicitly:

> Is every value the downstream domains need **knowable before the fabric domain runs**?
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

The authorised range is not a static fact anyone can pin in advance: it is computed from which
fabric interfaces currently carry a telemetry-exporter marking in their live description and what
IPv4 address each of those interfaces currently holds. Both facts can change independently of this
program (an interface can be re-marked, re-addressed, added, or retired) and neither is visible to
the Program Architect, which reads only `topology.json` and this file with no live estate access.
The three consuming legs therefore cannot be given the range in a static interface contract — it must
be produced by the fabric leg at run time and carried to them on a direct dependency edge, gated by
an independent approval of that specific produced value before any consumer acts on it. Guessing the
range up front would freeze it at authoring time and silently drift out of agreement with the fabric
the moment the live estate changes — exactly the drift this program exists to eliminate.

## Approvals — one gate per domain, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below is TRANSCRIBED from the approver
mapping declared in this program's objective, and marked `(declared)`. A gate the objective names no
approver for would be written `UNASSIGNED — no approver declared` and listed under open questions —
no such gate exists in this program; all five gates have a declared approver.

**Declared approvers confirmed on the POV team**:
- Program plan approver is Josh Allen (josh.allen@paichart.com) (declared) — member (Project Manager)
- Fabric exporter value approver is Steve Terry (steve.terry@paichart.com) (declared) — member (Owner)
- Kubernetes change method approver is Jacob Wilcox (jacob.wilcox@paichart.com) (declared) — member (Sales Engineer)
- Cloud storage change method approver is Josh Allen (josh.allen@paichart.com) (declared) — member (Project Manager)
- Observability change method approver is Jacob Wilcox (jacob.wilcox@paichart.com) (declared) — member (Sales Engineer)

Josh Allen and Jacob Wilcox each holding two gates is a declared choice, not a coverage gap — it is
not reassigned here for "balance."

### Every gate declares WHAT it approves and WHEN it sits

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg(s) it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Josh Allen (declared) |
| fabric exporter value | the value produced by the fabric leg (the derived CIDR) | the fabric leg finishing | the cluster, cloud, and observability legs | Steve Terry (declared) |
| Kubernetes change method | how the NetworkPolicy change will be authored | the program plan gate | the Kubernetes leg | Jacob Wilcox (declared) |
| cloud storage change method | how the bucket-policy change will be authored | the program plan gate | the cloud storage leg | Josh Allen (declared) |
| observability change method | how the ingress-config change will be authored | the program plan gate | the observability leg | Jacob Wilcox (declared) |

**Dependency consequence, spelled out explicitly** (both edges, per the sequenced case):

- `Program Architect → program plan gate`
- `program plan gate → fabric leg`
- `program plan gate → Kubernetes change method gate`
- `program plan gate → cloud storage change method gate`
- `program plan gate → observability change method gate`
- `fabric leg → fabric exporter value gate` (the gate approves the value the fabric leg produced)
- `fabric leg → Kubernetes leg`, `fabric leg → cloud storage leg`, `fabric leg → observability leg`
  (direct edges — these carry the produced CIDR; a gate carries approval, not data, so each consuming
  leg would receive an empty chained context without this direct edge)
- `fabric exporter value gate → Kubernetes leg`, `→ cloud storage leg`, `→ observability leg` (the
  leg also depends on its own value gate before acting on the value)
- `Kubernetes change method gate → Kubernetes leg`
- `cloud storage change method gate → cloud storage leg`
- `observability change method gate → observability leg`

Once the fabric leg completes and the fabric-exporter-value gate clears, the Kubernetes, cloud
storage, and observability legs have no dependency on one another and run **in parallel**.

## Pipeline 1 objective — Fabric (UPSTREAM)

- Harvest interface descriptions and IPv4 addresses across the fabric's device scope, **read-only**.
  Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — at the Phase 0 harvest of this run**: the harvest confirmed at least one
  interface across the fabric's device scope carries a description marking it as a telemetry
  exporter, and every such marked interface holds an IPv4 address.
- For every device in scope, read every interface's description and IPv4 address; select the
  interfaces whose description marks them as telemetry exporters (Design decision "Exporter
  population"); compute the smallest CIDR block, aligned to a valid prefix boundary, containing every
  selected interface's IPv4 address (Design decision "CIDR representation").
- **If the harvest returns no interfaces marked as telemetry exporters**: produce a gap report naming
  the absence and author no CIDR value — never substitute a default or all-covering range.
- **The deliverable MUST publish, explicitly and prominently**: the CIDR block produced by this rule
  (smallest aligned block covering every telemetry-exporter-marked interface address), plus the
  selection rule applied and the arithmetic showing coverage and minimality. The downstream legs
  depend on what this leg PRODUCES at run time, never on what was read while authoring.
- **Validation (mechanical)**: re-run `list_devices()`, then for each device `fetch_data(interfaces)`;
  filter to interfaces whose description marks them as a telemetry exporter; recompute the minimal
  aligned covering CIDR from that set. Expected output: the recomputed CIDR is identical to the
  published CIDR; every re-obtained marked-interface IPv4 address lies inside it; no re-obtained
  unmarked interface's IPv4 address lies inside it.

### ⚠️ This leg DERIVES a value the downstream legs consume

- **Show the computation** in the deliverable: the inputs (the set of marked interface addresses),
  the arithmetic, and the result's coverage.
- **Minimality is required.** A result looser than the minimum aligned cover is a **REJECTABLE
  defect even when it violates nothing else**, because it authorises more than the requirement needs.
- **Re-selection FIRST, escalation LAST.** If a candidate covering block fails a check, that rules
  out *that candidate* — recompute, do not declare the derivation impossible without having tested
  the available alternatives and named which ones were tested.
- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic example of the trap: `192.0.2.1` and
  `192.0.2.2` are adjacent addresses but do **not** summarise to a `/31` — a `/31` covers only an
  **aligned** pair (e.g. `192.0.2.0` and `192.0.2.1`); `.1`/`.2` straddle a boundary and their minimal
  aligned cover is a `/30`, which also admits `192.0.2.0` and `192.0.2.3`. The same boundary-alignment
  check applies to the real marked-interface set, whatever its size and layout turns out to be.
- **Verify member-by-member** before publishing: every selected interface's address is inside the
  derived block, and no unmarked interface's address is.
- ⚠️ **Verify the premise, not just reachability.** Confirming the fabric service answers proves it is
  alive, not that it holds a marked interface. The Phase 0 harvest already returned live interface
  data showing at least one marked, addressed interface exists — treat that as the tested premise for
  this run, not as a fact to re-assert with its values here.
- 🔴 **State the null case.** If the harvest yields no marked interfaces, the correct output is a gap
  report — never an imported or invented range.
- 🔴 **Run your own rule.** Apply the stated selection-and-aggregation rule literally to confirm the
  published block is exactly what the rule produces, including its prefix width — a rule that reads
  correctly but does not produce its own published output is a defect even when the published value
  happens to be right.
- 🔴 **The machine check is a floor, not the bar.** A clean mechanical recomputation is not evidence
  the requirement was met — it verifies containment and minimality, not intent. Satisfy the
  requirement; do not target the checker.

## Pipeline 2 objective — Kubernetes (DOWNSTREAM)

- Harvest existing `NetworkPolicy` resources and pod labels in the declared namespace, **read-only**.
  Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — at the Phase 0 harvest of this run**: the harvest confirmed the declared
  namespace exists and is reachable read-only, and obtained the namespace's full pod population.
- Author (or amend) a `NetworkPolicy` in the declared namespace whose pod selector matches only pods
  carrying the declared receiver label, permitting ingress on TCP 4317 and TCP 4318 from the CIDR
  block produced by the fabric leg — and from no other source — and selecting no other workload in
  the namespace.
- **Existence assumption**: if this leg's own harvest finds no existing `NetworkPolicy` selecting the
  declared receiver label, create one; if one already selects that label, modify its ingress rule to
  the declared ports and source — absence is the expected starting point, not an escalation.
- This leg **consumes the fabric-produced CIDR as chained** — it does not re-derive it. Containment
  for that value is discharged upstream (the fabric leg's own derivation check) and re-verified at the
  program tier (Acceptance checks 1, 2, 2b below).
  - **If §6 does not carry the fabric leg's chained output**: escalate. Do not guess, substitute, or
    proceed.
- **If this leg's own harvest finds zero pods anywhere in the namespace currently carrying the
  declared receiver label**: author the policy to the declared selector and ingress rule regardless —
  the selector governs prospectively, and a policy scoped to a label with no current member is still
  correctly scoped. Do not widen the selector to match a currently-present workload instead.
- **Validation (mechanical)**:
  ```
  kubectl get networkpolicy -n <declared namespace> -o json \
    | jq '.items[] | select(.spec.podSelector.matchLabels."app.kubernetes.io/component"=="telemetry-receiver")'
  ```
  Expected output: exactly one matching `NetworkPolicy`; its `spec.podSelector.matchLabels` contains
  only `app.kubernetes.io/component: telemetry-receiver` (no additional keys that widen or narrow the
  match); its ingress rule's `ports` list is exactly TCP 4317 and TCP 4318; its ingress rule's `from`
  is exactly one `ipBlock.cidr` equal to the CIDR published by the fabric leg.

## Pipeline 3 objective — Cloud storage (DOWNSTREAM)

- Harvest the bucket policy currently attached to the declared Terraform resource, **read-only**.
  Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — at the Phase 0 harvest of this run**: the harvest confirmed the
  Terraform resource address `aws_s3_bucket.app_logs` exists uniquely in the `prod` workspace state
  and is reachable for read.
- Author (or amend) a bucket policy statement on the declared bucket granting `s3:PutObject` only on
  objects within that bucket, conditioned on the request source IP falling within the CIDR block
  produced by the fabric leg — and granting no other action (no `s3:GetObject`, `s3:ListBucket`,
  `s3:DeleteObject`) and no other source condition.
- **Existence assumption**: if this leg's own harvest finds no bucket policy currently attached to the
  declared bucket, create one containing only the declared statement; if a policy already exists, add
  or merge the declared statement without removing unrelated existing statements — absence is the
  expected starting point, not an escalation.
- This leg **consumes the fabric-produced CIDR as chained** — it does not re-derive it. Containment
  for that value is discharged upstream and re-verified at the program tier.
  - **If §6 does not carry the fabric leg's chained output**: escalate. Do not guess, substitute, or
    proceed.
- **If this leg's own harvest cannot locate the declared Terraform resource in the `prod` workspace
  state**: produce a gap report naming the absence and author no change package for this leg.
- **Validation (mechanical)**:
  ```
  BUCKET=$(terraform show -json | jq -r '.values.root_module.resources[] | select(.address=="aws_s3_bucket.app_logs") | .values.bucket')
  aws s3api get-bucket-policy --bucket "$BUCKET" | jq '.Policy | fromjson | .Statement'
  ```
  Expected output: exactly one statement with `"Effect": "Allow"`, `"Action": "s3:PutObject"`,
  `"Resource": "arn:aws:s3:::$BUCKET/*"`, and a `Condition.IpAddress."aws:SourceIp"` equal to the
  CIDR published by the fabric leg; no statement in the policy grants `s3:GetObject`,
  `s3:ListBucket`, or `s3:DeleteObject` under that same source condition.

## Pipeline 4 objective — Observability ingress (DOWNSTREAM)

- Harvest the sender-enforcement configuration fronting the OTLP collector, **read-only**. Service
  descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — at the Phase 0 harvest of this run**: the harvest confirmed the OTLP
  sender-enforcement point is the ingress layer (not the collector's own bind address), separately
  identified for both the gRPC (4317) and HTTP (4318) listeners.
- Within each of the two OTLP-facing server blocks (the gRPC listener and the HTTP listener), insert
  an allow rule for the CIDR block produced by the fabric leg above any existing catch-all allow, and
  terminate each block's allow list with a deny-all — restricting senders on both listeners to exactly
  the declared CIDR.
- **Existence assumption**: if this leg's own harvest finds no deny-all terminator on either OTLP
  server block, add the declared allow/deny lines in the declared order; if a restrictive allow/deny
  sequence already exists on a block, replace it with the declared one — absence of any prior
  restriction is the expected starting point, not an escalation.
- **Exemplar stanza** (complete, every line, in order, placeholder intact — insert into each of the
  two OTLP server blocks, replacing any existing catch-all allow):
  ```
  allow <FABRIC_CIDR>;
  deny all;
  ```
  Forbidden tokens after the change: `allow all;` must not remain in either OTLP server block; no
  `deny` directive may reference any scope narrower or wider than `<FABRIC_CIDR>`.
- This leg **consumes the fabric-produced CIDR as chained** — it does not re-derive it. Containment
  for that value is discharged upstream and re-verified at the program tier.
  - **If §6 does not carry the fabric leg's chained output**: escalate. Do not guess, substitute, or
    proceed.
- **If this leg's own harvest cannot identify the OTLP-facing server block for one or both
  listeners**: produce a gap report naming which listener could not be located and author no ingress
  change for that listener.
- **Validation (mechanical)**:
  ```
  nginx -T 2>/dev/null | awk '/^[[:space:]]*server[[:space:]]*\{/ && !inb {inb=1; d=0; blk=""}
    inb {blk = blk $0 "\n"; t=$0; o=gsub(/\{/,"",t); t=$0; c=gsub(/\}/,"",t); d += o - c;
         if (d == 0) { if (blk ~ /listen (4317|4318);/) printf "%s", blk; inb=0 } }'
  ```
  Expected output: each of the two printed server blocks (the blocks listening on 4317 and 4318) contains exactly one `allow <fabric-leg
  published CIDR>;` line immediately followed by `deny all;`, and no `allow all;` line remains in
  either block. Additionally, a request originating from an address inside the published CIDR is
  accepted by both listeners, and a request originating from an address outside it is rejected by
  both listeners.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- Cluster target namespace: `trading`
- Archive target: Terraform resource `aws_s3_bucket.app_logs`, workspace `prod`
- Receiver ports: TCP 4317 (OTLP gRPC), TCP 4318 (OTLP HTTP)
- Archive write scope: `s3:PutObject` only

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The authorised exporter CIDR — produced by the fabric leg, chained into the Kubernetes, cloud
  storage, and observability legs' §6, settled before each of those legs starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (see each leg's
  Validation clause above) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the CIDR each of the Kubernetes, cloud storage, and observability legs consumed exactly equals the
   CIDR the fabric leg published — the chained value, not a guess, not a recomputation by the
   consuming leg;
2. every fabric interface address marked as a telemetry exporter (per the declared selector) lies
   inside the published CIDR;
2b. the published CIDR is the tightest-correct (minimal, aligned) cover of that marked-address set —
   recompute it; do not take the published value on trust;
3. no fabric interface address that is *not* marked as a telemetry exporter lies inside the published
   CIDR, and none of the three consuming legs' authorised scope exceeds its declared action set (the
   Kubernetes policy selects only the declared receiver label; the bucket policy grants `PutObject`
   only; the ingress allow list contains only the declared CIDR with no residual catch-all);
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` for each of the Kubernetes, cloud storage, and observability legs relative to the
   fabric leg — i.e. each consuming leg received the fabric leg's real deliverable, not a fallback and
   not nothing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** If a new requirement
  needs a number, it **APPENDS** (5, 6, ...); it never renumbers, merges into, or substitutes an
  existing slot.

- These checks are **properties, not hardcoded values** — they remain valid when the fabric, cluster,
  bucket, or ingress state is rebuilt.

- ⚠️ **Require evidence where its reader looks.** The integration reviewer's chained context is the
  leg deliverables, not a program-level summary. Each of checks 1–4 must be answerable from the
  Kubernetes, cloud storage, and observability legs' own reports plus the fabric leg's own report —
  never from a cross-leg narrative that only one leg's deliverable states.

### Consuming-leg attribution — the Kubernetes, cloud storage, and observability legs cannot self-check the CIDR

None of the three consuming legs can independently verify, against their own harvested state, that
the CIDR they were given is minimal or correctly derived — they have no visibility into the fabric
estate. A consuming leg's authorisation is treated as satisfied only when: (1) the fabric leg's own
derivation was machine-checked with no defect (this leg's Validation clause); (2) the program-tier
checks above (1, 2, 2b, 3) pass on the chained value; and (3) chaining coverage (check 4) confirms the
consuming leg received the fabric leg's real deliverable.

## Open questions

- None — every design decision above is declared, and every gate has a declared approver confirmed
  as a member of the POV team.

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
