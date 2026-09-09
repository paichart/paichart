# Program Requirements

> Self-host use case copy of `program-artifacts/firewall-a3-partner-path-r2/requirements.md` (the FW-A3.5 run,
> 2026-08-22): descriptors point at rigs on the hub's own host, and the writing rules and the clauses they
> require were brought up to the `_TEMPLATE` revision of 2026-08-31 (rules 6–14 were earned after r2 was written).
- POV: Autonomous Delivery Use Cases
- Phase: Firewall Rules Change
- Iteration: FW-A3.2 (three-domain path, **SEQUENCED**, transitive chaining) · 2026-08-21

> **Revision FW-A3.2 (2026-08-21)** — corrections after Round A3.1, which the leg reviewer correctly
> blocked (NEEDS-REVISION): the ACL had no interface binding because the round's topology mapped the
> untrust zone onto a port that did not exist. The lab now exposes bindable policy ports with
> role-bearing descriptions (topology.json `policyInterfaces`); every hop's rule MUST be bound to its
> named interface, and an unbindable rule is grounds to block, exactly as A3.1's reviewer did. A3.1
> also showed the edge package omitted its `## Derived Values` block, leaving the pool verified by
> prose recomputation only — the block is part of the deliverable contract; omitting it is a defect.

---

## Writing rules — read before authoring, they are the expensive part

These govern how you write **every other section**. All were earned by a failed or false-passing
run.

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
   the reason code, not the violation class, not `violations: []`. Every agent reads this file, so a
   machine pass-condition written here becomes **a target an agent can aim at instead of the
   requirement**. Let the platform own the string.
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

   🔴 **WRITE THE EXEMPLAR — BUT DO NOT RELY ON IT HOLDING.** This rule used to end "…converts
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

10. ⚠️ **A `[NEUTRALIZED-…]` sanitizer marker seen in CHAINED context is a platform view-layer
    annotation — it is not evidence the marker exists in the document itself.** The platform
    sanitizes text at the boundary where one agent's output is chained into another's context, so
    a reviewer's view can carry a neutralization marker that the at-rest deliverable does not.
    A reviewer must report a marker as an OBSERVATION (naming where it appeared), never as a
    blocking document defect; deliverable hygiene is verified against the at-rest artifact by the
    program tier and the human operator, who can read the document as stored.
    *Earned: IGP-T1 R5 — a clean package's "System IDs…" paragraph false-positived an injection
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

---

## Program scope

- **3** delivery domains, executed **IN SEQUENCE** along the traffic path
  `partner-internet → ceos1 (edge) → dmz-sg (cloud) → ceos2 (core) → internal-app`:
  1. **Network provisioning — EDGE** (UPSTREAM) on `ceos1`, described in `topology.json`: the
     partner-facing permit rule + the source-NAT pool selection.
  2. **Cloud IaC (Terraform) — DMZ** (MIDSTREAM) on the `dmz-sg` security group: ingress restricted
     to the post-NAT pool.
  3. **Network provisioning — CORE** (DOWNSTREAM) on `ceos2`: the dmz→inside rule matching the
     post-NAT pool.
- The existing eBGP fabric between ceos1 and ceos2 (the 10.0.12.0/30 link, ASNs 65001/65002) is
  explicitly **out of scope** — no routing changes, no renumbering.
- Applying any change to any device or cloud resource is **out of scope** — this program produces
  approved change packages only.

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test that decides sequenced vs parallel** — applied explicitly:

> Is every value the downstream domains need **knowable before the upstream domain runs**?
> **No.** The dmz and core hops must match the traffic's **post-NAT source** — the NAT pool the edge
> design selects. That pool is chosen from addresses **free in the fabric's 10.99.0.0/24 allocation
> pool at design time**, and the existing allocations are scattered, asymmetric across the two
> switches, and **re-randomized on every lab rebuild** — so the pool cannot be pinned in a static
> artifact or agreed in a contract, and the Program Architect (which reads only `topology.json` +
> this file, with **no live state access**) structurally cannot know it. It is an **output** of the
> edge design.

