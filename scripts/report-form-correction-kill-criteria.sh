#!/usr/bin/env bash
# report-form-correction-kill-criteria.sh — Step B kill-criteria read for the package form correction
# (mechanical-reflection-trigger, 2026-10-07). Plan §10; build: cline_docs/reviews/mechanical-reflection-trigger-2026-10-07/BUILD-REPORT-B.md.
#
# READ-ONLY against prod: every query runs in a read-only transaction (PGOPTIONS default_transaction_read_only=on),
# uses CTEs only (no temp tables), and carries a statement_timeout. Nothing is written anywhere.
#
# Scope: live executions AFTER the flag switch. The cut is DERIVED from the data — the first fact whose decision can only
# be taken with FORM_CORRECTION_ENABLED=true (an attempt, or the Step B scope reason 'hits-include-non-undercount').
# Pass an explicit cut to override it (e.g. the recorded switch-on timestamp):  scripts/report-form-correction-kill-criteria.sh '2026-10-08 01:00'
# An EMPTY cut means the flag has never been observed on: every count below is then an ABSENCE, not a zero.
#
# Sections (each maps to a kill criterion in the plan §10 / the follow-up):
#   1. attempts and adoptions, by reason                     → criterion 2 (adoption < 50% over the first 10 attempts)
#   2. 🔴 attempts on a NON-terraform leg                     → criterion 4 (must be 0)
#   3. 🔴 adopted with trigger hits remaining / non-undercount → criterion 3 (0 by construction)
#   4. adopted corrections whose reviewer then BLOCKED, with the blocking items that name a form defect → criterion 1
#      (a PRE-FILTER: read every row — "blocked on a form defect in the corrected block" is a reading, not a regex)
#   5. cost and latency per attempt                           → criterion 5 (> $0.30 or > 180 s per attempt is the flag)
#
# Cost is an ESTIMATE from the correction turn's own tokens: input, output, cache read and cache write (review B-L3 —
# the live turn carries the whole cached tool history, so most of its input may be cache tokens). Default rates are
# Sonnet 5's per lib/services/llm/model-pricing.ts ($2 in / $10 out; cache read 0.1x, 5-minute cache write 1.25x); override with FC_IN_PER_MTOK,
# FC_OUT_PER_MTOK, FC_CACHE_READ_PER_MTOK, FC_CACHE_WRITE_PER_MTOK. A row predating the cache fields prices them at 0.
set -euo pipefail
PROD="${PROD_SSH:-<PROD_USER>@<PROD_HOST>}"
CUT="${1:-}"
IN_RATE="${FC_IN_PER_MTOK:-2}"
OUT_RATE="${FC_OUT_PER_MTOK:-10}"
CR_RATE="${FC_CACHE_READ_PER_MTOK:-0.2}"
CW_RATE="${FC_CACHE_WRITE_PER_MTOK:-2.5}"
case "$CUT" in *"'"*|*";"*) echo "refusing a cut containing a quote or semicolon" >&2; exit 2;; esac
case "$IN_RATE$OUT_RATE$CR_RATE$CW_RATE" in *[!0-9.]*) echo "rates must be numeric" >&2; exit 2;; esac

