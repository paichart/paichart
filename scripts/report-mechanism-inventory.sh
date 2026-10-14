#!/usr/bin/env bash
# report-mechanism-inventory.sh — MI-13, made repeatable (2026-09-27). Quarterly health-run item (CLAUDE.md).
#
# Asks of every stamped fact, degradation signal, validator check, terminalizer and gate input: WHEN DID IT LAST
# FIRE, AND — for the ones that never fire — DID ITS TRIGGER HAPPEN? A never-fired mechanism is healthy (DORMANT) only
# if its trigger was recomputed from its own inputs and found absent; that recomputation is the point of this script.
# Baseline + the four buckets: cline_docs/reviews/mechanism-inventory-2026-09-16/INVENTORY.md.
#
# READ-ONLY against prod (psql over ssh; statement_timeout on every query). Nothing is written anywhere.
#
# Output: census tables, then TRIGGER lines. Every "🔴" line is a finding — each is 0 by construction on correct code,
# so it cannot rot as data grows. A "⚪" line is a CONTROL: while it reads 0, the zero beside it is unmeasured.
#
# Two exclusions are FACTS the script measures and names, never silent:
#   - an artifact whose JSON holds a lone UTF-16 surrogate escape (X11 class) cannot be cast to jsonb; such rows are
#     filtered BEFORE any cast and COUNTED, so one bad row cannot crash the run (it did, twice, on 2026-09-27);
#   - a task carrying a "PRESERVED TEST FIXTURE" comment is a deliberate specimen (e.g. the 2026-09-14 SYNTHESIZE
#     dead-end program, left hung on purpose). It is listed by name — DO NOT re-run it: retention is count-based, so
#     two more executions evict the failing one and destroy the fixture.
#
# Usage:  scripts/report-mechanism-inventory.sh            # default windows: 90d census, triggers since 2026-07-18
set -euo pipefail
PROD="${PROD_SSH:-<PROD_USER>@<PROD_HOST>}"
SQL=$(cat <<'SQL'
SET statement_timeout = 240000;
\pset pager off
-- Artifacts safe to cast: JSON objects with no lone-surrogate escape (X11). MATERIALIZED guarantees the filter runs first.
CREATE TEMP VIEW _raw AS SELECT id, name, "executionId", "createdAt", content FROM agent_artifacts
  WHERE name IN ('result.json','pipeline-index.json') AND content LIKE '{%';
\echo
\echo ============ 0. EXCLUSIONS (named, never silent) ============
SELECT count(*) AS artifacts_skipped_lone_surrogate FROM _raw
  WHERE content ~* '\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})' OR content ~* '(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}';
-- Preserved specimens: the FACT is metadata.runDisposition.state='preserved' (MI-3). A task marked only by a
-- "PRESERVED TEST FIXTURE" comment is listed too, flagged so its disposition can be recorded.
SELECT t.id, left(t.title, 70) AS preserved_fixture, t.status,
  CASE WHEN t.metadata->'runDisposition'->>'state' = 'preserved' THEN 'runDisposition=preserved'
       ELSE '⚠️ comment only — record runDisposition' END AS marked_by
FROM tasks t
WHERE t.metadata->'runDisposition'->>'state' = 'preserved'
   OR EXISTS (SELECT 1 FROM comments c WHERE c.task_id = t.id AND c.text LIKE 'PRESERVED TEST FIXTURE%');

CREATE TEMP TABLE _a AS
WITH ok AS MATERIALIZED (SELECT * FROM _raw
  WHERE content !~* '\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})' AND content !~* '(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}')
SELECT id, name, "executionId" eid, "createdAt" t, content::jsonb j FROM ok;

\echo
\echo ============ 1. STAMPED FACTS — top-level keys (lifetime / 90d / 30d / last) ============
SELECT name AS artifact, k AS key, count(*) AS lifetime,
  count(*) FILTER (WHERE t > now() - interval '90 days') AS n90,
  count(*) FILTER (WHERE t > now() - interval '30 days') AS n30,
  to_char(max(t), 'YYYY-MM-DD') AS last_seen
FROM _a, jsonb_object_keys(j) k GROUP BY 1, 2 ORDER BY 1, 2;

\echo
\echo ============ 1b. Do the nets ever say anything but their default? (90d) ============
SELECT 'derivationContainment disposition' AS fact, coalesce(j->'derivationContainment'->'containmentDisposition'->>'disposition','(none)') AS value, count(*), to_char(max(t),'MM-DD') AS last
  FROM _a WHERE j ? 'derivationContainment' AND t > now()-interval '90 days' GROUP BY 2
UNION ALL SELECT 'rollbackContainment disposition', coalesce(j->'rollbackContainment'->'rollbackDisposition'->>'disposition', j->'rollbackContainment'->>'rollbackDisposition','(none)'), count(*), to_char(max(t),'MM-DD')
  FROM _a WHERE j ? 'rollbackContainment' AND t > now()-interval '90 days' GROUP BY 2
UNION ALL SELECT 'dialectLint any violation', (jsonb_array_length(coalesce(j->'dialectLint'->'violations', j->'dialectLint'->'findings','[]'))>0)::text, count(*), to_char(max(t),'MM-DD')
  FROM _a WHERE jsonb_typeof(j->'dialectLint')='object' AND t > now()-interval '90 days' GROUP BY 2
UNION ALL SELECT 'contractPropagation checked', j->'contractPropagation'->>'checked', count(*), to_char(max(t),'MM-DD')
  FROM _a WHERE jsonb_typeof(j->'contractPropagation')='object' AND t > now()-interval '90 days' GROUP BY 2
UNION ALL SELECT 'reviewerVerdict approved', j->'reviewerVerdict'->>'approved', count(*), to_char(max(t),'MM-DD')
  FROM _a WHERE j ? 'reviewerVerdict' AND t > now()-interval '90 days' GROUP BY 2
UNION ALL SELECT 'markerPresence derivedValues', j->'markerPresence'->>'derivedValues', count(*), to_char(max(t),'MM-DD')
  FROM _a WHERE j ? 'markerPresence' AND t > now()-interval '90 days' GROUP BY 2
ORDER BY 1, 3 DESC;

\echo
\echo ============ 1c. What the newest facts SAY, not just whether they exist (MI-4; lifetime) ============
-- Section 1 counts presence only. These three are the facts a quarterly re-measure is about (added 2026-09-27 after
-- execution-facts' knowledge update found the script never read their values).
SELECT 'verdictFreshness checked/reason/match' AS fact,
  coalesce(j->'verdictFreshness'->>'checked','?') || ' / ' || coalesce(j->'verdictFreshness'->>'reason','?') || ' / ' || coalesce(j->'verdictFreshness'->>'match','null') AS value,
  count(*), to_char(max(t),'YYYY-MM-DD') AS last
  FROM _a WHERE j ? 'verdictFreshness' GROUP BY 2
UNION ALL SELECT 'supersession', CASE WHEN j->'supersession' ? 'skipped' THEN 'skipped: ' || (j->'supersession'->>'skipped')
                                      ELSE 'superseded (self-supersede)' END, count(*), to_char(max(t),'YYYY-MM-DD')
  FROM _a WHERE j ? 'supersession' GROUP BY 2
UNION ALL SELECT 'reviewerVerdict.evidenceGrading.graded', coalesce(j->'reviewerVerdict'->'evidenceGrading'->>'graded','(absent)'), count(*), to_char(max(t),'YYYY-MM-DD')
  FROM _a WHERE j ? 'reviewerVerdict' AND t >= '2026-09-20' GROUP BY 2
-- WARNINGS-INVISIBLE (2026-10-08). Reviewer side: warnings transcribed vs the CONTROL untranscribedLabelLines (a label
-- written in a shape G1 rejects). While both read 0 the zero is an ABSENCE — the label is in ONE protocol (network) until
-- batch 2 (clause f) ships. Leg side: the reviewerWarnings stamp's checked/reason/renderScope.
UNION ALL SELECT 'reviewerVerdict.warnings (n>0 / untranscribed>0)',
  (CASE WHEN jsonb_array_length(coalesce(j->'reviewerVerdict'->'warnings','[]'))>0 THEN 'warnings' ELSE 'none' END) || ' / ' ||
  (CASE WHEN coalesce((j->'reviewerVerdict'->>'untranscribedLabelLines')::int,0)>0 THEN 'UNTRANSCRIBED-READ-EACH' ELSE 'clean' END),
  count(*), to_char(max(t),'YYYY-MM-DD')
  FROM _a WHERE j->'reviewerVerdict' ? 'warnings' GROUP BY 2
UNION ALL SELECT 'reviewerWarnings checked/reason/renderScope',
  coalesce(j->'reviewerWarnings'->>'checked','?') || ' / ' || coalesce(j->'reviewerWarnings'->>'reason','?') || ' / ' || coalesce(j->'reviewerWarnings'->>'renderScope','?'),
  count(*), to_char(max(t),'YYYY-MM-DD')
  FROM _a WHERE j ? 'reviewerWarnings' GROUP BY 2
ORDER BY 1, 3 DESC;

\echo
\echo ============ 2. DEGRADATION — categories emitted (lifetime) ============
SELECT name AS artifact, coalesce(j->>'errorCategory', j->'executionDegradation'->>'errorCategory') AS category,
  count(*), to_char(max(t),'YYYY-MM-DD') AS last
FROM _a WHERE j ? 'errorCategory' OR j ? 'executionDegradation' GROUP BY 1, 2 ORDER BY 1, 3 DESC;

\echo
\echo ============ 3. VALIDATOR — diagnoses + sanctioned-exit facts (90d) ============
SELECT coalesce(j->'protocolValidation'->>'mode','?') AS mode, left(regexp_replace(s,'[0-9]+','N','g'), 80) AS diagnosis, count(*), to_char(max(t),'MM-DD') AS last
FROM _a, jsonb_array_elements_text(coalesce(j->'protocolValidation'->'missingSteps','[]')) s
WHERE name = 'pipeline-index.json' AND t > now()-interval '90 days' GROUP BY 1, 2
UNION ALL SELECT 'FACT', 'escalatedExit', count(*), to_char(max(t),'MM-DD') FROM _a WHERE j->'protocolValidation'->>'escalatedExit'='true' AND t > now()-interval '90 days'
UNION ALL SELECT 'FACT', 'reExecutionExit', count(*), to_char(max(t),'MM-DD') FROM _a WHERE (j->'protocolValidation') ? 'reExecutionExit' AND t > now()-interval '90 days'
-- COMPLETE-THEN-FAIL (2026-10-05, DESIGN-v2 §3.3 W3): the post-completion sanctioned exit. Its skipped Step-5 items live in
-- protocolValidation.postCompletionSteps, NEVER in missingSteps — so the diagnosis rows above do not count rescued runs.
UNION ALL SELECT 'FACT', 'postCompletionExempt', count(*), to_char(max(t),'MM-DD') FROM _a WHERE j->'protocolValidation'->>'postCompletionExempt'='true' AND t > now()-interval '90 days'
ORDER BY 1, 3 DESC;

\echo
\echo ============ 4. TERMINALIZERS + GATE INPUTS — facts on tasks (lifetime / 90d / last touch) ============
SELECT k AS fact, count(*) AS lifetime, count(*) FILTER (WHERE updated_at > now()-interval '90 days') AS n90, to_char(max(updated_at),'YYYY-MM-DD') AS last_touch
FROM tasks t, LATERAL (VALUES
  ('F16 blockedByUpstreamFailure', t.metadata ? 'blockedByUpstreamFailure'),
  ('PRE_FLIGHT cannotRun', t.metadata ? 'cannotRun'),
  ('F17 duplicateHalt', t.metadata ? 'duplicateHalt'),
  ('F20 qualityGate.outcome=escalated', t.metadata->'qualityGate'->>'outcome' = 'escalated'),
  ('R4 truncationStall', t.metadata ? 'truncationStall'),
  ('HARNESS_NO_OUTPUT harnessNoOutput', t.metadata ? 'harnessNoOutput'),
  ('REACTOR_BUDGET_EXHAUSTED', t.metadata ? 'reactorBudgetExhausted'),
  ('programReleasable=true', t.metadata->>'programReleasable' = 'true'),
  ('programReleasable=false', t.metadata->>'programReleasable' = 'false'),
  ('qualityGate.verdictMismatch', t.metadata->'qualityGate'->>'verdictMismatch' = 'true'),
  ('coverage notChained non-empty', jsonb_typeof((t."inputContext")::jsonb->'pipelineMetadata'->'notChained')='array' AND jsonb_array_length((t."inputContext")::jsonb->'pipelineMetadata'->'notChained')>0),
  ('interfaceContract delivered', (t."inputContext")::jsonb ? 'interfaceContract')
) v(k, hit) WHERE hit GROUP BY 1 ORDER BY 1;
SELECT count(*) AS reaped_comments, to_char(max(created_at),'YYYY-MM-DD') AS last FROM comments WHERE text LIKE '%Execution killed before it finished%';

\echo
\echo ============ TRIGGERS — each 🔴 is 0 by construction on correct code; each ⚪ is its control ============
WITH r AS (SELECT name, t, j, jsonb_array_length(j->'toolCalls') n,
    (SELECT count(*) FROM jsonb_array_elements(j->'toolCalls') x WHERE x->>'success'='false') f,
    (SELECT bool_and(x->>'success'='false') FROM (SELECT x FROM jsonb_array_elements(j->'toolCalls') WITH ORDINALITY e(x,i) ORDER BY i DESC LIMIT 2) z) tail2
  FROM _a WHERE t > '2026-07-18' AND jsonb_typeof(j->'toolCalls')='array')
SELECT '⚪ control: executions examined since 07-18' AS line, count(*)::text AS value FROM r
UNION ALL SELECT '🔴 tool-failure condition met but NO executionDegradation stamped', count(*)::text FROM r
  WHERE n > 0 AND (f::numeric/n > 0.5 OR (tail2 AND n >= 2)) AND NOT (j ? 'executionDegradation')
UNION ALL SELECT '🔴 deliverable truncated but no TRUNCATED_* stamped', count(*)::text FROM r
  WHERE j->'toolLoop'->>'deliverableTruncated'='true' AND coalesce(j->>'errorCategory', j->'executionDegradation'->>'errorCategory','') NOT LIKE 'TRUNC%';
WITH kids AS (SELECT c.id FROM tasks p JOIN tasks c ON c.stage_id = p.metadata->>'pipelineStageId' WHERE p.type='PIPELINE'),
ex AS (SELECT e.context, row_number() OVER (PARTITION BY e."taskId" ORDER BY e."startTime") rn
  FROM agent_executions e JOIN kids k ON k.id=e."taskId" WHERE e."startTime" > now()-interval '90 days')
SELECT '⚪ control: agent-loop re-executions of pipeline children (90d)' AS line,
  count(*) FILTER (WHERE rn>1 AND context->'triggeredBy'->>'source'='mcp-direct' AND context->'triggeredBy' ? 'parentExecutionId')::text AS value FROM ex
UNION ALL SELECT '🔴 agent-loop re-execution WITHOUT the reExecutionOfExecutionId stamp (keep-best + the cap are blind to it)',
  count(*) FILTER (WHERE rn>1 AND context->'triggeredBy'->>'source'='mcp-direct' AND context->'triggeredBy' ? 'parentExecutionId' AND NOT context ? 'reExecutionOfExecutionId')::text FROM ex;
-- MI-1 regression guard: the validator must not flag a comment that DOES carry the re-run note (paraphrase included).
-- Needs the validator's own input, the LAST successful task.comment (three argument shapes). Rows before the fix
-- (2026-09-28) are history; only later rows count.
WITH s AS (SELECT t, j FROM _a WHERE name='pipeline-index.json' AND j->>'resolvedMode'='SYNTHESIZE' AND t > '2026-09-28'),
lc AS (SELECT t, (j->'protocolValidation')::text LIKE '%missing the re-run note%' flagged,
  (SELECT coalesce(
      CASE WHEN jsonb_typeof(x->'arguments'->'parameters')='object' THEN x->'arguments'->'parameters'->>'comment' END,
      CASE WHEN jsonb_typeof(x->'arguments'->'parameters')='string' AND (x->'arguments'->>'parameters') LIKE '{%' THEN (x->'arguments'->>'parameters')::jsonb->>'comment' END,
      x->'arguments'->>'comment')
   FROM jsonb_array_elements(j->'toolCalls') WITH ORDINALITY e(x,i)
   WHERE x->>'success'='true' AND x->'arguments'->>'action'='task.comment' ORDER BY i DESC LIMIT 1) txt FROM s)
SELECT '⚪ control: SYNTHESIZE final comments since the MI-1 fix' AS line, count(*)::text AS value FROM lc WHERE txt IS NOT NULL
UNION ALL SELECT '🔴 re-run note PRESENT but the validator flagged it missing (MI-1 regression)',
  count(*) FILTER (WHERE flagged AND txt ~* '(cannot|can''t|can’t|can not)\s+(be\s+)?re[- ]?run|pipeline is COMPLETE[^\n]*re-run|create a fresh PIPELINE task')::text FROM lc;

\echo
\echo ============ COMPLETE-THEN-FAIL (phase 1 shipped 2026-10-05; DESIGN-v2 §8) ============
-- Floor = the DERIVED first completion carrying the anchor (never a typed date). EMPTY until the deploy has run a
-- completion = an ABSENCE, not a zero. Every line keys on the EXECUTION's status — never task executionStatus, which
-- after O4 reads NULL (not FAILED) for a terminated execution on a COMPLETED task.
-- Rescued provider failures are NOT in errorCode counts (O3): errorCode-based analytics are not "all provider failures";
-- the CONTEXT line and postCompletionFailure.cause.providerErrorType are their home.
WITH floor AS (SELECT min(completed_at) f FROM tasks WHERE metadata ? 'completedByExecutionId'),
-- Scoped to PIPELINE (build review EF-F1/PH-F4/BC-M1): the anchor is written on ANY agent-loop completion — ~105 ACTION
-- self-completions per 60-120 days in prod — but the rescue's P2 only ever considers a PIPELINE task. Unscoped, an ACTION
-- self-complete-then-fail would read as RED T1a and a reaped one would fire the O6 trigger, on correct code. P2's MODE half
-- (SYNTHESIZE) is not expressible in SQL; a PIPELINE non-SYNTHESIZE self-completion should be ~0 (only SYNTHESIZE and
-- domain-escalated legs call task.complete, v2 §3.7).
own AS (SELECT e.id eid, e.status, e.logs, e."createdAt" ct, t.id tid FROM agent_executions e JOIN tasks t ON t.id = e."taskId"
  WHERE t.type = 'PIPELINE' AND t.metadata->>'completedByExecutionId' = e.id),
ej AS (SELECT a."executionId" eid, CASE WHEN a.content LIKE '{%' THEN a.content::jsonb END j FROM agent_artifacts a
  WHERE a.name = 'error.json' AND a."executionId" IN (SELECT eid FROM own)),
pcf AS (SELECT a.eid, a.j FROM _a a WHERE a.name = 'pipeline-index.json' AND a.j ? 'postCompletionFailure')
SELECT '⚪ control: PIPELINE executions that completed their OWN task (anchor = own id)' AS line, count(*)::text AS value FROM own
UNION ALL SELECT '⚪ fix_live_since (derived: first anchored completion; empty ⇒ nothing measured)', coalesce(to_char((SELECT f FROM floor),'YYYY-MM-DD HH24:MI'),'(empty)')
UNION ALL SELECT '🔴 T1a eligible but never evaluated: anchor=own ∧ exec FAILED ∧ error.json ∧ NO postCompletionRescue (a post-loop throw is NAMED post-loop-throw since the build review, so it is not here; the one legitimate member is a failed predicate READ — check the journal for "predicate read failed")',
  count(*)::text FROM own o JOIN ej ON ej.eid = o.eid WHERE o.status = 'FAILED' AND NOT coalesce(ej.j ? 'postCompletionRescue', false)
UNION ALL SELECT '🔴 T2 postCompletionFailure stamped but the task''s anchor is NOT this execution',
  count(*)::text FROM pcf p JOIN agent_executions e ON e.id = p.eid JOIN tasks t ON t.id = e."taskId"
  WHERE coalesce(t.metadata->>'completedByExecutionId','') <> e.id
UNION ALL SELECT '🟠 O6 PHASE-2 TRIGGER — reaped after own completion (anchor=own ∧ FAILED ∧ no error.json ∧ not a user cancel; includes a rescue CAS miss where the REAPER won — the journal''s POST_COMPLETION_RESCUE_FAILED line distinguishes it). ANY NON-ZERO FIRES O6 (or 2027-01-05, whichever first)',
  count(*)::text FROM own o WHERE o.status = 'FAILED' AND NOT EXISTS (SELECT 1 FROM ej WHERE ej.eid = o.eid)
    AND NOT EXISTS (SELECT 1 FROM unnest(o.logs) l WHERE l LIKE '%Execution canceled by user%')
UNION ALL SELECT '· residual (b) declined: ' || coalesce(ej.j->'postCompletionRescue'->>'declinedReason','?'), count(*)::text
  FROM own o JOIN ej ON ej.eid = o.eid WHERE ej.j->'postCompletionRescue'->>'attempted' = 'false' GROUP BY ej.j->'postCompletionRescue'->>'declinedReason'
UNION ALL SELECT '· residual (c) rescue attempted and FAILED (tx timeout / 40P01 / P2002 / in-tx predicate mismatch) — read each. A CAS miss never lands here: the reaper/cancel row gets no error.json (see O6 / (d))', count(*)::text
  FROM own o JOIN ej ON ej.eid = o.eid WHERE ej.j->'postCompletionRescue'->>'attempted' = 'true'
UNION ALL SELECT '· residual (d) user cancel after own completion (includes a rescue CAS miss where the CANCEL won; POST_COMPLETION_RESCUE_FAILED in the journal)', count(*)::text
  FROM own o WHERE o.status = 'FAILED' AND EXISTS (SELECT 1 FROM unnest(o.logs) l WHERE l LIKE '%Execution canceled by user%')
UNION ALL SELECT '· residual (a) COMPLETED PIPELINE, latest exec FAILED, anchor absent or another execution (human mid-run; Tier-2 drop) — since the floor',
  count(*)::text FROM tasks t JOIN LATERAL (SELECT e.id, e.status FROM agent_executions e WHERE e."taskId" = t.id ORDER BY e."createdAt" DESC LIMIT 1) le ON true
  WHERE t.type = 'PIPELINE' AND t.status = 'COMPLETED' AND le.status = 'FAILED' AND coalesce(t.metadata->>'completedByExecutionId','') <> le.id
    AND t.completed_at >= coalesce((SELECT f FROM floor), 'infinity'::timestamp)
UNION ALL SELECT '· residual (e) LEG-TIER ACTION child: a harness-child ACTION that completed itself, latest exec FAILED, since the floor (O4 now writes NULL here, so base SYNTHESIZE Step 1 no longer trips; the leg-tier catch is the reviewer-less "authoritative SUCCESS" conjunct or a reviewer reading notChained no-selectable-execution) — read each',
  count(*)::text FROM tasks t JOIN LATERAL (SELECT e.id, e.status FROM agent_executions e WHERE e."taskId" = t.id ORDER BY e."createdAt" DESC LIMIT 1) le ON true
  WHERE t.type <> 'PIPELINE' AND t.status = 'COMPLETED' AND le.status = 'FAILED' AND t.metadata->>'completedByExecutionId' = le.id
    AND EXISTS (SELECT 1 FROM stages st WHERE st.id = t.stage_id AND st.metadata::jsonb ? 'harnessTaskId')
    AND t.completed_at >= coalesce((SELECT f FROM floor), 'infinity'::timestamp)
UNION ALL SELECT '· CONTEXT postCompletionFailure stamps (the Q5 lean-card re-decide trigger: the FIRST one)', count(*)::text || coalesce(' · last ' || to_char(max(e."createdAt"),'YYYY-MM-DD'),'')
  FROM pcf p JOIN agent_executions e ON e.id = p.eid;
\echo
\echo ============ PACKAGE FORM CHECK — toolLoop.formCheck (Step A, fact only; plan mechanical-reflection-trigger-2026-10-07) ============
-- config_change_author only, never on a PIPELINE task. Floor = the DERIVED first artifact carrying the fact: EMPTY until
-- the deploy has run an Author = an ABSENCE, not a zero. Trigger = hunk-count-mismatch OR marker-line-located; the other
-- kinds are facts only. The ⚪ numbered-hunk line is the trigger's own input: while it reads 0, a 0 FIRED is unmeasured.
-- Corpus baseline before the fact existed (scripts/replay-form-check.ts, 312 Authors to 2026-10-06): fired 15/9/5/1.
WITH fc AS (SELECT t, j, j->'toolLoop'->'formCheck' f, j->>'agentRole' role FROM _a
            WHERE name = 'result.json' AND jsonb_typeof(j->'toolLoop'->'formCheck') = 'object'),
floor AS (SELECT min(t) f FROM fc),
au AS (SELECT t, j FROM _a WHERE name = 'result.json' AND j->>'agentRole' = 'config_change_author'
         AND t >= coalesce((SELECT f FROM floor), 'infinity'::timestamp))
SELECT '⚪ fix_live_since (derived: first stamped formCheck; empty ⇒ nothing measured)' AS line,
  coalesce(to_char((SELECT f FROM floor), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ control: config_change_author executions since the floor', count(*)::text FROM au
UNION ALL SELECT '⚪ control: … of which carry ≥1 numbered @@ hunk (the trigger''s own input)',
  count(*) FILTER (WHERE (j->'toolLoop'->'formCheck'->>'numberedHunks')::int > 0)::text FROM au
UNION ALL SELECT '· reason: ' || coalesce(f->>'reason', '?'), count(*)::text FROM fc GROUP BY f->>'reason'
UNION ALL SELECT '· FIRED (triggerHitsTotal > 0) — read each', count(*) FILTER (WHERE (f->>'triggerHitsTotal')::int > 0)::text FROM fc
UNION ALL SELECT '· hits by kind (from the capped hits[]): ' || (h->>'kind'), count(*)::text FROM fc, jsonb_array_elements(f->'hits') h GROUP BY h->>'kind'
UNION ALL SELECT '· correction: ' || coalesce(f->'correction'->>'notAttemptedReason', 'attempted, adopted=' || coalesce(f->'correction'->>'adopted', '?')),
  count(*)::text FROM fc GROUP BY f->'correction'->>'notAttemptedReason', f->'correction'->>'adopted'
UNION ALL SELECT '🔴 formCheck stamped on a role other than config_change_author',
  count(*) FILTER (WHERE role IS DISTINCT FROM 'config_change_author')::text FROM fc
UNION ALL SELECT '🔴 config_change_author since the floor WITHOUT formCheck (a stamp path skipped the check)',
  count(*) FILTER (WHERE NOT coalesce(j->'toolLoop' ? 'formCheck', false))::text FROM au
-- Kill criterion 3 counts TRIGGER hits only. `postHitsTotal` also counts fact-only kinds (an untouched unlocated marker,
-- a side overflow), which an adopted correction legitimately leaves in place — keyed on it this line would go red on a
-- correct run. Step B stamps `postTriggerHitsTotal`, and the re-check of the persisted text (`textSource:
-- 'form-correction'`) must also read 0.
UNION ALL SELECT '🔴 adopted:true with trigger hits remaining (postTriggerHitsTotal > 0 OR re-check triggerHitsTotal > 0; kill criterion 3)',
  count(*) FILTER (WHERE f->'correction'->>'adopted' = 'true' AND (coalesce((f->'correction'->>'postTriggerHitsTotal')::int, 0) > 0
    OR (f->>'textSource' = 'form-correction' AND coalesce((f->>'triggerHitsTotal')::int, 0) > 0)))::text FROM fc
UNION ALL SELECT '🔴 adopted:true but the persisted fact is not the re-check (textSource <> form-correction)',
  count(*) FILTER (WHERE f->'correction'->>'adopted' = 'true' AND f->>'textSource' IS DISTINCT FROM 'form-correction')::text FROM fc
-- Review B-M2: correct only because the Step B scope is EVERY hit (B-M1) — so every decision hit of an attempt, fact-only
-- kinds included, must be a header undercount, and the uncapped totals must agree. 0 by construction on correct code.
UNION ALL SELECT '🔴 attempted on a decision that was NOT undercount-only (a decision hit is not a header-undercount, or hit totals differ)',
  count(*) FILTER (WHERE f->'correction'->>'attempted' = 'true' AND (
    coalesce((f->'correction'->>'decisionHitsTotal')::int, -1) IS DISTINCT FROM (f->'correction'->>'decisionTriggerHitsTotal')::int
    OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(f->'correction'->'decisionHits', '[]')) h
    WHERE h->>'kind' <> 'hunk-count-mismatch' OR coalesce((h->>'extraBodyLines')::int, 0) = 0
       OR (h->'observed'->>'old')::int < (h->'declared'->>'old')::int OR (h->'observed'->>'new')::int < (h->'declared'->>'new')::int)
  ))::text FROM fc;

\echo
\echo ============ PACKAGE FORM CORRECTION — Step B (flag FORM_CORRECTION_ENABLED; undercount-only) ============
-- Floor = the DERIVED flag-on cut: the first fact whose decision could only be taken with the flag ON (an attempt, or the
-- Step B scope reason). EMPTY ⇒ the flag has never been observed on = an ABSENCE, not a zero. Every line below counts
-- facts at/after that cut. Kill criteria + per-attempt cost/latency/reviewer read: scripts/report-form-correction-kill-criteria.sh.
WITH fc AS (SELECT t, eid, j->'toolLoop'->'formCheck' f FROM _a
            WHERE name = 'result.json' AND jsonb_typeof(j->'toolLoop'->'formCheck') = 'object'),
cut AS (SELECT min(t) c FROM fc WHERE f->'correction'->>'attempted' = 'true'
          OR f->'correction'->>'notAttemptedReason' = 'hits-include-non-undercount'),
on_ AS (SELECT * FROM fc WHERE t >= coalesce((SELECT c FROM cut), 'infinity'::timestamp)),
leg AS (SELECT o.eid, o.f, p.metadata->>'protocol' proto FROM on_ o
  JOIN agent_executions e ON e.id = o.eid JOIN tasks c ON c.id = e."taskId"
  LEFT JOIN tasks p ON p.type = 'PIPELINE' AND c.stage_id = p.metadata->>'pipelineStageId'
  WHERE o.f->'correction'->>'attempted' = 'true')
SELECT '⚪ flag_on_since (derived: first attempt or first scope decision; empty ⇒ flag never observed on)' AS line,
  coalesce(to_char((SELECT c FROM cut), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ control: Author facts since the cut', count(*)::text FROM on_
UNION ALL SELECT '⚪ control: … FIRED (triggerHitsTotal > 0) — the attempt''s own input', count(*) FILTER (WHERE (f->>'triggerHitsTotal')::int > 0)::text FROM on_
UNION ALL SELECT '· not attempted: ' || (f->'correction'->>'notAttemptedReason'), count(*)::text FROM on_
  WHERE (f->>'triggerHitsTotal')::int > 0 AND f->'correction'->>'attempted' = 'false' GROUP BY f->'correction'->>'notAttemptedReason'
UNION ALL SELECT '· ATTEMPTED', count(*) FILTER (WHERE f->'correction'->>'attempted' = 'true')::text FROM on_
UNION ALL SELECT '· … adopted', count(*) FILTER (WHERE f->'correction'->>'adopted' = 'true')::text FROM on_
UNION ALL SELECT '· … not adopted: ' || (f->'correction'->>'notAdoptedReason'), count(*)::text FROM on_
  WHERE f->'correction'->>'attempted' = 'true' AND f->'correction'->>'adopted' = 'false' GROUP BY f->'correction'->>'notAdoptedReason'
UNION ALL SELECT '🔴 attempt on a NON-terraform leg (kill criterion 4; the corpus says 0)',
  count(*) FILTER (WHERE proto IS DISTINCT FROM 'terraform-iac-protocol')::text FROM leg
-- Review B-H1: a FIRED fact reading flag-off AFTER the flag-on cut is the signature of a HALF-APPLIED switch (one of
-- paichart-web / paichart-mcp not restarted) or of a deploy that reverted a hand edit. Expected non-zero only after a
-- deliberate kill switch — then read scripts/report-form-correction-kill-criteria.sh with an explicit cut window.
UNION ALL SELECT '🔴 flag-off decisions on FIRED facts after the flag-on cut (half-applied switch / reverted hand edit)',
  count(*) FILTER (WHERE (f->>'triggerHitsTotal')::int > 0 AND f->'correction'->>'notAttemptedReason' = 'flag-off')::text FROM on_;

\echo
\echo ============ REQUIREMENTS FORM CORRECTION — toolLoop.requirementsFormCheck.correction (adoption rule 3 from 2026-10-12; rule 4 = Z66 citation identity, from its deploy) ============
-- Panel cline_docs/reviews/correction-adoption-severity-2026-10-11/ §3H. Every 🔴 is 0 by construction on correct code.
-- Rule 4 (Z66) is counted in the `v3` rows (version >= 3) and split per version below; its three new refusal markers
-- (citationsNewlyUncited / citationsNewlyNotVerbatim / citationsNarrowed) can appear only on a NOT-adopted attempt, so
-- every 🔴 below stays 0 by construction.
-- An `unwaivable-cleared` adoption is NOT a finding: each one is a clause read the owner made at publish
-- (--clause-read); read the false-flag share from those names. The FIRST read that finds a flag REAL is the
-- tightening trigger at REQUIREMENTS_ADOPTION_MAX_NEW_CLAUSE_FLAGS (set it to 0 in the next deploy).
WITH rc AS (SELECT t, j->'toolLoop'->'requirementsFormCheck'->'correction' c FROM _a
            WHERE name = 'result.json' AND jsonb_typeof(j->'toolLoop'->'requirementsFormCheck'->'correction') = 'object'),
v3 AS (SELECT * FROM rc WHERE (c->>'adoptionRuleVersion')::int >= 3 AND c->>'attempted' = 'true')
SELECT '⚪ control: correction attempts, every rule' AS line, count(*) FILTER (WHERE c->>'attempted' = 'true')::text AS value FROM rc
UNION ALL SELECT '⚪ rule ≥ 3 live since (empty ⇒ no rule-3 attempt yet: an ABSENCE)', coalesce(to_char(min(t), 'YYYY-MM-DD HH24:MI'), '(empty)') FROM v3
UNION ALL SELECT '· rule ≥ 3 attempts', count(*)::text FROM v3
-- Z66 review F4: never pool rule 3 and rule 4 — rule 4 adopts merged/duplicate citations rule 3 refused.
UNION ALL SELECT '· … rule ' || (c->>'adoptionRuleVersion') || ' attempts (live since ' || to_char(min(t), 'YYYY-MM-DD HH24:MI') || ')', count(*)::text
  FROM v3 GROUP BY c->>'adoptionRuleVersion'
UNION ALL SELECT '· … rule ' || (c->>'adoptionRuleVersion') || ' adopted', count(*) FILTER (WHERE c->>'adopted' = 'true')::text
  FROM v3 GROUP BY c->>'adoptionRuleVersion'
UNION ALL SELECT '· … adopted, arm ' || (c->>'adoptionArm'), count(*)::text FROM v3 WHERE c->>'adopted' = 'true' GROUP BY c->>'adoptionArm'
UNION ALL SELECT '· … not adopted: ' || (c->>'notAdoptedReason'), count(*)::text FROM v3 WHERE c->>'adopted' = 'false' GROUP BY c->>'notAdoptedReason'
UNION ALL SELECT '🔴 adopted with a regression other than clause flags (kill criterion)',
  count(*) FILTER (WHERE c->>'adopted' = 'true' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(c->'regressedMeasures', '[]')) m
                    WHERE m NOT IN ('clauses', 'clausesNewlyDropped')))::text FROM v3
UNION ALL SELECT '🔴 adopted WITH a regression on an arm other than unwaivable-cleared',
  count(*) FILTER (WHERE c->>'adopted' = 'true' AND jsonb_array_length(coalesce(c->'regressedMeasures', '[]')) > 0
                    AND c->>'adoptionArm' IS DISTINCT FROM 'unwaivable-cleared')::text FROM v3
UNION ALL SELECT '🔴 unwaivable-cleared with more than 1 newly flagged clause (the cap)',
  count(*) FILTER (WHERE c->>'adoptionArm' = 'unwaivable-cleared' AND (c->>'clausesNewlyDroppedTotal')::int > 1)::text FROM v3
UNION ALL SELECT '🔴 not adopted, a text came back, and no not-adopted artifact pointer (1b lost the correction)',
  count(*) FILTER (WHERE c->>'adopted' = 'false' AND c->>'notAdoptedReason' NOT IN ('empty', 'llm-error') AND NOT c ? 'notAdoptedText')::text FROM v3;

\echo
\echo ============ CONTAINMENT DELEGATION — consuming-leg-upstream-delegated (PHASE4-CONTAINMENT-PROPAGATION, 2026-10-12) ============
-- A consumer whose upstream DELEGATED (needs-node-c with a named reason, 0 violations) stamps needs-node-c
-- consuming-leg-upstream-delegated instead of blocking consuming-leg-upstream-not-green. Every 🔴 is recomputed from the
-- stamp's OWN transcribed legs, so each is 0 by construction on correct code. Floor = the DERIVED first delegated stamp;
-- EMPTY = an ABSENCE (no consumer has reached the arm since the deploy), never a zero.
-- Pre-deploy the stored corpus holds exactly 3 legs that would qualify (C5/C6/C7, all blocking); they predate the floor.
WITH dc AS (SELECT t, j->'derivationContainment' f, j->'derivationContainment'->'containmentDisposition' d FROM _a
            WHERE name = 'pipeline-index.json' AND jsonb_typeof(j->'derivationContainment'->'upstreamContainment'->'legs') = 'array'),
q AS (SELECT t, f, d, d->>'reason' r,
        jsonb_array_length(f->'upstreamContainment'->'legs') > 0
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f->'upstreamContainment'->'legs') l WHERE NOT (
              jsonb_typeof(l->'violations') = 'number' AND (l->>'violations')::numeric = 0
              AND ((l->>'disposition' = 'benign' AND l->>'checked' = 'true')
                   OR (l->>'disposition' = 'needs-node-c' AND coalesce(l->>'dispositionReason', '') <> ''))))
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(f->'upstreamContainment'->'legs') l WHERE l->>'disposition' = 'needs-node-c') AS qualifies,
        EXISTS (SELECT 1 FROM jsonb_array_elements(f->'upstreamContainment'->'legs') l
                WHERE jsonb_typeof(l->'derivedValues') = 'array' AND jsonb_array_length(l->'derivedValues') > 0) AS any_derived
      FROM dc),
