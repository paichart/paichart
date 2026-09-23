# Program Requirements — Telemetry Export Authorization

- Iteration: 20260922-0449 · 2026-09-22
- Origin: authored by the `requirements-authoring-protocol` v1.0.0 pipeline, run 20260922-0449, in
  POV *Requirements Generator — Validation*, phase *1 — Generate Against Ground Truth*. It cleared
  its own QA gate (`approved`, reviewer score 91). ⚠️ That is where this document was WRITTEN, not
  where the program it describes runs — the running POV and phase belong to whoever launches it.
- Publish-time pass 2026-09-22: writing rules spliced at the marker, and the Kubernetes target
  namespace supplied by the operator. **No other content was edited** — in particular the derived
  exporter block is absent from this document because the pipeline withheld it, not because anyone
  removed it.
- Control: `program-artifacts/telemetry-export-four-domain` — same objective, same gate structure,
  and a `topology.json` byte-identical to this one. The requirements document is the only variable.

---

## Writing rules — read before authoring, they are the expensive part

*Rules version: 2 — 2026-09-21.* These govern how you write **every other section**. Every one was
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

6. ⚠️ **State every existence assumption a leg's objective rests on.** If a target resource may be
   ABSENT from harvested state (a security group not yet created, an object tracked under another
   address), say so and name the expected shape ("the resource may not exist; CREATE is the
   expected outcome"). An unstated existence assumption is resolved by the design at runtime as an
   ambiguity — it costs retry generations, or worse, a guessed reconciliation.
   *Earned: FW-A3.2/A3.3 — the same leg entered the retry band both rounds on exactly this
   ambiguity; FW-A3.5 stated it and the leg ran clean first-pass (VT-18).*

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

## Program scope

- **4 legs** (pipelines). Leg 1 runs first; legs 2–4 run **in parallel** once leg 1 and its gate clear. A leg is either a distinct DOMAIN or a PHASE of one — no two legs below resolve to the same protocol against the same target class:
  1. **Fabric telemetry-exporter address derivation** (upstream) on the 2-device Arista cEOS fabric (`ceos1`, `ceos2`), described in `topology.json`. Read-only network-state protocol; produces a value, applies no change.
  2. **Kubernetes NetworkPolicy authoring** (downstream) on the `k8s-rig` cluster (namespaces probed: `default`, `monitoring`, `telemetry`, `kube-system`).
  3. **Cloud storage bucket policy authoring** (downstream) on the Terraform-managed `aws_s3_bucket.app_logs` (`prod` workspace, `us-east-1`).
  4. **Observability stack ingress restriction authoring** (downstream) on the otel-collector OTLP receiver fronting the Prometheus/Grafana stack.
- **Out of scope, explicitly**: the fabric's Ethernet1 inter-switch links and DMZ/PARTNER-UPLINK interfaces (unrelated to telemetry export); the `random_password.db_master` Terraform resource; SNMP community-string rotation; and **applying any of the four legs' change packages** — this program produces approved change packages only, never applied changes, and this document does not authorize a launch.

## Why this is sequenced (leg 1) then parallel (legs 2–4) — the design rationale

**The test that decides sequenced vs parallel, applied per edge:**

> Is every value the downstream domain needs knowable before the upstream domain runs?
>  - **Yes** ⇒ parallel; the value belongs in the interface contract.
>  - **No** ⇒ sequenced; the value must ride a DAG edge.

**Leg 1 → legs 2/3/4**: **No.** The exact set of fabric telemetry-exporter addresses — and therefore the minimal covering block that authorizes them — is a property of the *live* loopback allocation on `ceos1`/`ceos2` at harvest time, not a static fact that can be pinned in this document. The Program Architect reads only `topology.json` and this file, with no live device access, and structurally cannot know today's allocation; if the fabric is rebuilt or a loopback is added/removed, the covering block changes. This is an objective test, not a judgment call: a static literal frozen into this document would go stale on the next rebuild, which is exactly the failure this program exists to prevent. Hence leg 1 must run, publish what it derived, and legs 2–4 must consume that published value rather than a number written here.

**Legs 2, 3, 4 relative to each other**: parallel. Nothing in the Kubernetes NetworkPolicy, the S3 bucket policy, or the otel-collector's own ingress control depends on the other two — each authorizes the same upstream value against an independent target with an independent protocol, and none of the three produces a value another needs.

## Approvals — one gate per domain, plus the program plan gate

**Team provisioned for this POV** — every approver below is a member of the POV team; unnamed approvers would silently route to the POV owner:
- Program Manager is Chris Terry (chris.terry@paichart.com)
- Fabric value approver is Steve Terry (steve.terry@paichart.com)
- Kubernetes change approver is Jacob Wilcox (jacob.wilcox@paichart.com)
- Cloud change approver is Josh Allen (josh.allen@paichart.com)
- Observability change approver is Rika Smith (rika@example.com)

### Every gate declares WHAT it approves and WHEN it sits

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | every leg | Chris Terry |
| Fabric CIDR value | the covering address block produced by the Fabric leg (a produced value, not a method) | **the leg that produces it — Leg 1 (Fabric derivation)** | Legs 2, 3, 4 | Steve Terry |
| Kubernetes NetworkPolicy change | the method/manifest Leg 2 will apply | the program plan gate | Leg 2 | Jacob Wilcox |
| Cloud bucket policy change | the method/policy document Leg 3 will apply | the program plan gate | Leg 3 | Josh Allen |
| Observability ingress change | the method/config change Leg 4 will apply | the program plan gate | Leg 4 | Rika Smith |

⚠️ The Fabric CIDR value gate approves **the value produced by the Fabric leg** — never a bare "the produced range." It sits after Leg 1 finishes, not after any consuming leg, because approving it later would be approving work already done against an unapproved input.

**Dependency consequence, stated explicitly (do not infer the DAG from prose above):**
- Leg 1 (Fabric derivation) depends on the program plan gate only.
- The Fabric CIDR value gate depends on **Leg 1** (it approves what Leg 1 produced).
- Legs 2, 3, and 4 each depend on **both** their own change gate **and** on Leg 1 directly — write both edges: `Leg 1 → Fabric CIDR value gate`, `Leg 1 → Leg 2`, `Leg 1 → Leg 3`, `Leg 1 → Leg 4`, and separately each own-method gate depends on the plan gate. The Fabric CIDR value gate additionally blocks Legs 2–4 from starting.

⚠️ This is not redundancy: an approval gate carries approval, not data. It is template-less and produces no deliverable, so a leg whose only dependency is a gate receives an empty chained context and cannot see the value it exists to consume. The gate edge decides **when** a leg may start; the direct edge from Leg 1 is **how** the covering block reaches it.

## Pipeline 1 objective — Fabric telemetry-exporter address derivation (UPSTREAM)

- Harvest, per device, the interface IP configuration of every device in the fabric's read-only lab descriptor, **read-only**. Service descriptor: as registered for this run (`ceos-lab-readonly` class; a fresh registration is expected per run, since the prior run's registration is torn down at that run's synthesis).
- **Preconditions verified — this run's own Phase 0 harvest** (no reuse of a prior run's harvest artifact permitted): the harvest returned interface-IP data for both fabric devices with per-interface descriptions, confirming the inputs this derivation needs are present.
- **The work**: identify every interface across every harvested device whose description names it as a telemetry-exporter address; collect the full set of such addresses (as /32 host routes, one per interface).
- **The derivation**: compute the smallest CIDR block, aligned to a valid prefix boundary, that contains every address in that set. This is a recomputation the leg performs against its own harvest — it is not a value carried forward from any prior run.
- **If the harvest returns no interfaces described as telemetry-exporter addresses**: produce a gap report stating that no telemetry-exporter allocation currently exists on the fabric, and author no covering block — do not substitute a default range or a value from a prior run.
- **The deliverable MUST publish, explicitly and prominently**: the full set of harvested telemetry-exporter addresses, the derived covering block, and the reasoning for why it is minimal. These are the inputs Legs 2, 3, and 4 depend on.

