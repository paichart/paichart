# Program Requirements
- POV: Autonomous Delivery Use Cases
- Phase: IGP Migration (OSPF → IS-IS)
- Iteration: IGP-T1 R19 (TRIANGLE — four migration phases, **SEQUENCED**, gate + apply + re-harvest loop) · 2026-08-30
- Topology: **3 nodes, 3 links — the full triangle, UNSHELVED**: it now runs on the dedicated
  bare-metal lab host (kernel 6.8.0-138 native, the AaaWarmup-safe requirement, memory ample). This
  round carries everything the 2-node rounds (R7–R18, R18 green) earned, PLUS the property they
  honestly could not exercise: **path-preference preservation across an alternate path**.

> **What this program is.** Migrate the IGP of a live 3-node triangle brownfield network (OSPF area 0) to
> IS-IS with zero routing disruption, ships-in-the-night. The program produces **one
> approved-but-unapplied change package per phase**; a human applies each package out-of-band at a
> gate, and the next phase **re-harvests the applied live state** before designing. The platform
> never writes to a device. Legs are migration PHASES, not devices — every leg spans ALL THREE switches.

---

## Writing rules — read before authoring, they are the expensive part

These govern how you write **every other section**. All were earned by a failed or false-passing run.

1. ⚠️ **"Deterministic validation" means a reviewer can run it and compare, without judgement.**
   Every validation step is an **exact command** plus its **exact expected output** — the literal text
   or count you expect back. Prose like *"verify the adjacency is up"* or *"confirm parity"* is a
   **REJECTABLE defect**, not a validation step: two reviewers could disagree on whether it passed.
   *Earned: Run 13's network leg was blocked for exactly this.*

2. ⚠️ **Ship every artefact your validation cites.** If a step invokes a rule file, fixture, or
   comparison baseline, the change package must include its **complete, runnable contents**. Citing a
   check you did not ship is unrunnable, so it is not validation.
   *Earned: Run 10 was blocked for naming checks without shipping the rule files.*

3. 🔴 **State what must be TRUE. Do NOT name the measure that reports it.** Where a requirement can be
   written as a **property**, write the property — not the stamp shape, not the reason code, not the
   violation class. Every agent reads this file, so a machine pass-condition written here becomes **a
   target an agent can aim at instead of the requirement**. Let the platform own the string.
   *Earned: Run 15 — a leg met a published pass condition weaker than the requirement beside it, and
   shipped a defect.*

4. ⚠️ **Expected values stated in this document are reference data, NEVER evidence.** A tier must
   retrieve the **actual** value and construct its own finding. *Earned: Run 15 — Node C asserted a
   field's expected value, quoting the requirements, for a field absent from the artifact entirely.*

5. **Write properties, not hardcoded values**, wherever the environment can be rebuilt. The lab is
   disposable and redeployable; a magic expected string makes the round fail for the wrong reason.

6. ⚠️ **State every existence assumption a leg's objective rests on.** If a target may be ABSENT from
   harvested state, say so and name the expected shape. An unstated existence assumption is resolved
   by the design at runtime as an ambiguity — it costs retry generations, or worse, a guessed
   reconciliation. *Earned: FW-A3.2/A3.3 retried on exactly this; FW-A3.5 stated it and ran clean
   first-pass (VT-18).* → This program's assumptions are in **Existence assumptions** below.

7. ⚠️ **A constraint that exists only by convention does not exist for the agents.** If a value is
   forbidden or mandated by operating convention but invisible in harvested facts, write the
   constraint or accept the result. *Earned: FW-A3.3 selected a convention-violating value invisible
   to every tier because the convention was written nowhere (VT-18).* → This program's conventions
   are in **Design constraints** below.

---

## Program scope

- **4** delivery domains — the four migration phases — executed **IN SEQUENCE**, every phase
  spanning ALL THREE switches of the triangle topology described in `topology.json`:
  1. **P1 — IS-IS coexistence deploy** (UPSTREAM): change package adding IS-IS alongside OSPF,
     ships-in-the-night; OSPF untouched.
  2. **P2 — parity verification** (evidence leg): harvests LIVE post-P1 state; deliverable is a
     parity REPORT (IS-IS adjacency and route-set vs OSPF), not a config change.
  3. **P3 — preference shift**: change package flipping route preference to IS-IS,
     single-knob-reversible.
  4. **P4 — OSPF removal**: change package removing OSPF, with the harvested OSPF configuration
     embedded verbatim as the rollback.