floor AS (SELECT min(t) f FROM q WHERE r = 'consuming-leg-upstream-delegated')
SELECT '⚪ fix_live_since (derived: first delegated stamp; empty ⇒ nothing measured)' AS line, coalesce(to_char((SELECT f FROM floor), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ control: consumer stamps reaching either arm (delegated | upstream-not-green) since the floor',
  count(*)::text FROM q WHERE r IN ('consuming-leg-upstream-delegated', 'consuming-leg-upstream-not-green') AND t >= (SELECT f FROM floor)
UNION ALL SELECT '· upstream-not-green stamps whose legs qualify, ALL TIME (stamps, not legs; pre-deploy = C5/C6/C7, frozen history)',
  count(*)::text FROM q WHERE r = 'consuming-leg-upstream-not-green' AND qualifies
UNION ALL SELECT '· delegated, by upstream reason: ' || (u->>'dispositionReason'), count(*)::text
  FROM q, jsonb_array_elements(coalesce(d->'inputs'->'upstreamDelegated', '[]')) u WHERE r = 'consuming-leg-upstream-delegated' GROUP BY u->>'dispositionReason'
UNION ALL SELECT '🔴 delegated with NO named subject (inputs.upstreamDelegated empty or absent; B1 fail-closed regression)',
  count(*)::text FROM q WHERE r = 'consuming-leg-upstream-delegated'
    AND (jsonb_typeof(d->'inputs'->'upstreamDelegated') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'inputs'->'upstreamDelegated') = 0)
UNION ALL SELECT '🔴 delegated although a transcribed upstream copy is violated / blocking / benign-unchecked / unnamed / absent (rule regression)',
  count(*)::text FROM q WHERE r = 'consuming-leg-upstream-delegated' AND NOT qualifies
UNION ALL SELECT '🔴 upstream-not-green stamped since the floor on a fact whose legs ALL qualify (the delegation arm did not fire)',
  count(*)::text FROM q WHERE r = 'consuming-leg-upstream-not-green' AND qualifies AND t >= (SELECT f FROM floor)
UNION ALL SELECT '🔴 delegated with consumedValueCheck not-run-no-upstream-derived while a leg carries derivedValues (check-1 state miscomputed)',
  count(*)::text FROM q WHERE r = 'consuming-leg-upstream-delegated' AND d->'inputs'->>'consumedValueCheck' = 'not-run-no-upstream-derived' AND any_derived;

\echo
\echo ============ QUOTE FIDELITY + ROLLBACK WITNESS (VERBATIM-QUOTE-OMISSION, 2026-10-13) ============
-- quoteFidelity: stamped on every Harvester and Author leaf (one registry entry, leaf-persist); escalate-only, consumed by
-- nothing, rendered nowhere (owner A1/B3/B1-B2). E1: the rollback leaf's witness is the harvest's RAW toolCalls, keyed by
-- the stamp's own `witness` object. Floors are DERIVED from the first stamp; EMPTY = an ABSENCE (not deployed / no leaf
-- since), never a zero. Record: cline_docs/reviews/verbatim-quote-omission-2026-10-13/BUILD-A-E.md.
WITH leaf AS (SELECT t, j, j->>'agentRole' role, j->'quoteFidelity' q FROM _a
              WHERE name = 'result.json' AND coalesce(j->>'agentRole','') ~* 'harvest|author' AND coalesce(j->>'agentRole','') !~* '^requirements_'),
