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
          OR f->'correction'->>'notAttemptedReason' IN ('hits-include-non-undercount', 'prior-pass-reserved:edit-correction')),
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
-- KC4 (owner 2026-10-19): kubernetes-gitops is IN scope from k8s 1.17.0 (its Author writes unified diffs against the repo
-- file); its legs are cut at 2026-10-18 08:21:02Z. Criterion 4 now watches every OTHER domain.
UNION ALL SELECT '🔴 attempt on a leg outside {terraform, kubernetes-gitops} (kill criterion 4, amended 2026-10-19)',
  count(*) FILTER (WHERE proto IS NULL OR proto NOT IN ('terraform-iac-protocol', 'kubernetes-gitops-protocol'))::text FROM leg
UNION ALL SELECT '· attempts on kubernetes-gitops legs (in scope since KC4; context)',
  count(*) FILTER (WHERE proto = 'kubernetes-gitops-protocol')::text FROM leg
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
\echo ============ HELD BYTES (shadow, PLATFORM-HELD-BYTES Stage A 2026-10-14; Stage B push 1 kinds) ============
-- Floor DERIVED as the first held row (refs ∪ refusals); EMPTY = an ABSENCE (not deployed / capture off / no Harvester
-- since). Tables absent ⇒ the section says so and skips (pre-deploy). 🔴 11 runs AFTER this block (it needs R10, which SQL
-- cannot run) through scripts/replay-held-capture.sh --check-held. Plan: STAGE-A-PLAN.md §12.2.
-- Declared (service, tool) pairs = every platform-default descriptor entry with `files` (held-bytes/descriptors.ts; the same set
-- as quote-fidelity FILE_LANE_KEYS). They live ONCE below, in `declared` of the 🔴 9/10 block — pinned pair for pair by
-- test-held-bytes-store, so a new descriptor without its MI-13 pair fails CI (held-k8s 1g).
-- Stage B (push 1, P1-1) — per-line `kind` disposition (STAGE-B-PLAN.md P1-1 table). held_file_refs now holds CAPTURE,
-- BASE and CANDIDATE rows; BASE / CANDIDATE carry NULL sourceTool / toolCallIndex / selector / declaredBy.
--   kind = 'CAPTURE': captures by tool, by serviceId, dedup, 🔴 6, the 🔴 9/10 window bound (`he`), 🔴 12 (refs ↔ stored leaf).
--   split by kind:    refs with redactedCount > 0 (BASE copies the CAPTURE count; CANDIDATE has its own).
--   kind-blind BY DESIGN: live-since, unreferenced-blob context, 🔴 11 candidates, 🔴 2/3/4/8, the 🔴 9/10 inner NOT EXISTS
--   (any ref kind proves the execution was held), gcBatchSql (held-bytes-store.ts), --check-held (covers CANDIDATE blobs).
SELECT to_regclass('public.held_file_refs') IS NOT NULL AS held_tables \gset
\if :held_tables
-- HELD LEGS (Phase 10, 2026-10-17, PHASE10-PLAN.md W8; generalised held-k8s 1g, EF B-2): every held leg — the retired variant token
-- (stamp or title; G3 history, no longer held-capable for NEW legs, panel D4), PLUS a leg of a held-capable protocol whose FIRST
-- harness execution (its PLAN-SPAWN / CREATE pipeline-index.json) composed that protocol at ≥ its join version. Keyed on the
-- EARLIEST index (panel F16 / EF-S6, the pov-program precedent), so a pre-join leg re-executed after the deploy never enters a 🔴
-- line — and NEVER on the facts the held sections audit (an editApplication-keyed population makes "missing editApplication"
-- zero by construction, EF B-2). A leg created between the protocol seed and the template reseed IS keyed in; the no-launch window
-- is what keeps that minute empty (re-review EF NOTE-4), not this key.
-- _heldjoin MUST equal variant.ts HELD_JOIN_VERSIONS pair for pair (pinned by test-held-bytes-store); a domain joins in BOTH.
CREATE TEMP VIEW _heldjoin AS SELECT * FROM (VALUES
  ('observability-config-protocol', '{1,10,0}'::int[]),
  ('kubernetes-gitops-protocol', '{1,18,0}'::int[]),
  ('terraform-iac-protocol', '{1,15,0}'::int[]),
  -- held-network J1 (push 2): keyed at the join TEXT's version; no leg composes 1.25.0 until push 3 seeds it (variant.ts
  -- HELD_JOIN_AWAITING_TEXT), so this row measures nothing before then — by construction, not an absence to explain.
  ('network-provisioning-protocol', '{1,25,0}'::int[])
) v(name, minver);
CREATE TEMP VIEW _heldleg AS SELECT t.id, t.title, t.metadata, t.metadata->>'pipelineStageId' AS ps FROM tasks t
  WHERE t.type = 'PIPELINE' AND (t.metadata->>'protocol' = 'observability-config-held-protocol'
    OR (t.metadata->>'protocol' IS NULL AND t.title LIKE '%(protocol: observability-config-held)%')
    OR EXISTS (SELECT 1 FROM _heldjoin hj
      WHERE (t.metadata->>'protocol' = hj.name
             OR (t.metadata->>'protocol' IS NULL AND t.title LIKE '%(protocol: ' || left(hj.name, length(hj.name) - 9) || ')%'))
        AND (SELECT a.j->'protocolInjection'->'delta'->>'name' = hj.name
                  AND string_to_array(substring(a.j->'protocolInjection'->'delta'->>'version' FROM '^[0-9]+\.[0-9]+\.[0-9]+'), '.')::int[] >= hj.minver
             FROM _a a JOIN agent_executions e ON e.id = a.eid
             WHERE e."taskId" = t.id AND a.name = 'pipeline-index.json' ORDER BY a.t ASC LIMIT 1)));
-- held-k8s 1g: each execution's OWNING-LEG protocol, canonical long form — the SQL twin of variant.ts resolveOwningLegProtocol (a
-- PIPELINE task is its own leg; a leaf's leg is its stage's metadata.harnessTaskId; stamp first, title token second). NULL ⇒ no leg.
CREATE TEMP VIEW _execleg AS
SELECT e.id AS eid, lg.id AS legid,
  CASE WHEN lg.metadata->>'protocol' IS NOT NULL
         THEN CASE WHEN lg.metadata->>'protocol' LIKE '%-protocol' THEN lg.metadata->>'protocol' ELSE (lg.metadata->>'protocol') || '-protocol' END
       ELSE (SELECT m[1] || '-protocol' FROM regexp_matches(lg.title, '\(protocol: ([A-Za-z0-9-]+)\)') m LIMIT 1) END AS legproto
FROM agent_executions e JOIN tasks c ON c.id = e."taskId"
LEFT JOIN stages s ON s.id = c.stage_id
LEFT JOIN tasks lg ON lg.id = CASE WHEN c.type = 'PIPELINE' THEN c.id ELSE s.metadata->>'harnessTaskId' END;
-- held-k8s 1g: the protocols whose legs may capture a Git file source — MUST equal variant.ts GIT_FILE_SOURCE_PROTOCOLS (pinned).
CREATE TEMP VIEW _gitsrcleg AS SELECT * FROM (VALUES ('kubernetes-gitops-protocol'), ('terraform-iac-protocol'), ('network-provisioning-protocol')) v(name);
WITH f AS (SELECT min(c) f FROM (SELECT min("createdAt") c FROM held_file_refs UNION ALL SELECT min("createdAt") FROM held_capture_refusals) x)
SELECT '⚪ held-bytes live since (derived: first held row; empty ⇒ nothing measured)' AS line, coalesce(to_char((SELECT f FROM f), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ refs by kind: ' || k.kind, (SELECT count(*) FROM held_file_refs r WHERE r.kind = k.kind)::text FROM (VALUES ('CAPTURE'), ('BASE'), ('CANDIDATE')) k(kind)
UNION ALL SELECT '⚪ captures by tool: ' || "sourceTool", count(*)::text FROM held_file_refs WHERE kind = 'CAPTURE' GROUP BY "sourceTool"
UNION ALL SELECT '⚪ captures by serviceId (a foreign id = a user-registered same-name service, sec-ops N-7): ' || "serviceId" || ' (' || "serviceName" || ')', count(*)::text FROM held_file_refs WHERE kind = 'CAPTURE' GROUP BY "serviceId", "serviceName"
UNION ALL SELECT '· refusal ' || refusal || ' / identity ' || "identitySource", count(*)::text FROM held_capture_refusals GROUP BY refusal, "identitySource"
UNION ALL SELECT '· refs with redactedCount > 0 (live: a redacted held file), kind ' || k.kind, (SELECT count(*) FROM held_file_refs r WHERE r.kind = k.kind AND r."redactedCount" > 0)::text FROM (VALUES ('CAPTURE'), ('BASE'), ('CANDIDATE')) k(kind)
UNION ALL SELECT '· dedup (non-superseded executions only): refs / distinct (scope, sha256)',
  (SELECT count(*) || ' / ' || count(DISTINCT (r.scope, r."blobSha256")) FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" WHERE e."supersededById" IS NULL AND r.kind = 'CAPTURE')
UNION ALL SELECT '· storedByteLength p50 / p95 / max',
  (SELECT coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY "storedByteLength")::text, '-') || ' / ' || coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY "storedByteLength")::text, '-') || ' / ' || coalesce(max("storedByteLength")::text, '-') FROM held_blobs)
