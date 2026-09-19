# VT-28 — an instruction bundled two blocks the parser needs apart; the program was refused for eight rounds

**Status**: ✅ VERIFIED 2026-09-19 — first `programReleasable: true` for this objective, on round 8.
Drafted contemporaneously during the round. Re-verify trigger: any change to
`parseFencedJsonBlock`'s heading regex, the `config_change_author` role guidance, or the
network-provisioning Author clause naming `## Derived Values`.
**Layer**: program (four pipeline-tier legs, five human gates)
**Round type**: eighth round of the same objective; first release
**Date:** 2026-09-19. **POV:** Multi-Domain Autonomous Delivery — Showcase, phase *5 — One Objective,
Four Domains*. **Program task** `cmu8191bd0005yxkyblqgr9k0`, child stage `cmu81ahdj000fyxkyk8kue8g2`.

## Objective

Unchanged from VT-27: one value, derived once from live device state, consumed verbatim by three
independently-authored changes in three configuration languages that share no vocabulary. VT-27
closed the *delivery* question on rounds 4 and 6 and stated plainly that release had not been
achieved in six rounds. This is the round that achieved it, and the reason it took eight is the
finding.

## The result

`programReleasable: true`.

| leg | domain | verdict | containment |
|---|---|---|---|
| P1 | network-provisioning | approved / 90 | `benign (checked-clean)`, 0 violations |
| P2 | kubernetes-gitops | approved / 87 | `benign (consuming-leg-discharged)`, `upstreamContainment` green |
| P3 | terraform-iac | approved / 89 | idem |
| P4 | observability-config | approved / 88 | idem |
| Node C | integration review | **APPROVED, 0 blocking, 90** | recomputed `10.99.0.0/27` independently |

Coverage 4 of 4 chain-capable on both the producer and Node C, degraded 0. No `verdictMismatch`.
Node C graded the crossing VERIFIED-AGAINST-EVIDENCE and confirmed all three consumers took the
value verbatim.

## What was actually blocking it

The fabric leg came back **NEEDS-REVISION at 65** with exactly one blocking item, and the reviewer's
own words are the clearest statement of it:

> the package's `## Derived Values` evidence is nested as prose under `## Pre-existing Allocations`
> with no standalone `Derived Values` heading, causing the platform's own machine parse to record it
> as ✗/ABSENT … **even though the underlying derivation arithmetic (verified independently above) is
> correct.** Fix: add a standalone `## Derived Values` heading directly above the existing JSON
> block, carried unchanged.

The author's own stamped fact agreed: `markerPresence: {harvestedAllocations: false, derivedValues:
false, consumedValues: false}`, and `derivationContainment` was **absent entirely** — with no
parseable derived block there was nothing for the mechanical net to check, so the program-gate
conjunct could never be satisfied.

**The value was never wrong.** `10.99.0.0/27` covers exactly the six harvested exporter loopbacks
(ceos1 `.1/.26/.29` AS65001; ceos2 `.2/.4/.24` AS65002), and its minimality had been proved by the
Phase 1 Architect and re-proved independently by the reviewer via span+XOR arithmetic. Only the
carrier was unreadable.

### The cause was the instruction, not the agent and not the parser

The author's task description bundled two blocks into one lettered clause describing one section:

> *(e) a `## Pre-existing Allocations` section quoting the Phase 0 harvest's `## Harvested
> Allocations` block VERBATIM … with its source named, **and** the Phase 1 design's `## Derived
> Values` block carried forward VERBATIM;*

Read as written, the derived block is a *component of* the Pre-existing Allocations section. That is
exactly where the author put it. It carried both blocks verbatim, as instructed, and placed them as
instructed. **The agent complied; the instruction was wrong.**

⚠️ **This is not an argument for loosening the parser, and the corpus says so.**
`parseFencedJsonBlock` has already absorbed four widenings for heading furniture — emphasis marks,
ordinals (`### 6. Consumed Values`), backtick-quoted markers, inner heading runs, fence inversion —
each landed with a measured count of legs whose *stamped fact changed*. One candidate variant looked
correct at the unit-test layer and **regressed 3 production legs while fixing 3**, because a
single-heading fixture cannot express last-match-wins. Here the heading was genuinely absent. The
parser was right, the reviewer was right, and the defect was upstream of both.

## The fix, and why it is a clean causal test

Clause (e) was split into (e) and (e2), with (e2) stating that `## Derived Values` is a standalone
top-level heading, never nested under another section, with its fence immediately beneath it — and
saying *why*, in platform terms, so the requirement is not arbitrary.

**Nothing else changed.** No code, no protocol reseed, no template edit, no model change. The author
and reviewer were re-executed against the same chained context.

| | before | after |
|---|---|---|
| Author `markerPresence` | `derived ✗ consumed ✗` | **`derived ✓ consumed ✓`** |
| Author confidence | 88 | 88 (content unchanged) |
| Reviewer verdict | `approved: false`, 1 blocking | **`approved`, blocking none** |
| Reviewer confidence | 85 | 90 |
| Leg `derivationContainment` | absent | **checked, 0 violations** |
| Leg confidence | 65 | 85 |

