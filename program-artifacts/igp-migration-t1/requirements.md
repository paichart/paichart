# Program Requirements
- POV: Autonomous Delivery Use Cases
- Phase: IGP Migration (OSPF → IS-IS)
- Iteration: IGP-T1 (four migration phases, **SEQUENCED**, gate + apply + re-harvest loop) · 2026-08-23

> **What this program is.** Migrate the IGP of a live 3-node brownfield network (OSPF area 0) to
> IS-IS with zero routing disruption, ships-in-the-night. The program produces **one
> approved-but-unapplied change package per phase**; a human applies each package out-of-band at a
> gate, and the next phase **re-harvests the applied live state** before designing. The platform
> never writes to a device. Legs are migration PHASES, not devices — every leg spans all three
> switches.

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
  spanning all three switches of the triangle described in `topology.json`:
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
  costs such that **every relative path preference OSPF expresses is preserved under IS-IS** —
  including which path the triangle's off-mesh device pair transits (see check 2b).
- Preference policy: **while both protocols run, OSPF-learned routes must remain preferred on every
  device**; P3 flips preference to IS-IS via a **single, seconds-reversible knob**, and the rollback
  for P3 is flipping it back.
- `parityCriteria`: at G2, **every OSPF-learned prefix on every device is also available via IS-IS
  with a next-hop identical to OSPF's** — tolerance for missing or extra prefixes is **zero**.

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

Every leg: harvest all three switches **read-only** via the service descriptor
`https://raw.githubusercontent.com/paichart/paichart/main/descriptors/ceos-lab-readonly-descriptor.json`
— and **every leg's report must state, in that report, which phase it is, what the previous phase
was expected to have applied, and what its harvest actually showed about that** (the reader of leg
evidence is leg-scoped; a program-level statement is invisible to it — *earned: FW-A3.3, VT-18*).

- **P1 — coexistence deploy.** Per-device candidate config adding the IS-IS instance per the
  contract on every IGP interface (the triangle links + Loopback0, Loopback0 passive as it is under
  OSPF today). **OSPF configuration is not touched in any way**, and route preference must remain
  with OSPF per the contract's preference policy. Validation (per rule 1): exact commands + expected
  outputs proving IS-IS adjacency on each triangle link, and proving OSPF neighbor state is
  IDENTICAL to the pre-change harvest. Rollback: remove the IS-IS instance.
- **P2 — parity verification (evidence, not config).** Harvest live post-apply state; deliverable is
  a parity report: per device, the OSPF route set vs the IS-IS-available route set with next-hops,
  as retrieved output — plus the adjacency roster vs the contract's expectation. The report must
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
  *Earned: IGP-T1 R1 — a package carried both IOS-isms, the leg reviewer approved it, and the
  operator's config-session entry rejected both; the round was archived at G1.*
- NET area is `49.0001` on all devices (private AFI 49, single area — operating convention).
- The IS-IS instance identifier is identical on all three devices (convention; any consistent value).
- Loopback0 remains passive under IS-IS, as it is under OSPF (convention carried over).
- No phase may change interface addressing, descriptions, or the management plane.

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
2b. **recompute the path-cost table** from the per-interface metrics in the packages: every relative
   path ordering OSPF expresses in the harvested baseline — including which pair transits the middle
   node — must hold under the IS-IS metrics. Do not take stated costs on trust;
3. **no-collision, no-widening**: all system-IDs unique; each phase touches ONLY its phase's scope —
   P1 leaves OSPF and preference untouched, P3 touches preference only, P4's rollback embeds the
   live-harvested OSPF config verbatim;
4. **chaining coverage**: `predecessors === chainCapablePredecessors`, `degradedPredecessors === 0`,
   `notChained []` — each downstream leg received its upstream leg's **real** deliverable, not a
   fallback and not nothing.

- 🔴 ⚠️ **THE CHECK NUMBERS ABOVE ARE FIXED. A NEW CLAUSE MAY NOT TAKE ONE.** They are referenced by
  number from elsewhere in this document and from the protocol; renumbering, merging, or
  substituting one **silently deletes it**. If a new requirement needs a number, it **APPENDS**
  (5, 6, …). *Earned: Run 15 — a renumbering deleted the minimality check and a non-minimal result
  shipped as approved.*

- These checks are **properties, not hardcoded values** — they stay valid when the lab is rebuilt.

- ⚠️ **Require evidence where its READER looks.** The per-leg phase-discipline statement mandated in
  *Per-phase objectives* exists because Node C's chained context is the LEG deliverables; anything
  stated only at program level is invisible to it. *Earned: FW-A3.3 (VT-18).*
