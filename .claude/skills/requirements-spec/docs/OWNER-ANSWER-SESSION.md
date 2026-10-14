# Owner-answer session — from a zero-decision generation to an answered objective

> **PROMOTED 2026-10-10 (Steve)** → the general shape is `.claude/knowledge/patterns/owner-decision-elicitation-pattern.md`
> (Process & Workflow, 80%). THIS file stays the canonical operating procedure for the requirements pipeline.
>
> **Status: proven on TWO objectives.** (1) telemetry-export, 2026-09-30: T1-zero run 2 → answered regen 3 → published
> under an owner waiver (step 8); completeness re-proven by T1-zero run 3. (2) log-archive read, 2026-10-09: zero run →
> 20 owner answers → answered run 2, APPROVED 92 → published (`paichart@ff89bef`, waivers W1–W3) → its program reached
> **`programReleasable: true`** (`cmv0jir1y00b0yxmcrcvigrku`). The second-objective promotion trigger was met and the
> owner promoted it (above).
>
> Driver: `requirements-authoring-specialist` (since 2026-10-11; before that pipeline-harness). It owns the requirements
> pipeline and the publish step; this is the step between them. Neighbours: [`DESIGN-DECISION-QUESTIONS.md`](DESIGN-DECISION-QUESTIONS.md) — what the questions are;
> [`PUBLISH-GENERATED-SPEC.md`](PUBLISH-GENERATED-SPEC.md) — what happens after.

> **Walk-through skill (2026-10-08):** `/requirements-spec` (`.claude/skills/requirements-spec/SKILL.md`) orders this
> procedure and its scripts end to end and stops at every owner decision and production/public action. This doc stays canonical.

## What it is

The requirements generator never makes a design decision — it **asks**, and hands the owner ONE list: the *Decisions
needed from the owner* block. A generation that starts from an objective with **no** declared decisions returns that
block in full (~40 rows for a four-domain authorisation program). This session turns it into a numbered DESIGN DECISIONS
list, merges that into the objective, and regenerates — one human edit instead of the 20+ revisions it took to find the
same decisions by hand (telemetry-export Revs 3–25).

