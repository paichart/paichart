# Program Requirements: Lab Exporter Loopback on ceos2

- Authored in: Lab Exporter Address Expansion · Requirements
- Iteration: Run 20261110-0148 · 2026-11-10

> ⚠️ **"Authored in" is where this document was WRITTEN, not where the program it describes RUNS.**
> Those are normally different phases, and may be different POVs. The running phase is chosen by
> whoever launches the program, after this document exists — so it is not knowable here, and a
> header that states it as fact is wrong on every run that is not launched from the authoring phase.
> Earned 2026-09-22: a published spec asserted the authoring phase as its own, was corrected by
> hand, and the correction was lost when the document was regenerated — which is why the fix is
> here and not in a copy.

> 🔴 **DRAFT SPECIFICATION FOR HUMAN REVIEW.** Nobody has approved this document. It is not final and not ready to launch. It is **structurally incomplete** until a person runs `requirements-rules.py --insert` at publish time to splice in the *Writing rules* section, and then runs the conformance check. The program it describes is launched separately, by a person, after its plan gate. Rows marked OPEN below are decisions only the owner can make. Until the owner declares them, the leg's instruction for each one is a gap report naming that row.

---

## Program scope

- **1 leg** (pipeline). This is a **single-leg program with no cross-leg dependency**. No leg consumes a value that another leg produces, so the sequenced-versus-parallel question does not arise and this document has no sequencing-rationale section. The leg is a single DOMAIN: one protocol, one target class.
  1. **network-provisioning** (—) on lab switch ceos2. It reads both lab switches and changes only ceos2. Described in `topology.json`.
- The following are explicitly **out of scope**:
  - any system other than the lab switches (`network-provisioning.item-4`);
  - any configuration change on any lab switch other than ceos2 (`network-provisioning.target`);
  - any change to an interface, address, BGP neighbour, BGP policy or advertisement on ceos2 other than the one new loopback and its advertisement;
  - any address outside the declared exporter pool;
  - applying any change. This program produces change packages only.

## Design decisions

### Every leg

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| network-provisioning.target | which surface of the leg's service does it act on | — | lab switch ceos2: exactly one new loopback interface and the BGP advertisement of its /32. No configuration change on any other device | (declared — item 1: "on lab switch ceos2 only") |
| network-provisioning.population | which members of the class the derivation reads | — | every IPv4 prefix inside or overlapping 10.99.0.0/24 that either lab switch uses ("uses" is defined under Pipeline 1). A candidate overlapping any of them is never selected. If no /32 in the pool is free, the result is a gap | (declared — item 2: "in the exporter pool 10.99.0.0/24 that neither lab switch uses") |
| network-provisioning.representation | how the derived value is expressed | one aligned prefix · a set of prefixes · a host list | one aligned prefix: a single /32 | (declared — item 2: "on a /32") |
| network-provisioning.inputs-empty | the derivation's inputs are empty | gap | gap: a gap report naming which lab switch's interface or BGP state was unreadable or empty. No /32 is selected and no change is authored | (forced — item 2: a /32 chosen without a readable harvest of both switches cannot be shown to be one "that neither lab switch uses", and a substitute input set is outside item 2) → gap |
| approver.program-plan | who approves this gate | — | UNASSIGNED — no approver declared | OPEN — who approves the program plan gate?; options: — |
| approver.network-change | who approves this gate | — | UNASSIGNED — no approver declared | OPEN — who approves the network-provisioning change gate?; options: — |
| gate.network-change.position | when this gate sits (every gate except the program plan gate) | before-leg · after-leg-before-completion · after-producer-before-consumers | none until declared | OPEN — when does the network-provisioning change gate sit?; options: before-leg · after-leg-before-completion · after-producer-before-consumers |

### A network leg (configuration sources)

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| network-provisioning.sources | which devices the leg reads (the ones it changes and the ones it only needs to see), and where each one's configuration is read from | — | none until declared. The objective carries no device-sources block | OPEN — which devices does the leg read, and where is each one's configuration read from?; options: — |

### Owner items and further decisions this leg relies on

