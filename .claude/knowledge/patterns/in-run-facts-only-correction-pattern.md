# In-run facts-only correction — pattern

**Status:** 2 production instances (2026-10-06 terraform `config_change_author`; 2026-10-09 `requirements_author`).
**Confidence, stated per guard (the instances do not share one):**
- **80% for the provenance-guard variant (terraform).** Live: 9 of 9 attempts adopted, 0 collateral changes (A.5).
  Its scope is approved latent truncation, so it fixes packages, not refusals.
- **75% for the regression-guard variant (requirements).** It goes above 85% only after M-A (false-finding rate),
  M-B (adopted vs original read) and M-C (rejection branch end to end).

Post-work specialist review, audit and owner decisions G1–G8:
`cline_docs/reviews/in-run-correction-post-review-2026-10-10/` (SYNTHESIS.md). Corrected 2026-10-10 per G2.

## The problem it solves

An agent's deliverable fails a rule a machine can check — size, form, a missing line, a fabricated citation — and the
failure is only found AFTER the run: by a reviewer, by a human, or at publish. The fix is then a regeneration, which
re-rolls everything else too. Findings fixed in run N are replaced by new ones in run N+1, and the total does not
fall. That is an **open loop**: nothing inside the run told the agent what was wrong.

Measured (n = 1 attempt, one objective, Opus 5.5 Author): the pre-registered test passed at run 2 of 3 (VT-33). In
both runs the first draft was over the program read limit (by 11,953 and 5,554 characters), and the adopted
correction was under it. On that dimension the turn was necessary for this pass. The 9-generation trial before it is
not a control: the objective, model, checkers, pass rules and skill rules all changed too. Under today's checkers,
trial generation 9 fails only on size. The size failure itself appeared when the Author moved to Opus 5.5 (5 of 6
Opus drafts over the limit, 0 of 4 Sonnet drafts). The fix for that belongs at the source (G8), not in this loop.

The terraform instance has a different scope. It corrects latent truncation (diff hunk headers that undercount their
bodies) on packages reviewers were approving anyway. It does not reduce refusals.

## Live record after the post-work review (2026-10-10, requirements instance, adoption rule v2)

Every live requirements attempt since batch 1 was **adopted**:
- the batch-1 control (VT-33 run 2 re-run): 54.3K → 45.1K, 3 dropped clauses → 0;
- Z49 Phase D, zero run 3: adopted in 137 s, 0 clauses dropped;
- Z49 Phase D, answered run 2: lint 10 → 0, clauses 1 → 0, size 60,315 → 50,099;
- Z49 Phase D, answered run 3: adopted.

Three lessons, each measured:
- **Adopted is not passed.** Answered run 2's correction was adopted (every measure improved), but its program view
  was still 99 characters over the read limit, so the draft was regenerated. The adoption rule asks "no worse and
  something better"; the publish gate asks "within the limit". Never report an adoption as a pass.
- **A checker false positive refuses good corrections.** In lab L10 under the pre-Z48 clause checker, **0 of 6**
  corrections were adopted: each was refused for a "dropped clause" the checker misread. After the Z48 fix, live
  adoption was 3 of 3. When adoption falls, check the checker before the text.
- **Still owed:** M-B, a blind read of adopted vs original (register M-B-PAID-DECISION). Every requirements adoption
  so far is a size repair, so the regression guard's blind spot (wording no check measures) is still unmeasured.
  The 75% confidence stands.

## The shape

```
agent loop ends (end_turn) ─► CHECK (pure, deterministic) ─► stamp FACT on result.json (always — shadow mode)
                                         │
                       a trigger check fails AND flag ON AND the instance's own gates pass
                                         │
                           ONE tool-less correction turn, message = measured FACTS only
                                         │
                     re-CHECK the corrected text ─► ADOPTION RULE ─► adopt (persist corrected) | keep original
                                         │
                         stamp the decision, before/after measures, tokens, duration on the fact
```

1. **Check** — a pure function over the deliverable text (+ named inputs). No LLM. Mutation-tested fixtures.
2. **Fact** — stamped on every eligible execution whatever the flag says (shadow mode first: real trigger rates with
   zero behaviour change). Nested under `toolLoop.*` (E3b) — no whitelist edit; ahead of `finalResponse`.
