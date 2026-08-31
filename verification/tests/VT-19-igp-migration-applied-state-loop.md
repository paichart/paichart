# VT-19 — IGP migration campaign: the applied-state loop, ten rounds, migration COMPLETED

**Date:** 2026-08-23 (rounds 1-6, ~4 h) and 2026-08-24/25 (rounds 7-10, resume window) · **POV:** Autonomous Delivery Use Cases, phase *OSPF
to ISIS Migration* · **Programs:** IGP-T1 R1 `cmt57uu9d…` · R2 `cmt58yo0k…` · R3 `cmt59yhrn…` ·
R4 `cmt5b508v…` · R5 `cmt5bmlow…` · R6 `cmt5cv12i…` (3-node) · R7-R9 (2-node) ·
**R10 `cmt7xrwmx…` (2-node, migration completed)**. All preserved; non-green rounds archived with
disposition comments.
**Claim under test:** the S2 *applied-state* interdependency flavor — legs are migration PHASES,
each gate is a human **apply** to live devices, and the next leg designs against **re-harvested
live state** rather than the previous leg's declared output. (Complement to VT-18's
*designed-output* flavor: there the value crossed the DAG edge; here the WORLD changes between
legs and only a fresh harvest can see it.)

## Verdict

**APPLY LOOP VALIDATED END-TO-END: on R10 all four migration phases were applied and verified on
live devices, and the program then CORRECTLY REFUSED to certify itself.** Both halves are the
claim. Rounds 1-9 never passed G2; R10 completed coexistence → parity → preference shift → OSPF
removal, leaving both Arista cEOS nodes running pure IS-IS, persisted to startup-config, with the
OSPF process absent and the IS-IS route set unchanged across the removal.

`programReleasable: false` on that same run is not a contradiction and not a failure: the CHANGE
was correct, the EVIDENCE CHAIN had a hole, and the platform declined to certify it. See
*R10 — completion, and a correct refusal* below.

Concretely proven live (rounds 1-6, retained):

1. **First mid-program apply in the platform's history (R6 G1):** a reviewer-approved change
   package (reviewer 93/100, zero blocking) was applied VERBATIM by the human-side operator to
   three live Arista cEOS devices via EOS config sessions — session diffs held as byte provenance
   (only package lines present), the package's own deterministic validation executed green
   (§1 config landed token-for-token; §2 6/6 IS-IS adjacencies UP with the hostname→system-ID
   binding matching the contract NETs; §3 OSPF neighbor static fields byte-identical pre/post;
   §4 OSPF config byte-diff empty), coexistence live (RIB still OSPF-preferred, transit path
   preserved), state persisted (`write memory`). Evidence archived (pre/post captures + post-apply
   flash configs).
2. **The re-harvest was real:** P2's harvester read the devices *as applied* — both IGPs running —
   through a self-provisioned read-only service, minutes after the out-of-band apply.
3. **Escalation-as-outcome under a genuine capability gap (R6 P2):** zero-tolerance route parity
   (every prefix, identical next-hop) is unverifiable through the descriptor's NAPALM getter
   surface (no route-table or IGP-adjacency getter). All three leg children independently named
   the gap rather than fabricating parity; the leg harness explicitly REFUSED the confidence-band
   re-roll ("capability limit, not agent effort"), escalated with three human options, and tore
   down its registration. The program parked at G2 — no hang, no false green.

## The remediation campaign (five archived rounds, one earned rule each)

