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
5b. **You approve LEG TYPES here (pov-program 2.0.0, promotion E).** Every DAG entry states `leg type: value`
   (publishes a value, changes no system) or `leg type: change`; the gate description lists them, and each value leg
   quotes the requirements phrase it relied on. Check each type against what that leg's objective actually does — a
   leg that derives a value AND changes a device is a `change` leg. A type you do not accept means the plan is not
   approved: do not release, re-plan. An entry with no type is reported
   in the gate description, never supplied by the harness. Node C later checks every leg's token and type against
   this approved plan, and a mismatch there is BLOCKING.

### The hold window: what PLAN-SPAWN built, checked BEFORE you release (2026-10-04)

PLAN-SPAWN is the harness step that reads the approved plan and CREATES the legs, gates, producer and Node C. Several of
its steps are performed by the model and varied across the value-chain frozen window (B7, five runs). Each is fixable
only while the plan gate is held — once released, the legs start with whatever they were given. Check all four:

6. **Every leg and Node C holds the PLAN'S contract — compare each to the plan, never to each other.** The plan is the
   fenced JSON under `## Interface Contract` in the Architect's report; compare it to each child's
   `inputContext.interfaceContract` as **jsonb** (key-order-insensitive) — the query is in PROGRAM-RUN-FORENSICS-GUIDE §4c.
   Expect `SAME AS PLAN` on every row. ⚠️ *Corrected 2026-10-04:* this check used to compare md5 ACROSS legs, which is
   blind to a paraphrase every leg shares — measured, it missed 17 of 23 deviations, and passed B7 runs 1-2 and
   re-measure run 1 while their contracts had been re-typed (value-chain: 5 of 7 runs differ from the plan). *B7 runs 3-4:
   trimmed per leg; run 4's and re-measure run 1's Node C had no branch conditions.* A contract shape defect cannot be
   repaired in place — archive and relaunch, or release with the deviation recorded (owner's call).
   **Since C2/C3 (deploy of `d7762f17`, pushed 2026-10-04 06:24 UTC) the platform stores the PLAN's contract itself**, so
   also expect `metadata.interfaceContractSource.source = 'plan'` on every contract-bearing row and the live contract's sha
   equal to `storedAtWriteSha256`. Primary instrument: `npm run replay:plan-contract -- --root <root id>` (the shipped
   resolver; the SQL in the forensics guide is a cross-check). `source:'supplied'` or `'none'` on any row is a finding —
   read its `planResolution`. Keep the plan-comparison above until the first live run has verified this.
7. **The clearance reached every leg** (from the second run in a POV onward). Each PIPELINE leg's
   `metadata.duplicateAcknowledged` must CONTAIN every id in the root's list (⊇, not equal — the harness computes each
   leg's list and may legitimately add the leg-stage ids; a NARROWER list is the defect: one pov-program run carried 25
   of the root's 32). A leg's duplicate-halt is TERMINAL. *B7 run 4: the root held 15 ids and no leg got them — stamped
   by hand in the hold window, and the legs then passed their own check.* (Planned: the platform will make each leg's
   list a superset of the root's at execution, after which this check reads the ROOT — design C3,
   `cline_docs/reviews/value-chain-post-window-2026-10-04/C-PLAN-SPAWN-DESIGN.md`.)
   **Since C2/C3 (`d7762f17`):** read the ROOT's `metadata.duplicateAcknowledged` — it must carry every prior program AND
   pipeline stage. The platform makes each leg a superset of it at the leg's FIRST EXECUTION, so a short leg list in the
   hold window is now expected. It carries only a root clearance that names at least one real stage in the POV
   (`root-clearance-unbound` otherwise). A `PRE-FLIGHT CLEARANCE:` block in the DESCRIPTION is NOT carried — with one,
   check the legs as before. After first execution: every carry's `added` ⊆ the leg's current list (a stale POV-editor
   autosave can revert it; the carry runs again, idempotently, at every later execution prep). `HOWTO-use-program-harness`
   2.8.0 (promotion E deploy 2) states this carry rule; before deploy 2 it still said to confirm on leg metadata. Until
   the first live run verifies the carry, ALSO check ⊇ root on every leg as before.
8. **The dependency shape — Node C must REVIEW before you decide the change gates.** The intended shape:
   ```
   Plan gate ──► value leg ──► value gate ──► change leg A ──► change-method gate A
                                          ├─► change leg B ──► change-method gate B
                                          └─► change leg C ──► change-method gate C
   Producer + Node C wait for:   the legs only
   Program SYNTHESIZE waits for: everything, gates included
   ```
   Node C's cross-leg verdict (same value everywhere, nothing widened, each leg's own verdict) then lands while the
   change gates are still open — evidence FOR your gate decisions. The variant to catch:
   ```
   Producer + Node C wait for:   the legs AND the change-method gates
   ```
   *B7 run 4* — the harness acted on an Architect remark that gates "block program completion". The order of evidence
   flips: you decide the gates without Node C, and Node C then reads your gate notes as evidence (run 4's Node C cited
   our "settled, NOT approved" notes back as its blocking reasons — an echo, not an independent check), and it is a
   series break for any measurement. Neither shape is unsafe (release still needs every leg approved), but the protocol
   intends the first — and since pov-program 2.0.0 (promotion E6) it ENFORCES it in text: producer and Node C get "ALL
   pipeline child ids — never a gate", whatever the plan, contract or gate table says, and the Architect is told never to
   prescribe their edges. So on a run whose PLAN-SPAWN ran under 2.0.0 (launched after deploy 2) **Node C reviews BEFORE you release a gate that "blocks program completion"**
   (`after-leg-before-completion`): its verdict is evidence for that gate, and SYNTHESIZE still waits for the gate. The
   variant on such a run is a finding. Fix before release by removing the extra dependency edges. **How:** `perform task.update` with `dependencyIds: [<the PIPELINE leg ids>]` on the producer and on Node C — it
   REPLACES the dependency set (done live 2026-10-04, re-measure run 1). **Why it matters for approvers:** under the
   variant, Node C fetches each settled gate with `task.context` and reads your completion note as evidence — a gate
   note becomes a Node C input (an anchoring channel; persuasive prose passes the R9 sanitiser, only injection-shaped
   text is neutralised). If you ever do run the variant, keep gate notes strictly factual. *The cause so far has always
   been the same: the Architect reads the requirements' "blocks program completion" gate column as a wiring
   instruction — watch its assumptions for it.*