qfloor AS (SELECT min(t) f FROM _a WHERE name = 'result.json' AND j ? 'quoteFidelity'),
rc AS (SELECT t, j->'rollbackContainment' r FROM _a WHERE name = 'result.json' AND jsonb_typeof(j->'rollbackContainment') = 'object'),
rfloor AS (SELECT min(t) f FROM rc WHERE r ? 'witness')
SELECT '⚪ quoteFidelity live since (derived: first stamp; empty ⇒ nothing measured)' AS line, coalesce(to_char((SELECT f FROM qfloor), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ control: Harvester/Author result.json since the floor', count(*)::text FROM leaf WHERE t >= (SELECT f FROM qfloor)
UNION ALL SELECT '· quoteFidelity ' || coalesce(q->>'point','?') || ' / ' || coalesce(q->'quoteFidelityDisposition'->>'disposition','?') || ' / ' || coalesce(q->>'reason','?'),
  count(*)::text FROM leaf WHERE q IS NOT NULL GROUP BY 1
UNION ALL SELECT '· … of which a FILE-ARTIFACT-lane escalating finding (the lane the later render selects)',
  count(*)::text FROM leaf WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(q->'findings','[]')) x
    WHERE x->'source'->>'lane' = 'file-artifact' AND x->>'escalates' = 'true')
