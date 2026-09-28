# Program Requirements — Telemetry Export Authorisation — Cross-Domain

- Authored in: Telemetry Export Authorisation — Cross-Domain · Specify: Objective → Requirements
- Iteration: Run 20260928-0223 · 2026-09-28

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.** Those are normally different phases, and may be different POVs. The running phase is chosen by whoever launches the program, after this document exists.

---

## Program scope

- **4 legs** (pipelines). The **FABRIC** leg runs first; the **CLUSTER**, **CLOUD**, and **OBSERVABILITY** legs each depend on the FABRIC leg's produced value and run **in parallel relative to one another** (none of the three needs a value from either of the other two). This is a hybrid schedule, not a pure sequence or a pure parallel fan-out — see *Why this is sequenced* below for the test that produced it.
  1. **FABRIC** (upstream / producer) on the network fabric's exporter-marked interfaces, described in `topology.json`.
  2. **CLUSTER** (downstream) on the Kubernetes namespace `trading`.
  3. **CLOUD** (downstream) on the S3 bucket managed by Terraform resource `aws_s3_bucket.app_logs` in workspace `prod`.
  4. **OBSERVABILITY** (downstream) on the OTLP ingress in front of the observability stack's collector, TCP 4317/4318.
- Explicitly **out of scope**: any Kubernetes namespace other than the declared one; any storage resource other than the declared bucket; any listener other than the declared OTLP ingress ports; any fabric interface not carrying the declared exporter marker; any port or workload on the receiver surfaces other than the ones the declared decisions name; and the **application** of any change package produced by this program — apply is out-of-band and human-gated in every domain (see *Acceptance*).

## Design decisions

| decision | rule or named target | source |
|---|---|---|
| Cluster target | The Kubernetes namespace `trading`. No other namespace is in scope. | (declared) |
| Archive target | The S3 bucket managed by Terraform resource `aws_s3_bucket.app_logs` in workspace `prod`. No other storage resource is in scope. | (declared) |
| Receiver selector | Pods in `trading` labelled `app.kubernetes.io/component: telemetry-receiver`, on TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP). The policy selects only those pods; it must not select, and so must not isolate, any other workload in the namespace. | (declared) |
| Exporter population | The fabric's exporter addresses are the IPv4 addresses of interfaces whose description marks them as telemetry exporters. No other fabric address is an exporter address. | (declared) |
| Representation | The FABRIC leg computes the smallest CIDR block, aligned to a valid prefix boundary, that contains every one of the fabric's exporter addresses. That block is the range the other three systems authorise. | (declared) |
| Archive write scope | The exporter range is authorised for `s3:PutObject` on objects in the declared bucket only — no read, list, or delete. | (declared) |
| Program plan approver | Josh Allen (josh.allen@paichart.com) | (declared) |
| Fabric exporter value approver | Steve Terry (steve.terry@paichart.com) | (declared) |
| Kubernetes change method approver | Jacob Wilcox (jacob.wilcox@paichart.com) | (declared) |
| Cloud storage change method approver | Josh Allen (josh.allen@paichart.com) | (declared) |
| Observability change method approver | Jacob Wilcox (jacob.wilcox@paichart.com) | (declared) |
| Receiver readiness | The Kubernetes policy is authored against the declared selector whether or not any pod matches it at execution time, including a namespace holding no pods at all; the leg reports the number of matching pods, and a zero is reported, not treated as an error. | (declared) |
| Existing authorisations — receiver surfaces | On the pods the declared receiver selector selects, and on the observability stack's OTLP ingress (TCP 4317/4318), the exporter range is the only permitted sender; any other sender allowance on those surfaces is replaced, not kept. Rules for other ports and other workloads are not touched. | (declared) |
| Existing authorisations — archive bucket | The change to the bucket is additive: the exporter range gains `s3:PutObject` and nothing else; existing statements for other principals or purposes are kept; no statement may grant the exporter range more than `s3:PutObject`. | (declared) |
| Observability target | The observability stack's OTLP ingress in front of the collector, TCP 4317 (OTLP gRPC) and TCP 4318 (OTLP HTTP). No other listener is in scope. | (declared) |