| id | question | options | rule or named target | source |
|---|---|---|---|---|
| network-provisioning.item-3 | item 3 — the new loopback's /32 is advertised in BGP | — | ceos2's BGP process advertises the /32 published by this leg. The method is governed by `network-provisioning.advertisement-method` | (declared — item 3: "advertise it in BGP") |
| network-provisioning.item-4 | item 4 — the systems the program involves | — | the lab switches, and no other system | (declared — item 4: "One system is involved: the lab switches") |
| network-provisioning.selection | which free /32 in the pool is chosen when more than one is free | lowest-free · highest-free · owner-named-address | none until declared | OPEN — which free /32 is selected?; options: lowest-free · highest-free · owner-named-address |
| network-provisioning.pool-edges | whether the pool's first and last addresses may be selected | eligible · excluded | none until declared | OPEN — may the first and last addresses of 10.99.0.0/24 be selected as a /32?; options: eligible · excluded |
| network-provisioning.interface-name | which loopback interface name carries the new /32 | lowest-unused-loopback-number · owner-named-interface | none until declared | OPEN — which loopback interface number does the new loopback use?; options: lowest-unused-loopback-number · owner-named-interface |
| network-provisioning.class-marker | how the new loopback is marked as a member of the telemetry-exporter class | same-description-as-existing-members (read from the leg's own harvest) · owner-declared-description · no-marker | none until declared | OPEN — which interface description marks the new loopback as a telemetry-exporter loopback?; options: same-description-as-existing-members · owner-declared-description · no-marker |
| network-provisioning.advertisement-method | how ceos2's BGP process comes to advertise the new /32 | per-prefix-network-statement · redistribute-connected-filtered-to-the-new-/32 | none until declared | OPEN — by which mechanism is the new /32 advertised in BGP?; options: per-prefix-network-statement · redistribute-connected-filtered-to-the-new-/32 |

The authorisation rows and the routing rows do not apply to this leg. Each one is listed, with the reason, in the owner block below.

## Decisions needed from the owner

network-provisioning.inputs-empty — the derivation's inputs are empty — options: gap — governs: Pipeline 1 "If the harvest returns no lab-switch interface or BGP state" clause — tier: default
network-provisioning.selection — which free /32 in the pool is chosen when more than one is free — options: lowest-free · highest-free · owner-named-address — governs: Pipeline 1 derivation (selection step) and its validation script — tier: blocking
network-provisioning.pool-edges — whether the pool's first and last addresses may be selected — options: eligible · excluded — governs: Pipeline 1 derivation (candidate set) and its validation script — tier: blocking
network-provisioning.interface-name — which loopback interface name carries the new /32 — options: lowest-unused-loopback-number · owner-named-interface — governs: Pipeline 1 work (loopback creation) — tier: blocking
network-provisioning.class-marker — how the new loopback is marked as a member of the telemetry-exporter class — options: same-description-as-existing-members (read from the leg's own harvest) · owner-declared-description · no-marker — governs: Pipeline 1 work (loopback description) and post-change check P4 — tier: blocking
network-provisioning.advertisement-method — how ceos2's BGP process comes to advertise the new /32 — options: per-prefix-network-statement · redistribute-connected-filtered-to-the-new-/32 — governs: Pipeline 1 work (BGP advertisement) — tier: blocking
network-provisioning.sources — which devices the leg reads (the ones it changes and the ones it only needs to see), and where each one's configuration is read from — options: — — governs: Pipeline 1 Device sources slot — tier: blocking
approver.program-plan — who approves this gate — options: — — governs: Approvals table, program plan row — tier: blocking
approver.network-change — who approves this gate — options: — — governs: Approvals table, network-provisioning change row — tier: blocking
gate.network-change.position — when this gate sits (every gate except the program plan gate) — options: before-leg · after-leg-before-completion · after-producer-before-consumers — governs: Approvals table moment and blocks columns, and the dependency consequence — tier: blocking
network-provisioning.receiver — which workload/resource on the target is authorised — options: — — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target: it adds one loopback address and its route advertisement on ceos2, and adds, removes, allows, denies or restricts no sender or principal
network-provisioning.admitted-principal — who is admitted, and by which attribute the enforcer recognises them — options: source-address-range · named-identity · network-path · combination (state each part) — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.request-path — the path the admitted senders' requests take to the enforcer, which decides the attribute their address arrives in — options: direct · private-endpoint · translated — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target, and admits no principal
network-provisioning.principal-unseen — the leg's own harvest cannot confirm the enforcer sees the admitted attribute on the sender's path — options: gap · act-regardless — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.granted-action — what the admitted principal may do (actions, ports) — options: — — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.existing-grant — other allowances already on the same surface — options: replace · preserve · preserve-bounded (state the bound) — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.target-empty — the receiver selector/surface matches nothing now — options: act · gap — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.enforcer-absent — no policy object governs the receiver yet — options: create · gap — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.target-absent — the declared target itself does not exist — options: gap · create-target — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target. An unreadable or absent ceos2 is covered by network-provisioning.inputs-empty
network-provisioning.collateral — what else on the target changes because enforcement now applies — options: per enforcer — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target, so no enforcement starts to apply
network-provisioning.enforcer-scope — which parts of the enforcer the restriction covers — options: all-reaching-the-protected-thing · exemption-by-property · gap — governs: none, row deleted — tier: not-applicable — the leg neither grants nor removes access on its target
network-provisioning.covered-routes — when the leg adds a covering route, whether the routes it covers stop being advertised — options: replace · accompany — governs: none, row deleted — tier: not-applicable — the leg adds no advertised covering route: it originates one host /32 and suppresses, filters, withdraws or replaces no route
network-provisioning.must-stay-reachable — which destinations must stay reachable after the change, and from where — options: — — governs: none, row deleted — tier: not-applicable — the leg is not a routing leg: it adds no covering route and suppresses, filters, withdraws or replaces no route or advertisement

## Approvals: one gate for the network-provisioning leg, plus the program plan gate

**Approvers are DECLARED, never chosen.** Every approver below must be TRANSCRIBED from an approver mapping declared in this program's objective, and marked `(declared)`. **This objective declares no approver mapping.** Every gate is therefore written `UNASSIGNED — no approver declared`, and its `approver.<gate>` row in *Design decisions* is OPEN. The owner sees those rows in *Decisions needed from the owner*. No name has been picked from the POV roster: a roster says who EXISTS, never who is ACCOUNTABLE.

**Declared approvers confirmed on the POV team.** The platform routes a gate only to a MEMBER. A declared approver who is not a member silently falls to the POV owner.
- none: the objective declares no approvers, so there is nobody to confirm.

### Every gate declares WHAT it approves and WHEN it sits, and the two must agree

| kind | approves | sits AFTER | sits BEFORE |
|---|---|---|---|
| **intent / method** | how the work will be done, before it is done | the plan gate | the leg it governs |
| **produced value** | a concrete value that already exists | **the leg that PRODUCES that value** | the leg it authorises |

| gate | approves | moment — runs AFTER | blocks | approver |
|---|---|---|---|---|
| program plan | the plan and the interface contract | the Program Architect | the network-provisioning leg | UNASSIGNED — no approver declared |
| network-provisioning change | the change package for ceos2, carrying the /32 produced by the network-provisioning leg (a produced value, whose producer is the same leg) | OPEN: governed by `gate.network-change.position` | OPEN: governed by `gate.network-change.position` | UNASSIGNED — no approver declared |

⚠️ **The network-provisioning change gate approves a PRODUCED value.** The /32 does not exist until the network-provisioning leg selects it. If this gate is placed `before-leg`, it can approve only a method, never the address. If it is placed `after-producer-before-consumers`, it blocks nothing, because no leg consumes from this one. The owner's answer to `gate.network-change.position` decides which of these the gate is.

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

⚠️ **A gate the producing team can release for itself is not a gate.** Distinct owners are the point.
That is a check on the DECLARED mapping, never a licence to reassign. If the declaration puts one person on both gates, keep it as declared and raise it as an open question.

**Dependency consequence.** This is a single leg, so there is no upstream→downstream edge and no direct value edge. The network-provisioning leg depends on the program plan gate. Where the network-provisioning change gate sits relative to the leg is governed by `gate.network-change.position`, and no edge for it is drawn until the owner declares that row.

## Pipeline 1 objective: network-provisioning (single leg)

- Harvest lab switches ceos1 and ceos2 **read-only**: every interface's IPv4 addresses, and each switch's BGP configuration and running configuration, one switch per read. Service descriptor: `https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
- **Preconditions verified, 2026-11-10 (authoring run 20261110-0148)**: read from the Phase 0 harvest of this authoring pipeline (task "Harvest lab switch network state (interfaces, addresses, BGP)"). That harvest made read-only interface-address, BGP-configuration, BGP-neighbour and running-configuration reads against each lab switch through the descriptor's service. It confirmed four properties:
  - both lab switches answer and return interface and BGP state;
  - ceos2 runs a BGP process with an established session;
  - at least one /32 inside 10.99.0.0/24 is used by neither lab switch;
  - existing telemetry-exporter loopbacks carry a common interface description that marks their class.

  This document deliberately states neither the addresses in use nor a selected /32. Both are live state, which the leg reads and derives at run time.
- **Definition, binding on every clause below.** A /32 is **used** by a lab switch when it lies inside any IPv4 prefix configured on any interface of that switch, or inside any prefix that switch originates in BGP. This is containment, not equality with an interface's address (`network-provisioning.population`).
- **The work**, on ceos2 only (`network-provisioning.target`):
  - Add exactly one loopback interface carrying the /32 this leg derives. Its name is governed by `network-provisioning.interface-name` and its description by `network-provisioning.class-marker`.
  - Have ceos2's BGP process advertise that /32 (`network-provisioning.item-3`), by the mechanism governed by `network-provisioning.advertisement-method`.
  - While any of these three rows is OPEN, the leg's instruction for that part is a gap report naming the row id, and it authors nothing for that part.
- **The derivation:**
  - **Input block.** From this leg's own harvest of BOTH lab switches, the set of IPv4 prefixes that overlap 10.99.0.0/24 and are used by either switch (`network-provisioning.population`).
  - **Candidate set.** Every /32 inside 10.99.0.0/24 that overlaps no prefix in the input block, with the pool's first and last addresses included or excluded per `network-provisioning.pool-edges`.
  - **Result.** One /32 (`network-provisioning.representation`), chosen from the candidate set by the rule declared in `network-provisioning.selection`.
  - While `network-provisioning.selection` or `network-provisioning.pool-edges` is OPEN, the leg's instruction for the derivation is a gap report naming the OPEN row id(s), and no /32 is published.
- **If the harvest returns no lab-switch interface or BGP state** (either switch unreadable, or a read returns empty): apply `network-provisioning.inputs-empty` (gap). The gap report names which switch and which read returned nothing, and states that a readable harvest of both switches must exist. Never a substitute value, and never a selection from one switch's state alone. A readable harvest in which no used prefix overlaps the pool is NOT this case: it is a valid input block with no members.
- **If the candidate set is empty** (every /32 in the pool is used): apply `network-provisioning.population` (gap). The gap report names the pool and the candidates excluded. Never an address outside 10.99.0.0/24, and never a /32 that either switch uses.
- **Existence assumption** (*Writing rules* #6). The leg's own harvest decides each branch:
  - If ceos2 already has an interface of the name `network-provisioning.interface-name` selects, apply that row's rule to pick a name that does not collide.
  - If ceos2's BGP process is absent from the harvest, apply `network-provisioning.inputs-empty` (gap).
  - This document does not state which branch is true today.
- **The deliverable MUST publish, explicitly and prominently**:
  1. the input block, meaning the used prefixes overlapping the pool exactly as this leg's own harvest of both switches returned them;
  2. the /32 selected by the network-provisioning leg under `network-provisioning.selection` and `network-provisioning.pool-edges`;
  3. the output of the validation command below;
  4. the apply order (loopback first, then advertisement) and a rollback plan that removes exactly the added loopback and its advertisement.

  These are named by their rule and their producer, never by a value read while this document was authored.
- **Validation (mechanical, before apply)**:
  - Re-read each lab switch's interface addresses and BGP origination through the descriptor's service. Write every overlapping prefix to `used-prefixes.json` as a JSON array of prefix strings.
  - Run `python3 check-derivation.py used-prefixes.json <the published /32>`. The change package must ship this file complete and runnable.
  - The script must:
    1. recompute the candidate set and the selection from `used-prefixes.json` using the rules declared in `network-provisioning.selection` and `network-provisioning.pool-edges`;
    2. confirm that the published /32 has prefix length 32, lies inside 10.99.0.0/24, overlaps no prefix in `used-prefixes.json`, and equals the recomputed selection;
    3. confirm that `used-prefixes.json` equals the input block the deliverable published.
  - Expected stdout, exactly: `PASS`.
  - The expected output is never a list of input literals or a count of them.
- **Validation (mechanical, after the human applies the package out-of-band)**. Each check is bound to the published /32 (written `<P>`) and to an operator-captured pre-change baseline. These states cannot be witnessed before the run because `<P>` is selected at run time from live state and the change does not exist until a person applies the approved package. The literal expectations are therefore derived from the published value and the baseline, never fabricated here.
  - **P1 (ceos2):** `show ip interface <new loopback> | json`. Expected: `interfaces.<new loopback>.interfaceAddress.primaryIp` equals `{"address": "<P address>", "maskLen": 32}`.
  - **P2 (ceos2):** Capture `show ip bgp neighbors <ceos1 peer address> advertised-routes` before and after the change, extract prefixes with `grep -oE '[0-9.]+/[0-9]+' | sort`, and save them as `pre.txt` and `post.txt`. Then `comm -13 pre.txt post.txt` prints exactly `<P>/32`, and `comm -23 pre.txt post.txt` prints nothing.
  - **P3 (ceos1):** `show ip route <P>`. Expected: exactly one entry for `<P>/32`, of BGP-external type, whose next hop is ceos2's address on the ceos1–ceos2 link as read in the leg's own harvest.
  - **P4 (ceos2):** `show interfaces <new loopback> description`. Expected: the description `network-provisioning.class-marker` declares. This check is omitted only if that row is declared `no-marker`.
  - **P5 (both):** Diff the pre-change and post-change `show running-config` of each switch. On ceos1 the diff is empty. On ceos2 the diff contains only the new loopback stanza and the advertisement lines that `network-provisioning.advertisement-method` produces.

### ⚠️ If this leg DERIVES a value the downstream leg consumes

This leg derives the /32 that its own change package consumes. No other leg consumes it. Every clause applies.

- **The computation is shown in the DESIGN.** The deliverable carries the input block and the result block, plus
  re-runnable checks each followed by the literal text it prints — never a sentence stating the conclusion.
- **Minimality, or the equivalent tightest-correct property.** A result looser than the minimum is a
  **REJECTABLE defect even when it violates nothing else**, because it authorizes/permits more than
  the requirement needs. Here the tightest correct form is a /32. A shorter prefix on the new loopback, or in its advertisement, is a rejectable defect.
  *Earned: Run 15 shipped a `/30` where `/31` was minimal — mechanically clean, and a REJECT.*
- **Re-selection FIRST, escalation LAST.** If a candidate fails, that rules out *that candidate* —
  not the whole pool. Select another and recompute. Escalate only after establishing that no valid
  option exists **anywhere** in 10.99.0.0/24, and name which candidates you tested. *"Impossible" concluded from a
  handful of candidates is a **defect, not an escalation*** — it blocks the downstream leg on a false
  premise.
  *Earned: Run 12 declared the pool too fragmented while a clean pair was free the whole time.*
- ⚠️ **Verify by arithmetic, never by eyeballing.** For a /32 drawn from a pool, a host is used when it lies INSIDE any configured or originated prefix, not only when it equals an interface's address. Synthetic example: an interface carrying `192.0.2.5/30` makes `192.0.2.4` through `192.0.2.7` used, so `192.0.2.6` is not free even though no interface is addressed `.6`. Test overlap with prefix arithmetic, not string matching.
  *Earned: Runs 5 and 6 lost on this directly; Run 12 compounded it.*
- **Verify member-by-member** before publishing: the selected /32 is inside 10.99.0.0/24, and no prefix in the input block overlaps it.
- ⚠️ **Verify the PREMISE before you write the objective — reachability is not sufficiency.** An
  objective naming inputs the target does not hold is unsatisfiable, and the leg will either escalate
  (correct) or find a value somewhere (plausible and wrong). Probing that the service ANSWERS proves
  it is alive, not that it holds what you are about to ask about. Read a harvest — a fresh one or a
  prior run's — before writing the derivation clause.
  *Earned: 2026-09-20 — an objective asked for a cover over harvested private subnet CIDRs in a
  workspace holding two resources and no subnets. All three endpoints had been probed and answered.*
- 🔴 **STATE THE NULL CASE, always.** This leg's null outcomes are stated above: `network-provisioning.inputs-empty` for an unreadable or empty harvest, and `network-provisioning.population` for an exhausted pool. Each produces a gap report and authors nothing.
  *Earned: 2026-09-20 — the Design correctly declined to derive from an empty harvest, and the Author,
  holding a brief that demanded the block, imported a range from an unrelated pipeline and authored a
  policy permitting writes from switch loopback addresses. Its reviewer graded the import a
  non-blocking observation and approved at 92; the harness gate escalated and refused to release.
  Re-run with the null case stated, it produced a correct gap report on the first attempt.*
- 🔴 **RUN YOUR OWN RULE. A stated derivation rule and the value it publishes are two artifacts, and
  nothing else checks they agree.** Apply the rule you wrote, literally and step by step, to one
  input, and confirm it produces the value you published, including the WIDTH of the result (/32). Work this on a synthetic input in the deliverable before publishing. Every
  other instruction here verifies the VALUE; this one verifies the RULE.
  *Earned 2026-09-21: an authoring pass wrote "zero-pad each octet to 4 hex digits and concatenate",
  which yields 16 hex digits, and published a well-formed 12-digit identifier — one group shorter
  than its own rule produces. The published value was correct; the stated method could not have
  produced it.*
- 🔴 **The machine check is a FLOOR, not the bar.** A clean mechanical result is **not** evidence your
  derivation is correct — the checker verifies containment, not that you met the requirement.
  **Satisfy the requirements; do not target the checker.**

### Device sources: a network leg only

- **Device sources** (row `network-provisioning.sources`, OPEN): no block until the owner declares this leg's sources.

## Design constraints: split across the contract and the DAG

**Static → the interface contract** (declared, agreed before the leg runs):
- Exporter pool: 10.99.0.0/24 (declared, item 2)
- Prefix length of the new loopback address: /32 (declared, item 2)
- Device changed: lab switch ceos2 only (declared, item 1)
- Devices whose use of the pool is read: both lab switches (declared, items 2 and 4)

**Runtime → the DAG edge**:
- none. The selected /32 is derived and consumed inside the single network-provisioning leg and crosses no leg boundary.

## Acceptance

- Each change package must include deterministic validation with expected outputs (per *Writing rules*
  #1 and #2) and a rollback plan.
- **Apply is out-of-band and human-gated in every domain.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. In the change package, the address configured on the new ceos2 loopback and the prefix that ceos2's BGP process advertises are both exactly the /32 the network-provisioning leg published. They come from the same value, which is not re-derived anywhere else in the package.
2. The published /32 lies inside 10.99.0.0/24, and overlaps no prefix in the input block the leg published from its own harvest of both lab switches.
2b. The published value has prefix length 32. Recompute it from the published input block, using the rules declared in `network-provisioning.selection` and `network-provisioning.pool-edges`, and confirm the recomputation equals the published value. Do not take the stated value on trust.
3. The change package adds exactly one loopback interface and its advertisement on ceos2, and nothing else. It makes no change on ceos1 and no change to any existing interface, address, BGP neighbour, policy or advertisement on ceos2. No mechanism is added that advertises any prefix other than the published /32.
4. **Chaining coverage.** The program gate computes chaining coverage mechanically. Node C does not re-derive it and does not block for being unable to read it. Node C checks what its own chained context shows: the single network-provisioning leg appears as a predecessor carrying its real deliverable, not an output marked as a fallback, and not missing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or substituting
  one **silently deletes it**. If a new requirement needs a number, it **APPENDS** (5, 6, ...).
  *Earned: Run 15 (2026-07-29) — a new clause was added to this file and the reviewer renumbered it
  into slot **2b**, the minimality check, which it then never performed. A non-minimal result shipped
  as a result. This is the single most expensive defect this template prevents.*

- These checks are **properties, not hardcoded values**. They stay valid when the environment is
  rebuilt. That is deliberate: the round must not depend on a magic expected string.

- ⚠️ **Require evidence where its READER looks, not only where it is convenient to write.** The
  integration reviewer's chained context is the LEG deliverable. The input block, the selected /32, the `check-derivation.py` output and the apply order are therefore required IN the network-provisioning leg's deliverable, as stated under its objective.
  *Earned: FW-A3.3 — Node C correctly rejected because the apply order appeared only in the
  producer's deliverable, which its leg-scoped context could not see (VT-18).*

## Open questions

- **Pool reservations outside the lab switches (named gap).** Item 2 defines a free /32 only as one "that neither lab switch uses". A harvest of the switches cannot prove that no other holder (an address-management record, a collector, another device) has reserved an address inside 10.99.0.0/24. As written, the program treats any /32 that neither switch uses as available. If reservations exist outside the switches, the owner must declare them.
- **Item numbering of record (named gap).** Every `(declared — item N: …)` citation in this document uses the numbering of the objective's declared blocks exactly as it reached the author: item 1 "add one more telemetry-exporter loopback on lab switch ceos2 only", item 2 "on a /32 in the exporter pool 10.99.0.0/24 that neither lab switch uses", item 3 "and advertise it in BGP", item 4 "One system is involved: the lab switches". If the objective of record does not number these four items this way, or carries them unnumbered, every citation must be re-matched to it. Until then, each declared row is unconfirmed against the objective of record.

## Writing rules — read before authoring, they are the expensive part

<!-- WRITING-RULES -->

Confidence: 84/100
