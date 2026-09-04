# Program Operator Gate Playbook — running the human side of a gated program

> **What this is**: the choreography for the HUMAN/operator half of a `pov-program` run — what to do
> at a plan gate, at a package gate, and at an apply gate. Earned across two campaigns (FW-A3, five
> rounds; IGP-T1, nine) where **every defect that reached a device-facing decision was caught by an
> operator step, not by an agent tier**. Companions: `PROGRAM-HARNESS-USER-GUIDE.md` (mechanics),
> `PROGRAM-RUN-FORENSICS-GUIDE.md` (reading a finished run).
>
> Read this if you are the person completing gate tasks. It is deliberately about *what you do*, not
> about how the harness works.

## The one-line principle

**A gate is not a rubber stamp on an agent's verdict — it is an independent evidence step.** Across
9 IGP rounds, leg reviewers approved two packages (90/100, zero blocking issues) that were defective.
Both were caught at an operator gate. Treat every approval as a claim to verify, not a result to accept.

## Plan gate — it is an APPLY-SURFACE review

The plan gate is where platform reality is cheapest to check: nothing is built yet.

1. **Recompute every derived value yourself.** NETs, metrics, path costs, aggregates. Show the work.
2. **Probe every platform token the plan flags as unverified** — and any token that is new this round.
   Use a throwaway config session and ABORT it: zero device mutation, seconds of cost.
   ```
   configure session probe
   <the contract's canonical stanza, verbatim>
   end
   ! then: show session-config diffs   → every line accepted?
   !       abort                       → nothing changed
   ```
   *Earned: IGP-T1 R4 — a 10-second probe falsified the P3 preference knob (it sat at the wrong
   config level) and prevented a failure three applies deep. R9 — probed a new instance-identifier
   form and the OSPF administrative-distance premise the whole phase rested on.*
3. **Resolve, don't defer, the plan's open questions** where you are the deciding authority. An
   Architect that refuses to fabricate a value (good behaviour) hands you a decision — make it, and
   write the resolution into the gate comment so no leg has to guess.
4. **Do NOT write a prior round's specific defect into any text an agent reads** — see *Contaminating
   the experiment* below.

5. **Check the contract the LEGS hold, not the one the Architect wrote.** These are the same
   document only if nothing was re-run. Read `inputContext.interfaceContract` off an actual leg.

## A contract SHAPE defect cannot be repaired in place — archive the round

The interface contract is written into each leg at `task.create`, during PLAN-SPAWN, and it is
**frozen there for the life of the program** (CC7 is write-if-absent by design). This has a blunt
consequence that is easy to get wrong under momentum:

> **Re-running the Architect does not repair a round.** It produces a corrected contract that no
> already-created leg will ever receive.

So the operator decision at a blocked plan gate is a fork, not a judgement call:

| Defect is in… | Example | Disposition |
|---|---|---|
| the **shape** of the contract — a field absent, misnamed, or the wrong type | `platformDialect` missing, so dialect-lint has nothing to check | **ARCHIVE and relaunch.** The fix lands in the *successor's* PLAN-SPAWN. |
| the **content** of a field that is present and correctly shaped | a NET digit wrong, a metric miscomputed, an open question unresolved | Repairable in place — resolve it in the gate comment; the legs read the gate. |

The tell for a shape defect: the fix you need is to the **Architect's instructions**, not to a value.
Anything that changes what the Architect *emits* is by definition too late for legs that already exist.