### This leg derives a value the downstream legs consume — binding obligations

- **Show the computation** in the deliverable: list every harvested address, the arithmetic used to find the covering block, and confirm the block's address-space coverage is no larger than required to contain the set.
- **Minimality is mandatory.** A covering block looser than the minimum aligned prefix that contains the full harvested set is a rejectable defect even if it contains every address correctly — it authorizes more source addresses than the fabric actually uses.
- **Re-selection before escalation.** If the addresses do not summarize cleanly to a small aligned block, try alternative valid alignments before declaring no minimal cover exists; escalate only after testing more than one candidate boundary and naming which were tried.
- **Verify by arithmetic, never by eyeballing adjacency.** Two addresses being numerically close does not make their minimal aligned cover small — an aligned block only covers a set if every member falls inside it at that block's own boundary; check this by computation (e.g., network/prefix containment), not by inspection.
- **Verify member-by-member**: confirm every harvested telemetry-exporter address is inside the published block, and that no address outside the harvested set was folded in for convenience.
- **Verify the premise before deriving**: confirm the harvest actually returned telemetry-exporter-tagged interfaces before computing anything — a service that merely answers is not evidence it holds the addresses in question.
- **State the null case, always**: if the harvest yields no telemetry-exporter addresses this run, the leg must report that gap and derive nothing — never carry forward or improvise a value the harvest didn't produce.
- **Run your own rule**: apply the stated derivation method to the harvested set yourself and confirm the block it produces matches what you are about to publish, including its exact prefix width — a rule that reads correctly but wasn't actually executed against the data is the most expensive class of defect this document guards against.
- **A clean mechanical containment check is a floor, not the bar.** Passing containment does not by itself establish minimality — check minimality separately, as above.

