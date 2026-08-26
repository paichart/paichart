# VT-20 — a mechanical net catches what five prose guards and an approving reviewer missed; and the forensics behind it distinguish an ABSENT guard from a DISOBEYED one

**Status**: VERIFIED 2026-08-26, **UPDATED 2026-08-27** (see *Follow-through* at the end — the fix was
re-tested on a full four-leg round, and two defects were found in the checker itself) | Re-verify
trigger: dialect-lint contract shape change, interface-contract channel change, or
network-provisioning protocol bump past v1.7.0

⚠️ **Read the Follow-through section before citing this document's claim 1.** On its own, claim 1
overstates how reliable the transcription check was at the time: it worked on this round partly by
luck, and its false-positive behaviour was not yet known.
**Layer**: platform (with a pipeline-tier round as the specimen)
**Round type**: failure-injection (unplanned — a live round produced the defect)

**Date:** 2026-08-25 (round) / 2026-08-26 (forensics + fix) · **POV:** Autonomous Delivery Use Cases,
phase *OSPF to ISIS Migration* · **Program:** IGP-T1 R11 (2-node), P1 leg archived.
Successor to VT-19 (rounds 1-10), which recorded dialect-lint as *queued*. This is the round that ran it.

## Objective

Two claims, one specimen:

1. **A mechanical check catches a class of defect that prose guards do not.** Specifically: a
   *transcription-completeness* defect — a required line of a canonical configuration stanza silently
   ABSENT — which every prose guard in force had passed.
2. **A prose guard that fails must be classified before it is fixed.** An ABSENT guard and a DISOBEYED
   guard produce identical evidence (the model did not comply), and the two demand opposite fixes.

## Method

R11 ran the standard 2-node IS-IS coexistence leg (harvest → design → author → review). `dialect-lint`
had been wired into the engine days earlier and had never fired on real data. The package it produced was
then read by the lint, by its own LLM reviewer, and afterwards by hand against the live device.

Claim 2 was tested afterwards, by measuring — over EVERY archived leg that ever carried an interface
contract — whether each child task actually held the contract, and separately whether the specific
guard tokens appeared in the child's brief.

## Results

**Claim 1 — the lint caught it; the reviewer did not.**

| Signal | Result |
|---|---|
| dialect-lint PRESENCE half | **2 required canonical lines absent** — `address-family ipv4 unicast`, `isis network point-to-point` (zero occurrences in the document) |
| dialect-lint ABSENCE half | 0 — correct, the package was dialect-clean |
| Block classification | `{candidate-config:20, rollback:14, expected-output:13, command:8}` — working on real data, correctly ignoring 13 expected-output blocks |
| The package's own LLM reviewer | **APPROVED at 86/100, zero blocking issues** |

Impact is PROVEN on-device, not asserted: applying the stanza as authored yields
`% IS-IS (ISIS-1) is disabled because: IS-IS address family configuration is not present`. The config
enters, commits, and displays while the protocol stays OFF. That is the R7 defect exactly, recurring.

**A wiring defect found in the same run, which would have made the lint inert.** `extractBannedTokens`
matched `/banned/i` only, while the live Program Architect emits `platformDialect.forbiddenTokens` — zero
tokens on every real contract. It would have stamped a NAMED reason (`no-banned-token-list`) forever:
never a silent pass, but gating nothing while appearing wired. Predicate widened to `/banned|forbidden/i`,
mutation-verified. **Generalisable: a net's key predicate must be pinned against a LIVE artifact shape,
not only hand-authored fixtures.**

**Claim 2 — the classification, and it split the guards in two.**

The first reading was that four prose guards were in force on R11 (protocol rule, role guidance, the
canonical exemplar, the reviewer) and all four were bypassed. Measurement refuted that:

| Guard shape | Reached the agent's prompt? | Classification |
|---|---|---|
| Short **negative** rule (banned tokens) | **YES** — the harness paraphrased them into briefs; `metric-style` and `passive-interface` are named in the author's brief on nearly every archived leg | **Present and disobeyed.** R1/R3's recurrences are genuine prose-bypass — VT-19's finding stands, verified |
| Long **positive** exemplar (10-22 line stanza) | **NO** — the author's brief carried 3 of 10 canonical lines; the reviewer's, 1 of 10 | **Absent.** R7/R11's omission is a DELIVERY failure, not a compliance failure |

Root cause: the interface contract was delivered to the LEG and never to the leg's child tasks.
Across every archived leg carrying one: **7 of 7 legs lossy, 0 of N children ever holding the contract.**

The consequence is the sharpest part. The network-provisioning protocol instructed the reviewer to
*"check transcription and absence mechanically, token by token"* against the contract — while the
reviewer held only a paraphrase missing 9 of the 10 canonical lines. **That obligation was an
unsatisfiable predicate.** A reviewer told to verify a document it does not hold can only accept the
package's word, and did — approving at 86/100. Nothing failed, nothing warned; the check simply was
not performable, and no signal said so.

There is a design sting in this. Guidance had said *prefer a positive exemplar over a negative token
rule*, because an exemplar converts generation into transcription. That is right about efficacy — and
the exemplar is exactly the guard shape that CANNOT survive paraphrase into a brief. The strategy
silently depended on a structured delivery channel it did not have.

## Fix, and its verification

- **Contract inheritance**: a non-PIPELINE child with no contract inherits it write-if-absent from its
  qualified owning leg, sanitized, 64 KB cap, atomic conditional write.
- **No-restate rule** (orchestrator base v3.13.0): a brief must not restate the contract — it is now a
  second, lossy copy competing with the binding original.
