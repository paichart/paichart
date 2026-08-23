# VT-19 — IGP migration campaign: the applied-state loop, six rounds, first live mid-program apply

**Date:** 2026-08-23 (one rig window, ~4 h) · **POV:** Autonomous Delivery Use Cases, phase *OSPF
to ISIS Migration* · **Programs:** IGP-T1 R1 `cmt57uu9d…` · R2 `cmt58yo0k…` · R3 `cmt59yhrn…` ·
R4 `cmt5b508v…` · R5 `cmt5bmlow…` · R6 `cmt5cv12i…` (all preserved; R1–R5 archived with
disposition comments; R6 parked at G2 by design).
**Claim under test:** the S2 *applied-state* interdependency flavor — legs are migration PHASES,
each gate is a human **apply** to live devices, and the next leg designs against **re-harvested
live state** rather than the previous leg's declared output. (Complement to VT-18's
*designed-output* flavor: there the value crossed the DAG edge; here the WORLD changes between
legs and only a fresh harvest can see it.)

## Verdict

**APPLY LOOP VALIDATED to its first full cycle; parity leg validated as an HONEST ESCALATION;
full-migration completion deferred to a resume window.** Concretely proven live:

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

Systemic observations: three DIFFERENT guards each caught defects (operator apply, leg reviewer,
leg harness synthesize, operator plan-gate probe, operator at-rest forensics); every fix, once made
**transcription-grade**, held for the remainder of the campaign (the R6 author even self-repaired a
design omission against the canonical exemplar); and the two failures that recurred did so past
*prose* guards — the corpus evidence that earns the queued mechanical dialect-lint. Promotions
shipped at wrap: network-provisioning protocol v1.4.0 (platform-dialect + unharvestable-target
obligations, reviewer dialect lint — vendor-agnostic principles only; vendor token facts stay in
the run's requirements).

## Honest caveats

- **The window ended in a host incident, disclosed as part of this record:** ~10 min after P2
  completed, the shared 7.8 GiB host hit a kernel global OOM (3-node dual-IGP cEOS growth +
  program load); the platform's own app was unreachable for ~15 min until an operator power-cycle.
  No committed state was lost; the program's parked-at-G2 state and all artifacts survived intact.
  The 3-node-on-prod-host sizing verdict is revised RED for program-running windows; resume is on
  the 2-node fallback or an off-host rig.
- The migration itself is INCOMPLETE by design of the wrap: P3 (preference shift) and P4 (OSPF
  removal) were never released; their gates remain unreleased in the parked R6 program. The claim
  validated is the *loop mechanics + campaign method*, not "a full OSPF→IS-IS migration completed".
- The dual-stack (OSPFv3) variant of the source use-case is out of scope for this tier.
- WS4 caveats of the rig (static service credential; descriptor-level read-only scoping) apply as
  in VT-18.