UNION ALL SELECT '· held_blobs total relation size (DB N1 trigger: > 5 GB or > 25% of the DB ⇒ object storage)', pg_size_pretty(pg_total_relation_size('held_blobs'))
UNION ALL SELECT '· refs whose source call carries rewritten:true (R9 changed what the agent saw — Stage B''s V population)',
  count(*)::text FROM held_file_refs r JOIN _a a ON a.eid = r."executionId" AND a.name = 'result.json' WHERE r.kind = 'CAPTURE' AND a.j->'toolCalls'->r."toolCallIndex"->>'rewritten' = 'true'
UNION ALL SELECT '· unreferenced blobs with lastReferencedAt older than 2 days (CONTEXT — normal up to 48 h; the GC journal check follows)',
  count(*)::text FROM held_blobs b WHERE b."lastReferencedAt" < now() - interval '2 days' AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.scope = b.scope AND r."blobSha256" = b.sha256)
UNION ALL SELECT '⚪ 🔴11 candidates: blobs > 40 bytes containing a literal backslash-n', count(*)::text FROM held_blobs WHERE octet_length(content) > 40 AND position('\x5c6e'::bytea IN content) > 0
UNION ALL SELECT '🔴 2 a ref whose execution is not SUCCESS', count(*)::text FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" WHERE e.status <> 'SUCCESS'
UNION ALL SELECT '🔴 3 a blob whose sha256 is not sha256(content)', count(*)::text FROM held_blobs WHERE sha256 <> encode(sha256(content), 'hex')
UNION ALL SELECT '🔴 4 a blob over 5 MB, or storedByteLength ≠ octet_length(content)', count(*)::text FROM held_blobs WHERE "storedByteLength" > 5242880 OR octet_length(content) <> "storedByteLength"
UNION ALL SELECT '🔴 5 a result.json carrying a heldBytes key OUTSIDE a held-leg Harvester leaf (stamped there only)', count(*)::text FROM _a a
  JOIN agent_executions e ON e.id = a.eid JOIN tasks c ON c.id = e."taskId"
  WHERE a.name = 'result.json' AND a.j ? 'heldBytes' AND NOT (c."agentRole" ~* 'harvest' AND c.stage_id IN (SELECT ps FROM _heldleg))
UNION ALL SELECT '⚪ 🔴5 control: heldBytes stamps on held-leg Harvester leaves (push-2 code review DB-P2-2 / EF-P2-5)', count(*)::text FROM _a a
  JOIN agent_executions e ON e.id = a.eid JOIN tasks c ON c.id = e."taskId"
  WHERE a.name = 'result.json' AND a.j ? 'heldBytes' AND c."agentRole" ~* 'harvest' AND c.stage_id IN (SELECT ps FROM _heldleg)
UNION ALL SELECT '🔴 6 duplicate refs (executionId, toolCallIndex, selector)', count(*)::text FROM (SELECT 1 FROM held_file_refs WHERE kind = 'CAPTURE' GROUP BY "executionId", "toolCallIndex", selector HAVING count(*) > 1) d
UNION ALL SELECT '🔴 a CAPTURE ref with a NULL in the 4 relaxed columns (sourceTool, toolCallIndex, selector, declaredBy)', count(*)::text FROM held_file_refs WHERE kind = 'CAPTURE' AND ("sourceTool" IS NULL OR "toolCallIndex" IS NULL OR selector IS NULL OR "declaredBy" IS NULL)
UNION ALL SELECT '🔴 a held_views row with a NULL rewrittenLines (DB-CR-2: the column is nullable in the DB; every insert binds it, so 0 by construction)', count(*)::text FROM held_views WHERE "rewrittenLines" IS NULL
UNION ALL SELECT '🔴 7 a line-map-broken refusal (R10 is pinned line-preserving)', count(*)::text FROM held_capture_refusals WHERE refusal = 'line-map-broken'
UNION ALL SELECT '🔴 8 a ref with redactorVersion none on production (R10 is ON)', count(*)::text FROM held_file_refs WHERE "redactorVersion" = 'none';

-- 🔴 9 / 10: successful declared calls with NO held row. Recomputed from each call's ARGUMENTS (they survive truncated:true).
-- Bounded ABOVE by the last held row (code review DB SF-2 / arch N1 / EF NF-6): after a kill-switch-off (R0) or a purge
-- (R0b) capture is deliberately not running, so only executions created while capture was demonstrably live are judged.
-- Bounds are the held executions' OWN result.json timestamps: an execution's result.json is written a moment BEFORE its
-- held rows, so bounding on the rows' createdAt dropped the first captured execution (found 2026-10-14: control 10 of 12).
WITH he AS (SELECT "executionId" e FROM held_file_refs WHERE kind = 'CAPTURE' UNION SELECT "executionId" FROM held_capture_refusals),
f AS (SELECT min(a.t) f FROM _a a JOIN he ON he.e = a.eid WHERE a.name = 'result.json'),
l AS (SELECT max(a.t) l FROM _a a JOIN he ON he.e = a.eid WHERE a.name = 'result.json'),
declared AS (SELECT * FROM (VALUES
  ('observability-readonly', 'get_ingress_config'),
  ('observability-readonly', 'get_otel_config'),
  ('github-service', 'get_file_contents')
) d(svc, tool)),
calls AS (
  SELECT a.eid, (tc.ord - 1)::int idx,
         CASE WHEN jsonb_typeof(tc.v->'arguments') = 'object' THEN tc.v->'arguments' ELSE NULL END args, tc.v,
         -- held-k8s 1g: the RESOLVED service (envelope data.targetService), else the caller's spelling — capture's identify rule
         coalesce(tc.v->'result'->'content'->0->'data'->>'targetService',
                  CASE WHEN jsonb_typeof(tc.v->'arguments') = 'object' THEN tc.v->'arguments'->>'targetService' END) svc
    FROM _a a JOIN agent_executions e ON e.id = a.eid AND e.status = 'SUCCESS',
         jsonb_array_elements(CASE WHEN jsonb_typeof(a.j->'toolCalls') = 'array' THEN a.j->'toolCalls' ELSE '[]' END) WITH ORDINALITY tc(v, ord)
   WHERE a.name = 'result.json' AND a.t >= (SELECT f FROM f) AND a.t <= (SELECT l FROM l) AND tc.v->>'tool' = 'services' AND tc.v->>'success' = 'true'
     AND coalesce(tc.v->'result'->>'isError', 'false') <> 'true'),
