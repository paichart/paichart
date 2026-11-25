# Staged Lab Registration — sign a chained-role lab one stage at a time, on real upstream samples

**Confidence**: 80% ⚠️ (the planting lever is proven on two labs; the stage-by-stage sign-off is in its first full use)
**Category**: Process & Workflow
**Added**: 2026-11-23 (pipeline-harness with model-evaluation; owner-approved)
**Related**: Protocol 16 (`protocols/pre-registered-lab-gate-protocol.md`, § "Optional blind reads") ·
`pipelines/LAB-USER-GUIDE.md` § 5a · `zero-by-construction-check-with-control-pattern.md` (a check must be shown to exercise the change)

---

## The pattern in one rule

**When a later role's lab cell needs the output of an earlier role, do not hand-build that output. Run the earlier role's
cells first, hand-read one sample, plant it into the next role's cell, and register each stage — with its own cells, stop
rules and spend caps — only when the samples it binds to exist.**

## When to use

- A lab measures a text or model change across roles that feed each other (a state reader → a designer → an author → a reviewer).
- The change alters the SHAPE of what the earlier role produces, so no stored production output has that shape yet.
- You are about to write a design or a package by hand so that the downstream cell "has something to read".

Do not use it when every cell can run on a stored production output unchanged, or when only the last role's text changed.

## The problem it solves

A hand-built upstream input looks plausible and is wrong in ways its builder cannot see. The typical form is a stored output
re-stamped to fit a new cell: the handles, paths or labels are moved, and the words around them still describe the old world.
The downstream agent then reads a prompt that no production run could produce, and every paid sample on that cell measures the
fixture.

Measured once (2026-11-23, an observability text lab): a declared-source Author cell paired a stored design with newly kept
files. The design told the Author to edit handle `H2`; the files shown were `H1`, `H4`, `H5` at other paths. Both blind readers
of that cell ranked it their first finding. It was found at $0, before any sample was bought, and it came from building an
upstream output by hand. (The same read found a second fault of a different kind — the declared lines placed in the task body
instead of the contract. That is a placement check, in the lab user guide § 5a, not this pattern.)

## The shape

```
Stage 1  earliest role's cells (+ any cell that runs on a stored output unchanged, + the golden set)
           │  owner signs stage 1 → paid → EVERY sample hand-read → name the samples stage 2 binds to
Stage 2  next role's cells; upstream = a hand-read stage-1 sample, planted by the lab's input-edit lever
           │  registered by a DATED ADDENDUM: node definitions, plants, stop rules, caps from its own dry run
Stage 3  … and so on, one addendum and one owner sign-off per stage
```

- **One pre-registration document, written whole before any spend.** Every stage's cells, gates and decision rule are DESIGNED
  up front. What is deferred is only what cannot be known yet: the node definitions that bind to a sample, each plant read
  against the inputs its reader actually holds, and the caps.
- **Caps come from each stage's own dry run**, by the cap rule written in that lab's registration (the owner's rule for the
  2026-11 labs: the lab's estimate × 1.10 + 5 × the dearest sample; an older lesson in Protocol 16 says estimate + 20% — the
  registration states which one it uses), never from the planning figure. The planning figure for the whole lab is shown to the owner at the first sign-off and repeated at each one.
- **The sample that feeds the next stage is hand-read and named in the addendum**, with the reason it was chosen. A sample
  that broke a stop rule never feeds a later stage.
- **A hand-built part that cannot be avoided is listed** (which bytes, by how many exactly-once edits) and gets a fixture
  blind read before its first paid run.

## What you give up, stated plainly

- **Several sign-offs instead of one.** The owner approves spend per stage. Show the whole-lab planning cost every time so no
  stage reads as the total.
- **The lab runs in order and takes longer on the clock.** A late stage cannot start until the stage before it is read.
- **A stage-1 result can change the later design.** That is the point, and it is recorded by addendum, never by rewriting a
  registered gate.

## Anti-patterns

- **Re-stamping a stored output** to fit a new cell and calling the cell built.
- **One sign-off for cells that do not exist yet.** The caps are then guesses and the plants are unread.
- **Rewriting a registered gate after a stage's result.** Add an addendum beside it; an override is the owner's, written next
  to the gate it overrides.
- **Feeding the next stage the best-looking sample without reading the others.** The choice is then a selection effect.

## Checks before a stage is signed

1. The dry run of every cell in the stage exits clean: the candidate text is in every candidate arm, every plant reaches its
   reader, every input edit is re-read.
2. The fixture identity check holds for any file fixture the stage reads.
3. The "before" run reads zero on stored outputs for every new score that can be calibrated that way; say which cannot.
4. Any hand-built part has had its fixture blind read, and only the cells that were fixed are re-read.
5. The clean-copy gates pass on the commit the owner will run.

## Evidence

- **The planting lever**: an Author lab sample bound into a Reviewer cell (2026-10-15) and a Harvester lab sample bound into
  downstream cells (2026-10-18); designed in from the start, for every role, on an observability text lab (2026-11-23).
- **The cost of the alternative**: one hand-built Author cell that no production run could produce, found by blind readers at
  $0 on the 2026-11-23 lab. No measurement yet attributes a paid overrun to a rebuilt cell.

## Promotion condition

90%+ once one lab has run every stage this way and no cell had to be rebuilt after a paid sample.