SQL=$(cat <<SQL
SET statement_timeout = 120000;
\pset pager off
\echo ============ 0. CUT ============
WITH fc AS (SELECT a."createdAt" t, (a.content::jsonb)->'toolLoop'->'formCheck' f FROM agent_artifacts a
            WHERE a.name = 'result.json' AND a.content LIKE '{%' AND a.content LIKE '%"formCheck"%')
SELECT coalesce(NULLIF('${CUT}', ''), to_char(min(t), 'YYYY-MM-DD HH24:MI:SS')) AS flag_on_since,
       CASE WHEN '${CUT}' <> '' THEN 'explicit (argument)' WHEN min(t) IS NULL THEN 'EMPTY — flag never observed on' ELSE 'derived' END AS basis
FROM fc WHERE f->'correction'->>'attempted' = 'true' OR f->'correction'->>'notAttemptedReason' = 'hits-include-non-undercount';
SQL
)
# Shared CTE prefix: the cut, every Author fact at/after it, and the owning PIPELINE leg's protocol.
BASE=$(cat <<SQL
WITH fcall AS (SELECT a."executionId" eid, a."createdAt" t, a.content::jsonb j FROM agent_artifacts a
            WHERE a.name = 'result.json' AND a.content LIKE '{%' AND a.content LIKE '%"formCheck"%'),
cut AS (SELECT coalesce(NULLIF('${CUT}', '')::timestamp, min(t)) c FROM fcall
        WHERE j->'toolLoop'->'formCheck'->'correction'->>'attempted' = 'true'
           OR j->'toolLoop'->'formCheck'->'correction'->>'notAttemptedReason' = 'hits-include-non-undercount'),
fc AS (SELECT f.eid, f.t, f.j, f.j->'toolLoop'->'formCheck' x, e."taskId" tid, e."startTime" st, e."endTime" et, c.stage_id sid,
         (SELECT p.metadata->>'protocol' FROM tasks p WHERE p.type = 'PIPELINE' AND p.metadata->>'pipelineStageId' = c.stage_id LIMIT 1) proto
       FROM fcall f JOIN agent_executions e ON e.id = f.eid JOIN tasks c ON c.id = e."taskId"
       WHERE f.t >= coalesce((SELECT c FROM cut), 'infinity'::timestamp)),
att AS (SELECT * FROM fc WHERE x->'correction'->>'attempted' = 'true')
SQL
)
SQL+=$(cat <<SQL

\echo
\echo ============ 1. ATTEMPTS AND ADOPTIONS (criterion 2: adoption < 50% over the first 10 attempts) ============
${BASE}
SELECT '⚪ Author facts since the cut' AS line, count(*)::text AS value FROM fc
UNION ALL SELECT '⚪ … FIRED (triggerHitsTotal > 0)', count(*) FILTER (WHERE (x->>'triggerHitsTotal')::int > 0)::text FROM fc
UNION ALL SELECT '· not attempted: ' || (x->'correction'->>'notAttemptedReason'), count(*)::text FROM fc
  WHERE (x->>'triggerHitsTotal')::int > 0 AND x->'correction'->>'attempted' = 'false' GROUP BY 1
UNION ALL SELECT '· ATTEMPTED', count(*)::text FROM att
UNION ALL SELECT '· … adopted', count(*) FILTER (WHERE x->'correction'->>'adopted' = 'true')::text FROM att
UNION ALL SELECT '· … not adopted: ' || (x->'correction'->>'notAdoptedReason'), count(*)::text FROM att
  WHERE x->'correction'->>'adopted' = 'false' GROUP BY 1
UNION ALL SELECT '· adoption over the FIRST 10 attempts (criterion 2 fires below 5 of 10)',
  (SELECT count(*) FILTER (WHERE x->'correction'->>'adopted' = 'true') || ' of ' || count(*)
   FROM (SELECT x FROM att ORDER BY t LIMIT 10) f10);

\echo
\echo ============ 2. 🔴 ATTEMPTS ON A NON-TERRAFORM LEG (criterion 4: must be 0) ============
${BASE}
SELECT '🔴 attempts whose leg protocol is not terraform-iac-protocol' AS line, count(*) FILTER (WHERE proto IS DISTINCT FROM 'terraform-iac-protocol') AS n,
  string_agg(CASE WHEN proto IS DISTINCT FROM 'terraform-iac-protocol' THEN eid || ' (' || coalesce(proto, 'no PIPELINE leg') || ')' END, ', ') AS executions_READ_EACH
FROM att;

\echo
\echo ============ 3. 🔴 ZERO BY CONSTRUCTION (criterion 3) ============
${BASE}
SELECT '🔴 adopted with trigger hits remaining (postTriggerHitsTotal or the re-check)' AS line,
  count(*) FILTER (WHERE x->'correction'->>'adopted' = 'true' AND (coalesce((x->'correction'->>'postTriggerHitsTotal')::int, 0) > 0
    OR (x->>'textSource' = 'form-correction' AND coalesce((x->>'triggerHitsTotal')::int, 0) > 0))) AS n FROM att
UNION ALL SELECT '🔴 attempted on a decision hit that is not a header undercount, or hit totals differ (B-M2)',
  count(*) FILTER (WHERE coalesce((x->'correction'->>'decisionHitsTotal')::int, -1) IS DISTINCT FROM (x->'correction'->>'decisionTriggerHitsTotal')::int
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(x->'correction'->'decisionHits', '[]')) h
    WHERE h->>'kind' <> 'hunk-count-mismatch' OR coalesce((h->>'extraBodyLines')::int, 0) = 0
       OR (h->'observed'->>'old')::int < (h->'declared'->>'old')::int OR (h->'observed'->>'new')::int < (h->'declared'->>'new')::int)) FROM att