file_calls AS (SELECT * FROM calls WHERE args->>'tool' IN (SELECT tool FROM declared)),
-- A Git file source call holds NOTHING by design in three named cases (none is a capture miss):
--   dir   R4 — a directory listing (no resource item; content[0] a JSON array, or the G-1 listing placeholder);
--   oos   1b-scope — the owning leg is not a Git file source protocol (_gitsrcleg);
--   trunc the stored result was truncated at persist, so dir cannot be decided — read by hand, never judged.
gitc AS (
  SELECT fc.*,
    coalesce(fc.v->'result'->>'truncated', 'false') = 'true' AS trunc,
    (NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(fc.v#>'{result,content,0,data,result,content}') = 'array'
                   THEN fc.v#>'{result,content,0,data,result,content}' ELSE '[]' END) x WHERE x->>'type' = 'resource')
     AND (fc.v#>>'{result,content,0,data,result,content,0,text}' = '[platform: the file source directory listing was elided at persist (it carries blob ids)]'
          OR ltrim(coalesce(fc.v#>>'{result,content,0,data,result,content,0,text}', '')) LIKE '[%')) AS dir,
    coalesce((SELECT x.legproto FROM _execleg x WHERE x.eid = fc.eid), '') NOT IN (SELECT name FROM _gitsrcleg) AS oos
  FROM file_calls fc WHERE fc.svc IN (SELECT svc FROM declared) AND fc.svc = 'github-service'),
judged AS (
  SELECT fc.* FROM file_calls fc JOIN declared d ON d.svc = fc.svc AND d.tool = fc.args->>'tool'
   WHERE NOT EXISTS (SELECT 1 FROM gitc g WHERE g.eid = fc.eid AND g.idx = fc.idx AND (g.trunc OR g.dir OR g.oos)))
SELECT '🔴 9 a SUCCESS execution with a successful declared (service, tool) call and ZERO rows in both held tables' AS line,
  count(DISTINCT j.eid)::text AS value
  FROM judged j
 WHERE NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r."executionId" = j.eid)
   AND NOT EXISTS (SELECT 1 FROM held_capture_refusals x WHERE x."executionId" = j.eid)
UNION ALL SELECT '🔴 10 a successful file-tool call on a service IN the table with neither a ref nor a refusal for its toolCallIndex (known cause: a file dropped for a missing gateway serviceId — journal stats.noServiceId)',
  count(*)::text FROM judged j
 WHERE NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r."executionId" = j.eid AND r."toolCallIndex" = j.idx)
   AND NOT EXISTS (SELECT 1 FROM held_capture_refusals x WHERE x."executionId" = j.eid AND x."toolCallIndex" = j.idx)
UNION ALL SELECT '⚪ 9/10 control: declared file calls examined (0 ⇒ the two 🔴 zeros above are unmeasured)', count(*)::text FROM judged
UNION ALL SELECT '⚪ 9/10 control by service: ' || svc, count(*)::text FROM judged GROUP BY svc
UNION ALL SELECT '⚪ 10 other-service half (same tool names, service NOT in the table — read the first hit by hand, BC-N8)',
  count(*)::text FROM file_calls fc WHERE NOT EXISTS (SELECT 1 FROM declared d WHERE d.svc = fc.svc AND d.tool = fc.args->>'tool')
UNION ALL SELECT '⚪ 9/10 github exempt — directory listing (R4: no row by design)', count(*)::text FROM gitc WHERE dir AND NOT trunc
UNION ALL SELECT '⚪ 9/10 github exempt — owning leg not a Git file source (1b-scope: no row by design)', count(*)::text FROM gitc WHERE oos AND NOT dir AND NOT trunc
UNION ALL SELECT '· 9/10 github NOT judged — truncated stored result (directory undecidable; read each by hand)', count(*)::text FROM gitc WHERE trunc;

-- 🔴 12: a ref on a comparable stored leaf whose sha256 ≠ blobSha256. The JSON Pointer is decoded (split on '/', then
-- '~1' → '/' BEFORE '~0' → '~', RFC 6901) and anchored at the envelope root (result → content → 0 → data → result).
WITH f AS (SELECT min("createdAt") f FROM held_file_refs WHERE kind = 'CAPTURE'),
refs AS (
  SELECT r.id, r."blobSha256", a.j->'toolCalls'->r."toolCallIndex" tc,
         ARRAY['result','content','0','data','result']
           || ARRAY(SELECT replace(replace(seg, '~1', '/'), '~0', '~') FROM unnest(string_to_array(substr(r.selector, 2), '/')) WITH ORDINALITY u(seg, o) ORDER BY o) AS p
    FROM held_file_refs r JOIN _a a ON a.eid = r."executionId" AND a.name = 'result.json' WHERE r.kind = 'CAPTURE'),
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

-- held-k8s 1g — GIT FILE SOURCE (github-service; SYNTHESIS v3 §6.2). Every 🔴 is 0 by construction on correct code; each ⚪ is
-- its control. The pin below RE-DERIVES git-file-source-pin.js in SQL from the stored arguments (an approximation: the bidi and
-- well-formedness rules are not re-checked). The call-time gate refuses a violator (PINNED_ARGUMENT), so a SUCCESSFUL violator is
-- a gate bypass. Pin literals MUST equal GIT_FILE_SOURCE_PINS (pinned by test-held-bytes-store).
WITH gcalls AS (
  SELECT a.eid, tc.v,
         coalesce(tc.v->'result'->'content'->0->'data'->>'targetService',
                  CASE WHEN jsonb_typeof(tc.v->'arguments') = 'object' THEN tc.v->'arguments'->>'targetService' END) svc,
         coalesce(tc.v->'result'->'content'->0->'data'->'arguments',
                  CASE WHEN jsonb_typeof(tc.v->'arguments'->'arguments') = 'object' THEN tc.v->'arguments'->'arguments' END) sa,
         tc.v->>'success' = 'true' AND coalesce(tc.v->'result'->>'isError', 'false') <> 'true' AS ok
    FROM _a a, jsonb_array_elements(CASE WHEN jsonb_typeof(a.j->'toolCalls') = 'array' THEN a.j->'toolCalls' ELSE '[]' END) tc(v)
   WHERE a.name = 'result.json' AND tc.v->>'tool' = 'services'),
g AS (SELECT *, regexp_replace(coalesce(sa->>'path', ''), '^/', '') p FROM gcalls WHERE svc = 'github-service'),
gp AS (SELECT *, NOT (
    coalesce(sa->>'owner', '') ~ '^[A-Za-z0-9._-]+$' AND lower(sa->>'owner') = 'paichart'
    AND coalesce(sa->>'repo', '') ~ '^[A-Za-z0-9._-]+$' AND lower(sa->>'repo') = 'paichart-lab-configs'
    AND NOT coalesce(sa ? 'sha', false)
    AND (sa->>'ref' IS NULL OR sa->>'ref' IN ('main', 'refs/heads/main'))
    AND p <> '' AND length(p) <= 1024 AND p !~ '[%\\]' AND p !~ '[[:cntrl:]]' AND ('/' || p || '/') !~ '/(\.{1,2})?/'
    -- held-terraform SF-1: heldPathRefusal at the call gate (state / plan / variables paths)
    AND ('/' || lower(p) || '/') !~ '/(\.terraform|terraform\.tfstate\.d)/' AND lower(regexp_replace(p, '^.*/', '')) !~ '\.(tfstate|tfplan|tfvars)'
    -- TF-PATH-RULE-GAPS: the closed lists (suffix-less plans; Terraform CLI credentials)
    AND lower(regexp_replace(p, '^.*/', '')) NOT IN ('tfplan', 'tfplan.out', 'plan.out', 'tfplan.json', 'tfplan.binary', '.terraformrc', 'terraform.rc', 'credentials.tfrc.json')
    AND ('/' || lower(p) || '/') !~ '/\.terraform\.d/'
    -- held-network S1-H: a Nornir inventory under a nornir/ or inventory/ segment (credentials-file, narrowed — never by name alone)
    AND NOT (lower(regexp_replace(p, '^.*/', '')) IN ('hosts.yaml', 'hosts.yml', 'groups.yaml', 'groups.yml', 'defaults.yaml', 'defaults.yml')
             AND ('/' || lower(p)) ~ '/(nornir|inventory)/')
  ) AS violates FROM g)
SELECT '🔴 a SUCCESSFUL github-service call whose stored arguments break the pin (re-derived; a hit is a call-time gate bypass)' AS line,
  count(*) FILTER (WHERE ok AND violates)::text AS value FROM gp
-- held-terraform step 2 (sec-ops SW-1): a call-time refusal never names the violation TYPE, so match the hub's message — and match it
-- in BOTH stored shapes: production's agent loop persists success:true + result.isError with the message in result.content
-- (read off live leg T-W2, 2026-10-21), the lab's fixture tier persists success:false + result:null + the message under the error key.
-- The message regex covers the PINNED_ARGUMENT wording before F-T1 (escaped quotes) and after it.
UNION ALL SELECT '⚪ github-service calls examined: all / successful / refused at call time (PINNED_ARGUMENT)',
  count(*) || ' / ' || count(*) FILTER (WHERE ok) || ' / ' || count(*) FILTER (WHERE (coalesce((v->'result')::text, '') || ' ' || coalesce(v->>'error', ''))
    ~ 'outside the file source|never read through the Git file source') FROM gp
UNION ALL SELECT '⚪ github-service calls whose stored arguments break the pin, any outcome (the gate''s own refusals land here)', count(*) FILTER (WHERE violates)::text FROM gp
UNION ALL SELECT '🔴 a github-service CAPTURE on an execution whose owning leg is not a Git file source (1b-scope)', count(*)::text
  FROM held_file_refs r LEFT JOIN _execleg x ON x.eid = r."executionId"
 WHERE r.kind = 'CAPTURE' AND r."serviceName" = 'github-service' AND coalesce(x.legproto, '') NOT IN (SELECT name FROM _gitsrcleg)
UNION ALL SELECT '⚪ secret-manifest refusals (G-5: a plaintext Secret was never stored)', count(*)::text FROM held_capture_refusals WHERE refusal = 'secret-manifest'
UNION ALL SELECT '🔴 a held ref whose path is a terraform state, plan, variables or CLI credentials file (held-terraform T-3/T-4 + TF-PATH-RULE-GAPS: capture refuses each by path; re-derived from heldPathRefusal)', count(*)::text
  FROM held_file_refs WHERE lower(coalesce(path, '')) ~ '(^|/)(\.terraform|terraform\.tfstate\.d|\.terraform\.d)(/|$)' OR lower(regexp_replace(coalesce(path, ''), '^.*/', '')) ~ '\.(tfstate|tfplan|tfvars)'
     OR lower(regexp_replace(coalesce(path, ''), '^.*/', '')) IN ('tfplan', 'tfplan.out', 'plan.out', 'tfplan.json', 'tfplan.binary', '.terraformrc', 'terraform.rc', 'credentials.tfrc.json')
     OR (lower(regexp_replace(coalesce(path, ''), '^.*/', '')) IN ('hosts.yaml', 'hosts.yml', 'groups.yaml', 'groups.yml', 'defaults.yaml', 'defaults.yml')
         AND ('/' || lower(coalesce(path, ''))) ~ '/(nornir|inventory)/')
UNION ALL SELECT '🔴 a held blob whose text is terraform state or plan JSON (sec-ops SF-2 content half: capture refuses it state-file under any name)', count(*)::text
  FROM held_blobs WHERE convert_from(content, 'UTF8') ~ '"terraform_version"\s*:' AND convert_from(content, 'UTF8') ~ '"(lineage|prior_state|planned_values|resource_changes)"\s*:'
UNION ALL SELECT '⚪ state-file refusals (held-terraform T-3: a terraform state path was never stored)', count(*)::text FROM held_capture_refusals WHERE refusal = 'state-file'
UNION ALL SELECT '⚪ tfvars-file refusals (held-terraform T-4: a variables file was never stored)', count(*)::text FROM held_capture_refusals WHERE refusal = 'tfvars-file'
UNION ALL SELECT '⚪ credentials-file refusals (TF-PATH-RULE-GAPS: a Terraform CLI credentials file was never stored)', count(*)::text FROM held_capture_refusals WHERE refusal = 'credentials-file';
-- held-k8s 1g: the sourceRevision lines need the K-3 column (schema commit 44c51e63f). Before the step-1 deploy it is absent on prod:
-- say so and continue, never abort the inventory (ON_ERROR_STOP would end every later section).
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'held_file_refs' AND column_name = 'sourceRevision') AS held_srcrev \gset
\if :held_srcrev
SELECT '🔴 a github-service CAPTURE ref with a NULL sourceRevision (the pin takes it from the served URI)' AS line, count(*)::text AS value
  FROM held_file_refs WHERE kind = 'CAPTURE' AND "serviceName" = 'github-service' AND "sourceRevision" IS NULL
UNION ALL SELECT '🔴 a ref whose sourceRevision is not 40 lowercase hex', count(*)::text
  FROM held_file_refs WHERE "sourceRevision" IS NOT NULL AND "sourceRevision" !~ '^[0-9a-f]{40}$'
UNION ALL SELECT '🔴 a BASE / CANDIDATE whose sourceRevision differs from the ref it copied (fromRefId)', count(*)::text
  FROM held_file_refs r JOIN held_file_refs p ON p.id = r."fromRefId" WHERE r.kind <> 'CAPTURE' AND r."sourceRevision" IS DISTINCT FROM p."sourceRevision"
UNION ALL SELECT '⚪ CAPTURE refs by service: refs / with a revision / distinct revisions — ' || "serviceName",
  count(*) || ' / ' || count("sourceRevision") || ' / ' || count(DISTINCT "sourceRevision") FROM held_file_refs WHERE kind = 'CAPTURE' GROUP BY "serviceName";
\else
\echo   (held_file_refs.sourceRevision absent — the held-k8s step-1 schema is not deployed; the 3 revision 🔴 lines and the revisions ⚪ are unmeasured)
\endif
-- held-network step 3 batch 2b (P3/P4/P5, 2026-10-26): the DEVICE-READ lane (descriptors.ts DEVICE_READ_DESCRIPTORS — target
-- `device:<host>`, path /running-config) and the two network Harvester facts. Every 🔴 is 0 by construction on correct code; each ⚪
-- is its control (0 device refs ⇒ the 🔴 beside them are unmeasured — an ABSENCE until a declared device-read leg runs after the deploy).
-- _devsrcleg MUST equal variant.ts DEVICE_SOURCE_PROTOCOLS (pinned by test-device-read-capture).
CREATE TEMP VIEW _devsrcleg AS SELECT * FROM (VALUES ('network-provisioning-protocol')) v(name);
SELECT '⚪ device-read lane CAPTURE refs (target device:<host>)' AS line, count(*)::text AS value
  FROM held_file_refs WHERE kind = 'CAPTURE' AND target LIKE 'device:%' AND "declaredBy" = 'platform-default'
UNION ALL SELECT '⚪ device-read lane refusals by name — ' || refusal, count(*)::text FROM held_capture_refusals
 WHERE refusal LIKE 'device-%' GROUP BY refusal
UNION ALL SELECT '🔴 a device-read CAPTURE ref on an execution whose owning leg does not declare Device sources (P3: the lane exists only there)', count(*)::text
  FROM held_file_refs r LEFT JOIN _execleg x ON x.eid = r."executionId"
 WHERE r.kind = 'CAPTURE' AND r.target LIKE 'device:%' AND r."declaredBy" = 'platform-default' AND coalesce(x.legproto, '') NOT IN (SELECT name FROM _devsrcleg)
UNION ALL SELECT '🔴 a device-read CAPTURE ref whose selector is not a host''s structured running config, or whose path is not /running-config', count(*)::text
  FROM held_file_refs WHERE kind = 'CAPTURE' AND target LIKE 'device:%' AND "declaredBy" = 'platform-default'
   AND (selector !~ '^/structuredContent/hosts/[^/]+/output/config/running$' OR path <> '/running-config' OR target <> 'device:' || split_part(selector, '/', 4))
UNION ALL SELECT '⚪ deviceSourceReads stamps (network Harvesters): checked / not checked', count(*) FILTER (WHERE a.j->'deviceSourceReads'->>'checked' = 'true') || ' / '
  || count(*) FILTER (WHERE a.j->'deviceSourceReads'->>'checked' = 'false') FROM _a a WHERE a.name = 'result.json' AND a.j ? 'deviceSourceReads'
UNION ALL SELECT '· deviceSourceReads: stamps with a declared source NOT read (F-NW1 window read — read each by hand)', count(*)::text
  FROM _a a WHERE a.name = 'result.json' AND (a.j->'deviceSourceReads'->>'notRead')::int > 0
UNION ALL SELECT '· deviceSourceReads: stamps with an undeclared device config read (S-NOBLOCK: never held)', count(*)::text
  FROM _a a WHERE a.name = 'result.json' AND (a.j->'deviceSourceReads'->>'undeclaredDeviceConfigReads')::int > 0
UNION ALL SELECT '⚪ gitDeviceComparison Harvester stamps: compared devices / devices with ≥ 1 difference', coalesce(sum((a.j->'gitDeviceComparison'->>'comparedDevices')::int), 0) || ' / '
  || count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.j->'gitDeviceComparison'->'devices') = 'array' THEN a.j->'gitDeviceComparison'->'devices' ELSE '[]' END) d WHERE (d->>'differencesTotal')::int > 0))
  FROM _a a WHERE a.name = 'result.json' AND a.j->'gitDeviceComparison'->>'point' = 'harvester'