- **Protocol clauses made satisfiable** (network-provisioning v1.6.0): Author and Reviewer both name the
  `## Program Interface Contract` block as the source, the contract WINS over any brief paraphrase, and
  absent-block behaviour is defined — Author escalates rather than reconstructing; Reviewer grades
  ACCEPTED-FROM-CLAIMS and **never reports a mechanical check it could not perform**.
- **Observation scoping**: the contract preamble now states that constants bind what an agent PRODUCES,
  never what it OBSERVES; a contradiction between observed state and a constant is a FINDING. Conforming
  an observation to a constant is fabrication, and destroys the only signal that a contract is wrong.

Verified live on production against the R11 author child:

```
BEFORE hasContract: false
INHERITED: parentTaskId=cmt8k2qwl001c…  bytes=4888
AFTER  hasContract: true
```

The parent resolved is exactly the qualified parent the predicate targets; 4888 bytes is inside the
64 KB cap; the installed contract carries `platformDialect` — the key the lint's PRESENCE half reads.
Confirmed independently by the replay instrument: that child flips, its three siblings stay pre-fix.

## What is NOT claimed

- The end-to-end call site was not exercised by a live execution. The predicate and the write are proven;
  `prepareTaskForExecution`'s invocation of them is covered structurally and by build, and the next real
  program run confirms it.
- R11 itself remains ARCHIVED and non-green. This document does not claim R11 passed. It claims the
  platform's mechanical net caught a defect five prose guards and one LLM reviewer passed, and that the
  forensics behind it found a delivery defect that had been silently disabling an obligation on every leg.

## Enforcement

| Guard | What it pins |
|---|---|
| `npm run test:dialect-lint` (34 fixtures, live R1/R3/R6/R11 text) | both halves, block classification, named skips |
| `npm run test:dialect-lint-enrichment` (7) | the engine wiring and both catch arms |
| `npm run test:contract-propagation` (13) | the decomposition lint, incl. a bounded child scan whose cap biting is STAMPED, never silent |
| `npm run replay:contract-propagation -- <legTaskId>` | read-only re-measurement of any leg, no run required |
| `test-pipeline-context-render` CC7.4 | the produce-vs-observe scoping of the contract preamble (mutation-verified) |
| `test-cc7-contract-guard` B1.4 | the contract throw stays outside every `try` — rewritten this round after it was found to be measuring a comment and passing under mutation |


---

## Follow-through (2026-08-27) — what a second, complete round changed

VT-20 above records ONE leg of ONE round. IGP-T1 R12 ran the full four-leg migration the next day and
materially changes three things. Recording them here rather than leaving VT-20 to read as settled.

### 1. The delivery claim got much stronger

R12 applied **four** change packages VERBATIM to the live devices with **zero config-syntax defects and
zero device rejections**, and completed the migration to pure IS-IS on both nodes.

| | R11 (this document) | R12 |
|---|---|---|
| Children holding the contract | 0 of 4 | **4 of 4, every leg** |
| Canonical lines missing from the package | 2 | **0** |
| Config lines rejected by the device | — | **0** |

The open question after R11 was whether contract *delivery* alone fixes transcription, or whether the
author must stop generating config text at all (a deterministic renderer was proposed). **Delivery
alone fixed it**, and the renderer was dropped unbuilt. No author has yet been observed dropping a
line while HOLDING the complete exemplar.

### 2. Claim 1 needs a qualification this document could not have known

The transcription check derives its required lines by splitting the contract's canonical stanza, and
the Program Architect's output SHAPE is **non-deterministic across rounds** — R11 emitted it
newline-separated, R12 emitted the same stanza slash-separated on one line. The splitter handled only
newlines, so on R12 it produced ONE needle (`router isis`) that almost any IS-IS package contains: a
confident clean pass over nothing, reported as `stanzasConsidered:1, needles:1, skipped:[]`.

**So the "first live catch" recorded above happened partly by luck** — R11's round was newline-shaped.
Caught pre-gate on R12 and fixed (separator tolerance; the separator is now emitted as a fact; a
stanza that will not decompose is a NAMED skip, never a silent one-needle pass). Both live shapes are
pinned as fixtures.

### 3. The checker had two defects of its own, found by measuring its whole corpus

Corpus measured 2026-08-27 — 8 persisted facts, **4 actually checked**, the entire population since the
lint shipped. Of the two `MISSING` findings ever produced:

- **R11 P1 — TRUE POSITIVE** (8 of 10 required lines present, 2 missing: the real defect).
- **R12 P4 — FALSE POSITIVE.** An OSPF-*removal* leg, whose package correctly carries almost none of
  the stanza and says so explicitly. **The leg reviewer approved it, correctly. The prose judgement
  was right and the mechanical check was wrong.**

A 50% false rate on findings. Small n — decisive about existence, weak about rates.

Also confirmed live on that leg: a placeholder line degrades to its literal prefix, and the prefix from
`net <NET>` matched OSPF `network 1.1.1.1/32 area 0.0.0.0`, reporting four NETs in a package containing
none — **false PRESENCE**, the more dangerous direction, since it makes an absent required line look
transcribed.

Both fixed: prefix matching now requires a word boundary, and the fact carries `linesPresent` /
`linesRequired` so a consumer can distinguish *high-but-incomplete* (a dropped line — a real defect)
from *near-zero* (a leg that does not deploy this stanza). The check deliberately does **not** guess
which it is looking at; it reports the counts and leaves intent to the consumer.

### What this means for how much weight the mechanical net can carry

The campaign's evidence has consistently favoured mechanical checks over prose ones. **R12 is the
counter-example, and it should be read as one:** a checker with no notion of leg intent produced a
confident false block on a clean package, and a human-style reviewer was the one that got it right.
"Mechanical beats prose" is a tendency in this domain, **not a law** — and a guard's own first full
round is exactly when to measure it rather than trust it.