UNION ALL SELECT '🔴 formCheck on a role other than config_change_author',
  count(*) FILTER (WHERE j->>'agentRole' IS DISTINCT FROM 'config_change_author') FROM fc
-- Review B-H1: a FIRED fact reading flag-off after the cut = a half-applied switch (paichart-web OR paichart-mcp not
-- restarted) or a deploy that reverted a hand edit. After a deliberate kill switch, pass a cut window that ends there.
UNION ALL SELECT '🔴 flag-off decisions on FIRED facts after the cut (half-applied switch / reverted hand edit)',
  count(*) FILTER (WHERE (x->>'triggerHitsTotal')::int > 0 AND x->'correction'->>'notAttemptedReason' = 'flag-off') FROM fc;

\echo
\echo ============ 4. ADOPTED corrections whose reviewer then BLOCKED (criterion 1 — READ EACH ROW) ============
-- The reviewer is every change_reviewer execution in the SAME stage that started after the Author finished. A row is listed
-- when that reviewer's verdict is NOT approved; form_defect_items are its blocking items that name a hunk / header / line
-- count / truncation / @@ — a pre-filter. The corrected block is decisionHits[].block + header: compare by hand.
${BASE},
rv AS (SELECT a2.eid aeid, re.id reid, re."startTime" rst, (ra.content::jsonb)->'reviewerVerdict' v
  FROM att a2 JOIN tasks rc ON rc.stage_id = a2.sid AND rc."agentRole" = 'change_reviewer'
  JOIN agent_executions re ON re."taskId" = rc.id AND re."startTime" >= coalesce(a2.et, a2.t)
  JOIN agent_artifacts ra ON ra."executionId" = re.id AND ra.name = 'result.json' AND ra.content LIKE '{%')
SELECT a.eid AS author_execution, a.proto, r.reid AS reviewer_execution,
  (SELECT string_agg(h->>'header', ' ; ') FROM jsonb_array_elements(a.x->'correction'->'decisionHits') h) AS corrected_headers,
  r.v->>'approved' AS reviewer_approved,
  (SELECT string_agg(left(b, 200), ' || ') FROM jsonb_array_elements_text(coalesce(r.v->'blocking', '[]')) b
    WHERE b ~* '(hunk|header|@@|line count|truncat|git apply|elid|\.\.\.)') AS form_defect_items_READ_EACH
FROM att a JOIN rv r ON r.aeid = a.eid
WHERE a.x->'correction'->>'adopted' = 'true' AND coalesce(r.v->>'approved', 'false') <> 'true'
ORDER BY a.t;
${BASE},
rv AS (SELECT a2.eid aeid, (ra.content::jsonb)->'reviewerVerdict' v
  FROM att a2 JOIN tasks rc ON rc.stage_id = a2.sid AND rc."agentRole" = 'change_reviewer'
  JOIN agent_executions re ON re."taskId" = rc.id AND re."startTime" >= coalesce(a2.et, a2.t)
  JOIN agent_artifacts ra ON ra."executionId" = re.id AND ra.name = 'result.json' AND ra.content LIKE '{%')