Worked example (all files in `cline_docs/follow-ups/`): `telemetry-export-t1zero-run2-draft.md` (the generation's draft),
`telemetry-export-t1zero-answers.md` (the answers, the row→item map, the resulting objective).

## Steps

### 1. Run the zero-decision generation
The objective states the goal, the DRAFT SPECIFICATION line and the descriptors, and declares nothing. Launch it as usual
(`(protocol: requirements-authoring)` title token; in a phase with prior pipeline stages, set
`metadata.duplicateAcknowledged` to the LIST of every prior `Pipeline: …` stage id first). Fetch the draft and the run
summary (read-only; one execution per child, no truncation):

```bash
python3 scripts/publish-generated-spec.py fetch --task <generation task id> --out <run dir>/draft-zero
```

Check the draft is COMPLETE (ends at *Writing rules*, no truncation note) and the owner block sits right after *Design
decisions*. A truncated draft is not answerable — fix the budget first (`lib/agents/role-model-params.ts`).

### 2. Check coverage BEFORE answering anything — this is the real test of the generator
```bash
python3 scripts/check-requirements-coverage.py --draft <the generation's draft>   # exit 1 on any ERROR (2026-10-08)
```
It checks the exact parts of Reviewer checks 8.1 / 8.2 (form only) / 8.3 / 8.6 against the registry, read at run time:
every leg × every key of each class it carries, every gate's approver and position, the four source forms, forced only
on its two keys, and the owner block against the table as sets with tiers. It never guesses a leg's CLASS: a leg with no
producer, authorisation or routing rows at all is listed to READ — confirm its work is outside that class. Proven on the
worked example (it reproduces run 2's hand-recorded deviations below) and on `t1zero-v2` (it finds the waived "owner
block reads none" finding). Tests: `npm run test:requirements-coverage`. Hand-written specs with no decision table are
out of scope. The hand check below is now the READ list, not the whole job.

**Invented rows are sorted by the check itself (B-2 / R2, 2026-10-12).** A row whose key is neither a registry key nor
an item row (`<token>.item-<N>`) reads either *"invented key restates item N"* (a declared row citing item N first — the
Author re-keys it; nothing for the owner) or *"invented key asks a decision no key or item asks"* (an OPEN row the Author
had to raise — the owner answers it as a new item, and it is a registry candidate: file it). Show the second kind to the
owner FIRST.

Compare the owner block's row ids against the registry (`DESIGN-DECISION-QUESTIONS.md` → *Which legs get which rows*):
every leg × every key of its class, every gate. A missing row is a generator defect to file, not something to answer
around. On run 2: 40 of 40, nothing missing.

### 3. Note the draft's deviations — your answers will override them, but they are findings
Look for: a row filed `default`/forced on a key that is not forced-eligible (run 2: all four `gate.*.position`); an
options enum missing an option the template carries (run 2: `representation` dropped `one aligned prefix`); a harvested
value or COUNT inside a question ("which two devices"); leg instructions that assume an answer while its row is OPEN.
Compare with the generation's own Reviewer verdict — what it caught and missed is data for the registry. File them.

### 4. Group the rows into decisions, and recommend with evidence
Forty rows collapse to about a dozen decisions. The grouping used on run 2:

| group | rows | decides |
|---|---|---|
| A. What to act on | targets, receivers, population, representation | which namespace/bucket/ingress/workloads/members, and the value's form |
| B. Who approves and when | `approver.*`, `gate.*.position` | people, and each gate's moment |
| C. Who is admitted, what they may do | `admitted-principal`, `request-path` (when admitted by address), `principal-unseen`, `granted-action` per leg | principal form + the path its requests take + grant; show `request-path` × `principal-unseen` as ONE combined table (U12) |
| D. How the change behaves | `existing-grant`, `target-empty`, `enforcer-absent`, `target-absent` per leg | replace/preserve, empty/absent outcomes |
| E. Side effects and scope | `collateral`, `enforcer-scope` per leg | which parts of the enforcer the restriction covers, and what else changes with it — shown as ONE combined table (they interact) |
| F. Routing (a leg that changes routes) | `covered-routes`, `must-stay-reachable` per routing leg | whether a covering route replaces or accompanies the routes it covers; which destinations stay reachable, from where |

Present ONE group at a time as a table — question · recommendation · **why** (the run or revision that earned it, from the
registry's "earned by" column or the objective file's history). Name where a row is a genuine policy call (e.g. replace
vs preserve) versus a lesson from a failure, and which values only the owner can supply (approver names, identifiers).
Rows the generator *derived* (`tier: confirm`) are recommended as the derived answer, for the owner to confirm. The owner
accepts or changes the group; nothing is decided silently.
**Outcome cells come from the registry, verbatim** (`DESIGN-DECISION-QUESTIONS.md` § *What each answer leads to*, U12,
2026-10-12): what the program does with each option, and which rows interact. The recommendation is always a separate
column. Never compose a consequence the registry does not state; if a row has no line there, say so and file it.

### 5. Record each group immediately, as numbered objective items
Write the accepted answers into the answers file under `### Group <X>` headings as `N. <decision>` items, worded as they
will appear in the objective — decision numbers are what the Author cites and the Reviewer checks, so keep them stable.
One item may answer several rows (e.g. "absent enforcers" for all legs). Then add the **row → item map**
(`<!-- ROW-ITEM-MAP -->` table, one line per owner-block row id; `forced` accepts the generator's forced default and is
legal only on `target-absent` / `inputs-empty`).
**A new-decision row answered as item M** (an invented row of the *asks a decision* kind) is mapped as
`<token>.item-<M>` in the ROW-ITEM-MAP — that is the id the next generation carries (B-2, 2026-10-12). For the MERGE,
the zero draft's own row id stays the question key (the merge compares the zero draft's owner block).

### 6. Merge — mechanically, with the coverage check
```bash
python3 scripts/build-answered-objective.py \
  --base   <the zero-decision objective> \
  --answers <answers file> \
  --draft  <the generation's draft> \
  --out    <answered objective>
```
It refuses to write the objective if an owner question has no answer, a map row names a question the draft never asked,
an item number does not exist, `forced` is used on an ineligible key, items do not run 1..N, or an item answers nothing.
Verified 2026-09-30: rebuilds the launched run-2 objective byte-for-byte; each of those failures mutation-tested.

### 7. Regenerate, then publish
Launch the answered objective as a new generation (new stage, same title token, `duplicateAcknowledged` listing every
prior `Pipeline: …` stage id in the phase — including the zero-decision run's). Verify the task description equals the
merged file before executing. **Carry the owner's row→item map in the harness task's METADATA**, in the same
`task.update` as `duplicateAcknowledged`, and read it back:
`python3 scripts/build-row-item-map.py --answers <answers file>` → `metadata.requirementsRowItemMap`. Never put it in the
objective text. The in-run check uses it for the dropped-clause test, and the correction turn freezes it. Without it,
both fall back to the draft's own citations and record that (`inputs.ownerRowItemMap`).

**What happens inside the run (since 2026-10-09).** The Author's draft is checked in-run, against the same size,
coverage, citation, clause and lint rules as the gates below (`toolLoop.requirementsFormCheck`). A failing draft gets
ONE facts-only correction turn. The correction is kept only if it fixes something and makes nothing worse (adoption
rule v2, 2026-10-10: citations and checked clauses may not fall, coverage errors may not rise, and no clause newly
drops). **Rule v3 (2026-10-12):** one exception — a correction that gets the program view fully under the read limit is
kept even if ONE clause newly reads as dropped; that flag, and every section the correction shrank, then become reads
the publish pass enforces (`--clause-read`, `--correction-diff-read`): a checker miss is named, a real deletion means
regenerate, and a waiver never clears either. The original is saved as `requirements.pre-correction.md`, and a
correction that was NOT kept as `requirements.correction-not-adopted.md`, for a diff read. The correction is part of the same
Author execution, not a re-run. **It does not replace the pre-publish gate**, which still runs on what was delivered. Expect APPROVED with the owner block reading only the accepted forced defaults (or
`none`), every citation quoting items 1..N verbatim.

**Pre-publish gate — required, whatever the verdict** (convergence panel 2026-09-30: the Reviewer's quote check has 100%
precision but ~31% recall, so APPROVED alone is not publishable):
```bash
python3 scripts/check-requirements-citations.py --objective <answered objective> --draft <the Author's requirements.md>
python3 scripts/check-requirements-coverage.py --draft <the Author's requirements.md>   # coverage again on the regenerated draft
python3 scripts/check-requirements-clauses.py --objective <answered objective> --answers <answers file> --draft <the Author's requirements.md>
```
The clause check finds an owner item's obligation (state / list / report / publish / record / name) missing from its
leg. That is NOT a write-up slip.
It string-tests every table citation (one contiguous span; dash variants, backticks, first-letter case and one trailing
mark are the only tolerance) and checks every authorisation leg carries a premise branch applying
`<token>.principal-unseen`. A finding = not publishable, unless waived under step 8. It stands in for the planned `citationFidelity` fact.
Then follow `PUBLISH-GENERATED-SPEC.md`.

**A question added to the registry AFTER the zero-decision run** (e.g. `principal-unseen`, 2026-09-30) is answered like
any other: add the item, and map its rows as `| \`<row id>\` (added <date>: <why>) | N |` — the merge script counts them
as asked.
The same marker covers a row an Author INVENTED in a later zero-decision run (2026-10-10: zero run 3 added
`host-network-member` and `out-of-policy-grants`; the owner pointed both at existing items 4 and 20): map it to the item
that answers it, with `(added <date>: <why>)`, and merge against the draft the other rows were asked in. Merge against
ONE draft — two zero runs of one objective name gates differently and add different rows, so mixing them refuses.

### 8. When the verdict is NEEDS-REVISION on write-up slips only — the manual publish decision
**Current technique (Steve, 2026-09-30), used on regen 3:** do NOT regenerate again to chase slips. Four answered
generations in a row went NEEDS-REVISION on slips that changed nothing, and per-copy slip rates (~5% per quote) make a
fully clean draft unlikely at any prompt tuning (fresh-opinion review, `requirements-author-convergence-2026-09-30/`).
Until P1/P2 remove the slip classes (OPEN-REGISTER, "PROPOSALS … remove the Author's chance to slip"), publish under an
owner waiver when — and only when — every finding passes this test:

1. **Classify each finding** from the Reviewer's verdict AND the pre-publish gate (the gate finds what the Reviewer
   misses — regen 3's two quote slips were gate-only). A finding is **waivable** only if it changes nothing the program
   is told. Waivable shapes seen so far: a quote that differs from its item by a word while selecting the same option; a
   leg that names exactly its target item but omits the inline `.target` citation; an owner block reading `none` while
   omitting a `forced` default the owner already accepted (answers map: `forced`). *(Until 2026-10-12 a coverage ERROR
   "unknown key for a known token" on a row citing an owner item no key asks was waived here as registry-caused (Z47,
   W1). B-2 closed it: that row is now an item row, or reads "invented key restates item N", which the Author fixes by
   re-keying — regenerate, do not waive. An "invented key asks a decision" finding is an owner question, answered as a
   new item, never waived.)*
2. **Not waivable — regenerate (or fix the rule) instead:** a quote or citation that selects a DIFFERENT option than its
   item; a missing row, leg, gate or premise branch; a harvested value anywhere (`PUBLISH-GENERATED-SPEC.md`); any
   blocking finding about what a leg DOES. Never hand-edit the spec to fix one — a hand-edited spec tests nothing.
3. **Show the owner each finding with the exact text** (draft line vs. item) and the classification; the owner decides.
   The waiver is the OWNER's decision, recorded by name — not the operator's.
4. **Record it in the published directory's `PUBLISH-NOTES.md`**: source task id, protocol version, verdict + score,
   the waiver (approver of record, date, each finding numbered with why it changes nothing), and the checks run (gate
   output, harvested-state lint, publish checks). The notes file is not a program input. Worked example:
   `~/paichart/program-artifacts/telemetry-export-genspec-t1zero/PUBLISH-NOTES.md`.
5. **Publish per `PUBLISH-GENERATED-SPEC.md`**, additionally removing the platform's "NOT RELEASED — quality gate:
   needs-revision" banner from `report.md` (the waiver is what releases it — say so in the notes).
6. **File the slips** in the open register against P1/P2 — each waived run is evidence for, or against, removing the class.

## Why the order matters
- **Coverage before answers** — once answers exist, a missing question is invisible: the regenerated spec is complete by
  construction for whatever was asked.
- **Group, don't list** — 40 rows presented flat invite rubber-stamping; a dozen decisions with evidence invite judgement.
- **Record immediately, merge mechanically** — the answers file is the owner's record; hand-assembling the objective is
  where a question quietly goes unanswered.