*Earned twice. Predicted by the boundary-contract panel ("a mid-campaign fact promotion will NOT
reach already-created children — correct behaviour; just do not expect otherwise"), written into the
plan the same morning, and then violated the same day: IGP-T1 R14 was kept alive by re-running the
Architect, whose corrected contract (10 checkable stanza lines, 3 forbidden tokens) sat 35 minutes
newer than four legs that all still carried `platformDialect=false`. The round was archived at the
plan gate having touched no device. **A documented failure mode is not a defended one** — this table
exists because prose warning had already failed.*

**Relaunch cost is low and archive cost is high only in feelings.** An archived round costs one
Architect execution; a round run on an inert contract costs the whole round *and* produces evidence
you cannot trust, which is worse than no evidence.

## Package gate — check mechanically before you read charitably

1. **Run the mechanical check first**, before forming an opinion:
   `npm run check:package -- --package <pkg> --contract <contract> [--stanza <key>]`
   It reports two independent halves: banned tokens ABSENT, and canonical-stanza lines PRESENT.
   *Earned: IGP-T1 R7 — a package omitted one canonical line, was banned-token clean, and was
   approved 90/100. Absence-only checking runs in the opposite direction to that defect.*
2. **Read BOTH halves — they run in opposite directions and neither substitutes for the other.**
   ABSENCE asks *did something forbidden get in?*; PRESENCE asks *did something required fall out?*
   A package can be perfectly dialect-clean and fatally incomplete.
   *Earned: IGP-T1 R11 — absence returned 0 violations (correctly) while presence found two missing
   canonical lines. The missing line left IS-IS inactive; the leg reviewer approved at 86/100.*
   **Since 2026-08-25 the lint also runs in the ENGINE**, so a leg's `dialectLint` fact is stamped
   on its result before you ever reach the gate — read the fact first, then run `check:package` for
   anything you want to re-check by hand.
   **Know what it does NOT cover** and do those by eye: it is bounded entirely by the CONTRACT — it
   contributes no platform knowledge of its own, so a line absent from the exemplar is a line it can
   never require. The tool NAMES what it skipped (`checked:false` always carries a reason; a
   placeholder line whose literal prefix is too short is skipped and listed) — read those lines, do
   not skim past them. `blockKinds` tells you "0 violations because clean" apart from "0 violations
   because nothing was classified as config".
3. **The mechanical fact can be WRONG — read it against the leg's INTENT.** The check assumes a leg
   DEPLOYS the stanza. A *removal* leg legitimately contains none of it, and a package that correctly
   says "the IS-IS stanza is untouched by this change, not restated below" is doing the right thing —
   restating it would risk drift.
   *Earned: IGP-T1 R12 — the PRESENCE half reported EIGHT missing canonical lines on the OSPF-removal
   leg. The leg reviewer approved it, correctly, at 90. The prose judgement was right and the
   mechanical check was wrong.* So "mechanical beats prose" is a tendency in this domain, **not a
   law**: a checker with no notion of intent produces confident false blocks, which is the same
   naive-comparator mistake the corpus-measure rule exists to prevent.
   Also treat a *presence* count as evidence, not proof: a placeholder needle degrades to its literal
   prefix, and a short prefix over-matches (R12: the needle from `net <NET>` matched OSPF
   `network 1.1.1.1/32 area 0.0.0.0`, reporting four NETs in a package containing none).

4. **Sanity-check that the PRESENCE half measured anything at all.** It derives required lines by
   splitting the contract's stanza, and the Architect's output SHAPE is non-deterministic across
   rounds — newline-separated one round, one line with ` / ` separators the next. A stanza that does
   not decompose yields ONE needle matching almost any package, i.e. a confident clean pass over
   nothing. Read `separators` and `skipped` in the fact, and ask whether the number of required lines
   is *plausible for this stanza*.
   *Earned: IGP-T1 R12 — caught pre-gate. One needle (`router isis`) from a thirteen-line stanza,
   reported as `stanzasConsidered:1, needles:1, skipped:[]`, which reads exactly like success. A
   `stanza-not-decomposable` skip is now emitted, but eyeball the count anyway.*

5. **A table that equates two DIFFERENT measures is never cosmetic — flag it even when the underlying
   property holds.** Downstream legs consume the NUMBER, not the property.
   *Earned: IGP-T1 R12 — a parity table marked OSPF total path cost (20) as matching IS-IS per-link
   metric (10). The property did hold on the contract's real criterion, so it looked harmless. The
   next leg inherited the wrong figure and wrote a validation step expecting `[90/10]`; the leg after
   that harvested `[90/20]`. The program-tier reviewer blocked release on it and was right.*

6. **Read the validation steps as an operator who will run them.** Ask of each: *can this pass, given
   what this phase is required to do?*
   *Earned: IGP-T1 R9 — a step required IS-IS routes to appear in the RIB while the same phase
   required OSPF to stay preferred, which guarantees they never install. The step contradicted the
   phase it validated.*

## Apply gate — the discipline that keeps applies honest

1. **Capture the pre-change baseline first**, exactly as the package's diff steps require. No baseline,
   no byte-diff, no proof.
2. **Apply the package VERBATIM.** Never patch it while applying. If a line is wrong, that is a gate
   finding and the package gets re-authored — the applied change must stay byte-provenant to the
   reviewed document, or the run's whole claim collapses.
3. **Use a config session and review the diff BEFORE commit.** The diff must contain only package
   lines. `abort` costs nothing.
4. **Run the package's own validation — and read each step's SHAPE before judging it.** Since
   network-provisioning v1.9.0 a step may legitimately take one of three shapes, and only the first
   has a literal to compare against. Judging all three by "match the expected text" is how a correct
   change gets reverted.

   | Step shape | How it passes | How it fails |
   |---|---|---|
   | **Literal** (carries a fenced expected output) | the named STATIC fields match | a named static field differs |
   | **Comparison / byte-diff** (pre-change baseline + post-change diff) | the named fields are unchanged (or changed as the step states) | a NAMED field moved; volatile fields differing is NOT a failure |
   | **Presence assertion** (no literal, because nothing has ever rendered this) | the named fields are PRESENT with the stated values | a named field is absent or contradicts |

   A step with no literal is **not** a defective step — for a feature that has never existed on the
   device there is nothing to quote, and the package is required to say so rather than predict.

5. **🔴 TIERED DISPOSITION — a rendering mismatch is a FINDING, not a rollback.** This is the rule
   that most needs stating, because the obvious one is wrong:

   - **State/property assertion fails** (adjacency not up, route absent, protocol inactive) ⇒ the
     change did not do what it claimed ⇒ **roll back** per the package's rollback block.
   - **Identity, formatting or column mismatch, with the state assertions passing** ⇒ **FINDING, and
     HOLD.** Record it, do not roll back, escalate for a package fix.

   ⚠️ **An unnecessary rollback is itself a risk event.** Reverting a live IGP migration causes route
   churn, a second convergence and a second maintenance window. The binary "mismatch ⇒ roll back"
   rule treated rollback as the safe default; on this class of change it is not. Under this tiering
   all three of R12's rendering mismatches become findings, **zero rollbacks**, and the migration
   proceeds — which was the correct field outcome, and the one an experienced operator took anyway.

6. **⏱ GIVE IT TIME — check on a WINDOW, not a single shot.** A protocol needs seconds to converge,
   and some fields are only correct *after* it does. Re-check at intervals before declaring failure;
   a step should state its own wait, and absent one, allow ~90s with re-checks.

   ⚠️ This can fail a correct change **even with perfect predictions**, which is why it is its own
   step. On EOS the dynamic-hostname TLV is learned *after* the IS-IS adjacency forms, so the
   identity column can transiently render the numeric System Id and then switch to the hostname —
   an immediate post-commit check can catch the transient and read as a mismatch. OSPF likewise
   passes through EXSTART/LOADING before FULL.

7. **Know which fields are safe to assert** (Arista EOS; the same logic applies elsewhere):

   | Command | Safe to assert | Never assert |
   |---|---|---|
   | `show isis neighbors` | row exists per expected interface; State; Type (L1/L2); Interface | SNPA (a MAC), Circuit Id, Hold time; identity as *either* hostname or System Id, never one specific form |
   | `show ip ospf neighbor` | Neighbor ID (the configured router-id); State reaching FULL; Interface; Address | Dead Time; the FULL/DR\|BDR suffix unless priorities are pinned; **the column layout itself** |
   | `show ip route` | prefix present; protocol code (`O`, `i L2`); `[AD/metric]`; next-hop; egress interface | route age; entry ordering; ECMP next-hop ORDER (assert the set) |
   | `show running-config section <proto>` | per-line PRESENCE against the canonical stanza | whole-block byte equality — EOS canonicalises: `distance 90` renders as two per-level lines, and a line equal to the default silently disappears |

   Universally volatile, never assert: timers, hold/dead counters, uptimes, sequence numbers,
   checksums, SNPA/MACs on virtual rigs, DIS/DR election results, whitespace and column widths.
8. **`write memory` after a verified apply**, so a container restart cannot silently revert a phase
   mid-program. ⚠️ **This is an OPERATOR obligation and packages do not carry it.** Across R12's four
   legs no package mentioned persistence; every change applied cleanly and startup-config still held
   the OLD protocol with zero lines of the new one — a reboot would have reverted the entire
   migration. Persisting is not a package edit, so it does not breach the verbatim rule in step 2.
   If you deliberately do NOT persist — e.g. to leave a package defect visible in the record rather
   than repairing it by hand — **say so explicitly in the gate comment**, because "the migration
   completed" and "the migration survives a reboot" are then different claims.
9. **🔴 READ RAW OUTPUT. An empty result is not a pass.** Pipe through `cat -A`, or read the unfiltered
   line, before concluding anything.
   *Earned three times in one campaign: R5 (the at-rest artifact grep), R7's first deploy (stale
   containers reading as absent), and R7's apply — where `show isis interface brief` returned empty
   and the raw text said `% IS-IS (1) is disabled because: IS-IS address family configuration is not
   present`. A count would have read as "nothing to report".*