9. **Every leg title carries its protocol token and leg type** (`(protocol: network-derivation)` etc.) — Node C checks
   them against the approved plan.
10. **Node C runs on the `Program Integration Reviewer` row** on a run whose PLAN-SPAWN ran under 2.0.0 (launched after deploy 2) — confirm Node C's `agentTemplateId`
   is the id recorded at deploy 2, by id, not by name: `Value-Chain Program Integration Reviewer` also contains that name,
   and a missing exact name binds the nearest row SILENTLY. A root PLANNED before deploy 2 and released after it keeps
   its `Change Reviewer` Node C — the third population (CLAUDE.md soak entry), expected, not a finding.

⚠️ **Re-running a leg after Node C has reviewed it leaves Node C's verdict STALE.** With Node C wired to the legs only, it
can finish while a leg's own gate is still open. If you then re-run that leg (to fix its package) before releasing its
gate, the program synthesises on Node C's verdict about the OLD package — the operator-induced re-run class, made
reachable by the new order. Re-run Node C after the leg (its input changed, so it is not a same-input re-roll), or record
the deviation before release.

The SQL for 6-8 (one query, read-only) is in `PROGRAM-RUN-FORENSICS-GUIDE.md` §4c.

### Run titles in a MEASUREMENT window — no run number, so the clearance must be perfect