-- held-network step 3 push 2 (O-2, the J1 entry gate): capture governs from the leg's FIRST-EXECUTION declaration snapshot
-- (metadata.deviceSourcesSnapshot, prepare-task-for-execution.ts). The 🔴 is scoped to refs written after the first snapshot ever
-- (a ref from a leg first executed before push 2 deployed predates the rule); while the ⚪ reads nothing it is unmeasured.
UNION ALL SELECT '⚪ Device-sources legs carrying a declaration snapshot (O-2), by snapshot state — '
  || coalesce(t.metadata->'deviceSourcesSnapshot'->'resolution'->>'state', '(unreadable)'), count(*)::text
  FROM tasks t WHERE t.type = 'PIPELINE' AND t.metadata->>'protocol' IN (SELECT name FROM _devsrcleg) AND t.metadata ? 'deviceSourcesSnapshot' GROUP BY 1
UNION ALL SELECT '🔴 a device-read CAPTURE ref (written after the first snapshot ever) whose owning leg carries NO declaration snapshot (O-2)', count(*)::text
  FROM held_file_refs r JOIN _execleg x ON x.eid = r."executionId" JOIN tasks lg ON lg.id = x.legid
 WHERE r.kind = 'CAPTURE' AND r.target LIKE 'device:%' AND NOT (lg.metadata ? 'deviceSourcesSnapshot')
   AND r."createdAt" >= (SELECT min((metadata->'deviceSourcesSnapshot'->>'takenAt')::timestamptz) FROM tasks WHERE metadata ? 'deviceSourcesSnapshot')
-- push 2 (P8, mcp-hub SF-3): the DECLARED-GIT-LINE lane — a Git file held from a customer (non-platform) Git service because it equals a
-- declared `git-file` line. 🔴 0 by construction: the lane exists only on a Device-sources leg, and it refuses a read with no served URI.
UNION ALL SELECT '⚪ declared-git-line CAPTURE refs (target github:…, service ≠ github-service), by declaredBy — ' || "declaredBy", count(*)::text
  FROM held_file_refs WHERE kind = 'CAPTURE' AND target LIKE 'github:%' AND "serviceName" <> 'github-service' GROUP BY "declaredBy"
UNION ALL SELECT '⚪ declared-git-line refusals — git-file-not-declared', count(*)::text FROM held_capture_refusals WHERE refusal = 'git-file-not-declared'
UNION ALL SELECT '🔴 a declared-git-line CAPTURE ref on an execution whose owning leg does not declare Device sources (P8: the lane exists only there)', count(*)::text
  FROM held_file_refs r LEFT JOIN _execleg x ON x.eid = r."executionId"
 WHERE r.kind = 'CAPTURE' AND r.target LIKE 'github:%' AND r."serviceName" <> 'github-service' AND r."declaredBy" = 'platform-default'
   AND coalesce(x.legproto, '') NOT IN (SELECT name FROM _devsrcleg)
UNION ALL SELECT '🔴 a declared-git-line CAPTURE ref with no sourceRevision (mcp-hub push-2 SF-1: a read with no served URI holds nothing)', count(*)::text
  FROM held_file_refs WHERE kind = 'CAPTURE' AND target LIKE 'github:%' AND "serviceName" <> 'github-service' AND "declaredBy" = 'platform-default' AND "sourceRevision" IS NULL;
-- WI-B10 (2026-10-23, design §9.1 J): REGISTRANT file declarations. Every 🔴 is 0 by construction on correct code; each ⚪ is its
-- control (while the registrant counts read 0 the 🔴 beside them are unmeasured — no customer service has declared files yet). The
-- call-time eligibility fact itself is never persisted (§10 A-1); since INTERNAL-FIT IF-3 (2026-10-24) its OUTCOME is stamped on
-- CAPTURE refs/refusals (eligibility own | granted | install | platform + grantPovId) and measured in the IF-3 block below. "A foreign
-- row was held" is still enforced by construction in extract.ts ('foreign' is never stored) and pinned by test-held-registrant-capture.
-- The guard reads the table the queries RESOLVE (regclass follows search_path, so a control's TEMP shadow table is the one judged —
-- LL-T-41: the held-git control's shadow tables predate this column and must skip, not abort).
SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'held_file_refs'::regclass AND attname = 'declarationSha256' AND NOT attisdropped)
  AND to_regclass('held_declarations') IS NOT NULL AS held_decl \gset