Single variable, opposite outcome. This matters because of F1: a retry never receives the diagnostic
that caused it, so a blind re-run had no mechanism by which to fix itself — it would have reproduced
the same placement from the same instruction. The description was the only channel that reaches a
child, and comments are never chained.

## ⚠️ This is NOT a clean autonomous run

Two operator interventions, and unlike VT-27's they were not operator error — the second is a
platform gap.

1. **The author and reviewer were re-run by hand.** The leg had already completed; nothing re-opens
   a completed leg on its own.
2. **The leg had to be re-synthesized by hand.** Re-running the two children did **not** retrigger
   the parent leg, because the retrigger does not fire for an already-COMPLETED task. Left alone,
   the leg would have kept a NEEDS-REVISION synthesis over children that were fixed and approved.

### The platform gap this exposed

`task.complete` rejects COMPLETED→COMPLETED, so **a re-synthesized leg cannot update its own
completion record.** The harness discovered this mid-run, unprompted, and mitigated it correctly:
it wrote `metadata.qualityGate = {outcome: "approved", reviewerScore: 90, reviewerPresent: true}`
directly and posted a corrective addendum naming precisely what stayed stale.

The gate input is therefore right. Two other surfaces are not:

- `task.confidenceScore` stayed **65**, and the completion summary still says *"Reviewer returned
  NEEDS-REVISION"* — both describing the superseded package.
- That stale 65 then **propagated to the program's headline confidence**, because MIN-across-children
  read the stored field. The program's own synthesis caught this and said so: *"the MIN-across-children
  rule picks P1's stored confidenceScore (65), which is KNOWN-STALE … True current MIN using the
  corrected value would be 87."*

So a releasable program reports 65. Harmless to the gate — confidence has been out of gate semantics
at every tier since the 2026-07-18 calibration study — and wrong in the customer-facing direction,
understating a clean run. Three surfaces now disagree: `confidenceScore` 65, `metadata.programConfidence`
85, true corrected MIN 87.

## What the platform did well, unprompted

The program synthesis volunteered three things nobody asked for, each of which a human reviewer
would otherwise have had to find:

- the stale-confidence propagation above, with the cause and the corrected number
- that P1's own `rollbackContainment` `needs-node-c` item — two BGP restore lines absent from the
  harvest — **was not explicitly named by Node C**, correctly noting it is not a Step-5 conjunct and
  does not block
- that P4's dialect was graded ACCEPTED-FROM-CLAIMS because the interface contract states
  `platformDialect NOT PROVIDED`, rather than claiming a verification it could not perform

The `rollbackContainment` item is itself a correct delegation, not a defect: Phase 0 harvested
structured interface data, not running-config, so the two `router bgp` restore lines could not be
matched against anything. `needs-node-c` is the right disposition for a question the leg cannot
answer.

## What this round does NOT establish

- **One instance.** A description defect fixed once is not evidence about how often instructions and
  parsers disagree elsewhere. The general question — how many seeded clauses name a parsed-block
  marker without mandating its *placement* — is greppable (`DERIVED_VALUES_MARKER`,
  `CONSUMED_VALUES_MARKER`, `HARVESTED_ALLOCATIONS_MARKER` are exported constants) and **has not been
  measured**.
- **Not an autonomous release.** Three hand interventions stand between the round and its verdict.
  The eight-round total is also not a platform failure rate: several earlier rounds were superseded
  for input contamination or operator error, documented in VT-26 and VT-27.
- **The completion-record gap is unfixed**, and its mitigation currently depends on the harness LLM
  noticing. It noticed here. Nothing guarantees the next one will.
- **P4's number discipline was not stress-tested.** G4 required every threshold, window and wait to
  be justified against a harvested quantity; the leg passed, but no unjustified number was present
  to catch.

## Method note

The decisive signal is the author's stamped `markerPresence`, not the reviewer's prose — it is
visible on the **lean card** (`agent.results` without `verbose`), so confirming the fix cost one
cheap call rather than a 100 KB envelope read. The verbose envelope is capped at 100 KB and the
`finalResponse` sits after the tool-call array, so on a long author package the deliverable body is
**not retrievable this way at all** — a fact worth knowing before designing a check around it.

Evidence: author task `cmu8w9xle0031yxkyt8ddtqqb` (executions `cmu8weck1006iyxkzsn6so7g4` 234s →
`cmu8wz0t7005kyxky07hcgv5g` 257s) · reviewer `cmu8wa5id003dyxky0v369491` · P1
`cmu81fbzc000hyxkzxi0jsbbk` (syntheses 80s → 94s @65 → 115s @85) · P2 `cmu81gnyn0014yxkz347laqi6` ·
P3 `cmu81go07001ayxkz8upex7lh` · P4 `cmu81go25001gyxkzfg49u09x` · producer
`cmu81hb62001syxkzvl2gecm1` · Node C `cmu81hb800020yxkz2l2qsnb2`.
