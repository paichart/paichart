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
SQL
)
ssh "$PROD" "cd /var/www/paichart-app/current && source .env.production && psql \"\$DATABASE_URL\" -X -q -v ON_ERROR_STOP=1" <<<"$SQL"