\if :held_decl
SELECT '⚪ mcp_tools rows carrying a held-file declaration: fetched / direct' AS line,
  count(*) FILTER (WHERE "declarationSource" = 'fetched') || ' / ' || count(*) FILTER (WHERE "declarationSource" = 'direct') AS value
  FROM mcp_tools WHERE jsonb_typeof("heldFiles") = 'object'
UNION ALL SELECT '⚪ held_declarations snapshots', count(*)::text FROM held_declarations
UNION ALL SELECT '⚪ registrant CAPTURE refs: refs / distinct declarations / distinct services',
  count(*) || ' / ' || count(DISTINCT "declarationSha256") || ' / ' || count(DISTINCT "serviceId") FROM held_file_refs WHERE kind = 'CAPTURE' AND "declaredBy" = 'registrant'
UNION ALL SELECT '⚪ registrant refusals by name — ' || refusal, count(*)::text FROM held_capture_refusals WHERE "declaredBy" = 'registrant' GROUP BY refusal
UNION ALL SELECT '🔴 a registrant CAPTURE ref without a declarationSha256 (the store validator refuses it)', count(*)::text
  FROM held_file_refs WHERE kind = 'CAPTURE' AND "declaredBy" = 'registrant' AND "declarationSha256" IS NULL
UNION ALL SELECT '🔴 a non-registrant held row carrying a declarationSha256 (refs + refusals; BASE/CANDIDATE never inherit it)', (
  (SELECT count(*) FROM held_file_refs WHERE coalesce("declaredBy", '') <> 'registrant' AND "declarationSha256" IS NOT NULL)
  + (SELECT count(*) FROM held_capture_refusals WHERE "declaredBy" <> 'registrant' AND "declarationSha256" IS NOT NULL))::text
UNION ALL SELECT '🔴 a registrant CAPTURE whose declaration snapshot is missing (snapshots are immutable, never deleted in v1)', count(*)::text
  FROM held_file_refs r WHERE r.kind = 'CAPTURE' AND r."declaredBy" = 'registrant' AND r."declarationSha256" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM held_declarations d WHERE d.sha256 = r."declarationSha256")
UNION ALL SELECT '🔴 a registrant CAPTURE on a tool its own snapshot does not declare (recomputed from held_declarations)', count(*)::text
  FROM held_file_refs r JOIN held_declarations d ON d.sha256 = r."declarationSha256"
 WHERE r.kind = 'CAPTURE' AND r."declaredBy" = 'registrant'
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d."heldFiles"->'files') = 'array' THEN d."heldFiles"->'files' ELSE '[]' END) f WHERE f->>'tool' = r."sourceTool")
UNION ALL SELECT '🔴 a stored declaration whose gitPin equals a platform pin (WB-1: never the platform Git source; the validator refuses it)', count(*)::text
  FROM held_declarations d, jsonb_array_elements(CASE WHEN jsonb_typeof(d."heldFiles"->'files') = 'array' THEN d."heldFiles"->'files' ELSE '[]' END) f
 WHERE lower(f->'gitPin'->>'owner') = 'paichart' AND lower(f->'gitPin'->>'repo') = 'paichart-lab-configs'
UNION ALL SELECT '🔴 an mcp_tools declaration on a platform-default service name (F(a): refused at registration)', count(*)::text
  FROM mcp_tools WHERE jsonb_typeof("heldFiles") = 'object' AND name IN ('observability-readonly', 'github-service')
UNION ALL SELECT '🔴 an mcp_tools row whose heldFilesSha256 has no snapshot (the snapshot is written BEFORE the row)', count(*)::text
  FROM mcp_tools t WHERE t."heldFilesSha256" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM held_declarations d WHERE d.sha256 = t."heldFilesSha256");
\else
\echo   (held_file_refs.declarationSha256 absent — the WI-B10 schema is not deployed; the registrant 🔴 lines are unmeasured)
\endif
-- INTERNAL-FIT IF-3 (2026-10-24): shared held eligibility — the hosted owner-written POV grant (eligibility 'granted' + the ONE
-- grantPovId) and the self-host install-wide setting ('install', never on the hosted platform). Every 🔴 is 0 by construction on
-- correct code and is proven from STORED rows only (database-manager B-1: never recomputed from the fire-and-forget audit trail);
-- each ⚪ is a control. Resolve-aware guard (LL-T-41), as above.
SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'held_file_refs'::regclass AND attname = 'eligibility' AND NOT attisdropped)
  AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'held_capture_refusals'::regclass AND attname = 'eligibility' AND NOT attisdropped)
  AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'mcp_tools'::regclass AND attname = 'heldGrantPovIds' AND NOT attisdropped) AS held_if3 \gset
\if :held_if3
SELECT '⚪ mcp_tools rows carrying a POV grant list (rows / grants)' AS line,
  count(*) || ' / ' || coalesce(sum(cardinality("heldGrantPovIds")), 0) AS value FROM mcp_tools WHERE cardinality("heldGrantPovIds") > 0
UNION ALL SELECT '⚪ CAPTURE refs by eligibility — ' || coalesce(eligibility, '(null: pre-IF-3 or replay)'), count(*)::text
  FROM held_file_refs WHERE kind = 'CAPTURE' GROUP BY eligibility
UNION ALL SELECT '⚪ granted CAPTURE refs + refusals', ((SELECT count(*) FROM held_file_refs WHERE eligibility = 'granted')
  + (SELECT count(*) FROM held_capture_refusals WHERE eligibility = 'granted'))::text
UNION ALL SELECT '⚪ grant entries naming a POV the row owner is no longer a literal member of (legitimate after a member leaves — a CONTROL)', count(*)::text
  FROM mcp_tools t, unnest(t."heldGrantPovIds") g(pov)
 WHERE NOT EXISTS (SELECT 1 FROM "POV" p WHERE p.id = g.pov AND (p."ownerId" = t.configuration->>'ownerId'
        OR EXISTS (SELECT 1 FROM "TeamMember" tm WHERE tm."teamId" = p."teamId" AND tm."userId" = t.configuration->>'ownerId')))
UNION ALL SELECT '🔴 eligibility granted ⇔ grantPovId set, broken in either direction (refs + refusals)', (
  (SELECT count(*) FROM held_file_refs WHERE (eligibility = 'granted') <> ("grantPovId" IS NOT NULL) AND eligibility IS NOT NULL)
  + (SELECT count(*) FROM held_file_refs WHERE eligibility IS NULL AND "grantPovId" IS NOT NULL)
  + (SELECT count(*) FROM held_capture_refusals WHERE (eligibility = 'granted') <> ("grantPovId" IS NOT NULL) AND eligibility IS NOT NULL)
  + (SELECT count(*) FROM held_capture_refusals WHERE eligibility IS NULL AND "grantPovId" IS NOT NULL))::text
UNION ALL SELECT '🔴 an eligibility outside the closed set (own, granted, install, platform; refs + refusals; foreign is never stored)', (
  (SELECT count(*) FROM held_file_refs WHERE eligibility IS NOT NULL AND eligibility NOT IN ('own','granted','install','platform'))
  + (SELECT count(*) FROM held_capture_refusals WHERE eligibility IS NOT NULL AND eligibility NOT IN ('own','granted','install','platform')))::text
UNION ALL SELECT '🔴 a BASE / CANDIDATE ref carrying an eligibility or grantPovId (CAPTURE rows only — never inherited)', count(*)::text
  FROM held_file_refs WHERE kind IN ('BASE','CANDIDATE') AND (eligibility IS NOT NULL OR "grantPovId" IS NOT NULL)
UNION ALL SELECT '🔴 a granted row whose grantPovId is not its execution''s task POV (refs + refusals; a NULL one is the line above)', (
  (SELECT count(*) FROM held_file_refs r JOIN agent_executions e ON e.id = r."executionId" JOIN tasks t ON t.id = e."taskId"
    WHERE r.eligibility = 'granted' AND r."grantPovId" IS NOT NULL AND r."grantPovId" IS DISTINCT FROM t.pov_id)
  + (SELECT count(*) FROM held_capture_refusals r JOIN agent_executions e ON e.id = r."executionId" JOIN tasks t ON t.id = e."taskId"
    WHERE r.eligibility = 'granted' AND r."grantPovId" IS NOT NULL AND r."grantPovId" IS DISTINCT FROM t.pov_id))::text
UNION ALL SELECT '🔴 a CAPTURE ref/refusal on a row OWNERLESS NOW (configuration ownerId absent — github-service is one) whose stored eligibility is set and is not platform (HELD-CAPTURE-COMPARE-ELIGIBILITY; refs + refusals; NULL = pre-IF-3, not counted)', (
  (SELECT count(*) FROM held_file_refs r JOIN mcp_tools m ON m.id = r."serviceId"
    WHERE r.kind = 'CAPTURE' AND r.eligibility IS NOT NULL AND r.eligibility <> 'platform' AND coalesce(m.configuration->>'ownerId', '') = '')
  + (SELECT count(*) FROM held_capture_refusals r JOIN mcp_tools m ON m.id = r."serviceId"
    WHERE r.eligibility IS NOT NULL AND r.eligibility <> 'platform' AND coalesce(m.configuration->>'ownerId', '') = ''))::text