| Round | Died at | Defect (all caught, none reached a device) | Fix → validated in |
|---|---|---|---|
| R1 | G1 apply | package carried two IOS-isms on an Arista target; leg reviewer approved; **operator's config-session entry rejected both** | requirements template rule 8 (platform dialect) + instance EOS dialect block → R2 (tokens absent, reviewer checked) |
| R2 | P1 quality gate | OSPF-unchanged validation written as prose (the target has no getter — under-specified corner) | rule 9: topology-fact literals and/or operator byte-diff, gap named → R3+ |
| R3 | P1 quality gate | author RE-EMITTED the banned `metric-style` token past binding negative rules (+ router-level `passive-interface`); reviewer missed dialect again; **leg harness caught it** | live-verified canonical stanza EXEMPLAR (negative rules lose to generation priors; transcription holds) → R5/R6 |
| R4 | **plan gate** | contract's P3 knob at a config level the platform rejects (`distance` under `router isis` top level) — flagged by the plan itself as unverified, **falsified by a 10-second operator probe** | verified knob shape (distance under address-family) + the plan-gate-probe practice → R5/R6 |
| R5 | P1 quality gate | **view-layer false positive**: the platform's injection screen annotated a clean package's "System IDs…" paragraph in the *reviewer's chained view*; the reviewer blocked a document carrying no marker at rest (all 5 technical checks passed) | rule 10 (markers are view annotations, report-don't-block) + platform pattern fix queued with the incident as fixture |
| R6 | — | **green through G1 apply; honest escalation at P2**; window ended by a host memory incident (below) | descriptor extension (curated route/adjacency show-command allowlist, v0.2.0) → resume round |
| R7 | P1 quality gate | package OMITTED a canonical line; IS-IS entered/committed/displayed cleanly while the protocol stayed INACTIVE; reviewer approved at 90/100 checking only the banned-token direction | completeness stated as a PROPERTY in protocol v1.5.0 + role guidance (never the omitted token) → R9 transcribed complete |
| R8 | superseded pre-gate | **contaminated by me, not by the agent**: I wrote R7's specific defect token into the task DESCRIPTION and the harness propagated it to the Architect — a pass would have evidenced only "the agent avoided the line it was told about" | writing rule 3 restated as governing EVERY agent-readable channel (template rule 11) → R9 re-run clean |
| R9 | G2 | furthest yet: P1 approved first-pass, G1 applied+verified, P2 ran. TWO defects, one root — a MEASURE named where a PROPERTY was meant: an unsatisfiable P1 step, and a parity criterion measured over INSTALLED routes during deliberate coexistence (reads empty precisely BECAUSE the phase succeeded) | parity restated against the LINK-STATE DATABASE; satisfiability clause into protocol v1.5.0 → R10 |
| **R10** | **— completed all four phases** | verdict-read defect (below), three satisfiability slips, none reaching a device incorrectly | orchestrator protocol v3.12.0 mid-run; role-guidance satisfiability rule at wrap |