## Why this is sequenced (fabric → the other three), and parallel among the other three

**The test that decides sequenced vs parallel** — apply it explicitly and record the answer:

> Is every value the downstream domain needs **knowable before the upstream domain runs**?
>  - **Yes** ⇒ parallel; the values belong in the **interface contract**.
>  - **No** ⇒ sequenced; the value must ride a **DAG edge** (inter-pipeline chaining).

The value every one of CLUSTER, CLOUD, and OBSERVABILITY needs — the exporter CIDR block — is not knowable up front: it is computed from which fabric interfaces currently carry the exporter marker and what their addresses are, both of which change whenever the fabric is rebuilt, re-cabled, or re-labelled. The Program Architect (which reads only `topology.json` and this file, with no live state access) structurally cannot know this value; it can only be produced by running the FABRIC leg's own harvest and derivation. That answers **No** for all three downstream legs against the FABRIC leg, so each of the three depends on FABRIC by a DAG edge, not a contract field.

Between CLUSTER, CLOUD, and OBSERVABILITY themselves, the test answers **Yes**: none of the three needs a value the other two produce — each only needs the FABRIC leg's exporter range, and each authorises it against a target the other two do not touch. There is therefore no ordering requirement among the three; they may execute in parallel once FABRIC's value exists and its gate clears.

## Approvals — one gate per domain, plus the program plan gate

**Declared approvers confirmed on the POV team:**
- Program plan approver is Josh Allen (josh.allen@paichart.com) (declared) — member (PROJECT_MANAGER).
- Fabric exporter value approver is Steve Terry (steve.terry@paichart.com) (declared) — member (OWNER).
- Kubernetes change method approver is Jacob Wilcox (jacob.wilcox@paichart.com) (declared) — member (SALES_ENGINEER).
- Cloud storage change method approver is Josh Allen (josh.allen@paichart.com) (declared) — member (PROJECT_MANAGER).
- Observability change method approver is Jacob Wilcox (jacob.wilcox@paichart.com) (declared) — member (SALES_ENGINEER).

Josh Allen and Jacob Wilcox each hold two gates. This is declared as written in the objective and is kept as declared — it is not this document's place to reassign it, only to note that a program normally separates producer and approver, and this mapping puts the same two people across four of the five gates between them.

### Every gate declares WHAT it approves and WHEN it sits

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | The plan and the interface contract | The Program Architect | Every leg | Josh Allen (declared) |
| fabric exporter value | The value produced by the FABRIC leg — the derived exporter CIDR block itself, not a method | The FABRIC leg produces its result | CLUSTER, CLOUD, and OBSERVABILITY legs (each of which consumes that value) | Steve Terry (declared) |
| Kubernetes change method | How the CLUSTER leg's change will be made (the NetworkPolicy authoring method) | The program plan gate | The CLUSTER leg | Jacob Wilcox (declared) |
| cloud storage change method | How the CLOUD leg's change will be made (the bucket-policy authoring method) | The program plan gate | The CLOUD leg | Josh Allen (declared) |
| observability change method | How the OBSERVABILITY leg's change will be made (the ingress-authoring method) | The program plan gate | The OBSERVABILITY leg | Jacob Wilcox (declared) |

⚠️ Write "the value produced by X", never a bare "the PRODUCED value" — a bare "PRODUCED" has no producer and drifts toward the consuming leg's own artifact, which would place the fabric-exporter-value gate after a consuming leg has already run instead of before it. The table above names the FABRIC leg as producer explicitly for this reason.

⚠️ The three change-method gates are intent/method gates and sit before the leg they govern (after the plan gate, which is correct for an intent gate). The fabric-exporter-value gate is a produced-value gate and sits after its producer (the FABRIC leg) and before its consumers (CLUSTER, CLOUD, OBSERVABILITY) — this is the position a produced-value gate requires, distinct from the method gates' position.

⚠️ No gate here is wired after the leg it governs with nothing left for it to block — the three method gates sit before their respective legs run, and the fabric-exporter-value gate sits after production and before consumption. Each gate can still block something.