UNION ALL SELECT '⚪ CAPTURE refs/refusals on a row ownerless now with a stored eligibility (the control for the line above; 0 ⇒ unmeasured)', (
  (SELECT count(*) FROM held_file_refs r JOIN mcp_tools m ON m.id = r."serviceId"
    WHERE r.kind = 'CAPTURE' AND r.eligibility IS NOT NULL AND coalesce(m.configuration->>'ownerId', '') = '')
  + (SELECT count(*) FROM held_capture_refusals r JOIN mcp_tools m ON m.id = r."serviceId"
    WHERE r.eligibility IS NOT NULL AND coalesce(m.configuration->>'ownerId', '') = ''))::text
UNION ALL SELECT '🔴 an install-wide row on the HOSTED platform (HELD_ELIGIBILITY_INSTALL_WIDE is self-host only; run against prod)', (
  (SELECT count(*) FROM held_file_refs WHERE eligibility = 'install') + (SELECT count(*) FROM held_capture_refusals WHERE eligibility = 'install'))::text;
\else
\echo   (eligibility / heldGrantPovIds absent — the IF-3 schema is not deployed; the shared-eligibility 🔴 lines are unmeasured)
\endif
\else
\echo   (held-bytes tables absent — Stage A not deployed; nothing measured)
\endif
\echo ============ HELD LEGS (PLATFORM-HELD-BYTES Stage B V-10; Phase 10: every held-capable leg, view _heldleg) ============
-- A HELD LEG is a row of _heldleg (defined before the HELD BYTES section: the retired variant token, or an obs leg composed on
-- obs ≥ 1.10.0). Its leaves are the tasks in the stage its metadata names. Every 🔴 below is 0 by construction on correct code;
-- each ⚪ is a control. While the held-legs control reads 0 every zero beside it is UNMEASURED — an absence, not a result.
-- Phase 10 scope rule (held-edit-carrier.ts): an Author in state no-edits / no-base is OUT OF SCOPE (heldEdit.inScope false) —
-- its leg may be approved with no applied edit; the two approval 🔴 lines below exempt exactly that.
-- An errorFact-shaped stamp (reason enrichment-error) is a ⚪ (a net that failed and said so); a real stamp where none belongs is 🔴.
-- Every artifact read goes through section 0's `_a` (lone-surrogate rows filtered BEFORE the jsonb cast): a raw `content::jsonb`
-- CTE here could be inlined into a scan of every artifact and abort the whole section on one bad row (push-2 code review DB-P2-1).
\if :held_tables
WITH vleg AS (SELECT id, metadata, ps FROM _heldleg),
leaf AS (SELECT c.id, c."agentRole" AS role, v.id AS leg, c.created_at AS tc FROM tasks c JOIN vleg v ON c.stage_id = v.ps),
rj AS (
  SELECT e."taskId" AS tid, a.eid, a.j FROM _a a JOIN agent_executions e ON e.id = a.eid
  WHERE a.name IN ('result.json', 'pipeline-index.json') AND e.status = 'SUCCESS' AND a.j ? 'editApplication'),
pidx AS (
  SELECT e."taskId" AS tid, a.j FROM _a a JOIN agent_executions e ON e.id = a.eid
  WHERE a.name = 'pipeline-index.json' AND e."taskId" IN (SELECT id FROM vleg)),
va AS (SELECT a.eid, e."taskId" AS tid, l.leg, a.j FROM _a a JOIN agent_executions e ON e.id = a.eid JOIN leaf l ON l.id = e."taskId"
  WHERE a.name = 'result.json' AND e.status = 'SUCCESS' AND l.role = 'config_change_author'),
vr AS (SELECT a.eid, l.leg, a.j FROM _a a JOIN agent_executions e ON e.id = a.eid JOIN leaf l ON l.id = e."taskId"
  WHERE a.name = 'result.json' AND e.status = 'SUCCESS' AND l.role = 'change_reviewer'),
-- Phase 10 panel F15 (EF-S5 / AR-S7 / audit A-M2): the Author the CARRIER judges — the FIRST-created config_change_author task of the
-- leg, its newest SUCCESS execution (the authoritative-read analogue; when that first Author never succeeded it can differ from the
-- carrier's pick — accepted, re-review EF NOTE-3: the first 🔴 line still fires) — and THE out-of-scope predicate (held-bytes/scope.ts)
-- re-derived from that Author's OWN stamp, never from qualityGate.heldEdit.inScope, so these lines stay independent of the carrier.
vsel AS (SELECT DISTINCT ON (va.leg) va.leg, va.eid, va.j,
    (va.j->'editApplication'->>'state' IN ('no-edits','no-base','demo-pov','view-not-rendered','view-over-budget','view-line-map-unstable',
        'unheld','handle-ambiguous','base-superseded','base-not-held','handle-namespace-ambiguous','diff-over-budget')
      AND coalesce(va.j->'editApplication'->>'digestTruncated', 'false') <> 'true'
      AND coalesce((va.j->'editApplication'->>'blocksTotal')::int, 0) = 0 AND coalesce((va.j->'editApplication'->>'total')::int, 0) = 0
      AND coalesce((va.j->'editApplication'->>'editsOutsideSection')::int, 0) = 0
      AND coalesce((va.j->'editApplication'->>'restoreOutsideRollback')::int, 0) = 0
      AND coalesce((va.j->'editApplication'->>'refusedTotal')::int, 0) = 0
      AND (coalesce((va.j->'editApplication'->>'rollbackRestores')::int, 0) = 0 OR va.j->'editApplication'->>'state' = 'no-edits')) AS oos
  FROM va JOIN leaf l ON l.id = va.tid JOIN agent_executions e ON e.id = va.eid
  ORDER BY va.leg, l.tc ASC, e."startTime" DESC)
SELECT '⚪ held legs (0 ⇒ every 🔴 below is unmeasured)' AS line, (SELECT count(*) FROM vleg)::text AS value
UNION ALL SELECT '⚪ held-leg Author executions', (SELECT count(*) FROM va)::text
UNION ALL SELECT '⚪ held-leg Reviewer executions', (SELECT count(*) FROM vr)::text
UNION ALL SELECT '⚪ editApplication stamps OUTSIDE a held leaf, errorFact-shaped (a net that failed and said so)',
  count(*)::text FROM rj WHERE rj.tid NOT IN (SELECT id FROM leaf) AND rj.tid NOT IN (SELECT id FROM vleg) AND rj.j ? 'editApplication' AND rj.j->'editApplication'->>'reason' = 'enrichment-error'
UNION ALL SELECT '🔴 editApplication stamped (for real) on a task that is no held leaf or leg',
  count(*)::text FROM rj WHERE rj.tid NOT IN (SELECT id FROM leaf) AND rj.tid NOT IN (SELECT id FROM vleg) AND rj.j ? 'editApplication' AND coalesce(rj.j->'editApplication'->>'reason', '') <> 'enrichment-error'
UNION ALL SELECT '🔴 a held-leg Author execution without editApplication', count(*)::text FROM va WHERE NOT va.j ? 'editApplication'
UNION ALL SELECT '🔴 a held-leg Reviewer execution without reviewedEditDiff', count(*)::text FROM vr WHERE NOT vr.j ? 'reviewedEditDiff'
UNION ALL SELECT '🔴 a held leg SYNTHESIZE (pipeline-index carries rollbackContainment) without the editApplication hoist',
  count(*)::text FROM pidx WHERE pidx.j ? 'rollbackContainment' AND NOT pidx.j ? 'editApplication'
UNION ALL SELECT '🔴 a held leg stamped approved while its carrier inputs do not allow it (RE-EXECUTED notes excluded, CLAUDE.md 2026-09-22; an out-of-scope package by THE predicate, re-derived from the selected Author stamp, is allowed — Phase 10)',
  count(*)::text FROM vleg LEFT JOIN vsel ON vsel.leg = vleg.id WHERE vleg.metadata->'qualityGate'->>'outcome' = 'approved'
    AND coalesce(vleg.metadata->'qualityGate'->>'note', '') NOT ILIKE '%RE-EXECUTED%'
    AND (vleg.metadata->'qualityGate'->'heldEdit' IS NULL OR vleg.metadata->'qualityGate'->'heldEdit' ? 'reason'
      OR (coalesce(vsel.oos, false) = false
        AND (vleg.metadata->'qualityGate'->'heldEdit'->>'state' <> 'applied' OR vleg.metadata->'qualityGate'->'heldEdit'->>'reviewerSaw' <> 'rendered')))
UNION ALL SELECT '🔴 an approved held leg with NO applied Author execution whose (execution, candidateDigest8) a rendered Reviewer stamp names, whose selected Author is not out of scope by THE predicate — re-derived from the stamps, independent of the carrier (BC-P2-5 / EF-P2-5; Phase 10 F15)',
  count(*)::text FROM vleg WHERE vleg.metadata->'qualityGate'->>'outcome' = 'approved'
    AND coalesce(vleg.metadata->'qualityGate'->>'note', '') NOT ILIKE '%RE-EXECUTED%'
    AND NOT EXISTS (SELECT 1 FROM vsel WHERE vsel.leg = vleg.id AND vsel.oos)
    AND NOT EXISTS (SELECT 1 FROM va JOIN vr ON vr.leg = va.leg WHERE va.leg = vleg.id
      AND va.j->'editApplication'->>'state' = 'applied' AND vr.j->'reviewedEditDiff'->>'state' = 'rendered'
      AND vr.j->'reviewedEditDiff'->>'authorExecutionId' = va.eid
      AND vr.j->'reviewedEditDiff'->>'candidateDigest8' = va.j->'editApplication'->>'candidateDigest8')
UNION ALL SELECT '🔴 refWrite committed whose CANDIDATE rows ≠ the stamped candidateFiles',
  count(*)::text FROM va WHERE va.j->'editApplication'->>'refWrite' = 'committed'
    AND (SELECT count(*) FROM held_file_refs r WHERE r."executionId" = va.eid AND r.kind = 'CANDIDATE') <> coalesce((va.j->'editApplication'->>'candidateFiles')::int, -1)
UNION ALL SELECT '🔴 an edit-application manifest naming a BASE/CANDIDATE ref with no row',
  count(*)::text FROM (SELECT content::jsonb AS j FROM (SELECT content FROM agent_artifacts
      WHERE name = 'edit-application.manifest.json' AND content LIKE '{%'
        AND content !~* '\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})' AND content !~* '(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}'
      OFFSET 0) safe) m, -- OFFSET 0: the filter runs BEFORE the cast (`_a` admits result.json + pipeline-index.json only, DB-P2-1)
    jsonb_array_elements(CASE WHEN jsonb_typeof(m.j->'files') = 'array' THEN m.j->'files' ELSE '[]' END) f
  WHERE true
    AND ((f ? 'baseRefId' AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.id = f->>'baseRefId'))
      OR (f ? 'candidateRefId' AND NOT EXISTS (SELECT 1 FROM held_file_refs r WHERE r.id = f->>'candidateRefId')))