## Pipeline 2 objective — Kubernetes NetworkPolicy authoring (DOWNSTREAM)

- Harvest namespaces, services, NetworkPolicies, and workloads in the target `k8s-rig` cluster, **read-only**. Service descriptor: as registered for this run (`k8s-rig-readonly` class).
- **Preconditions verified — this run's own Phase 0 harvest**: namespaces `default`, `monitoring`, `telemetry`, and `kube-system` were probed by name (the descriptor exposes no namespace-enumeration tool, so this is not exhaustive cluster coverage); no NetworkPolicy and no telemetry-ingest workload or Service were found in any of them.
- **Target — SUPPLIED AT PUBLISH TIME by the operator, not harvested (2026-09-22)**: namespace
  `trading`, workload Deployment `orders-api` (selector `app: orders-api`). Verified live at supply
  time: 2/2 replicas ready, and **zero** NetworkPolicies in the namespace. This discharges the named
  gap below. ⚠️ It is an operator assertion with a timestamp, NOT a harvest result — this leg must
  re-confirm it against its own harvest before authoring, and gap-report rather than proceed if the
  namespace or workload is absent at run time.
- **The work**: author a NetworkPolicy that restricts ingress to the `orders-api` workload in
  `trading` such that only the address block produced by the Fabric leg is permitted as a source.
- **Existence assumption**: no NetworkPolicy exists in `trading` (confirmed live at supply time), so
  CREATE, not MODIFY, is the expected outcome. The workload itself already exists and is NOT created
  by this program. Shape is default-deny plus the scoped allow — state what the policy must PERMIT,
  not merely what it must deny.
- **Named gap — DISCHARGED at publish time, and the reason it existed is structural.** The k8s
  descriptor exposes no namespace-enumeration tool (`list_resources` requires a namespace and its
  `resourceType` enum has no `namespaces` entry), so a harvest can only probe names it already knows.
  This run probed four and the real target was a fifth. The harvest was RIGHT to state this as a gap
  rather than infer a clean negative — absence in a probe list is evidence about the list, not about
  the cluster. The operator has now supplied the namespace above. **Until the descriptor can
  enumerate namespaces, this gap recurs on every run and must be closed the same way.**