SELECT '⚪ control: adopted corrections with ≥1 later reviewer verdict' AS line,
  count(DISTINCT a.eid) FILTER (WHERE a.x->'correction'->>'adopted' = 'true') AS n FROM att a JOIN rv r ON r.aeid = a.eid
UNION ALL SELECT '· … of which ≥1 later reviewer did NOT approve (read section 4 rows)',
  count(DISTINCT a.eid) FILTER (WHERE a.x->'correction'->>'adopted' = 'true' AND coalesce(r.v->>'approved', 'false') <> 'true') FROM att a JOIN rv r ON r.aeid = a.eid;

\echo
\echo ============ 5. COST AND LATENCY PER ATTEMPT (criterion 5: flag > \$0.30 or > 180 s) — rates in/out/cache-read/cache-write per MTok: \$${IN_RATE} / \$${OUT_RATE} / \$${CR_RATE} / \$${CW_RATE} ============
${BASE}
SELECT eid AS execution, to_char(t, 'MM-DD HH24:MI') AS at, proto, j->>'modelUsed' AS model,
  x->'correction'->>'adopted' AS adopted, x->'correction'->>'notAdoptedReason' AS reason,
  (x->'correction'->>'inputTokens')::int AS in_tok, (x->'correction'->>'outputTokens')::int AS out_tok,
  (x->'correction'->>'cacheReadTokens')::int AS cache_read, (x->'correction'->>'cacheCreationTokens')::int AS cache_write,
  round(((coalesce((x->'correction'->>'inputTokens')::numeric, 0) * ${IN_RATE}) + (coalesce((x->'correction'->>'outputTokens')::numeric, 0) * ${OUT_RATE}) + (coalesce((x->'correction'->>'cacheReadTokens')::numeric, 0) * ${CR_RATE}) + (coalesce((x->'correction'->>'cacheCreationTokens')::numeric, 0) * ${CW_RATE})) / 1e6, 4) AS est_usd,
  round((x->'correction'->>'durationMs')::numeric / 1000, 1) AS seconds,
  CASE WHEN ((coalesce((x->'correction'->>'inputTokens')::numeric, 0) * ${IN_RATE}) + (coalesce((x->'correction'->>'outputTokens')::numeric, 0) * ${OUT_RATE}) + (coalesce((x->'correction'->>'cacheReadTokens')::numeric, 0) * ${CR_RATE}) + (coalesce((x->'correction'->>'cacheCreationTokens')::numeric, 0) * ${CW_RATE})) / 1e6 > 0.30
         OR coalesce((x->'correction'->>'durationMs')::numeric, 0) > 180000 THEN '🔴 over' ELSE '' END AS criterion_5
FROM att ORDER BY t;
${BASE}
SELECT count(*) AS attempts,
  round(avg(((coalesce((x->'correction'->>'inputTokens')::numeric, 0) * ${IN_RATE}) + (coalesce((x->'correction'->>'outputTokens')::numeric, 0) * ${OUT_RATE}) + (coalesce((x->'correction'->>'cacheReadTokens')::numeric, 0) * ${CR_RATE}) + (coalesce((x->'correction'->>'cacheCreationTokens')::numeric, 0) * ${CW_RATE})) / 1e6), 4) AS avg_est_usd,
  round(avg((x->'correction'->>'durationMs')::numeric) / 1000, 1) AS avg_seconds,
  round(max((x->'correction'->>'durationMs')::numeric) / 1000, 1) AS max_seconds
FROM att;
SQL
)
ssh "$PROD" "cd /var/www/paichart-app/current && source .env.production && PGOPTIONS='-c default_transaction_read_only=on' psql \"\$DATABASE_URL\" -X -q -v ON_ERROR_STOP=1" <<<"$SQL"
