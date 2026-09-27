# Zero-by-Construction Check with Control Pattern

> **Created**: 2026-09-28
> **Source**: health-run query design across the F9 rewrite-fact queries (2026-09-25), the FU1 chained-value queries
> (2026-09-25) and the MI-13 mechanism inventory (`scripts/report-mechanism-inventory.sh`, 2026-09-27)
> **Status**: Field-tested — 3+ uses, reviewed in the F9 panel; no trigger line has yet caught a real regression
> **Confidence**: 85% (promote to 90%+ when a trigger line first catches a genuine regression and its control proves the catch was real)

## Pattern Overview

**Problem.** A health check that reports "0 problems" usually cannot tell *clean* from *nothing was examined*. The
query ran over an empty window, a filter silently excluded everything, a column read `NULL` for every row, or the fix
it guards has not shipped yet — and each of those also prints 0. Checks like this read as guards while guarding
nothing, and they rot quietly as data changes.

**Solution.** Write each check so that:
1. **The trigger line is 0 by construction on correct code.** It counts something that must never exist if the
   mechanism works (e.g. "a tool-failure condition was met but no degradation was stamped"). Any non-zero is a finding,
   and the check cannot drift as data grows.
2. **Every trigger has a control beside it** — a count of how much the check actually examined (rows in the window,
   executions since the fix). **While the control reads 0, the zero beside it is unmeasured, not clean.**
3. **Exclusions are counted and named, never silent** (rows that cannot be parsed, preserved test fixtures).
4. **A never-fired mechanism is "dormant" only if its trigger was recomputed from its own inputs and found absent.**
   Otherwise it is unmeasured.

## When to Use This Pattern

- Quarterly or health-run queries that guard a shipped fix or a stamped fact.
- Any "should never happen" condition you intend to watch over time.
- Before declaring a mechanism alive, dormant or dead (mechanism inventories).

Not for one-off investigations, where a plain count is fine.

## The Pattern

```sql
-- CONTROL first: how much did this check actually examine?
SELECT '⚪ control: executions examined since the fix' AS line, count(*)::text AS value FROM r
-- TRIGGER: 0 by construction on correct code; any non-zero is the finding
UNION ALL
SELECT '🔴 condition met but the fact was NOT stamped', count(*)::text FROM r
 WHERE <condition recomputed from the row's own inputs> AND NOT (j ? '<the fact>');
```

Rules that make it trustworthy (each learned the hard way):

- **Recompute the trigger from the mechanism's inputs**, not from its output. Checking that the output exists only
  proves the output exists.
- **Scope the window to the fix's live date**, derived from data where possible (e.g. the first row carrying the new
  field). Pre-fix rows had nothing to comply with and would sit in the count forever.
- **Pre-filter rows that cannot be parsed, then count them** — one corrupt row once made a whole-table JSON cast throw.
- **Read values, not just presence.** A fact that exists but always says the same thing can be blind; count its values.
- **Classify matches instead of counting them.** 28 of 46 flags from one validator were false; a count alone would have
  reported 46 "problems".

## Performance/Results

- **MI-13 inventory (2026-09-27):** 58 mechanisms classified; the "trigger recomputed" rule separated 14 genuinely
  dormant mechanisms from blind ones, and the classify-don't-count rule found the one partly blind validator (fixed as
  MI-1). The script runs in about 30 seconds, read-only.
- **F9 rewrite-fact queries (2026-09-25):** the controls proved every column computed (the same queries with the cut
  forced earlier returned 942 and 520 examined rows) before the post-fix window had any data — so an empty post-fix
  result was reported as unmeasured, not as clean.
- **Known limit:** no trigger line has yet caught a genuine regression. That is the promotion condition above.

## Related Patterns

- `global-singleton-health-monitoring.md` (runtime health; this pattern is for stored-data health queries)
- Protocol 10, `signal-design-protocol.md` — the DENOMINATOR axis: "0 banned" without a denominator is a misleading signal
- `scripts/report-mechanism-inventory.sh`, CLAUDE.md "Quarterly Specialist Health-Run" (the live instances)
