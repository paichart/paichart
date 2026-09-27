# Evidence-Graded Panel Review Protocol (Protocol 14)

> **Purpose**: HOW to run a high-stakes specialist panel so that its conclusion can be trusted — from making sure
> the panelists' knowledge is current, through an independent audit of the synthesis, to the gates a change must
> pass before it ships. Protocol 2 decides **whether** a review is needed and who sits on it; Protocol 13 is the
> finding → fix loop that calls for a review at its step 4. This protocol is the **procedure for the review itself**
> when the stakes justify the full machinery.
> **Owner**: pipeline-harness-specialist (coordinator role). **Created**: 2026-09-28, from the EF-DL2 arc
> (`cline_docs/reviews/ef-dl2-dialect-lint-classification-2026-09-27/`), where every step below caught something real.
> **Companions**: Protocol 2 (whether + who), Protocol 13 (the loop this plugs into), Protocol 10 (fact vs verdict for
> any signal the change ships), Protocol 11 (the drift sweep that closes it), Protocol 12 (keep specialist files lean
> while updating them), `SPECIALIST-LIFECYCLE-GUIDE.md`.

## When to use — and when NOT to (proportionality)

The full procedure costs roughly **8–12 agent runs** (EF-DL2: 6 knowledge refreshes, 4 lanes, 1 audit, 1 blind
labeller, 2 implementations). Match the machinery to the stakes:

| Tier | Use when | Machinery |
|---|---|---|
| **0 — single review** | A contained change with one owner, one obvious layer, and cheap reversal. *(EG-1's wording change used one reviewer and was right to.)* | One specialist review (Protocol 2). |
| **1 — small panel** | Two or three domains touched, or a design choice with a real alternative. | Phase A (2–3 lanes) + Phase B. Skip C unless the synthesis resolves a disagreement. |
| **2 — full protocol** | Any ONE of: changes a heuristic, classifier or gate that decides outcomes across many runs; edits a shared key used by several domains; a security or tenant boundary; ships to a public mirror or a customer-facing surface; panelists are expected to disagree; the first cut was already wrong once. | Phases 0 → E, all of them. |

State the tier and the reason in the review folder's `PANEL.md`. Moving up a tier mid-review is normal; moving down needs a reason.

## Phase 0 — Refresh the panelists' knowledge, and prove it

A panel is only as good as what its specialists believe. **Earned 2026-09-27 (SK-1, `83783365`):** six specialists
self-updated before the EF-DL2 panel; the documented-grep audit went 258 → 309 greps, and the pass surfaced three things
the panel would otherwise have reasoned from wrongly — a test filed as live-server-bound that was not, an inventory script
that never read the newest facts' values, and a wrong attribution of which change added a reader.

1. List the facts shipped since the panelists' last update (the commit log is authoritative, not memory).
2. Each relevant specialist **updates its own library and discovery** (never its agent file beyond correcting a false
   sentence — Protocol 12) with two passes: ADD what is missing, and CLAIM-STALENESS (correct what the changes made false).
3. **Prove coverage** with a matrix: a distinctive token per shipped fact, grepped across each specialist's three files.
   Every blank must be either filled or judged irrelevant to that specialist, out loud.
4. Run the documented-grep audit; the audited count must not silently drop.

Skip for Tier 0–1 if the panelists' files were updated since the relevant changes.

## Phase 1 — Initial assessment (the coordinator)

Write `ASSESSMENT.md` before briefing anyone:
- **The defect as a property** ("the net scans what the package asks the device to become"), not as an instance.
- **What is already measured** and **what is not** — the unknowns become the lanes' questions.
- **Blast radius: every consumer** of the thing being changed. *(EF-DL2: a second net consumed the same classification.)*
- **Anchors pinned at HEAD.** Line numbers copied from the register or an older doc drift after every edit.
- Constraints the panel must respect, including earlier decisions recorded in the code itself.

## Phase A — Lanes

- **Non-overlapping lanes**, one per specialist, each with numbered questions. A lane owns a question; it may comment on
  others' but does not answer them.
- **Every brief carries the same rules:** run your discovery first; review only — **no edits, no commits** (write only your
  output file); prod read-only with a statement timeout; measure the property, classify matches rather than counting them;
  cite file:line; end with a findings table, what you could NOT establish, and a confidence %.
- **Relay findings between lanes mid-panel.** When one lane finds something another lane's measurement depends on, send it
  to that lane before it finishes. *(EF-DL2: Lane 3 found a second defect; Lane 1 re-scored on top of it. Without the
  relay, the headline number would have blended two defects.)*

## Phase B — Synthesis (the coordinator)

- Synthesise from the lanes' **full files**, never their summaries.
- Separate **agreement** from **disagreement**; resolve each disagreement **on evidence**, naming which lane's measurement
  decided it.
- **Attribute** the recommendation to the lane that made it; do not write "the panel recommends" unless all lanes did.
- **Put the cost in the headline**, next to the benefit. *(EF-DL2 v1 omitted "false SCAN 5 → 109"; the audit caught it.)*
- **Check acceptance criteria honestly**, including failures. A criterion that fails by one is reported as failing, with
  the reason — never smoothed into "passes".
- **Frame each decision neutrally**: the options, the trade-off, a recommendation.
- **Traceability table**: every finding from every lane → folded / deferred with reason / rejected with reason.
- Correct your own earlier errors in the open (e.g. an assessment claim a lane disproved).

## Phase C — Independent audit

- An auditor (system-reviewer by default) reads the **lane files first** and writes its **own obligation list before
  opening the synthesis**, then checks the synthesis against it. *(Earned twice: on the RWF Stage 1 plan, 13 of 71
  obligations not fully covered, 2 of them defect-grade and 2 missing; on EF-DL2's synthesis, 4 defect-grade misstatements.)*
- Output classes: **DROPPED · MISREPRESENTED · RESOLUTION-CHALLENGED · AC-OVERCLAIM · MISSING-DECISION**, each with both
  quotes, a grade and a fix; overall verdict FAITHFUL / FAITHFUL-WITH-FIXES / NOT-FAITHFUL.
- **The coordinator re-runs the load-bearing items before folding them.** Folding an unverified audit claim repeats the
  failure the audit exists to prevent.
- Fold every item into a **v2 synthesis** with a section mapping each audit item to where it was folded.

## Phase D — Decision

The owner decides. Record each decision as taken — in the synthesis, the register, and any standing CLAUDE.md entry it
changes — even when the answer is "all recommendations". A decision nobody wrote down gets re-litigated.

## Phase E — Implementation gates

1. **Ground truth for heuristic changes.** If the change alters how something is classified, hand-label **every item the
   change moves** (a census, not a sample), then have a **blind second labeller** re-label them:
   - the **coordinator builds the blind input** — the items' context with no labels and no classifier output, shuffled,
     the answer key held back; an instruction "not to look" is not blindness;
   - include items of **both** classes, so hidden errors in either direction can surface;
   - score agreement on the axis that matters to the decision (e.g. config vs non-config), and read every disagreement.
2. **The owning specialist implements, uncommitted** (shared worktree: one commit owner). Separate concerns go in separate
   commits.
3. **Coordinator review before commit:** scope matches the brief; a sensitivity scan of any new fixtures (they may reach a
   public mirror); **re-run one mutation independently**; the full test suite **and `npm run build`** — `tsc` alone passed
   on a file whose absolute import broke CI.
4. **List every stored-value change** the commit makes (archive replay), in the commit message. "0 dispositions moved" is a
   claim to measure, not assume.
5. **Before a code push:** nothing executing, no deploy running, enough memory for the build. Remember a docs-only push does
   not deploy, so a build-breaking file in one stays hidden until the next code push.
6. **Close with Protocol 11** and schedule the re-measure (e.g. a health-run baseline) if the change ships a new baseline.

## Anti-patterns (each observed)

- Synthesising from the lanes' summaries; the full files carried findings the summaries dropped.
- Letting panel agents commit in a shared worktree.
- Declaring an acceptance criterion "passed" without re-scoring the moved items against ground truth.
- Giving a "blind" labeller a path to the first labeller's file.
- Carrying an inherited claim into the assessment without a mechanism behind it (EF-DL2: "EG-1 made a false scan lower-stakes" — the net's facts never reach a reviewer).
- Committing review scratch code that imports by absolute path into a type-checked folder.

## Proven impact (EF-DL2, 2026-09-27/28)

- A second, independent defect found mid-panel and folded into the fix.
- Four defect-grade misstatements caught by the audit before the owner decided, including an overstated test result.
- Ground truth confirmed blind (config vs non-config agreement 104/104, κ = 1.000) before the change merged.
- Shipped result: real configuration never scanned 32 → 2 blocks; 0 violations changed; 2 presence results corrected;
  the second consumer's decisions unmoved — each figure measured on the archive and listed in the commit.