3. **Decision** — first matching reason wins, every skip named. **Common prefix:** `not-checked` →
   `no-trigger-hit`/`no-failing-check` → prior reflection pass used → budget self-flag → `flag-off`. **Then the
   instance's own gates:** terraform — `hits-include-non-undercount` (scope); requirements — missing inputs →
   `insufficient-time`.
4. **The turn** — ONE reflection-mode call, no tools (`tool_choice none`; preserved-thinking models keep the tool
   set). Spends the run's one reflection pass, so #90 is disqualified. **This includes a failed attempt:** an
   `llm-error` attempt sets `attempted: true`, so a 50–69 package whose correction call failed gets neither pass. That
   is a deliberate cost/time trade, named here so it is not rediscovered.
5. **The message carries facts, never verdicts or design instructions.** What was measured, against what limit, where.
   The only instructions are re-emission mechanics (same headings, keep decisions, no tools, keep the confidence line).
   Pin it: a vocabulary test that no design verb (`cut`, `remove`, `should`, `recommend`…) appears. **A fact the
   checker got wrong is still a false message:** 2 of 2 live requirements messages carried one (the zero-run citation
   parse; the Z48 clause findings). A trigger check's false-finding rate is part of its fitness (condition 1).
6. **Adoption rule.** Conditions in order, first failure named: provider OK + non-empty + `end_turn`; the corrected
   text re-checks; structural guards (headings, R10 redaction placeholders, confidence line byte-identical); **no
   measured check worsens**; at least one failing check strictly improves. Otherwise the original is kept by
   reference. **What it guarantees depends on the guard:** with per-line provenance, no line changes except the
   named ones. With a regression guard, only that no MEASURED check worsens. Text no check measures can still be
   lost (see condition 4).
7. **Envelope.** A default-OFF env flag read through one helper (literal `'true'` only); kill criteria; an MI-13 row;
   a recorded card decision; the prompt pinned by hash; a CLAUDE.md series cut at switch-on. **Time bound — the
   instances differ:**
   - requirements derives a budget from the R4 constants and skips with `insufficient-time`, never overrunning;
   - terraform has NO deadline check, only a fixed 600 s abort, and its decision has no time arm.

   A third instance takes the requirements form.

## When it applies — all four must hold

1. **The defect is mechanically detectable with ~zero false triggers** — measured, not asserted. A false trigger
   costs a turn and risks drift. A pre-filter (known blind spots or false positives) is guard-only, never a trigger.
2. **The agent can fix it with what it already holds.** Form, size, a missing/duplicated line, a count, a citation to
   text it has. NOT a judgement, missing evidence, or a fact it would have to re-read.
3. **The adoption rule can prove the correction did not make it worse** — a measure set that covers what matters, or
   line-level provenance.
4. **If the cheapest repair of a trigger is a deletion (size, count caps), the adoption rule must also measure the
   content a deletion could remove: per-line provenance, or a content-preservation measure — or, where the adoption
   rule waives that measure, an ENFORCED read of it before the deliverable is used (requirements rule 3, 2026-10-12:
   `publish-generated-spec.py` `--clause-read` + `--correction-diff-read`).** A regression guard over the trigger checks
   alone does not satisfy condition 3 for such a trigger. ⚠️ The requirements instance never met this condition for
   size by measure: `clausesChecked` cannot see a deleted sentence, and the clause check covers ~10 obligations per
   spec. Its guarantee is the enforced read, and it holds only while **the publish pass is the only route from a
   generated spec to a program** (invariant — any second, automatic consumer of a generated spec reopens rule 3).

**Measured limit (requirements stage A):** the loop sees FORM slips, not JUDGEMENT slips. Do not route judgement
through it.

## Two instances, two guard strengths

