#!/usr/bin/env bash
# Pull EQUIVALENCE SPECIMENS from production — read-only — into a local fixture.
#
# WHY A FIXTURE AND NOT A LIVE-DB TEST. The migration's acceptance is that the registry stamps
# exactly what production actually stamped. That comparison has to be against OBSERVED OUTPUT, not
# against a frozen copy of the old code — a copy only compares one set of assumptions with a second
# copy of itself. But a test that needs prod credentials runs once, by one person, and then rots
# (this repo's out-of-CI suites are the standing evidence). So: capture the real rows ONCE, here,
# and let `scripts/test-net-registry-equivalence.ts` replay the SHIPPING registry against them
# forever, in CI, with no DB.
#
# ⚠️ SPECIMEN WINDOWS ARE NOT OPTIONAL. A leg stamped BEFORE a net's last behavioural change will
# legitimately differ, and accepting that difference would train the gate to accept differences.
# Every leg below is on or after 2026-09-11, the date `contractApplicability` began nesting inside
# dialectLint and contractPropagation — so all four leg nets are in-window for all four legs.
#
#   usage: scripts/pull-net-equivalence-specimens.sh [legTaskId ...]
#   default: the four 2026-09-11 legs (obs R3b-3 + R2b/k8s and siblings)
set -euo pipefail

HOST="${PAICHART_PROD_HOST:-<PROD_USER>@<PROD_HOST>}"
OUT="$(dirname "$0")/fixtures/net-registry-equivalence/specimens.json"
LEGS=("$@")
if [ ${#LEGS[@]} -eq 0 ]; then
  LEGS=(cmtwhdi4d006qyx1rnnxkblay cmtwh44dv002xyx1rdi2cygju cmtwfmqrz0005yx1rqhsvmpps cmtwcpnwo0003yx2dvd6wxsbd)
fi
IDS=$(printf "'%s'," "${LEGS[@]}"); IDS="${IDS%,}"

mkdir -p "$(dirname "$OUT")"

# One document per leg. `latest per task` mirrors the enrichments' own ORDER BY createdAt DESC LIMIT 1.
read -r -d '' SQL <<SQLEOF || true
WITH legs AS (SELECT * FROM tasks WHERE id IN ($IDS)),
art AS (
  SELECT e."taskId", a.content, row_number() OVER (PARTITION BY e."taskId" ORDER BY a."createdAt" DESC) rn
  FROM agent_artifacts a JOIN agent_executions e ON e.id = a."executionId"
  WHERE a.name IN ('result.json','pipeline-index.json') AND a.content LIKE '{%'
),
-- TWO casts on purpose. jsonb NORMALIZES key order (length, then bytewise), so a baseline
-- pulled through it is not what production wrote — the first run of this gate reported 14
-- mismatches that were ALL key-order-only, with identical values. json preserves the stored
-- text exactly, so (jj->'x')::text is the artifact's own bytes. jsonb is kept only for the
-- cheap ->> field reads where order cannot matter.
latest AS (SELECT "taskId", content::jsonb AS j, content::json AS jj FROM art WHERE rn = 1)
SELECT jsonb_pretty(jsonb_agg(doc)) FROM (
  SELECT jsonb_build_object(
    'legTaskId', l.id,
    'leg', jsonb_build_object('id', l.id, 'type', l.type, 'title', l.title,
                              'agentRole', l."agentRole", 'metadata', l.metadata,
                              'inputContext', l."inputContext"),
    'stageId', l.metadata->>'pipelineStageId',
    'stage', (SELECT jsonb_build_object('id', s.id, 'metadata', s.metadata)
              FROM stages s WHERE s.id = l.metadata->>'pipelineStageId'),
    -- F12: does a PROGRAM-harness parent point at this stage? Captured as the ANSWER, so the
    -- fixture does not have to re-encode the AND-lift the shared lookup owns.
    'programParentId', (SELECT p.id FROM tasks p
       WHERE p.type = 'PIPELINE' AND p.metadata->>'pipelineStageId' = l.metadata->>'pipelineStageId'
         AND (p.metadata->>'protocol' LIKE '%program%' OR p.title LIKE '%program%') LIMIT 1),
    'children', (SELECT coalesce(jsonb_agg(jsonb_build_object(
         'id', c.id, 'title', c.title, 'agentRole', c."agentRole", 'type', c.type,
         'description', c.description, 'inputContext', c."inputContext",
         'stageId', c.stage_id,
         'executionCount', (SELECT count(*) FROM agent_executions x WHERE x."taskId" = c.id),
         'finalResponse', (SELECT j->>'finalResponse' FROM latest WHERE "taskId" = c.id),
         'stamped', (SELECT jsonb_build_object(
              'markerPresence', (jj->'markerPresence')::text,
              'rollbackContainment', (jj->'rollbackContainment')::text,
              -- The JSONB rendering as well, because the HOIST reads the Author's stamp through
              -- (content::jsonb)->>'rollbackContainment' in production -- so the hoisted fact
              -- inherits Postgres's jsonb key ORDER, not the artifact's. A stub that handed the
              -- json-ordered text back would make the gate pass against a read path production
              -- does not use.
              'rollbackContainmentJsonbText', j->>'rollbackContainment') FROM latest WHERE "taskId" = c.id)
       ) ORDER BY c.created_at ASC), '[]'::jsonb)
      FROM tasks c WHERE c.stage_id = l.metadata->>'pipelineStageId'),
    -- WHAT PRODUCTION ACTUALLY STAMPED on the leg. The gate compares against THIS.
    -- Captured as TEXT, byte-for-byte as production wrote it. The gate compares against THIS.
    'stampedLeg', (SELECT jsonb_build_object(
         'derivationContainment', (jj->'derivationContainment')::text,
         'dialectLint', (jj->'dialectLint')::text,
         'contractPropagation', (jj->'contractPropagation')::text,
         'rollbackContainment', (jj->'rollbackContainment')::text) FROM latest WHERE "taskId" = l.id)
  ) AS doc
  FROM legs l
) t;
SQLEOF

echo "Pulling ${#LEGS[@]} specimen leg(s) from $HOST (read-only)…" >&2
# Ship the SQL as a FILE rather than through two layers of shell quoting. The inline -c form went
# through ssh + bash + psql and lost its own quoting; a file has exactly one reader.
TMP_SQL=$(mktemp)
printf '%s\n' "$SQL" > "$TMP_SQL"
scp -q "$TMP_SQL" "$HOST:/tmp/net-equiv-pull.sql"
ssh "$HOST" 'cd /var/www/paichart-app/current && source .env.production && psql "$DATABASE_URL" -At -P pager=off -f /tmp/net-equiv-pull.sql; rm -f /tmp/net-equiv-pull.sql' > "$OUT"
rm -f "$TMP_SQL"

node -e "const d=require('$OUT'.replace(/^/,process.cwd()+'/'));console.log('✅ wrote',d.length,'specimen legs to','$OUT')" \
  2>/dev/null || node -e "JSON.parse(require('fs').readFileSync('$OUT','utf8'));console.log('✅ wrote specimens to $OUT')"