`PROGRAM-HARNESS-USER-GUIDE.md` §2 says put a run number in the title: it lets a leg read a prior run's stage as
history instead of a duplicate of itself. In a measurement window that number tells agents where they sit in the series
(B7 run 4's Architect quoted "Run 4 of a declared ≥5-run window" and the stop line), so the re-measure window drops it —
plain identical title, a timestamped fresh stage per run, and NO measurement criteria in phase/stage text. The cost is
that the run number's protection is gone, so check 7 is no longer optional: the root carries every prior stage id, and
every leg must carry it before release.

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
   not skim past them. `blockKinds` is the CLASSIFIER'S READING of the package (a count of fenced-block
   LINES per kind), not ground truth. It separates "0 violations because clean" from "0 violations
   because nothing was scanned" only in the TOTAL case — no `candidate-config` key at all. A mis-kinded
   config block moves lines between keys without making the stamp look empty (EF-DL2 measured 32 real
   config blocks exempted that way), so a non-zero `candidate-config` count does not prove the config
   you care about was scanned: open the package and check that its applied config sits in blocks the
   lint would call candidate config. Compare `blockKinds` across legs only when their
   `dialectLint.classifier` matches.
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

   🔴 **Never apply a block that contains `<<REDACTED-SECRET>>` or `<REDACTED-SECRET>`** — or any other
   `<<REDACTED…>>` or `<REDACTED…>` form (Authors invent variants such as `<REDACTED-SNMP-RO-COMMUNITY>`) — in
   desired state, a rollback or a CLI step. Those are the platform's secret
   placeholders, not values, and devices accept them as literals (device-verified 2026-10-13, P4): EOS
   takes them as an SNMP community, a `secret 0` / `enable password 0` or a TACACS key; nginx takes them
   in a `proxy_set_header` value; otelcol takes them in a header or auth setting. **A green `nginx -t`
   or `otelcol validate` does not prove such a file safe** — both pass with the placeholder in place.
   **On EOS, a full `configure replace` (or rollback clean-config + load) of a file with a redacted
   password-hash line can delete that object, the only admin user included, while still printing
   "Copy completed successfully".** Such a block cannot be applied verbatim, so it is a gate finding
   like any other wrong line: hold, and have the package re-authored to leave the secret-bearing line
   out of the edit set; for a rollback, restore from the device's own saved configuration, not from the
   package text. Never type the real value in by hand: the applied change would then differ from the
   reviewed document. Since 2026-10-13 the leg's `report.md` names such lines under **Platform warnings
   (non-blocking)** (`placeholder-in-apply-block`). That is a warning, not a gate, and **its absence is
   not clearance**: it reads the persisted package, and a package from before 2026-10-13 carries no
   such check at all. Search the text yourself: `grep -nE '<{1,2}REDACTED' <package file>` (every hit inside a block you
   will apply is a stop).
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

⚠️ **The PRE-FLIGHT CLEARANCE block is the channel you will forget.** It is operational text you
write for the duplicate check, so it does not feel like instruction — and the harness propagates it
verbatim into CHILD BRIEFS. *Earned 2026-09-18: a clearance block naming a prior round's defect and
score reached a leg's design role, and on an earlier run reached the **REVIEWER**, handing the judge
the exact failing string before it had looked. That round was superseded; its result was unusable.*
**Keep the block to stage identifiers.** Corrective content goes in `requirements.md`, where it
propagates legitimately and a human sees it at the plan gate.

⚠️ **And check the objective before you use a round as evidence of a protocol change.** If the
objective hand-carries the behaviour the protocol was changed to produce, the run tests the
workaround. *Pass condition written IN ADVANCE, then verified mechanically on the package — that is
what made kubernetes-gitops 1.9.0's validation trustworthy (2026-09-19).*

## Settling a gate WITHOUT approving the package — option (b) (owner's decision, used in value-chain runs 2-5)