| | terraform `config_change_author` | `requirements_author` (2b) |
|---|---|---|
| Check | `package-form-check.ts`: diff hunk headers vs bodies | `requirements-form-check.ts` (TS port of the publish checks): size/program view, stray rule citations, coverage, citations, clauses, lint, residue |
| Trigger | hunk-header undercount only (narrow, by design) | every failing trigger check; registry-caused coverage findings EXCLUDED (the agent does not own them). Lint is a pre-filter and should be guard-only (G3) |
| Adoption guard | **per-line provenance** — every changed line must come from a named source (`content-not-from-named-source`, `header-start-changed`) | **regression-based** — no measured check worsens + one improves; headings/placeholders/confidence structural guards. **Rule v2 (G1 A, built 2026-10-10):** frozen before-map, citations/clauses-checked may not fall, all coverage findings guarded, clause findings by identity; probes P0–P6 pinned (P2–P4 still adopted — the measured blind spot). **Rule v3 (2026-10-12, panel `cline_docs/reviews/correction-adoption-severity-2026-10-11/`):** size cleared to 0 adopts over ≤ 1 newly flagged clause (`unwaivable-cleared` arm, owner P1 = C); the read is enforced at publish, never by a waiver |
| Flag + eligibility | `FORM_CORRECTION_ENABLED` (ON 2026-10-06 23:52:54Z). **One global flag; eligibility is role-wide, so it covers all four domains that share the role**, though only terraform triggers today | `REQUIREMENTS_FORM_CORRECTION_ENABLED` (ON 2026-10-09 04:00:17Z, before run 1 of the three-run test). **Hold on new generations until G1 A ships** |
| Time bound | fixed 600 s abort; no deadline check | R4-derived budget, `insufficient-time` skip |
| Original kept? | the package by reference; on adoption the changed lines are on the fact (`edits`, ≤ 8) | `requirements.pre-correction.md` on every attempt + sha pointer + before-lists (G1 B, built 2026-10-10); since rule 3 the NOT-adopted correction too (`requirements.correction-not-adopted.md`) + after-lists; both hashed on the persisted (post-R10) bytes. Before G1 B: not persisted |
| **Gates actually run** | live shadow + Protocol 16 lab | stage A replay of stored drafts + the three-run go/no-go. **No live shadow window (<2 h), no lab, no blind read of adopted vs original** |
| Envelope surfaces | kill criteria, MI-13 rows, card line, prompt sha pin | **none of those four yet** (G5) |
| Records | `cline_docs/reviews/mechanical-reflection-trigger-2026-10-07/` | `cline_docs/reviews/requirements-author-retrospective-2026-10-09/` (WIRING-NOTE-2B, SYNTHESIS) |

**The regression guard is weaker by construction.** A whole-document re-emission can change wording no check
measures. Both live requirements adoptions were size repairs that shrank the document by 21% and 15%, and nobody has
compared what was removed with what remained. **A regression-guard instance MUST persist the original; without it the
guard's blind spot cannot be measured.**

It is wrong to say requirements lines have "no named source". Decision-table rows, owner-block lines,
`(declared — item N)` lines and objective-declared tokens all have one. The regression guard is there because no
per-line provenance check exists for this document yet, not because one is impossible. Prefer provenance wherever
lines can be traced to a source.

**The Author's confidence line carries over.** It is kept byte-identical, so it is the Author's verdict on the draft
BEFORE correction, sitting over a re-emitted text. For terraform only header counts move. For requirements the same
score sits over a document 15–21% shorter, and keep-best and the #90 band read it. This is a known property, not a
fix.

**A regression guard must compare IDENTITY, not COUNTS (Z66, adoption rule 4, live 2026-10-12 09:27:20Z).** Rule 3 refused
a correction because "citations may not fall" (27 → 26): the correction had re-keyed six restating rows and merged two rows
citing the same item — exactly the fix the checks asked for. A count guard scores a legitimate merge as a loss. Rule 4
compares which (leg row or section, item) pairs are still cited and verbatim. Its first version then ADOPTED a correction that
kept one quote of a merged item and silently deleted the item's other sentence ("Nothing maintains the set after the
program"), because the clause guard only recognises state/list/report/publish/record/name obligations. The independent review
found it; the fix guards the item WORDS each scope's verbatim quotes cover (`citationsNarrowed`). Replay: 1 of 100 stored
attempts changes. **Lessons:** (1) every guard that counts something will refuse a correct merge or accept a narrowing —
compare what is still present, not how many; (2) a "dropped-clause" guard covers only the verbs its grammar knows —
prohibitions ("never…", "nothing maintains…") need their own cover; (3) an adoption-rule change is a gate change: independent
review plus a full replay of stored attempts before deploy. Records: `cline_docs/reviews/z66-adoption-duplicate-merge-2026-10-12/`.