⚠️ No approver here is on both halves of the same gate boundary (producer and its own consumer) — the FABRIC leg's approver (Steve Terry) is distinct from each downstream change-method approver.

**Dependency consequence, stated explicitly:**
- CLUSTER, CLOUD, and OBSERVABILITY each depend on **both** their own change-method gate **and** the FABRIC leg directly: `FABRIC → Kubernetes change method gate` AND `FABRIC → CLUSTER`; `FABRIC → cloud storage change method gate` AND `FABRIC → CLOUD`; `FABRIC → observability change method gate` AND `FABRIC → OBSERVABILITY`. The fabric-exporter-value gate itself depends on `FABRIC` (it approves what FABRIC produced) and gates all three downstream legs: `fabric exporter value gate → CLUSTER`, `→ CLOUD`, `→ OBSERVABILITY`.

  ⚠️ **This is not a design choice, and the direct edge is not redundancy.** An approval gate carries approval, not data: it is template-less and produces no deliverable, so a downstream leg whose only dependency is a gate receives an EMPTY chained context and cannot see the exporter range it exists to consume. The gate edge decides **when** a downstream leg may start; the direct edge from FABRIC is **how the value reaches it**.

## Pipeline 1 objective — FABRIC (upstream / producer)

- Harvest the fabric's interfaces and their IPv4 addresses, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified — Phase 0 harvest, this run**: a scoped per-device interface read against the fabric confirmed at least one interface on the fabric carries a description matching the declared exporter marker convention, on more than one device. `none — first run against this target` does not apply; a prior harvest exists and confirmed reachability and marker presence.
- Identify the exporter population: every interface, on every device in scope, whose description marks it a telemetry exporter per the declared marker rule (design decision "Exporter population"). Read the IPv4 address of each such interface.
- **Derivation**: compute the smallest CIDR block, aligned to a valid prefix boundary, that contains every one of the harvested exporter addresses (design decision "Representation"). See the derivation clauses below for how this must be validated.
- **If the harvest returns no exporter-marked interfaces**: produce a gap report naming that no address carried the declared marker convention on this run, and author no derived range. Do not substitute a default or a previously-seen value.
- **The deliverable MUST publish, explicitly and prominently**: the exporter CIDR block produced by this run's derivation, plus the reasoning for the choice (which interfaces qualified by the declared marker rule, and why the published block is the tightest aligned cover of them). The downstream legs depend on what this leg PRODUCES at run time, not on what was read while authoring this document.
- **Validation (mechanical)**: re-run the same scoped interface read this leg used, filter to interfaces whose description matches the declared exporter marker rule, and re-apply the declared smallest-aligned-cover rule to their addresses. Expected: the recomputed block equals the published block, and every re-obtained exporter address lies inside it. This is a property check (equality of recomputation, membership of every input), never a check against literal addresses or a literal count recorded in this document.

### ⚠️ If this leg DERIVES a value the downstream legs consume