UNION ALL SELECT '🔴 a retired variant template (Observability Held …) on a task whose leg is not a held leg',
  count(*)::text FROM tasks t JOIN agent_templates tp ON tp.id = t."agentTemplateId"
  WHERE tp.name LIKE 'Observability Held %' AND t.id NOT IN (SELECT id FROM leaf)
UNION ALL SELECT '⚪ held-leg Author state: ' || coalesce(va.j->'editApplication'->>'state', '(none)'), count(*)::text FROM va GROUP BY 1
UNION ALL SELECT '⚪ refusal name: ' || k, sum((v)::int)::text FROM va, jsonb_each_text(CASE WHEN jsonb_typeof(va.j->'editApplication'->'refused') = 'object' THEN va.j->'editApplication'->'refused' ELSE '{}' END) x(k, v) GROUP BY k
UNION ALL SELECT '⚪ replace-not-reviewable by rewrite class: ' || k, sum((v)::int)::text FROM va, jsonb_each_text(CASE WHEN jsonb_typeof(va.j->'editApplication'->'notReviewableByClass') = 'object' THEN va.j->'editApplication'->'notReviewableByClass' ELSE '{}' END) x(k, v) GROUP BY k
UNION ALL SELECT '⚪ correction attempted / adopted', (count(*) FILTER (WHERE va.j->'editApplication'->'correction'->>'attempted' = 'true'))::text || ' / ' || (count(*) FILTER (WHERE va.j->'editApplication'->'correction'->>'adopted' = 'true'))::text FROM va
UNION ALL SELECT '⚪ base-not-held (a PLATFORM state, separate from Author refusals)', count(*)::text FROM va WHERE va.j->'editApplication'->>'state' = 'base-not-held'
UNION ALL SELECT '⚪ digestTruncated rows (an unjudgeable row, never a silent 0)', count(*)::text FROM va WHERE va.j->'editApplication'->>'digestTruncated' = 'true'
UNION ALL SELECT '⚪ diff-over-budget (Reviewer states)', count(*)::text FROM vr WHERE vr.j->'reviewedEditDiff'->>'state' = 'diff-over-budget'
UNION ALL SELECT '⚪ handle-namespace-ambiguous (Author states)', count(*)::text FROM va WHERE va.j->'editApplication'->>'state' = 'handle-namespace-ambiguous'
UNION ALL SELECT '⚪ out-of-scope selected Authors by THE predicate (not forced by scope). Read one on a leg that changes a collector/proxy file by hand: a whole-file write below 0.90, or in a platform state, lands here', count(*)::text FROM vsel WHERE vsel.oos
UNION ALL SELECT '⚪ heldEdit.inScope false on held legs (out-of-scope packages, Phase 10)', count(*)::text FROM vleg WHERE vleg.metadata->'qualityGate'->'heldEdit'->>'inScope' = 'false'
UNION ALL SELECT '⚪ Reviewer reviewedEditDiff state: ' || coalesce(vr.j->'reviewedEditDiff'->>'state', '(none)'), count(*)::text FROM vr GROUP BY 1
UNION ALL SELECT '⚪ heldEdit.forced on held legs (reason: ' || coalesce(vleg.metadata->'qualityGate'->'heldEdit'->>'reason', '-') || ')', count(*)::text FROM vleg WHERE vleg.metadata->'qualityGate'->'heldEdit'->>'forced' = 'true' GROUP BY vleg.metadata->'qualityGate'->'heldEdit'->>'reason'
-- held-network push 3 (owner D-1, 2026-10-26): the carrier's device-force family, named so a 0 is printed (the GROUP BY line above omits it).
UNION ALL SELECT '⚪ held legs forced git-file-not-held (a declared Git file not held; D-1)', count(*)::text FROM vleg WHERE vleg.metadata->'qualityGate'->'heldEdit'->>'reason' = 'git-file-not-held'
UNION ALL SELECT '⚪ held legs forced device-sources-absent (the snapshot declares no block; D-1)', count(*)::text FROM vleg WHERE vleg.metadata->'qualityGate'->'heldEdit'->>'reason' = 'device-sources-absent'
UNION ALL SELECT '🔴 a device-force reason (git-file-not-held / device-read-not-held / device-sources-*) on a held leg that is not a Device-sources leg',
  count(*)::text FROM vleg JOIN tasks t ON t.id = vleg.id WHERE (vleg.metadata->'qualityGate'->'heldEdit'->>'reason' IN ('git-file-not-held', 'device-read-not-held')
      OR vleg.metadata->'qualityGate'->'heldEdit'->>'reason' LIKE 'device-sources-%')
    AND coalesce(t.metadata->>'protocol', '') NOT IN (SELECT name FROM _devsrcleg)
UNION ALL SELECT '🔴 git-file-not-held / device-read-not-held stamped without its device list (gitFileDevicesNotHeld / devicesNotHeld non-empty)',
  count(*)::text FROM vleg WHERE (vleg.metadata->'qualityGate'->'heldEdit'->>'reason' = 'git-file-not-held'
      AND jsonb_array_length(CASE WHEN jsonb_typeof(vleg.metadata->'qualityGate'->'heldEdit'->'gitFileDevicesNotHeld') = 'array' THEN vleg.metadata->'qualityGate'->'heldEdit'->'gitFileDevicesNotHeld' ELSE '[]' END) = 0)
    OR (vleg.metadata->'qualityGate'->'heldEdit'->>'reason' = 'device-read-not-held'
      AND jsonb_array_length(CASE WHEN jsonb_typeof(vleg.metadata->'qualityGate'->'heldEdit'->'devicesNotHeld') = 'array' THEN vleg.metadata->'qualityGate'->'heldEdit'->'devicesNotHeld' ELSE '[]' END) = 0)