## When the package is right and its paperwork is wrong

Occasionally the change is correct and verified, but a validation step is unsatisfiable or names the
wrong observable. You then have a genuine judgement call: release on substituted evidence, or archive.

**Why this used to happen constantly — and why it should now be rare.** The author can predict what
it **CONFIGURES** but not what the device **DISPLAYS**: it harvests pre-change state read-only and
never sees the device's response to its own config, so any *expected output* it writes for a
never-yet-rendered feature is a prediction. (Letting the author check the device is ruled out — the
read-only boundary stays.)

✅ **Largely FIXED at the source since 2026-08-27**, so treat this section as residual risk rather
than routine. Role guidance no longer permits quoting the *authored config* as expected output — that
single disjunct authorised two of R12's four defects, and the author was complying with it. And
network-provisioning v1.9.0 requires a step to cite a witnessed rendering or else use the comparison
or presence shape. Measured on R13: predicted expected-output blocks fell from 12 to **1**, the author
declined to predict five times and named each gap, and its reviewer approved with zero blocking
issues. If you are seeing these traps routinely again, that is a REGRESSION to report, not the
weather.

**Known rendering traps** — kept because they are the seed corpus for any future rendering-facts
store, and because a trap you can name is one you will not misread at 2am. All Arista EOS, all live in
IGP-T1 R12, all on packages whose CONFIG was perfect. Under the tiered disposition (apply-gate step 5)
every one of these is now a FINDING, not a rollback:
| Package predicted | Device actually renders |
|---|---|
| `System Id: 0020.0200.2002` in `show isis neighbors` | the **hostname** (`ceos2`) |
| `distance 90` under address-family | **two** lines: `distance 90 level-1`, `distance 90 level-2` |
| `show ip ospf neighbor` with Neighbor/Pri/State/Address/Interface | EOS also emits `Instance` and `VRF` columns |