Consequence: the three pipelines are DAG-sequenced (edge → dmz → core), and each downstream leg
consumes the upstream leg's actual deliverable. If someone guessed the pool up front, the guessed
addresses would collide with live allocations on some rebuilds and the downstream rules would match
traffic that never exists — the exact silent-hole class this program exists to prevent.

**Design order is edge-first. Apply order is the REVERSE (core → dmz → edge)**: the innermost hop
must be provisioned before the outer hop opens, so partner traffic is never admitted toward a hop
that cannot yet police it. The program deliverable must state both orders explicitly and distinguish
them — conflating design order with apply order is a known error class for sequenced security paths.

## Approvals — one gate per domain, plus the program plan gate

Team provisioned for this POV:
- Network security lead is Steve Terry steveterry66@gmail.com
- Cloud platform lead is Steve Terry steveterry66@gmail.com
- Core network lead is Steve Terry steveterry66@gmail.com

- The **edge (ceos1) change** requires its own approval before that pipeline may run.
- The **dmz (Terraform) change** requires its own approval before that pipeline may run.
- The **core (ceos2) change** requires its own approval before that pipeline may run.
- Sequenced: each downstream pipeline waits on **BOTH** its own gate **AND** the upstream pipeline
  (the DAG edge). The dmz leg waits on the edge pipeline; the core leg waits on the dmz pipeline.

## Pipeline 1 objective — Network provisioning, EDGE (ceos1) (UPSTREAM)

- Harvest ceos1 AND ceos2 **read-only** (both — pool freedom is fabric-wide). Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/descriptors/ceos-lab-readonly-descriptor.json`
- Author the edge policy change package for ceos1:
  - bind the partner ingress rule to the PARTNER-UPLINK interface named in topology.json `policyInterfaces` (Ethernet3, untrust zone);
  - an ingress rule permitting **exactly** tcp/443 from the partner CIDR `203.0.113.0/24` (the
    pre-NAT source — the edge is the ONLY hop that may match it) to the internal app `10.20.0.10/32`;
  - a source-NAT translating the partner CIDR to the **selected pool** (tag `PARTNER-SNAT-2026`);
  - an explicit default deny with deny-logging;
  - rule tag `PARTNER-HTTPS-2026`.
- **The derivation**: select a free, aligned **/31 or /30** from the 10.99.0.0/24 pool as the NAT
  pool, colliding with **no existing allocation on either switch** (interface addresses and BGP
  network statements both reveal allocations — harvest both).
- **Convention, written (rule 7)**: the pool must not contain the network address (`10.99.0.0`) or the
  broadcast address (`10.99.0.255`) of the allocation pool. Both are legal against every harvested fact;
  they are excluded by operating convention, which exists only because it is written here.
- **Provenance (rule 13)**: the pool is a DERIVED value — no getter returns it. Label it `DERIVED` in the
  deliverable and name its basis (the harvested allocation set and the alignment rule). Never present it as
  retrieved output.
- **The deliverable MUST publish, explicitly and prominently**: the selected NAT pool and the
  reasoning for the choice (which candidates were considered, why this one). This is the input BOTH
  downstream legs depend on.

### ⚠️ This leg DERIVES a value the downstream legs consume — every line below is an incident

- **Show the computation** in the deliverable: the inputs (the harvested allocation set), the
  selection, and the result's coverage.
- **Minimality, or the equivalent tightest-correct property.** A pool larger than the requirement
  needs is a **REJECTABLE defect even when it violates nothing else**, because it authorizes
  addresses no translated flow will ever use. *Earned: Run 15 shipped a `/30` where `/31` was
  minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate block collides, that rules out *that
  candidate* — not the whole pool. Select another and recompute. Escalate only after establishing
  that no valid block exists **anywhere in the pool**, naming which candidates you tested.
  *"Impossible" concluded from a handful of candidates is a **defect, not an escalation**.*
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** CIDR trap: a `/31` covers an **aligned** pair
  only — `.1/.2` are adjacent but straddle a boundary; their minimal cover is a `/30` that swallows
  neighbours. Alignment: a /31 starts on an even fourth octet; a /30 on a multiple of 4.
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: every address the pool authorizes is genuinely
  free on BOTH switches, and nothing allocated falls inside it.
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence the
  derivation is correct. **Satisfy the requirements; do not target the checker.**

### Platform dialect — Arista EOS, for policy and NAT (rule 8; reference data, rule 4)

Neither an access-list nor NAT exists in the harvested state of either switch, so there is no stanza to
imitate. The EOS-native shape below was accepted by a live EOS config-session syntax check (cEOS-lab
4.32.2.1F, 2026-09-09). Transcribe the SHAPE — complete, every line, in order — with the round's own
values; the pool below is an illustration, not the answer (rule 4).

```
ip access-list PARTNER-HTTPS-2026
   10 permit tcp 203.0.113.0/24 host 10.20.0.10 eq https
   20 deny ip any any log