## Preconditions before a third instance

1. Corpus-measured share of fixable defects, **per domain** for shared roles.
2. A **live** shadow window with enough eligible executions to measure the false-trigger rate. A replay corpus alone is
   not enough.
3. A lab with a **hand or blind read of every adopted output** against its original. Mandatory, and never "replaced
   by" a downstream pass.
4. The guard: per-line provenance where lines have a source. For a regression guard, condition 4 must hold for every
   trigger whose cheapest repair is a deletion.
5. Triggers are checks with a measured ~zero false-trigger rate. Pre-filters are guard-only.
6. Prompt pinned by hash, with a re-measure required on any change.
7. Envelope checklist complete: time budget, kill-criteria rows (including a join of Reviewer blocking items to
   changed lines or sections — the attribution criterion), MI-13 row, card decision recorded, check suites in CI.
8. Protocol-keyed eligibility and per-domain series cuts for roles shared across domains.
9. A step registry with a surface-coverage test, and a `reflectionPassSpentBy` slot naming who spent the pass (G6).
10. Fix at the layer that owns the defect (see anti-patterns).

## How to add a new instance (do not skip steps)

1. **Corpus-measure first.** Classify the role's refusals / post-run findings: what share is a mechanically detectable
   defect the agent could fix alone? Small share ⇒ stop.
2. **Check + fact in shadow** (flag absent) — measure trigger and false-trigger rates live, per domain.
3. **Protocol 16 lab gate** — replay refused cases with the turn on, rule pre-registered (refusals fall; no approved
   control regresses; no adopted text worse on a blind read).
4. **Flag on** — per domain where the flag allows it (terraform's does not), with kill criteria and a series cut in
   CLAUDE.md.

The requirements instance did not follow steps 2 and 3. That was a recorded owner decision: the role has no other
user, and the three-run test stood in. It is not a precedent. See "Gates actually run" above.

## Anti-patterns

- A correction message that judges or instructs design ("shorten section 3") — it becomes a verdict channel (Protocol 10).
- More than one turn, or a loop until clean — unbounded cost, and it optimises the checker, not the deliverable.
  **A single turn has the same problem when the cheapest repair is a deletion** (condition 4).
- Triggering on what the agent does not own (registry-caused findings) — it cannot fix them and will churn.
- Using a pre-filter as a trigger. Its hits are candidates, not findings, so a deletion of a legitimate flagged value
  counts as a repair.
- **Correcting the agent toward a defective checker or spec.** If the checker is wrong (Z48) or the spec prescribes a
  form no stage produces (Z50), fix that layer. Do not route it to the agent.
- Adoption on "looks better" or on the agent's own claim — only re-measured facts adopt.
- Gating release on the turn's outcome — the turn improves inputs; the reviewer/gate still decides. Never let a card
  word such as "repaired" turn `adopted` into an endorsement.
- Telling the Reviewer a correction happened — it contaminates the Reviewer population (the `evidenceGrading`
  precedent). Attribute through the data instead (precondition 7).
- Shipping the turn before shadow data exists.

## Pins

`test:package-form-check`, `test:form-correction`, `test:form-correction-core`, `test:requirements-form-correction`
(all in `test:all-validation`). The requirements check's own suites (`test:requirements-form-check`, `-parity`,
`-data`) are NOT in CI. **Terraform only:** kill criteria `scripts/report-form-correction-kill-criteria.sh` (prices
attempts at Sonnet rates; the terraform Author is on Opus 5.5 since 2026-10-07, so cost is under-stated about 2×),
MI-13 rows `PACKAGE FORM CHECK` / `PACKAGE FORM CORRECTION`. The requirements instance has no kill criteria and no
MI-13 row yet (G5). **Owed:** a pin that no `qualityGate` or gate conjunct reads `toolLoop.*Check.correction`. Today
that holds by grep, with nothing enforcing it.

**Companions:** agent-output-trustworthiness-defense-stack (the anti-fabrication correction turn is the ancestor);
pre-registered lab gate (Protocol 16); signal design (Protocol 10).