UNION ALL SELECT '🔴 Harvester/Author result.json since the floor WITHOUT quoteFidelity (a stamp path skipped the net)',
  count(*)::text FROM leaf WHERE t >= (SELECT f FROM qfloor) AND q IS NULL
UNION ALL SELECT '🔴 quoteFidelity stamped on a role that is neither a harvest nor an author leaf',
  count(*)::text FROM _a WHERE name = 'result.json' AND j ? 'quoteFidelity' AND coalesce(j->>'agentRole','') !~* 'harvest|author'
UNION ALL SELECT '🔴 quoteFidelity BLOCKING on a checked fact (A1: a finding never blocks)',
  count(*)::text FROM leaf WHERE q->>'checked' = 'true' AND q->'quoteFidelityDisposition'->>'disposition' = 'blocking'
UNION ALL SELECT '🔴 disposition disagrees with the findings (needs-node-c with 0 escalating, or benign with >0)',
  count(*)::text FROM leaf WHERE q->>'checked' = 'true' AND (
    (q->'quoteFidelityDisposition'->>'disposition' = 'needs-node-c' AND coalesce((q->'blocks'->>'escalating')::int, 0) = 0)
    OR (q->'quoteFidelityDisposition'->>'disposition' = 'benign' AND coalesce((q->'blocks'->>'escalating')::int, 0) > 0))