UNION ALL SELECT '⚪ held views (all states rendered by construction; count)', (SELECT count(*) FROM held_views)::text
UNION ALL SELECT '⚪ dangling BASE fromRefId (the CAPTURE it copied is gone — GC order context)', (SELECT count(*) FROM held_file_refs b WHERE b.kind = 'BASE' AND b."fromRefId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM held_file_refs c WHERE c.id = b."fromRefId"))::text;
\endif

\echo
\echo ============ Q2 LEG-CONTRACT HEAL — interfaceContractSource arm create-absent / create-absent-declined (2026-10-17; SYNTHESIS v3 V10) ============
-- The program's own root harness created a PIPELINE child WITHOUT interfaceContract: the platform stored the plan's contract
-- (source plan, arm create-absent, flagged) or recorded why it declined (source none, arm create-absent-declined + declineReason,
-- no contract, no flag). ALWAYS scope on source AND arm. Floor = the DERIVED first create-absent* stamp; EMPTY = an ABSENCE
-- (no omission since the deploy), never a zero. Every 🔴 is 0 by construction on correct code.
CREATE TEMP VIEW _ics AS
SELECT t.id, t.type::text AS type, t.stage_id, t.created_at, t.metadata m, t."inputContext"::jsonb ic,
       t.metadata->'interfaceContractSource' s,
       t.metadata->'interfaceContractSource'->>'source' src,
       t.metadata->'interfaceContractSource'->>'arm'    arm
FROM tasks t WHERE t.metadata ? 'interfaceContractSource';
WITH floor AS (SELECT min(created_at) f FROM _ics WHERE arm IN ('create-absent', 'create-absent-declined')),
ca AS (SELECT * FROM _ics WHERE src = 'plan' AND arm = 'create-absent'),
cd AS (SELECT * FROM _ics WHERE src = 'none' AND arm = 'create-absent-declined')
SELECT '⚪ fix_live_since (derived: first create-absent* stamp; empty ⇒ nothing measured)' AS line, coalesce(to_char((SELECT f FROM floor), 'YYYY-MM-DD HH24:MI'), '(empty)') AS value
UNION ALL SELECT '⚪ stamps by source/arm/type: ' || coalesce(src, '-') || '/' || coalesce(arm, '-') || '/' || type, count(*)::text FROM _ics GROUP BY src, arm, type
UNION ALL SELECT '⚪ create-absent-declined by declineReason: ' || coalesce(s->>'declineReason', '(null)'), count(*)::text FROM cd GROUP BY s->>'declineReason'
UNION ALL SELECT '⚪ contract-key-seen declines (a contract SENT and dropped in transit — read each; the rate below backstops only what this cannot see)', count(*)::text FROM cd WHERE s->>'declineReason' = 'contract-key-seen'
UNION ALL SELECT '🔴 create-absent on a non-PIPELINE task', count(*)::text FROM ca WHERE type <> 'PIPELINE'
UNION ALL SELECT '🔴 create-absent with legBaseline.equalsPlan = false', count(*)::text FROM ca WHERE s->'legBaseline'->>'equalsPlan' = 'false'
UNION ALL SELECT '🔴 create-absent with no stored inputContext.interfaceContract object (split spread / post-create loss)', count(*)::text
  FROM ca WHERE jsonb_typeof(ic->'interfaceContract') IS DISTINCT FROM 'object'
UNION ALL SELECT '🔴 create-absent without requiresInterfaceContract = true', count(*)::text FROM ca WHERE m->>'requiresInterfaceContract' IS DISTINCT FROM 'true'
UNION ALL SELECT '🔴 create-absent-declined holding a contract or the flag (decline is metadata-only)', count(*)::text
  FROM cd WHERE ic ? 'interfaceContract' OR m->>'requiresInterfaceContract' = 'true'
UNION ALL SELECT '🔴 create-absent-declined with no declineReason', count(*)::text FROM cd WHERE coalesce(s->>'declineReason', '') = ''
UNION ALL SELECT '⚪ create-absent whose caller execution was pruned by retention (binding via callerTaskId only)', count(*)::text
  FROM ca WHERE NOT EXISTS (SELECT 1 FROM agent_executions e WHERE e.id = ca.s->>'callerExecutionId')
UNION ALL SELECT '🔴 create-absent whose caller is not the program root (exec row when present, else callerTaskId)', count(*)::text
  FROM ca LEFT JOIN agent_executions e ON e.id = ca.s->>'callerExecutionId'
  WHERE NOT EXISTS (SELECT 1 FROM tasks r WHERE r.id = coalesce(e."taskId", ca.s->>'callerTaskId')
                      AND r.type = 'PIPELINE' AND r.metadata->>'pipelineStageId' = ca.stage_id)
UNION ALL SELECT '🔴 create-absent stored contract ≠ a same-stage, same-plan sibling''s stored contract (jsonb value =)', count(*)::text
  FROM ca WHERE EXISTS (SELECT 1 FROM _ics o WHERE o.stage_id = ca.stage_id AND o.id <> ca.id AND o.src = 'plan'
                          AND o.s->>'planSha256' = ca.s->>'planSha256' AND jsonb_typeof(o.ic->'interfaceContract') = 'object'
                          AND o.ic->'interfaceContract' <> ca.ic->'interfaceContract')
UNION ALL SELECT '· read-each: create-absent leg later refused INTERFACE_CONTRACT_MISSING (an operator replacement trips it)', count(*)::text
  FROM ca WHERE m->'cannotRun'->>'reasonCode' = 'missing-interface-contract'
UNION ALL SELECT '· watch (THE success metric, a lower bound): create-absent leg later superseded — read every one', count(*)::text
  FROM ca WHERE jsonb_typeof(m->'cannotRun') = 'string' AND m->>'cannotRun' ILIKE 'superseded%'
UNION ALL SELECT '· rate: create-absent / (create + create-absent), PIPELINE, creates before the first create-absent in their stage, since the floor',
  coalesce(round(count(*) FILTER (WHERE x.arm = 'create-absent')::numeric / NULLIF(count(*), 0), 3)::text, '(no rows)')
  FROM _ics x WHERE x.src = 'plan' AND x.type = 'PIPELINE' AND x.arm IN ('create', 'create-absent') AND x.created_at >= (SELECT f FROM floor)
    AND NOT EXISTS (SELECT 1 FROM _ics e WHERE e.stage_id = x.stage_id AND e.arm = 'create-absent' AND (e.created_at, e.id) < (x.created_at, x.id));

-- K6 tripwire: reads the lone-surrogate-filtered _a; retention-bounded, so it carries its own ⚪ denominator.
WITH ca AS (SELECT * FROM _ics WHERE src = 'plan' AND arm = 'create-absent'),
calls AS (
  SELECT ca.id, coalesce(x->>'arguments', (x->'input')::text) args, (x->'result')::text res
  FROM ca JOIN _a a ON a.eid = ca.s->>'callerExecutionId' AND a.name = 'pipeline-index.json'
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.j->'toolCalls') = 'array' THEN a.j->'toolCalls' ELSE '[]'::jsonb END) x)
SELECT '⚪ create-absent rows whose caller pipeline-index.json is readable' AS line, count(DISTINCT id)::text AS value FROM calls
UNION ALL SELECT '🔴 create-absent whose creating task.create carried interfaceContract (K6 key-seen gate leaked)', count(DISTINCT id)::text
  FROM calls WHERE args ~ 'task\.create' AND args ~ 'interfaceContract' AND position(id IN res) > 0;

-- watch: program-stage PIPELINE legs refused F16 since the floor, by arm / reason (Q2's scoped residual).
WITH roots AS (SELECT metadata->>'pipelineStageId' ps FROM tasks
               WHERE type = 'PIPELINE' AND metadata->>'protocol' IN ('pov-program-protocol', 'value-chain-program-protocol') AND metadata ? 'pipelineStageId'),
floor AS (SELECT min(created_at) f FROM _ics WHERE arm IN ('create-absent', 'create-absent-declined'))
SELECT '· watch: program legs refused INTERFACE_CONTRACT_MISSING since the floor' AS line,
       coalesce(c.metadata->'interfaceContractSource'->>'arm', '(no fact)') || ' / ' ||
       coalesce(c.metadata->'interfaceContractSource'->>'declineReason', c.metadata->'interfaceContractSource'->>'planResolution', '-') AS arm_reason, count(*)
FROM roots r JOIN tasks c ON c.stage_id = r.ps
WHERE c.type = 'PIPELINE' AND c.metadata->'cannotRun'->>'reasonCode' = 'missing-interface-contract' AND c.created_at >= (SELECT f FROM floor)
GROUP BY 2;

-- K13: suppliedMatched population, EXCLUDING supplied creates whose stage already held an earlier create-absent sibling
-- (that harness saw the storage sentence). Post-floor rows only; ties on (created_at, id).
WITH floor AS (SELECT min(created_at) f FROM _ics WHERE arm IN ('create-absent', 'create-absent-declined')),
x AS (SELECT s0.*, EXISTS (SELECT 1 FROM _ics e WHERE e.stage_id = s0.stage_id AND e.src = 'plan' AND e.arm = 'create-absent'
                             AND (e.created_at, e.id) < (s0.created_at, s0.id)) AS exposed
      FROM _ics s0 WHERE s0.src = 'plan' AND s0.arm = 'create')
SELECT '⚪ K13 suppliedMatched (all time): matched / mismatched / excluded-exposed' AS line,
  count(*) FILTER (WHERE NOT exposed AND s->>'suppliedMatched' = 'true')::text || ' / ' ||
  count(*) FILTER (WHERE NOT exposed AND s->>'suppliedMatched' = 'false')::text || ' / ' ||
  count(*) FILTER (WHERE exposed AND created_at >= coalesce((SELECT f FROM floor), 'infinity'))::text AS value
FROM x;
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

# ── R10 v8 ECHO OVERFLOW (sec-ops F-NB1 control review C-3, 2026-10-25) — outside SQL by necessity ───────────────────────────
# The echo matcher holds at most ECHO_MAX_TRIES x ECHO_MAX_LITERALS (8,192) literals per persist; past it the overflow is COUNTED on
# the persist's securityEvent line (`echoOverflow`), never stamped — so the journal is the only reader. Echo redaction is the
# load-bearing control for network secrets (register F-NB1-CONTROL-IS-R10-ECHO): an overflowing persist may have left an echo in
# clear. 🔴 = backstop lines with echoOverflow > 0 (0 by construction short of 8,192 secret literals in one persist — read the
# execution). ⚪ = backstop lines carrying the field at all (v8 persists that redacted something); while it reads 0 the 🔴 is
# UNMEASURED. Window = what the pm2 logs still hold (rotation), never "ever".
if r10=$(ssh "$PROD" 'grep -h "R10 backstop: redacted" /var/log/paichart/*combined*.log* 2>/dev/null | grep -o "\"echoOverflow\":[0-9]*" | cut -d: -f2' 2>/dev/null); then
  r10_all=$(grep -c . <<<"$r10" || true); r10_over=$(awk '$1 > 0' <<<"$r10" | grep -c . || true)
  echo "🔴 R10 echo overflow — persists whose securityEvent line logged echoOverflow > 0 (journal window): ${r10_over:-0}"
  echo "⚪ R10 backstop lines carrying echoOverflow (v8 persists that redacted something; the control): ${r10_all:-0}"
else
  echo "🔴 R10 echo overflow: UNMEASURED (journal read failed — never read as 0)"
fi