- It consumes the Fabric leg's covering block **as chained** — it does not re-derive it, and is forbidden from recomputing it. Containment for that block is discharged in Leg 1 and re-verified at the program tier below.
  - **If the chained context does not carry it**: escalate. Do not guess, substitute, or proceed.
- **If this leg's own harvest finds no candidate namespace for the telemetry-ingest workload at all** (customer does not supply one and none is discoverable): produce a gap report naming the missing input; do not author a NetworkPolicy against a guessed namespace.
- No further leg consumes from this one; no downstream publication obligation.

## Pipeline 3 objective — Cloud storage bucket policy authoring (DOWNSTREAM)

- Harvest the `prod` Terraform workspace state, **read-only**. Service descriptor: as registered for this run (`terraform-rig-readonly` class).
- **Preconditions verified — this run's own Phase 0 harvest**: `aws_s3_bucket.app_logs` (ARN `arn:aws:s3:::acme-app-logs`, region `us-east-1`) is present in state with an empty `policy` attribute; no `aws_s3_bucket_policy` resource exists in the workspace.
- **The work**: author an `aws_s3_bucket_policy` for `acme-app-logs` that permits write access to the bucket **only** from the address block produced by the Fabric leg, and denies it otherwise.
- **Existence assumption**: the bucket exists; no bucket policy exists today. CREATE (not MODIFY) of the `aws_s3_bucket_policy` resource is the expected outcome.
- It consumes the Fabric leg's covering block **as chained** — it does not re-derive it, and is forbidden from recomputing it. Containment for that block is discharged in Leg 1 and re-verified at the program tier below.
  - **If the chained context does not carry it**: escalate. Do not guess, substitute, or proceed.
- **If this leg's own harvest no longer finds `aws_s3_bucket.app_logs` in state at run time**: produce a gap report; do not author a policy against a bucket that does not exist in this leg's own harvest, regardless of what an earlier run observed.
- No further leg consumes from this one; no downstream publication obligation.

## Pipeline 4 objective — Observability stack ingress restriction authoring (DOWNSTREAM)

- Harvest stack health, the as-deployed otel-collector configuration, scrape targets, and Grafana datasources, **read-only**. Service descriptor: as registered for this run (`observability-readonly` class).
- **Preconditions verified — this run's own Phase 0 harvest**: `stack_health` reported prometheus/grafana/otel-collector all up; the as-deployed OTLP receiver binds `0.0.0.0:4317`/`0.0.0.0:4318` with no source-address restriction configured.
- **The work**: restrict the OTLP receiver so it accepts telemetry only from the address block produced by the Fabric leg. The as-deployed configuration exposes no native source-restriction field, so this leg's own harvest must first determine which access-control mechanism (collector-level allowlist, extension, or an external network-layer control in front of the receiver) the deployed collector build actually supports before authoring the change — this document does not prescribe the mechanism, since none was observed as already present.
- **Existence assumption**: no source-address restriction exists on the OTLP receiver today, in any form. CREATE of whichever control mechanism this leg's harvest confirms is available is the expected outcome; this is a greenfield state, not a modification of an existing control.
- It consumes the Fabric leg's covering block **as chained** — it does not re-derive it, and is forbidden from recomputing it. Containment for that block is discharged in Leg 1 and re-verified at the program tier below.
  - **If the chained context does not carry it**: escalate. Do not guess, substitute, or proceed.