- **Verify the PROPERTY the step was trying to prove**, via observables the phase does not preclude.
- **Release only if the property holds** and the applied state is correct.
- **Record the deviation explicitly in the gate comment**, including that it departs from
  "the package's validation is the runbook". Silently substituting your own evidence is how an
  "approved-but-unapplied package" claim quietly stops being true.
- The defect is still a defect: file it, and fix the layer that produced it.

## Contaminating the experiment (the subtle one)

Writing a prior round's SPECIFIC defect into a task description, gate comment, or requirements file
lets the agent satisfy the pointer instead of the property. A round that then passes evidences only
"the agent avoided the line it was told about".

- **State the PROPERTY** ("the stanza must appear COMPLETE, every line, in order").
- **Name the MECHANISM** ("omission still commits and displays cleanly while the protocol stays inactive").
- **Cite the earning round** for provenance.
- **Never name the instance token.**

*Earned: IGP-T1 R8 was superseded before its plan gate for exactly this, and R9 re-run clean — which
is the only reason R9's result is usable as evidence.*

## Campaign hygiene

- **Archive, never delete.** A non-green round is the provenance of its fix: disposition comment naming
  defect/fix/continuation, gates left unreleased, next round in a SIBLING stage.
- **Pre-arm clearances.** Duplicate-halt recurses; name every prior program AND pipeline stage in the
  new round's description.
- **Fix at the right layer, then re-run as validation** — rig/input gaps → topology+inputs; craft slips
  → role guidance (+ targeted reseed); contract ambiguity → protocol; a format that recurs → code.
- **One round, one assessment.** Write it before launching the next; the trend across rounds is the
  finding, not any single round.