- Applying any change to any device is **out of scope** — apply is out-of-band and human-gated at
  every gate. The management plane (eAPI, credentials, Management0) and everything not part of the
  IGP are explicitly **out of scope**: no interface renumbering, no new links, no BGP (none exists
  on this network).

## Why this is sequenced — the design rationale, read before questioning the DAG

**The test**: is every value a downstream phase needs knowable before the upstream phase runs?

**No — and not because a value is derived, but because the world changes between legs.** Each gate
is a real out-of-band human apply to live devices. Phase N+1 must design against the **applied live
state** of phase N — whether the IS-IS adjacencies actually formed, what the live route table
actually contains, whether the preference flip actually took — and that state does not exist until
the operator applies phase N's package. The Program Architect (which reads only `topology.json` +
this file, with **no live state access**) structurally cannot know it, and no interface contract can
carry it, because it is created *during* the program by hands outside the platform. The DAG edge
carries each leg's report (intent + declared applied values); **the re-harvest carries the truth**,
and the two must be compared, not conflated.

What IS knowable up front — the target design constants (level design, NET convention, metric
style, preference policy) — belongs in the **interface contract**, derived by the Program Architect
in the plan. See *Design constraints*.

## Approvals — one gate per phase, plus the program plan gate

Team provisioned for this POV:
- Network lead / migration approver is Steve Terry steveterry66@gmail.com

- The **migration design (the plan)** requires approval before any phase may run.
- **G1** (after P1): the approver applies P1's package and confirms coexistence before P2 may run.
- **G2** (after P2): the approver accepts the parity evidence before P3 may run.
- **G3** (after P3): the approver applies P3's package and confirms IS-IS carries traffic before P4
  may run.
- **Final gate** (after P4): the approver applies P4's package; the program completes on that
  confirmation.
- Each phase waits on **BOTH** its own gate **AND** the previous pipeline (the DAG edge).

## The interface contract — what the plan must derive (static, knowable up front)

The Program Architect derives these in the plan and they bind every leg:

- `targetProtocol`: IS-IS, **flat Level-2-only** (single area 0.0.0.0 maps to one L2 domain), one
  IS-IS instance with an **identical instance identifier on all three devices**.
- `nets`: one NET per device in area `49.0001`, **system-ID derived from that device's router-id by
  the standard BCD packing**. Show the derivation per device (see the derivation clauses below).
- `metricStyle`: wide. Per-interface IS-IS metrics translated from the harvested OSPF interface
  costs such that **the harvested cost relationship is carried forward exactly** (see check 2b).
  ⚠️ **Scope note — this topology EXERCISES the property the 2-node rounds could not:** the
  triangle's unequal link costs make one destination reachable by two paths with a real preference
  between them (the topology's transit design: corner-to-corner traffic prefers the two-hop path
  through the transit node over the direct link). The stronger property is therefore IN SCOPE and
  REQUIRED: **every relative path preference OSPF expresses must be preserved by the translated
  IS-IS metrics** — not just per-interface faithfulness. A pass here may be reported as
  path-selection preservation; that is the point of this round.
- Preference policy: **while both protocols run, OSPF-learned routes must remain preferred on every
  device**; P3 flips preference to IS-IS via a **single, seconds-reversible knob**, and the rollback
  for P3 is flipping it back.
- `parityCriteria`: at G2, **every prefix OSPF advertises is present in each device's IS-IS
  link-state database, with a next-hop identical to the one OSPF resolves for it** — tolerance for
  missing or extra prefixes is **zero**. The IS-IS next-hop here is **derived** (see P2 below): a
  link-state database carries reachability and metric, not a resolved next-hop. Deriving it is
  correct and expected; presenting the derivation as a retrieved quote is not.
  ⚠️ **Why the criterion is stated against the link-state database and NOT against the routing
  table.** During coexistence this program deliberately keeps OSPF preferred, so IS-IS routes are
  computed but never INSTALLED — and a routing-table view lists installed routes only. A criterion
  phrased as "available via IS-IS in the RIB" is therefore unsatisfiable *precisely because the
  phase succeeded*: it reads empty on a perfectly healthy fabric. The property that actually matters
  — can IS-IS carry every prefix OSPF carries, to the same next-hop, the moment preference flips —
  is observable in the link-state database throughout coexistence. State the PROPERTY; do not name
  a measure the phase precludes.
  *Earned: IGP-T1 R9 — P2 harvested correctly, compared harvest-vs-harvest correctly, and reported
  parity FAILED for two prefixes whose reachability was demonstrably present in the IS-IS LSDB. The
  leg was right about what it measured; the criterion was measuring the wrong thing.*