- **If this leg's own harvest finds no configurable access-control mechanism on the deployed collector build at all** (no collector-level allowlist and no feasible network-layer insertion point): produce a gap report naming exactly what was checked and what is missing; do not fabricate a config block for a mechanism that isn't there.
- No further leg consumes from this one; no downstream publication obligation.

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- Cloud target bucket: `acme-app-logs` (ARN `arn:aws:s3:::acme-app-logs`), region `us-east-1`, Terraform workspace `prod`.
- OTLP receiver ports on the observability stack: gRPC `4317`, HTTP `4318`.
- Cluster namespaces confirmed to exist and hold no conflicting policy at harvest time: `default`, `monitoring`, `telemetry`, `kube-system` (not an exhaustive namespace list — see Leg 2's named gap).

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- The minimal covering address block for the fabric's telemetry-exporter addresses — produced by Leg 1, chained into Legs 2, 3, and 4's inputs, settled before any of those three legs start.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules* #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change packages only — never applied changes.

**Per-leg deterministic validation** (command + exact expected output, no prose):

- **Leg 1 (Fabric derivation)** — minimality and containment, self-checked before publication:
  - Containment: for each harvested telemetry-exporter address `a`, `python3 -c "import ipaddress; print(ipaddress.ip_address('<a>') in ipaddress.ip_network('<published block>'))"` — expected output: `True` for every harvested address.
  - Minimality: for the published block `B`, split it into its two equal halves at the next-longer prefix; `python3 -c "import ipaddress; net=ipaddress.ip_network('<B>'); h=list(net.subnets(new_prefix=net.prefixlen+1)); print([all(ipaddress.ip_address(a) in half for a in <harvested set>) for half in h])"` — expected output: `[False, False]` (no single half contains the whole harvested set, confirming `B` is not loosely oversized by one bit — the full minimality argument in the deliverable must additionally justify why no other alignment at the same or shorter prefix length works).

- **Leg 2 (Kubernetes)** — namespace `trading`; policy name `<NAME>` is fixed by the authoring leg:
  - `kubectl get networkpolicy -n trading <NAME> -o jsonpath='{.spec.ingress[*].from[*].ipBlock.cidr}'` — expected output: exactly one CIDR string, equal to the block published in Leg 1's deliverable, and no other CIDR string present.
  - `kubectl get networkpolicy -n trading <NAME> -o jsonpath='{.spec.policyTypes}'` — expected output: `["Ingress"]`.

- **Leg 3 (Cloud)**:
  - `aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text | jq -r '.Statement | length'` — expected output: `1`.
  - `aws s3api get-bucket-policy --bucket acme-app-logs --query Policy --output text | jq -r '.Statement[0].Condition.IpAddress["aws:SourceIp"]'` — expected output: exactly the block published in Leg 1's deliverable, as the sole entry.

- **Leg 4 (Observability)** — the exact mechanism is determined by this leg's own harvest (see Pipeline 4 objective), so the check is staged:
  - Structural: the change package's exemplar configuration stanza for the chosen mechanism must be complete and runnable — every line, in order, no placeholder tokens remaining.
  - Deterministic post-change probe against the deployed control's configuration source: a command that greps the deployed access-control stanza for the literal block published in Leg 1's deliverable — expected output: exactly one match, and no other CIDR literal present in that same stanza. This is the sanctioned exception for a state not fully knowable before this leg's own harvest runs: the CIDR is known in advance (chained from Leg 1), but the collector's supported access-control mechanism is not known until this leg's own harvest inspects the deployed build.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the block consumed by Legs 2, 3, and 4 exactly equals the block Leg 1 produced — the chained value, not a guess, not a recomputation;
2. every address in Leg 1's harvested telemetry-exporter set is contained within the block each of Legs 2, 3, and 4 configured as its permitted source;
2b. the tightest-correct property — Node C recomputes the minimal covering block from Leg 1's own published harvested-address list independently, and confirms it matches what Leg 1 published; it does not take Leg 1's stated value on trust;
3. no leg's authorized control admits any address or range beyond the block Leg 1 produced — no wildcard source, no `0.0.0.0/0`, no additional CIDR entries in any of the three downstream controls;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`, `notChained []` for each of Legs 2, 3, and 4 — i.e. each downstream leg received Leg 1's real deliverable, not a fallback and not nothing.

- These checks are properties, not hardcoded values — they stay valid when the fabric, cluster, bucket, or collector are rebuilt. The round must not depend on a magic expected string frozen at this document's authoring time.

---

**Draft status**: this is a **draft specification for human review**, not an approved or launch-ready document. The writing rules in the section above were spliced in mechanically (`requirements-rules.py --insert`); run `requirements-rules.py --check` to confirm they are still canonical. The program it describes is launched separately, by a person, after the plan gate above is cleared.

Confidence: 84