UNION ALL SELECT '⚪ E1 raw witness live since (derived: first rollback stamp carrying `witness`; empty ⇒ nothing measured)',
  coalesce(to_char((SELECT f FROM rfloor), 'YYYY-MM-DD HH24:MI'), '(empty)')
UNION ALL SELECT '🔴 rollbackContainment checked:true since the E1 floor WITHOUT `witness` (a stamp still read the transcription)',
  count(*)::text FROM rc WHERE t >= (SELECT f FROM rfloor) AND r->>'checked' = 'true' AND NOT r ? 'witness'
UNION ALL SELECT '🔴 rollbackContainment reason no-harvest-text since the E1 floor (the pre-E1 arm came back)',
  count(*)::text FROM rc WHERE t >= (SELECT f FROM rfloor) AND r->>'reason' = 'no-harvest-text';

\echo
\echo ============ APPLY-BLOCK PLACEHOLDER (PLACEHOLDER-APPLIES-AS-LITERAL interim guard, 2026-10-13) ============
-- applyBlockPlaceholder: stamped on every config_change_author leaf (exact role); warning-only, consumed by nothing, NOT
-- whitelisted; rendered only as the leg report.md "Platform warnings (non-blocking)" section on hit legs. Floor DERIVED
-- from the first stamp; EMPTY = an ABSENCE. The second ⚪ is the trigger's own input (a placeholder ANYWHERE in the
-- package): while it reads 0, a 0 hit count is unmeasured. Pre-floor corpus (replay): 2 of 316, both 2026-07-15.
-- Record: cline_docs/reviews/platform-held-bytes-2026-10-13/PLACEHOLDER-GUARD-BUILD.md.
WITH au AS (SELECT t, j, j->'applyBlockPlaceholder' p FROM _a WHERE name = 'result.json' AND j->>'agentRole' = 'config_change_author'),
pfloor AS (SELECT min(t) f FROM _a WHERE name = 'result.json' AND j ? 'applyBlockPlaceholder')
SELECT '⚪ applyBlockPlaceholder live since (derived: first stamp; empty ⇒ nothing measured)' AS line, coalesce(to_char((SELECT f FROM pfloor), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ control: config_change_author result.json since the floor', count(*)::text FROM au WHERE t >= (SELECT f FROM pfloor)
UNION ALL SELECT '⚪ control: … of which the package carries a placeholder ANYWHERE (prose, evidence or apply block)',
  count(*)::text FROM au WHERE t >= (SELECT f FROM pfloor) AND j->>'finalResponse' ~ '<{1,2}REDACTED[^<>\n]{0,40}>{1,2}'
UNION ALL SELECT '· applyBlockPlaceholder ' || CASE WHEN p->>'checked' = 'true' THEN (CASE WHEN (p->>'count')::int > 0 THEN 'HIT' ELSE 'clean' END) ELSE 'checked:false ' || coalesce(p->>'reason','?') END,
  count(*)::text FROM au WHERE p IS NOT NULL GROUP BY 1
UNION ALL SELECT '· legs whose report.md carried the platform-warnings section (reportMdSource.applyBlockPlaceholderAppended)',
  count(*)::text FROM _a WHERE j->'reportMdSource' ? 'applyBlockPlaceholderAppended'
UNION ALL SELECT '🔴 config_change_author result.json since the floor WITHOUT applyBlockPlaceholder (a stamp path skipped the net)',
  count(*)::text FROM au WHERE t >= (SELECT f FROM pfloor) AND p IS NULL
UNION ALL SELECT '🔴 applyBlockPlaceholder stamped on a role other than config_change_author',
  count(*)::text FROM _a WHERE name = 'result.json' AND j ? 'applyBlockPlaceholder' AND coalesce(j->>'agentRole','') <> 'config_change_author'
UNION ALL SELECT '🔴 a HIT on a package whose persisted text carries no placeholder at all (the fact read different bytes)',
  count(*)::text FROM au WHERE (p->>'count')::int > 0 AND coalesce(j->>'finalResponse','') !~ '<{1,2}REDACTED[^<>\n]{0,40}>{1,2}'
UNION ALL SELECT '🔴 hits list disagrees with count (count ≤ 5 but a different number of hits, or more than 5 hits)',
  count(*)::text FROM au WHERE (p->>'count')::int > 0 AND (
    jsonb_array_length(coalesce(p->'hits','[]')) > 5
    OR ((p->>'count')::int <= 5 AND jsonb_array_length(coalesce(p->'hits','[]')) <> (p->>'count')::int));

\echo
\echo ============ HELD BYTES (shadow, PLATFORM-HELD-BYTES Stage A, 2026-10-14) ============
-- Floor DERIVED as the first held row (refs ∪ refusals); EMPTY = an ABSENCE (not deployed / capture off / no Harvester
-- since). Tables absent ⇒ the section says so and skips (pre-deploy). 🔴 11 runs AFTER this block (it needs R10, which SQL
-- cannot run) through scripts/replay-held-capture.sh --check-held. Plan: STAGE-A-PLAN.md §12.2.
-- Declared (service, tool) pairs in the platform default table (descriptorVersion 1): observability-readonly ×
-- get_otel_config / get_ingress_config. A new descriptor ⇒ update the two literals below with it.
SELECT to_regclass('public.held_file_refs') IS NOT NULL AS held_tables \gset
\if :held_tables
WITH f AS (SELECT min(c) f FROM (SELECT min("createdAt") c FROM held_file_refs UNION ALL SELECT min("createdAt") FROM held_capture_refusals) x)
SELECT '⚪ held-bytes live since (derived: first held row; empty ⇒ nothing measured)' AS line, coalesce(to_char((SELECT f FROM f), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ captures by tool: ' || "sourceTool", count(*)::text FROM held_file_refs GROUP BY "sourceTool"
UNION ALL SELECT '⚪ captures by serviceId (a foreign id = a user-registered same-name service, sec-ops N-7): ' || "serviceId" || ' (' || "serviceName" || ')', count(*)::text FROM held_file_refs GROUP BY "serviceId", "serviceName"
UNION ALL SELECT '· refusal ' || refusal || ' / identity ' || "identitySource", count(*)::text FROM held_capture_refusals GROUP BY refusal, "identitySource"
UNION ALL SELECT '· refs with redactedCount > 0 (live: a redacted held file)', count(*)::text FROM held_file_refs WHERE "redactedCount" > 0
UNION ALL SELECT '· dedup (non-superseded executions only): refs / distinct (scope, sha256)',
  (SELECT count(*) || ' / ' || count(DISTINCT (r.scope, r."blobSha256")) FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" WHERE e."supersededById" IS NULL)
UNION ALL SELECT '· storedByteLength p50 / p95 / max',
  (SELECT coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY "storedByteLength")::text, '-') || ' / ' || coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY "storedByteLength")::text, '-') || ' / ' || coalesce(max("storedByteLength")::text, '-') FROM held_blobs)
UNION ALL SELECT '· held_blobs total relation size (DB N1 trigger: > 5 GB or > 25% of the DB ⇒ object storage)', pg_size_pretty(pg_total_relation_size('held_blobs'))
UNION ALL SELECT '· refs whose source call carries rewritten:true (R9 changed what the agent saw — Stage B''s V population)',
  count(*)::text FROM held_file_refs r JOIN _a a ON a.eid = r."executionId" AND a.name = 'result.json' WHERE a.j->'toolCalls'->r."toolCallIndex"->>'rewritten' = 'true'
UNION ALL SELECT '· unreferenced blobs with lastReferencedAt older than 2 days (CONTEXT — normal up to 48 h; the GC journal check follows)',
  count(*)::text FROM held_blobs b WHERE b."lastReferencedAt" < now() - interval '2 days' AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.scope = b.scope AND r."blobSha256" = b.sha256)