!
ip access-list PARTNER-NAT-MATCH
   10 permit ip 203.0.113.0/24 any
!
ip nat pool PARTNER-SNAT-2026 10.99.0.4 10.99.0.5 prefix-length 31
!
interface Ethernet3
   ip access-group PARTNER-HTTPS-2026 in
   ip nat source dynamic access-list PARTNER-NAT-MATCH pool PARTNER-SNAT-2026
```

Not this platform's tokens (a reviewer, an operator and a lint can all grep these): numbered
`access-list 1xx …`, `ip nat inside source list …`, `ip nat inside`/`ip nat outside` interface roles,
`permit tcp … eq 443` written as an object-group. Completeness is half the rule: an omitted line
enters and commits cleanly while the policy stays unbound.

### Validation shape for state the read-only service cannot see (rules 9 and 11)

The harvest service exposes device facts, interfaces and routing state — not access-list or NAT state.
So a validation step for this package is a **config-presence** check: the exact `show running-config
section access-list` / `show ip nat pool` command and, as its expected output, the package's own stanza
text verbatim (static by design). Hit counters and translation tables are dynamic and are named as
excluded. A NAT *translation* check is precluded by this phase (no partner traffic exists in the lab —
rule 11) and must not be written as a validation step.

## Pipeline 2 objective — Terraform IaC, DMZ security group (MIDSTREAM)

- Harvest the Terraform estate **read-only**. Service descriptor:
  `https://raw.githubusercontent.com/paichart/paichart/main/usecases/firewall-a3-partner-path/descriptors/terraform-readonly-descriptor.json`
- **Existence assumption, stated (rule 6)**: `aws_security_group.dmz_app` may be ABSENT from the harvested
  state — the `prod` workspace holds the log bucket and a captured secret, not the DMZ security group. If
  it is absent, CREATE is the expected outcome and the plan evidence shows one resource added; if present,
  the package modifies it in place. Either is a legitimate finding; a guessed reconciliation is not.
- Author the `aws_security_group.dmz_app` change package:
  - ingress permitting **exactly** tcp/443 from the **post-NAT pool** — consumed **as chained** from
    the edge leg's deliverable. This leg does **not** re-derive the pool and is forbidden from
    recomputing it. Containment for the pool is discharged **upstream** and re-verified at the
    program tier.
  - egress permitting exactly tcp/443 to `10.20.0.10/32`;
  - **no** `0.0.0.0/0` in any direction, and **no rule matching the partner CIDR `203.0.113.0/24`** —
    that is the pre-NAT source, which does not exist at this hop; a rule matching it would be a
    wrong-stage match that never fires on real traffic.
- Deliverable: HCL diff + plan evidence + rollback, and it MUST re-publish the consumed pool
  prominently (it is the value the core leg consumes transitively).