Systemic observations: three DIFFERENT guards each caught defects (operator apply, leg reviewer,
leg harness synthesize, operator plan-gate probe, operator at-rest forensics); every fix, once made
**transcription-grade**, held for the remainder of the campaign (the R6 author even self-repaired a
design omission against the canonical exemplar); and the two failures that recurred did so past
*prose* guards — the corpus evidence that earned the mechanical dialect-lint. **It has since shipped
and run: see VT-20, where on its first live round it caught two absent canonical lines in a package its
own reviewer approved at 86/100.** VT-20 also refines this sentence's classification, and the refinement
matters: measured afterwards, the SHORT NEGATIVE rules (banned tokens) *were* carried into the child
briefs, so R1/R3 really were bypassed prose and this finding stands — but the LONG POSITIVE exemplar was
NOT (3 of 10 canonical lines survived the brief), so the later transcription-completeness failures were a
DELIVERY defect, not disobedience. An absent guard and a disobeyed guard produce identical evidence and
demand opposite fixes; classify before concluding. Promotions
shipped at wrap: network-provisioning protocol v1.4.0 (platform-dialect + unharvestable-target
obligations, reviewer dialect lint — vendor-agnostic principles only; vendor token facts stay in
the run's requirements).


## R10 — completion, and a correct refusal

**The migration.** Four phases, each applied by the human-side operator in an EOS config session
with the diff reviewed BEFORE commit, each verified against live device state, each persisted:

| phase | applied evidence |
|---|---|
| P1 coexistence | IS-IS adjacency UP both directions; **OSPF config byte-diff ZERO** on both nodes (md5 identical pre/post); OSPF still preferred `[110/20]` — IS-IS computed, not installed |
| P2 parity | zero-tolerance parity PASS on the **LSDB basis**; operator re-verified independently from raw router-LSA + LSP data: OSPF's advertised set and IS-IS's are identical, zero missing, zero extra |
| P3 preference shift | `O … [110/20]` → **`I L2 … [90/20]`** on both nodes; OSPF neighbours still FULL; OSPF config byte-diff still zero |
| P4 OSPF removal | `router ospf` ABSENT, process not running, zero OSPF routes; **IS-IS route set UNCHANGED across the removal**; both nodes persisted to startup-config |

**The refusal.** `programReleasable: false`. Node C, the program-tier integration reviewer,
independently found that P1's leg quality gate was stamped `outcome: "approved"` while its own
reviewer's terminal verdict was `NEEDS-REVISION` — and that the gate applied the package anyway.
That is a true statement about the evidence chain, so the program declined to certify itself even
though every applied change was correct. **A release gate that certifies a correct change on a
false stamp is worth less than one that refuses.**

**Why the stamp was false — a platform defect, found and fixed mid-run.** The orchestrator protocol
named `result.json.finalResponse` as the reviewer-verdict source, named NO retrieval verb, and
forbade `verbose: true` — the only flag that returns a body. The harness fell back to the one verb
the step did name (`task.context`, the POINTER channel), called it on the reviewer four times
(3.3 KB each, **untruncated**), honestly reported the verdict "wasn't independently quotable via
available tools", and stamped approved. Not truncation; not a tool defect. The identical bug had
been found and fixed one tier up (`pov-program` 1.0.14, 2026-07-23) and the pipeline tier was never
swept.

Fixed to orchestrator **v3.12.0** between G1 and P2, with a before/after on byte-comparable work in
the same run:

| | P1 (protocol 3.11.0) | P2 / P3 / P4 (protocol 3.12.0) |
|---|---|---|
| `agent.results` calls | 0 | 3 per leg, all `verbose: true` |
| verdict read | ❌ "not quotable" | ✅ correct |
| `verdictMismatch` stamped | **true** | absent (×3) |

Note the v3.12.0 reads WERE truncated (117 KB / 38 KB / 21 KB against an 8 KB tool-loop cap) and the
verdict still came through — because `reviewerVerdict` is emitted ABOVE `finalResponse` in
`result.json`. The artifact field-order contract did exactly the job it exists for.

**Five layers, one broken.** The protocol introduced the defect; `verdict-mismatch-guard` flagged it
(dangerous direction, pipeline tier); the operator gate caught and documented it; the protocol fix
prevented recurrence for three subsequent legs; and Node C independently re-caught it at the program
tier and blocked release. That is the architecture behaving as designed under a real fault.

**A first, incidentally:** R10 is the first program in the platform's history to carry a
`cannotRun: "superseded:"` child into synthesis (measured: 0 of 14 prior programs). SYNTHESIZE
reasoned unprompted that it was *"correctly superseded … 0 dependents, not blocking"* and assessed
on the four real legs — the Guard-4/assessment split is sound as shipped.

## Honest caveats

- **The window ended in a host incident, disclosed as part of this record:** ~10 min after P2
  completed, the shared 7.8 GiB host hit a kernel global OOM (3-node dual-IGP cEOS growth +
  program load); the platform's own app was unreachable for ~15 min until an operator power-cycle.
  No committed state was lost; the program's parked-at-G2 state and all artifacts survived intact.
  The 3-node-on-prod-host sizing verdict is revised RED for program-running windows; resume is on
  the 2-node fallback or an off-host rig.
- **SUPERSEDED 2026-08-25 — this caveat previously read "the migration itself is INCOMPLETE by
  design of the wrap".** That was true of R6 and is now false: R10 released all four gates and the
  migration completed on live devices. Retained here rather than deleted because a negative claim
  ages worst — a later fix silently falsifies it and nothing re-checks.
- **What is NOT claimed:** R10's program is `programReleasable: false`. This document does not claim
  a machine-certified migration; it claims an APPLIED and OPERATOR-VERIFIED one, plus a correct
  refusal to certify it. A round with a clean evidence chain end-to-end has not yet been run.
- **The 2-node topology costs the transit-path narrative.** With one link there is no alternate
  path, so nothing here proves path-selection preservation — only faithful per-interface metric
  translation. The 3-node rig is shelved (does not fit the prod host at any cap; cEOS does not boot
  on the off-host VM), both verdicts measured, not assumed.
- **Three defects were found by the OPERATOR, not by any agent tier**: the false approval stamp
  (G1), a validation step whose expected output cannot hold on a correct removal (final gate), and
  a rollback the leg reviewer could only grade ACCEPTED-FROM-CLAIMS, verified at the gate against
  an independently captured pre-change snapshot. The gate is an evidence step, not a rubber stamp,
  and this run is the strongest evidence yet for that discipline.
- The dual-stack (OSPFv3) variant of the source use-case is out of scope for this tier.
- WS4 caveats of the rig (static service credential; descriptor-level read-only scoping) apply as
  in VT-18.

## R19 — the triangle round (2026-08-30): path preference, applied and proven

The 3-node triangle — shelved when it exceeded the shared production host and blocked on a kernel
incompatibility — ran on a dedicated bare-metal lab host (kernel 6.8.0-138 native; the AaaWarmup
kernel finding of 2026-08-24 was thereby confirmed on bare metal). The round extends this VT's
claim in the one dimension the 2-node topology honestly disclaimed: **relative path preference**.

- **Two more verified mid-program applies** (P1 coexistence at G1, P3 preference shift at G3):
  packages applied verbatim via config sessions with captured diffs, validated by each package's
  OWN deterministic steps, persisted per each package's persistence statement. The apply→re-harvest
  loop ran twice in sequence on the same world.
- **Path-preference preservation proven at three levels**: derived (P2's SPF over the harvested
  LSDB, every non-retrieved value labelled DERIVED with the Dijkstra shown), evidenced (18/18
  device-prefix next-hop pairs matching OSPF, both load-bearing transit pairs), and — after G3 —
  **forwarding-plane-verified**: both corners install their far-corner routes at AD 90 via the
  transit node, exactly as OSPF routed them (two-hop cost 30 beating the direct 40).
- **P4 (OSPF removal) was refused — a refusal later PROVEN to be a false positive** (see the
  2026-08-31 correction below): the leg reviewer judged the rollback's interface description lines
  anachronistic and therefore *reconstructed* rather than quoted, and the program integration
  reviewer echoed the same reading as the SOLE blocking issue while every other program-tier check
  passed across all four legs. A subsequent corpus measurement ran the character-for-character
  test: all 51 rollback lines, descriptions included, sit verbatim in the leg's own harvest — the
  rationale text was in the lab's baseline configs from rig-build time. The
  program was parked at its final gate by explicit human choice (see close-out below): three phases applied and persisted,
  the point-of-no-return leg honestly blocked, the fabric stable in dual-IGP with IS-IS preferred
  and a seconds-reversible path back.
- **Two operator-tier findings recorded**: P1's package mandated a byte-identical diff of a command
  carrying a per-second countdown column (an unsatisfiable check as written — its own field-level
  form beside it was the correct shape, and P3's package used exactly that corrected form); and
  the P4 refusal, initially logged here as the prose verbatim-rule's first live failure — a claim
  the corpus measurement later overturned (correction below).

Caveats as above, plus: the operator applies were performed by the delegated AI operator over ssh
to lab containers — the same out-of-band, human-gated lane a human engineer occupies; nothing in
the authoring pipeline touched a device.

## R19 close-out — the P4-Completion round and the honest completion (2026-08-31)

The parked state above did not stand as the arc's ending; it stands as its pivot.

- **P4-Completion round (fresh single-pipeline run, next day, against the *applied* world):** the
  alleged defect was named as the round's anti-pattern up front, and before applying, the operator
  ran the exact test the defect demands — **all 21 rollback lines found character-for-character in
  the leg's own harvest** (rollback ⊆ harvest). Applied spoke→spoke→hub with a validation gate
  between each device: OSPF removed from all three, zero `O`-coded routes at every step, the IS-IS
  route set byte-stable against baseline on static fields, persisted per the package's persistence
  statement. The fabric is IS-IS-only; the migration the one-sentence objective asked for is done.
- **The R19 program record was then closed, and it refused to launder itself.** With the
  world-condition factually true, the human released the parked final gate. The program completed —
  with the verdict **preserved**: `needs-revision`, `programReleasable: false`, and the extracted
  root `report.md` opening with a NOT-RELEASED banner over the composed deliverable. A released
  gate closes a record; it does not overwrite a reviewer's refusal. The completion round's approval
  lives in its own, separate record — provenance intact in both directions.

What this adds to the VT's claim: the refusal→remediation loop is not just a stop — it is a
*resumable* stop whose remediation round inherits the alleged defect as an explicit contract term,
passes the mechanical form of the disputed property before apply, and leaves two unconflated
records — one refused, one approved — each carrying its own evidence.

## CORRECTION — the P4 refusal was a reviewer false positive (2026-08-31)

The corpus measurement gating the proposed rollback-verbatim mechanical check ran that exact
string test on the refused P4 package: **51/51 rollback lines verbatim in the leg's own harvest**,
including all six "anachronistic" interface descriptions — which trace to the lab's baseline
startup configs, authored at rig-build time. The reviewer, which by protocol design reads the
package and not the raw harvest, stated in its own verdict that it could not re-verify against
the source, then asserted the anachronism as proven; the program-tier reviewer echoed the same
inference from the same text (correlation, not corroboration). The refusal was in the fail-safe
direction and cost one day; the migration outcome is unaffected (the completion round's package
was independently correct). Across the full 56-package archived corpus the measurement found
**zero true rollback fabrications**, so the mechanical check ships as a recorded fact beside
future packages, not a blocking rule. What this VT keeps from the episode: the park-and-complete
mechanics worked exactly as designed around an honest-but-wrong verdict, and the system's own
measure-the-corpus-first discipline is what caught its reviewer's error.