UNION ALL SELECT '⚪ 🔴11 candidates: blobs > 40 bytes containing a literal backslash-n', count(*)::text FROM held_blobs WHERE octet_length(content) > 40 AND position('\x5c6e'::bytea IN content) > 0
UNION ALL SELECT '🔴 2 a ref whose execution is not SUCCESS', count(*)::text FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" WHERE e.status <> 'SUCCESS'
UNION ALL SELECT '🔴 3 a blob whose sha256 is not sha256(content)', count(*)::text FROM held_blobs WHERE sha256 <> encode(sha256(content), 'hex')
UNION ALL SELECT '🔴 4 a blob over 5 MB, or storedByteLength ≠ octet_length(content)', count(*)::text FROM held_blobs WHERE "storedByteLength" > 5242880 OR octet_length(content) <> "storedByteLength"
UNION ALL SELECT '🔴 5 a result.json carrying a heldBytes key (none until Stage B)', count(*)::text FROM _a WHERE name = 'result.json' AND j ? 'heldBytes'
UNION ALL SELECT '🔴 6 duplicate refs (executionId, toolCallIndex, selector)', count(*)::text FROM (SELECT 1 FROM held_file_refs GROUP BY "executionId", "toolCallIndex", selector HAVING count(*) > 1) d
UNION ALL SELECT '🔴 7 a line-map-broken refusal (R10 is pinned line-preserving)', count(*)::text FROM held_capture_refusals WHERE refusal = 'line-map-broken'
UNION ALL SELECT '🔴 8 a ref with redactorVersion none on production (R10 is ON)', count(*)::text FROM held_file_refs WHERE "redactorVersion" = 'none';