- **Show the computation** in the deliverable: the inputs (as read at run time), the arithmetic, and the result's coverage of every input.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimal aligned cover is a **REJECTABLE defect even when it violates nothing else** — it authorises more than the requirement needs.
- **Re-selection FIRST, escalation LAST.** If the first candidate block computed is not minimal or not aligned, that rules out that candidate — recompute against the actual input set before concluding no valid block exists. Escalate only after establishing no valid block exists at all, and name what was tried.
- ⚠️ **Verify by arithmetic, never by eyeballing.** Synthetic example (not this run's values): addresses `10.0.0.1` and `10.0.0.2` are adjacent but do **not** summarise to a `/31` — they straddle a `/31` boundary, and their minimal aligned cover is a `/30`, which also admits `10.0.0.0` and `10.0.0.3`. A `/31` covers only an aligned pair such as `10.0.0.2`/`10.0.0.3`.
- **Verify member-by-member** before publishing: every harvested exporter address is inside the derived block, and nothing outside the harvested set is implied to be an exporter by virtue of falling inside the block.
- ⚠️ **Verify the premise, not just reachability.** A successful harvest read proves the fabric is reachable, not that it holds interfaces carrying the exporter marker. Confirm at least one marked interface exists before treating a derivation as guaranteed to produce a result (see *Preconditions verified* above).
- 🔴 **State the null case.** If the harvest yields no exporter-marked interfaces, the correct outcome is a gap report naming the absence — never an imported or previously-seen range, and never a range derived from unmarked interfaces.
- 🔴 **Run your own rule.** Before publishing, apply the stated smallest-aligned-cover rule by hand to the harvested address set and confirm the result you are about to publish is what that rule, applied literally, actually produces — including the width of the resulting prefix. A rule that reads correctly but was not re-applied can still ship a mismatched width.
- 🔴 **The machine check is a floor, not the bar.** A clean mechanical validation (equality of recomputation, membership of every input) is not evidence the derivation is correct — it verifies containment and reproducibility, not that the minimal-cover requirement was met. Satisfy the requirement; do not target the checker.

## Pipeline 2 objective — CLUSTER (downstream)

- Harvest the namespace `trading`'s pods and NetworkPolicies, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/k8s-readonly-descriptor.json`
- **Preconditions verified — Phase 0 harvest, this run**: a label-selected pod list call against `trading` succeeded and returned a definite result (not a query failure), and a NetworkPolicy list call against `trading` succeeded and returned a definite result. Both confirm the namespace is reachable and both reads are authoritative for their respective counts, whatever those counts are.
- Author a Kubernetes NetworkPolicy scoped to the declared receiver selector (pods in `trading` labelled `app.kubernetes.io/component: telemetry-receiver`, TCP 4317 and TCP 4318), ingress-restricted to the exporter range consumed from the FABRIC leg. The policy selects only those pods and must not select, and so must not isolate, any other workload in the namespace.
- **Existence assumption** (*Writing rules* #6): this leg's own harvest decides which branch applies at execution time — if it finds no NetworkPolicy governing the declared receiver pods or the namespace broadly, author a net-new policy (absence is the expected starting point, not an escalation); if it finds one, modify it in place rather than creating a second. Per the declared "receiver readiness" decision, the policy is authored against the declared selector whether or not any pod currently matches it, including a namespace holding zero matching pods — a zero match count is reported by this leg, not treated as an error or a reason to withhold the policy.
- This leg consumes the exporter CIDR block **as chained** from the FABRIC leg's deliverable — it does **not** re-derive it, and is forbidden from recomputing it independently. Containment and minimality for that value are discharged upstream (in the FABRIC leg) and re-verified at the program tier (see *Acceptance*).
  - **If the chained context does not carry the FABRIC leg's published value**: escalate. Do not guess, do not substitute a previously-seen or example value, and do not proceed with an ungated ingress rule.
- Per the declared "existing authorisations — receiver surfaces" decision: on the pods the declared selector selects, the exporter range is the only permitted sender for TCP 4317/4318 — any other sender allowance found on those specific pods for those specific ports is replaced, not kept. Rules governing other ports or other workloads in the namespace are not touched by this leg.
- **If this leg's own harvest returns zero pods matching the declared receiver selector**: author the policy against the selector regardless (per the declared "receiver readiness" decision), and report the zero count as the leg's own finding — this is a valid, reportable result, not a gap or an error.
- **Validation (mechanical)**: `kubectl get networkpolicy <policy-name> -n trading -o jsonpath='{.spec.podSelector.matchLabels}'` — expected output: `{"app.kubernetes.io/component":"telemetry-receiver"}` and no other label key. `kubectl get networkpolicy <policy-name> -n trading -o jsonpath='{.spec.ingress[*].from[*].ipBlock.cidr}'` — expected output: exactly the CIDR block published by the FABRIC leg's deliverable, and no other block. `kubectl get pods -n trading -l app.kubernetes.io/component=telemetry-receiver --no-headers | wc -l` — expected output: a non-negative integer, reported as the leg's own finding (zero is a valid, non-blocking result per the declared decision).

## Pipeline 3 objective — CLOUD (downstream)

- Harvest the Terraform state for workspace `prod`, scoped to resource `aws_s3_bucket.app_logs`, **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/terraform-readonly-descriptor.json`
- **Preconditions verified — Phase 0 harvest, this run**: a state-list call against workspace `prod` succeeded and located the declared resource address, and a state-pull of that resource's own attributes succeeded and returned its policy attribute as a definite (empty-or-populated) string, not a query failure.
- Author an S3 bucket policy statement authorising the exporter range consumed from the FABRIC leg for `s3:PutObject` on objects in the declared bucket only — no `s3:GetObject`, `s3:ListBucket`, or `s3:DeleteObject`, and no action beyond `s3:PutObject` for that principal range in any statement.
- **Existence assumption** (*Writing rules* #6): this leg's own harvest decides which branch applies at execution time — if it finds the bucket's policy attribute empty, author the first policy statement for this bucket (absence is the expected starting point, not an escalation); if it finds an existing policy with statements, add this statement to it without removing or narrowing any existing statement for another principal or purpose. Per the declared "existing authorisations — archive bucket" decision, this leg's change is additive in either branch: it never revokes, and it never widens any existing grant beyond what that grant already permits.
- This leg consumes the exporter CIDR block **as chained** from the FABRIC leg's deliverable — it does **not** re-derive it, and is forbidden from recomputing it independently. Containment and minimality for that value are discharged upstream (in the FABRIC leg) and re-verified at the program tier (see *Acceptance*).
  - **If the chained context does not carry the FABRIC leg's published value**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest cannot locate the declared bucket resource in workspace `prod`**: produce a gap report naming that the declared Terraform resource address was not found in state, and author no policy statement.
- **Validation (mechanical)**: `terraform state show aws_s3_bucket_policy.<this-statement-resource> | grep -A5 '"Action"'` — expected output: `"Action": "s3:PutObject"` as the sole action for the statement whose `Principal`/condition scopes to the exporter range, and no `s3:GetObject`, `s3:ListBucket`, or `s3:DeleteObject` string anywhere in that statement's JSON. A second check, `terraform state show aws_s3_bucket.app_logs | grep -c '"Sid"'` before and after the change (operator-captured baseline diff, since pre-existing statement count is not knowable before this run touches state) — expected: the after-count equals the before-count plus exactly one, confirming the change was additive and not a replacement of the whole policy document.

## Pipeline 4 objective — OBSERVABILITY (downstream)

- Harvest the observability stack's OTLP ingress configuration (in front of the collector, TCP 4317/4318), **read-only**. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/observability-readonly-descriptor.json`
- **Preconditions verified — Phase 0 harvest, this run**: a read of the ingress configuration file governing both the declared gRPC (4317) and HTTP (4318) server blocks succeeded and returned a definite, parseable sender-allow configuration for each block (not a query failure), and that same read distinguished the declared OTLP ingress from any other listener present on the host (per the declared "Observability target" decision, only the declared ingress is in scope).
- Author sender-allow configuration for both the TCP 4317 and TCP 4318 server blocks restricting inbound senders to the exporter range consumed from the FABRIC leg.
- **Existence assumption** (*Writing rules* #6): this leg's own harvest decides which branch applies at execution time — if it finds an unrestricted or broader sender rule on either declared port, replace it with a rule scoped to the exporter range (per the declared "existing authorisations — receiver surfaces" decision, the exporter range becomes the sole permitted sender on those two ports, and any other sender allowance on those ports is replaced, not kept); if it finds no sender rule at all on a declared port, author one net-new. Rules governing any other listener on the host are not touched by this leg (per the declared "Observability target" decision).
- This leg consumes the exporter CIDR block **as chained** from the FABRIC leg's deliverable — it does **not** re-derive it, and is forbidden from recomputing it independently. Containment and minimality for that value are discharged upstream (in the FABRIC leg) and re-verified at the program tier (see *Acceptance*).
  - **If the chained context does not carry the FABRIC leg's published value**: escalate. Do not guess, do not substitute, do not proceed.
- **If this leg's own harvest cannot locate the declared OTLP ingress configuration for one or both declared ports**: produce a gap report naming which port's configuration was not found, and author no sender rule for that port.
- **Validation (mechanical)**: for each of the two declared ports, `grep -A3 'listen 4317' <ingress-config-path>` and `grep -A3 'listen 4318' <ingress-config-path>` — expected output for each block: exactly one `allow <exporter-range>;` line matching the CIDR block published by the FABRIC leg's deliverable, followed by `deny all;`, and no other `allow` line present in that block.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- Cluster receiver selector: `app.kubernetes.io/component: telemetry-receiver`, TCP 4317/4318, namespace `trading`.
- Archive bucket identity: the resource managed by Terraform address `aws_s3_bucket.app_logs` in workspace `prod`, and the action set `s3:PutObject` only.
- Observability ingress identity: the ingress in front of the collector, TCP 4317/4318, to the exclusion of any other listener.

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The exporter CIDR block — produced by the FABRIC leg, chained into the CLUSTER, CLOUD, and OBSERVABILITY legs' respective inputs, settled before each of those legs starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules* #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. The value each of the CLUSTER, CLOUD, and OBSERVABILITY legs consumed exactly equals the CIDR block the FABRIC leg produced — the chained value, not a guess, not an independent recomputation by the consuming leg.
2. Every fabric exporter address the FABRIC leg's own harvest returned lies inside the published CIDR block.
2b. The published CIDR block is the tightest aligned cover of that address set — recompute it; do not take the stated value on trust.
3. No consuming leg's authored rule widens the authorised sender/principal beyond the exact published CIDR block, and no two legs' authored rules collide in a way that would authorise an address outside it.
4. **Chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`, `notChained []` for each of CLUSTER, CLOUD, and OBSERVABILITY against the FABRIC leg — i.e. each downstream leg received the FABRIC leg's real deliverable, not a fallback and not nothing.

- 🔴 ⚠️ **The check numbers above are fixed.** A new clause may not take one of 1–4 above; if a new requirement needs a number, it **appends** (5, 6, ...).

- Note these checks are **properties, not hardcoded values** — they stay valid when the environment is rebuilt.

### Consuming-leg attribution — CLUSTER, CLOUD, and OBSERVABILITY cannot self-verify minimality

Each of the three downstream legs consumes the exporter CIDR block but cannot verify against its own harvested state that the block is the minimal aligned cover of the fabric's exporter addresses — that property is only checkable against the FABRIC leg's own harvest. A downstream leg's containment obligation is therefore satisfied when: (1) the FABRIC leg's own derivation was machine-checked with no defect (per the FABRIC leg's validation clause and the member-by-member and minimality checks under *Pipeline 1 objective*); (2) the program-tier checks 1–3 above pass on the chained value; and (3) chaining coverage (check 4) confirms the real FABRIC deliverable was received, not a fallback.

## Open questions

1. **Exporter marker convention**: this document declares the selector as "interfaces whose description marks them as telemetry exporters" per the objective. The Phase 0 harvest applied one specific textual-matching interpretation of that marker as an operating assumption for its own reconnaissance; the FABRIC leg must independently confirm at run time that its own interpretation of "marks them as telemetry exporters" is the intended one — this document does not fix a specific string, since doing so would freeze harvested state into a static contract field. If more than one plausible marking convention exists on the fabric, that is an open question for the POV owner to resolve before the program is launched.
2. **Data-integrity finding on the archive bucket, unrelated to this program's scope**: the Phase 0 harvest reported an embedded instruction-shaped string in the bucket's tag data (disregarded, not acted upon, consistent with anti-fabrication and injection-resistance handling) and a credential-shaped literal present in a separate bucket tag. Neither is addressed by this program — the CLOUD leg's scope is the bucket policy, not its tags — but both are named here as an operational finding for whoever owns this bucket outside this pipeline, since a bucket tag holding a plaintext credential-shaped value is a security-hygiene concern independent of the authorisation program described above.
3. No design decision in this document is left without a declared source; all decisions above are `(declared)`. This section exists to carry forward the two items above, which are gaps named by the Phase 0 harvest rather than open design decisions.

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