## Pipeline 3 objective — Network provisioning, CORE (ceos2) (DOWNSTREAM)

- Harvest ceos2 **read-only** (same descriptor as Pipeline 1).
- Author the core policy change package for ceos2:
  - bind the rule to the DMZ-SEGMENT interface named in topology.json `policyInterfaces` (Ethernet2, dmz zone);
  - a dmz→inside rule permitting **exactly** tcp/443 from the **post-NAT pool** (consumed **as
    chained** via the dmz leg — same non-recomputation rule as Pipeline 2) to `10.20.0.10/32`;
  - explicit default deny with deny-logging; rule tag `PARTNER-HTTPS-2026`;
  - **no rule matching the partner CIDR** (wrong-stage match, as above).
- Platform dialect and validation shape: as Pipeline 1's two sections (same EOS access-list shape bound
  with `ip access-group … in` on `Ethernet2`; no NAT stanza on this hop; config-presence validation only).

## Design constraints — split across the contract and the DAG

**Static → the interface contract** (knowable up front, agreed before any leg runs):
- flow intent: src `203.0.113.0/24` at ingress only, dst `10.20.0.10/32`, tcp/443, permit
- default action: deny, with deny-logging, at every hop
- naming: rule tag `PARTNER-HTTPS-2026`, NAT pool tag `PARTNER-SNAT-2026`
- zone map: untrust=partner side, dmz=middle segment, inside=internal-app side
- apply order (human, out-of-band): core → dmz → edge — the reverse of design order

**Runtime → the DAG edge** (not knowable up front — see the rationale section):
- the **NAT pool** — produced by the edge leg, chained into the dmz leg's §6, then via the dmz
  leg's deliverable into the core leg's §6, each settled before the consumer starts.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing
  rules* #1 and #2) and a rollback plan restoring the pre-change policy exactly.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. the pool each consuming leg applied exactly equals what the edge leg produced — the chained
   value, not a guess, not a recomputation;
2. every address the pool authorizes is inside the fabric allocation pool and collides with no
   harvested allocation on either switch;
2b. the tightest-correct property of the pool — recompute it; do not take the stated size on trust;
3. no hop widens the flow: no `0.0.0.0/0`, no port beyond 443, no destination beyond the app /32,
   and no return-path hole beyond established/related;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — i.e. each downstream leg received its upstream leg's **real** deliverable, not
   a fallback and not nothing;
5. **no wrong-stage match**: the pre-NAT partner CIDR `203.0.113.0/24` appears in the edge leg's
   ingress rule and **nowhere else** in any hop's match criteria;
6. the program deliverable states BOTH orders — design order (edge → dmz → core) and apply order
   (core → dmz → edge) — and distinguishes them.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere; renumbering, merging, or substituting one **silently deletes it**. If a new
  requirement needs a number, it **APPENDS** (7, 8, …). *Earned: Run 15 — a new clause was
  renumbered into slot 2b, deleting the minimality check; a non-minimal result shipped.*
- These checks are **properties, not hardcoded values** — they stay valid when the lab is rebuilt.

### Consuming-leg attribution — the dmz and core legs legitimately cannot self-check

The dmz and core legs consume a pool they cannot verify against their own harvested state (the
Terraform estate and ceos2 alone cannot see fabric-wide freedom). Their SATISFIED condition is a
property: (1) the edge leg's derivation was machine-checked with no defect, (2) the program-tier
checks above pass on the chained value, and (3) chaining coverage confirms the real deliverable was
received. A consuming leg in this state is a legitimate state to land in — never a bar it failed.

### Validation-round scope note (honesty)

This round validates the PROGRAM machinery on live rigs — transitive inter-pipeline chaining,
settledness, gate composition, and the seam checks above. The cEOS lab's dataplane NAT behaviour is
NOT a claim of this round; the change packages are approved-but-unapplied, and any optional apply is
a separate human decision.