-- 🔴 9 / 10: successful declared calls with NO held row. Recomputed from each call's ARGUMENTS (they survive truncated:true).
-- Bounded ABOVE by the last held row (code review DB SF-2 / arch N1 / EF NF-6): after a kill-switch-off (R0) or a purge
-- (R0b) capture is deliberately not running, so only executions created while capture was demonstrably live are judged.
-- Bounds are the held executions' OWN result.json timestamps: an execution's result.json is written a moment BEFORE its
-- held rows, so bounding on the rows' createdAt dropped the first captured execution (found 2026-10-14: control 10 of 12).
WITH he AS (SELECT "executionId" e FROM held_file_refs UNION SELECT "executionId" FROM held_capture_refusals),
f AS (SELECT min(a.t) f FROM _a a JOIN he ON he.e = a.eid WHERE a.name = 'result.json'),
l AS (SELECT max(a.t) l FROM _a a JOIN he ON he.e = a.eid WHERE a.name = 'result.json'),
calls AS (
  SELECT a.eid, (tc.ord - 1)::int idx,
         CASE WHEN jsonb_typeof(tc.v->'arguments') = 'object' THEN tc.v->'arguments' ELSE NULL END args, tc.v
    FROM _a a JOIN agent_executions e ON e.id = a.eid AND e.status = 'SUCCESS',
         jsonb_array_elements(CASE WHEN jsonb_typeof(a.j->'toolCalls') = 'array' THEN a.j->'toolCalls' ELSE '[]' END) WITH ORDINALITY tc(v, ord)
   WHERE a.name = 'result.json' AND a.t >= (SELECT f FROM f) AND a.t <= (SELECT l FROM l) AND tc.v->>'tool' = 'services' AND tc.v->>'success' = 'true'
     AND coalesce(tc.v->'result'->>'isError', 'false') <> 'true'),