A program only reaches its final SYNTHESIZE when every gate is terminal. If a change leg came back NEEDS-REVISION and you
do not intend to re-run it, holding its gate leaves the program open forever (run 12: `runDisposition: abandoned`).
**Option (b):** complete the gate with a note that says, in so many words, **"Gate SETTLED, package NOT APPROVED"**, the
leg's blocking reason, and that the completion releases nothing. The program then synthesises and stamps
`programReleasable: false` with the reason — you get the finished record (Node C, cost, facts) and nothing is released,
because `programReleasable` keys on each leg's outcome, not on the gate.

- **This is the owner's call, every time** — never a delegated default (PROGRAM-HARNESS-USER-GUIDE §5 rule 2). The owner
  chose it per gate in each run.
- ⚠️ **Gate completion is not an approval fact.** The platform cannot tell an option-(b) settlement from an approval; only
  the note says so. Harmless while release keys on leg outcomes — but nothing downstream may read "gate completed" as
  "package approved". A gate-outcome FACT is the candidate fix (filed: GATE-COMPLETION-IS-NOT-APPROVAL).
- If Node C depends on the gates (it did in value-chain run 4; a pov-program 2.0.0 run should never wire it so), it
  **reads your gate notes and uses them as evidence** — write them as facts.
- Keep the note under 500 characters (`task.complete` summary limit — an over-long one writes nothing).

## Campaign hygiene

- **Archive, never delete.** A non-green round is the provenance of its fix: disposition comment naming
  defect/fix/continuation, gates left unreleased, next round in a SIBLING stage.
- **Pre-arm clearances — on the ROOT *and* on every leg.** Duplicate-halt recurses; name every prior
  program AND pipeline stage. ⚠️ **The check fires INCONSISTENTLY**: on 2026-09-18 a round's legs
  carried no clearance and never halted; on 2026-09-19 the same shape, against the same four prior
  stages, halted. It costs nothing when unused and a restart when it is not there.
- **A duplicate-halt is TERMINAL and freezes the cone — a re-run needs a FRESH task.** The platform
  marks `task.executionStatus = FAILED` and walks the forward cone, stamping
  `blockedByUpstreamFailure: true` on every downstream sibling (F17,
  `execution-terminal-persist.ts`). ⚠️ **Do NOT `agent.execute` the halted leg to recover it**: its
  cone is already frozen, so the leg runs and its consumers still do not queue — the program then
  escalates `orphaned-cascade-after-root-recovery`, correctly, and every frozen task has to be
  hand-started. *(2026-09-19: done exactly this; three legs plus the producer and Node C all needed
  hand-starting, and the round stopped being a clean autonomous run.)*
- ⚠️ **Read the field the platform writes, not the one next to it.** On a halted leg
  `agent_executions.status` says **SUCCESS** — truthfully, because the harness ran, detected the
  duplicate, stamped it and exited cleanly. The halt lives on **`task.executionStatus`** and on the
  downstream cone. *Reading the execution row produced a confident "it was not terminalized"
  conclusion that survived into three documents for several hours before the code was read.*
- **Declare your rig's planted artifacts.** A deliberately planted secret that the environment file
  does not mention is, from the leg's seat, an unexplained credential on the resource it is about to
  change — and a domain protocol may require it to HALT on exactly that. *2026-09-19: an AWS
  access-key pattern in a resource TAG (which the provider's own `sensitive_attributes` redaction does
  NOT cover — it protects attributes, not tags) blocked a correct package.* You cannot fix this by
  weakening the drift rule without removing the control that makes the run worth anything: declare the
  artifact, scope the declaration to it, and leave the rule armed for everything else.
- **Comments are not a channel.** A comment on a package reaches **no agent** — not the next leg, not
  Node C; chaining carries `finalResponse` only. Mid-run you can stop a program or let it proceed; you
  cannot improve it.
- **Fix at the right layer, then re-run as validation** — rig/input gaps → topology+inputs; craft slips
  → role guidance (+ targeted reseed); contract ambiguity → protocol; a format that recurs → code.
- **One round, one assessment.** Write it before launching the next; the trend across rounds is the
  finding, not any single round.