### ⚠️ Derivation clauses — the NET and metric derivations are computations, show them

- **Show the computation** in the plan and restate it in each consuming package: inputs (router-id,
  OSPF cost), the arithmetic, the result.
- ⚠️ **Verify by arithmetic, never by eyeballing.** The BCD-packing trap: each router-id octet
  zero-pads to THREE digits **before** the twelve digits regroup into four-digit chunks —
  `10.0.0.1` packs as `010.000.000.001` → `0100.0000.0001`, NOT as its unpadded digits. Dropping
  leading zeros produces system-IDs that collide or mis-order. Recompute digit-by-digit.
- **Verify member-by-member** before publishing: every device has exactly one NET; every system-ID
  is unique; every interface in the topology has a translated metric.
- 🔴 **Any machine check is a FLOOR, not the bar.** A mechanically clean package is not evidence the
  derivation met the requirement. **Satisfy the requirements; do not target any checker.**
- ⚠️ **NETs and metrics are contract text, not machine-matched value kinds.** Restate applied
  contract values **plainly in the deliverable prose** of each leg; do not invent a machine-readable
  kind label for them — a coined kind has previously parked a correct program on a false mismatch.
  *Earned: Tasman Run 1.*

## Per-phase objectives

Every leg: harvest ALL THREE switches **read-only** via the service descriptor
`https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
— and **every leg's report must state, in that report, which phase it is, what the previous phase
was expected to have applied, and what its harvest actually showed about that** (the reader of leg
evidence is leg-scoped; a program-level statement is invisible to it — *earned: FW-A3.3, VT-18*).

- **P1 — coexistence deploy.** Per-device candidate config adding the IS-IS instance per the
  contract on every IGP interface (the point-to-point link + Loopback0, Loopback0 passive as it is under
  OSPF today). **OSPF configuration is not touched in any way**, and route preference must remain
  with OSPF per the contract's preference policy. Validation (per rule 1): exact commands + expected
  outputs proving IS-IS adjacency on the point-to-point link, and proving OSPF neighbor state is
  IDENTICAL to the pre-change harvest. Rollback: remove the IS-IS instance.
  **The OSPF-unchanged check has a known harvest gap and a required deterministic shape (added
  after R2, 2026-08-23): the read-only service cannot retrieve the OSPF adjacency table, and that
  does NOT license prose.** The validation must instead (a) assert, as literal fenced expected
  output, the STATIC fields of `show ip ospf neighbor` derivable from `topology.json` — every
  adjacency's Neighbor ID, state `FULL`, and interface, per device (dynamic fields such as dead
  time are excluded and named as excluded) — AND (b) mandate an operator-captured pre-change
  baseline of the same command with a post-change byte-diff of those static fields. Descriptive
  prose in place of either is a rejectable defect (rule 1). *Earned: IGP-T1 R2 — the author wrote
  prose for exactly this check and the reviewer correctly blocked the package.*
- **P2 — parity verification (evidence, not config).** Harvest live post-apply state; deliverable is
  a parity report: per device, the OSPF-advertised prefix set (with the next-hop OSPF resolves) vs
  the prefixes present in the IS-IS link-state database (with their IS-IS next-hop) — plus the
  adjacency roster vs the contract's expectation.
  ⚠️ **DERIVED VALUES MUST BE LABELLED DERIVED — this criterion requires one.** A link-state
  database carries reachability and metric entries keyed by system-ID; it does **not** carry a
  resolved next-hop, which is an SPF/topology product. So the IS-IS next-hop in this report is
  **derived, not retrieved**, and the report must say so and state the basis it was derived from.
  Writing it as retrieved output — or asserting blanket "every value is a direct quote from tool
  output" over a table that contains it — is a fabrication risk on the exact field this criterion
  turns on, and a reviewer is right to block for it.
  **The general rule, which applies to any protocol and any vendor:** where a criterion requires a
  value the evidence source does not directly carry, the value is still legitimate — DERIVE it, then
  label it derived and name what it was derived from. Never silently promote a derivation to a
  quotation. Do not "solve" this by dropping the field or by switching to a source that happens to
  print the word: derive, disclose, and let the reviewer judge the derivation.
  *Earned: IGP-T1 R15 and R16 — both P2 legs presented an SPF-derived next-hop as a literal
  link-state-database quote. On a 2-node/1-link topology the derived value is trivially correct
  (one neighbour), which is exactly why it passed R15's reviewer unnoticed and why the claim was
  invisible: the answer was right, only its stated provenance was wrong. R16's reviewer caught it
  and blocked the leg. Note this requirement previously said "as retrieved output" here — the
  analyst was doing what it was told.* Do NOT build the comparison from
  installed-route views: while OSPF stays preferred, IS-IS routes do not install, so those views are
  empty BY DESIGN and prove nothing either way (see `parityCriteria`). The report must
  compare **retrieved values against retrieved values** (harvest vs harvest), never against this
  document (rule 4). Any deviation from `parityCriteria` is stated as a finding with the exact
  retrieved evidence; a deviation means the correct outcome for the leg is to surface it, not to
  design around it.
- **P3 — preference shift.** Change package flipping preference to IS-IS via the contract's
  single-knob mechanism, identically on all three devices. Validation: exact commands + expected
  outputs proving the RIB's IGP routes are now IS-IS-sourced on each device, and that OSPF is still
  running (process up, neighbors full). Rollback: flip the knob back (seconds).
- **P4 — OSPF removal.** Change package removing the OSPF process from all three devices. **The
  rollback section must embed, verbatim, the OSPF configuration as harvested live by THIS leg** —
  re-adding it is the rollback, and a paraphrased or reconstructed rollback is a defect. Validation:
  exact commands + expected outputs proving OSPF is absent from running config, no OSPF routes in
  any RIB, and the IS-IS route set unchanged from the pre-removal harvest.

## Existence assumptions (rule 6 — state them so nobody guesses)

- At P1's harvest, **no IS-IS process exists on any device — CREATE is the expected outcome.**
- At P2+, the previous phase's applied state **is expected to be present** in the harvest. If it is
  absent, the gate's apply did not happen or did not take: the leg must surface that finding and
  stop; designing around a missing apply is a defect, not resourcefulness.
- At P4's harvest, OSPF is still present (removal is P4's own subject); the preference flip from P3
  is expected to be live.

## Design constraints — conventions made explicit (rule 7)

- **Platform dialect (added after R1, 2026-08-23): every candidate config line must be valid
  Arista EOS syntax for the platform in `topology.json` — the operator applies packages verbatim in
  an EOS config session, and a rejected token archives the round.** Because IS-IS is ABSENT from
  the harvested state, there are no live stanzas to imitate; the following EOS facts are reference
  data (rule 4 — state them in the package, do not treat restating them as a check):
  - EOS expresses level-2-only as `is-type level-2` (there is no `level-2-only` token).
  - EOS IS-IS uses wide metrics unconditionally — there is NO `metric-style` command; the
    contract's "wide" property is a platform default the package should STATE, not configure.
  - IS-IS passive is INTERFACE-level (`isis passive` under the interface) — there is no
    router-level `passive-interface` command under `router isis`.
  *Earned: IGP-T1 R1 — a package carried IOS-isms, the leg reviewer approved it, and the
  operator's config-session entry rejected them; the round was archived at G1. R3 re-emitted
  `metric-style wide` and router-level `passive-interface` despite the negative rules above —
  hence the exemplar below.*
- **Canonical EOS stanza shape (every line verified accepted in a live EOS 4.32.2.1F config
  session): TRANSCRIBE this shape, substituting only the bracketed values.**

  ```
  router isis <instance>
     net <NET>
     is-type level-2
     !
     address-family ipv4 unicast
  !
  interface <Ethernet-interface>
     isis enable <instance>
     isis network point-to-point
     isis metric <value>
  !
  interface Loopback0
     isis enable <instance>
     isis passive
  ```

  The strings `metric-style`, `passive-interface` (under router isis), and `level-2-only` must not
  appear anywhere in a candidate config.
- **The preference knob's canonical EOS shape (added after R4, 2026-08-23; live-verified accepted
  AND cleanly reversible in an EOS 4.32.2.1F config session): administrative distance for IS-IS is
  configured under the ADDRESS-FAMILY context, not at the `router isis` top level — `distance
  <value>` directly under `router isis <instance>` is INVALID input on this platform.** The
  verified shape (renders as a `level-1`/`level-2` pair; `no distance <value>` reverts to the
  115 default):

  ```
  router isis <instance>
     address-family ipv4 unicast
        distance <value>
  ```

  *Earned: IGP-T1 R4 — three successive plans placed the P3 knob at the top level, where the
  platform rejects it; caught by an operator probe at the plan gate, before any leg ran.*
- NET area is `49.0001` on all devices (private AFI 49, single area — operating convention).
- The IS-IS instance identifier is identical on all three devices (convention; any consistent value).
- Loopback0 remains passive under IS-IS, as it is under OSPF (convention carried over).
- No phase may change interface addressing, descriptions, or the management plane.

## Reviewer view-layer note (added after R5, 2026-08-23)

A `[NEUTRALIZED-…]` marker appearing in a reviewer's chained view of a package is a platform
view-layer annotation applied at the chaining boundary — it is NOT evidence the marker exists in
the document at rest (this domain's prose legitimately opens paragraphs with "System ID…", which
the platform's injection screen can annotate in transit). Report such a marker as an observation
naming its location; do not treat it as a blocking document defect. At-rest document hygiene is
verified by the program tier and the human operator from the stored artifact.
*Earned: IGP-T1 R5 — a clean package was blocked for a marker that existed only in the reviewer's
view.*

## Acceptance

- Each change package (P1, P3, P4) includes deterministic validation with expected outputs (rules
  1–2) and a rollback plan; P2's deliverable is the parity evidence itself.
- **Apply is out-of-band and human-gated in every phase.** This program produces approved change
  packages only — never applied changes.

### Program integration reviewer (Node C) verifies, from structured facts:

1. every leg's applied contract values — NETs, per-interface metrics, the preference mechanism —
   **exactly equal what the approved plan's interface contract stamped** (retrieved from the leg
   deliverables and compared, not assumed);
2. each NET is well-formed for area `49.0001` and its system-ID is **exactly the BCD packing of that
   device's router-id** — recomputed digit-by-digit, not taken on trust;
2b. **recompute the metric translation** from the per-interface metrics in the packages against the
   harvested OSPF costs: each interface's IS-IS metric must carry its harvested OSPF cost forward
   under the contract's stated rule. Do not take stated costs on trust. ⚠️ This check is DELIBERATELY
   NARROWER than its 3-node form (which recomputed a path-cost table and required every relative path
   ordering to hold): a two-device single-link topology expresses no path choice. The check number is
   retained per the fixed-numbering rule; the WEAKER property is what a pass here evidences;
3. **no-collision, no-widening**: all system-IDs unique; each phase touches ONLY its phase's scope —
   P1 leaves OSPF and preference untouched, P3 touches preference only, P4's rollback embeds the
   live-harvested OSPF config verbatim;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — each downstream leg received its upstream leg's **real** deliverable, not a
   fallback and not nothing.
5. **path-preference preservation (TRIANGLE round, appended per the numbering rule)**: for every
   (device, remote-loopback) pair, the next-hop the IS-IS design would install **equals the
   next-hop OSPF resolves for that pair in the same harvest** — recomputed from the packages'
   per-interface metrics via SPF over the topology, not taken from any stated table. The transit
   pairs (a corner reaching the far corner via the transit node rather than the direct link) are
   the load-bearing instances: equality there proves relative path preference survived the
   translation; a divergence on ANY pair is a blocking finding, whatever the per-interface
   metrics say (a set of individually faithful metrics can still invert a path preference —
   that inversion is exactly what this check exists to catch). Rule 13 applies: the IS-IS
   next-hops here are DERIVED values and must be labelled as such with their derivation shown.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or
  substituting one **silently deletes it**. If a new requirement needs a number, it **APPENDS**
  (5, 6, …). *Earned: Run 15 — a renumbering deleted the minimality check and a non-minimal result
  shipped as approved.*

- These checks are **properties, not hardcoded values** — they stay valid when the lab is rebuilt.

- ⚠️ **Require evidence where its READER looks.** The per-leg phase-discipline statement mandated in
  *Per-phase objectives* exists because Node C's chained context is the LEG deliverables; anything
  stated only at program level is invisible to it. *Earned: FW-A3.3 (VT-18).*