file_calls AS (SELECT * FROM calls WHERE args->>'tool' IN ('get_otel_config', 'get_ingress_config'))
SELECT '🔴 9 a SUCCESS execution with a successful declared (service, tool) call and ZERO rows in both held tables' AS line,
  count(DISTINCT fc.eid)::text AS value
  FROM file_calls fc
 WHERE fc.args->>'targetService' = 'observability-readonly'
   AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r."executionId" = fc.eid)
   AND NOT EXISTS (SELECT 1 FROM held_capture_refusals x WHERE x."executionId" = fc.eid)
UNION ALL SELECT '🔴 10 a successful file-tool call on a service IN the table with neither a ref nor a refusal for its toolCallIndex (known cause: a file dropped for a missing gateway serviceId — journal stats.noServiceId)',
  count(*)::text FROM file_calls fc
 WHERE fc.args->>'targetService' = 'observability-readonly'
   AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r."executionId" = fc.eid AND r."toolCallIndex" = fc.idx)
   AND NOT EXISTS (SELECT 1 FROM held_capture_refusals x WHERE x."executionId" = fc.eid AND x."toolCallIndex" = fc.idx)
UNION ALL SELECT '⚪ 9/10 control: declared file calls examined (0 ⇒ the two 🔴 zeros above are unmeasured)',
  count(*)::text FROM file_calls fc WHERE fc.args->>'targetService' = 'observability-readonly'
UNION ALL SELECT '⚪ 10 other-service half (same tool names, service NOT in the table — read the first hit by hand, BC-N8)',
  count(*)::text FROM file_calls fc WHERE coalesce(fc.args->>'targetService', '') <> 'observability-readonly';

-- 🔴 12: a ref on a comparable stored leaf whose sha256 ≠ blobSha256. The JSON Pointer is decoded (split on '/', then
-- '~1' → '/' BEFORE '~0' → '~', RFC 6901) and anchored at the envelope root (result → content → 0 → data → result).
WITH f AS (SELECT min("createdAt") f FROM held_file_refs),
refs AS (
  SELECT r.id, r."blobSha256", a.j->'toolCalls'->r."toolCallIndex" tc,
         ARRAY['result','content','0','data','result']
           || ARRAY(SELECT replace(replace(seg, '~1', '/'), '~0', '~') FROM unnest(string_to_array(substr(r.selector, 2), '/')) WITH ORDINALITY u(seg, o) ORDER BY o) AS p
    FROM held_file_refs r JOIN _a a ON a.eid = r."executionId" AND a.name = 'result.json'),
-- coalesce: an entry WITHOUT a truncated key is not truncated. Without it trunc is NULL, and NULL rows fall out of BOTH
-- `WHERE trunc` and `WHERE NOT trunc`, so every line read 0 and the control read 0 (found on the first live window,
-- 2026-10-14: 18 refs joined, 0 classified).
leaves AS (SELECT id, "blobSha256", coalesce(tc->'result'->>'truncated', 'false') = 'true' AS trunc, tc #>> p AS leaf FROM refs)
SELECT '· 12 refs not comparable: truncated stored entry' AS line, count(*)::text AS value FROM leaves WHERE trunc
UNION ALL SELECT '· 12 refs not comparable: looksSerialized leaf (> 40 chars with a literal backslash-n)', count(*)::text FROM leaves WHERE NOT trunc AND leaf IS NOT NULL AND length(leaf) > 40 AND strpos(leaf, E'\\n') > 0
UNION ALL SELECT '🔴 12 refs unresolved (the Pointer resolved on the raw record, so it must on the stored one — an anchor/decode bug)', count(*)::text FROM leaves WHERE NOT trunc AND leaf IS NULL
UNION ALL SELECT '⚪ 12 control: refs compared', count(*)::text FROM leaves WHERE NOT trunc AND leaf IS NOT NULL AND NOT (length(leaf) > 40 AND strpos(leaf, E'\\n') > 0)
UNION ALL SELECT '🔴 12 refs NOT classified by the lines above (a NULL in trunc/leaf — the check itself is broken)', ((SELECT count(*) FROM refs) - (SELECT count(*) FROM leaves WHERE trunc) - (SELECT count(*) FROM leaves WHERE NOT trunc AND leaf IS NULL) - (SELECT count(*) FROM leaves WHERE NOT trunc AND leaf IS NOT NULL))::text
UNION ALL SELECT '🔴 12 a comparable stored leaf whose sha256 ≠ the ref''s blobSha256', count(*)::text FROM leaves
  WHERE NOT trunc AND leaf IS NOT NULL AND NOT (length(leaf) > 40 AND strpos(leaf, E'\\n') > 0)
    AND encode(sha256(convert_to(leaf, 'UTF8')), 'hex') <> "blobSha256";
\else
\echo   (held-bytes tables absent — Stage A not deployed; nothing measured)
\endif
SQL
)
ssh "$PROD" "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" -X -q -v ON_ERROR_STOP=1" <<<"$SQL"

# ── HELD BYTES 🔴 11 and the GC journal check (PLATFORM-HELD-BYTES Stage A, §12.2) — outside SQL by necessity ──────────
echo
echo "============ HELD BYTES 🔴 11 + GC journal (runner + pm2 logs) ============"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if out=$("$HERE/scripts/replay-held-capture.sh" --check-held 2>/dev/null | tail -1) && [[ "$out" == candidates* ]]; then
  echo "🔴 11 held blobs the deep walk would redact more than the stored text (parity, NF-1): $out"
else
  echo "🔴 11 held blobs the deep walk would redact more than the stored text: UNMEASURED (runner failed — never read as 0)"
fi
# pm2 writes to /var/log/paichart/*combined*.log (ecosystem.config.js); the midnight line usually lands in the rotated .log.1.
# Expect ~2 lines per night (both processes run the sweep — register RM-SWEEPS-BOTH-PROCESSES).
gc=$(ssh "$PROD" 'grep -h "Held-bytes GC sweep" /var/log/paichart/*combined*.log* 2>/dev/null | tail -4 | cut -c1-200' || true)
if [ -n "$gc" ]; then sed 's/^/· GC journal: /' <<<"$gc"; else echo "· GC journal: 0 lines in /var/log/paichart/*combined*.log* (before the first midnight after deploy this is expected)"; fi
ctx=$(ssh "$PROD" 'grep -h "held-bytes: context counts\|held-bytes: capture batch ready" /var/log/paichart/*combined*.log* 2>/dev/null | grep -o "\"stats\":{[^}]*}" | tail -5' || true)
if [ -n "$ctx" ]; then sed 's/^/· capture stats (unidentified, undeclaredFailed, failedUnmatched, noServiceId…): /' <<<"$ctx"; else echo "· capture stats: 0 journal lines"; fi

