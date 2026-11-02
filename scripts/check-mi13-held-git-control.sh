#!/usr/bin/env bash
# held-k8s 1g — POSITIVE CONTROL for MI-13's HELD BYTES section (the github / Git file-source lines + the generalised 🔴 9/10).
#
# WHY: on the corpus every new line reads 0 (no github call exists yet), and a 0 from a line that cannot fire is unmeasured.
# This runs the section's OWN SQL — extracted from report-mechanism-inventory.sh, unchanged — against SYNTHETIC rows in TEMP
# tables that SHADOW the real ones (pg_temp is searched first), on the LOCAL database, in a session that writes nothing
# permanent. Each scenario plants exactly one hit for one line; the expected values below are the control.
#
# Usage: scripts/check-mi13-held-git-control.sh            (reads DATABASE_URL from .env; LOCAL only — refuses a non-localhost URL)
set -euo pipefail
cd "$(dirname "$0")/.."
URL=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?([^"?]*).*/\1/')
case "$URL" in *@localhost*|*@127.0.0.1*) ;; *) echo "refusing: not a localhost DATABASE_URL"; exit 2 ;; esac

INV=scripts/report-mechanism-inventory.sh
SQLALL=$(awk '/^SQL=\$\(cat <<'"'"'SQL'"'"'/{f=1;next} f&&/^SQL$/{exit} f' "$INV")
# The section ends where HELD LEGS begins (it nests an inner \if for the sourceRevision column, so the first \endif is not its end).
SECTION=$(awk '/^\\echo ============ HELD LEGS/{exit} /^\\echo ============ HELD BYTES/{f=1} f{print}' <<<"$SQLALL")
[ -n "$SECTION" ] || { echo "could not extract the HELD BYTES section"; exit 2; }

OUT=$(psql "$URL" -X -q -v ON_ERROR_STOP=1 <<SQL
SET client_min_messages = warning;
CREATE TEMP TABLE tasks (id text, title text, type text, metadata jsonb, stage_id text, "agentRole" text, created_at timestamptz DEFAULT now());
CREATE TEMP TABLE stages (id text, metadata jsonb);
CREATE TEMP TABLE agent_executions (id text, "taskId" text, status text, "supersededById" text);
CREATE TEMP TABLE agent_artifacts (id text, name text, "executionId" text, "createdAt" timestamptz, content text);
CREATE TEMP TABLE held_file_refs (id text, kind text, "executionId" text, "toolCallIndex" int, selector text, "sourceTool" text, "declaredBy" text,
  "serviceId" text, "serviceName" text, "blobSha256" text, scope text, "redactedCount" int DEFAULT 0, "redactorVersion" text DEFAULT 'paichart.r10/3',
  "fromRefId" text, "sourceRevision" text, "createdAt" timestamptz DEFAULT now(), "storedByteLength" int,
  path text);  -- held-terraform step 2: MI-13's state/variables-path 🔴 line (step 1) reads it; without it this control aborted
CREATE TEMP TABLE held_capture_refusals (id text, "executionId" text, "toolCallIndex" int, refusal text, "identitySource" text, "createdAt" timestamptz DEFAULT now());
CREATE TEMP TABLE held_blobs (sha256 text, scope text, content bytea, "storedByteLength" int, "lastReferencedAt" timestamptz DEFAULT now());
CREATE TEMP TABLE held_views ("rewrittenLines" int);

-- legs: k8s leg L1 (stage S1), obs leg L2 (stage S2, composed obs 1.10.0 first ⇒ a held leg)
INSERT INTO tasks VALUES
 ('L1','Scale web (protocol: kubernetes-gitops)','PIPELINE','{"protocol":"kubernetes-gitops-protocol","pipelineStageId":"C1"}','P','pipeline_harness', now()),
 ('L2','OTLP (protocol: observability-config)','PIPELINE','{"protocol":"observability-config-protocol","pipelineStageId":"C2"}','P','pipeline_harness', now()),
 ('H1','Harvest','ACTION','{"protocol":null}','C1','infra_state_harvester', now()),
 ('H2','Harvest','ACTION','{"protocol":null}','C2','infra_state_harvester', now()),
 ('H3','Harvest','ACTION','{"protocol":null}','C1','infra_state_harvester', now());
INSERT INTO stages VALUES ('C1','{"harnessTaskId":"L1"}'), ('C2','{"harnessTaskId":"L2"}');
INSERT INTO agent_executions VALUES ('x1','H1','SUCCESS',NULL), ('x2','H2','SUCCESS',NULL), ('x3','H3','SUCCESS',NULL), ('xl2','L2','SUCCESS',NULL);

INSERT INTO agent_artifacts VALUES ('pi2','pipeline-index.json','xl2', now() - interval '3 hours',
  '{"protocolInjection":{"delta":{"name":"observability-config-protocol","version":"1.10.0"}}}');

-- x1 (k8s leaf): [0] file read (elided status + resource) ⇒ a CAPTURE ref; [1] a directory listing (G-1 placeholder) ⇒ no row;
-- [2] a SUCCESSFUL pin violator (owner attacker) ⇒ a source-not-pinned refusal; [3] refused at call time (PINNED_ARGUMENT, repo evil)
-- in BOTH stored shapes (held-terraform step 2, sec-ops SW-1): [3] production's agent loop — success:true, result.isError, the hub
-- message in result.content (read off live leg T-W2) — and [4] the lab fixture tier — success:false, result:null, the message under the
-- error key, in the pre-F-T1 escaped wording (L-T1 H-T-OFFREF sample-02). The earlier plant's text ("PINNED_ARGUMENT: refused") is a
-- message no call ever carries, so the control passed while the real column read 0.
INSERT INTO agent_artifacts VALUES ('r1','result.json','x1', now() - interval '2 hours', \$J\${"toolCalls":[
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml"},
   "result":{"content":[{"type":"text","text":"[platform: the file source status line was elided at persist (it carries a blob id)]"},{"type":"resource","resource":{"uri":"repo://paichart/paichart-lab-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/k8s/a.yaml","text":"kind: Namespace\n"}}]}}}]}},
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s"},
   "result":{"content":[{"type":"text","text":"[platform: the file source directory listing was elided at persist (it carries blob ids)]"}]}}}]}},
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"attacker","repo":"paichart-lab-configs","path":"k8s/a.yaml"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"attacker","repo":"paichart-lab-configs","path":"k8s/a.yaml"},
   "result":{"content":[{"type":"text","text":"x"},{"type":"resource","resource":{"uri":"repo://attacker/paichart-lab-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/k8s/a.yaml","text":"evil\n"}}]}}}]}},
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"evil","path":"k8s/a.yaml"}},
  "result":{"isError":true,"content":[{"type":"text","text":"Service call blocked by compliance policy: Blocked: repo is outside the file source pin (read-only Git file source: the pinned repository, default branch, a relative path, no sha)"}]}},
 {"tool":"services","success":false,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml","ref":"v1"}},
  "error":"Service call blocked by compliance policy: Blocked: &#039;ref&#039; is outside the file source&#039;s pin (read-only Git file source: the pinned repository, default branch, a relative path, no sha)","result":null}
]}
\$J\$);
-- x2 (obs leaf): [0] a github file read ⇒ OUT OF SCOPE (no row by design) — plus a PLANTED github CAPTURE row (🔴 non-k8s leg)
INSERT INTO agent_artifacts VALUES ('r2','result.json','x2', now() - interval '90 minutes', \$J\${"toolCalls":[
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml"},
   "result":{"content":[{"type":"text","text":"s"},{"type":"resource","resource":{"uri":"repo://paichart/paichart-lab-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/k8s/a.yaml","text":"kind: Namespace\n"}}]}}}]}}
]}
\$J\$);
-- x3 (k8s leaf): [0] an in-scope github file read with NO held row ⇒ 🔴 9 and 🔴 10 (a capture miss)
INSERT INTO agent_artifacts VALUES ('r3','result.json','x3', now() - interval '100 minutes', \$J\${"toolCalls":[
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/b.yaml"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/b.yaml"},
   "result":{"content":[{"type":"text","text":"s"},{"type":"resource","resource":{"uri":"repo://paichart/paichart-lab-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/k8s/b.yaml","text":"kind: Service\n"}}]}}}]}}
]}
\$J\$);

INSERT INTO held_file_refs (id, kind, "executionId", "toolCallIndex", selector, "sourceTool", "declaredBy", "serviceId", "serviceName", "blobSha256", scope, "fromRefId", "sourceRevision") VALUES
 ('ok1','CAPTURE','x1',0,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service', encode(sha256(convert_to(E'kind: Namespace\n','UTF8')),'hex'),'s', NULL,'0ea432e751cc622ffab91d7a90386c66cadf8733'),
 ('nul','CAPTURE','x1',9,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service','x','s', NULL, NULL),
 ('bad','CAPTURE','x1',8,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service','x','s', NULL,'ABC'),
 ('bas','BASE','x1',NULL,NULL,NULL,NULL,'gh','github-service','x','s','ok1','1111111111111111111111111111111111111111'),
 ('oos','CAPTURE','x2',7,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service','x','s', NULL,'0ea432e751cc622ffab91d7a90386c66cadf8733'),
 -- held-terraform step 3 (MI13-GIT-CONTROL-STATE-PATH-UNPLANTED): a held ref whose path is a terraform state file — capture refuses it, so a hit here is a capture that held state
 ('tfs','CAPTURE','x1',10,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service','x','s', NULL,'0ea432e751cc622ffab91d7a90386c66cadf8733'),
 -- TF-PATH-RULE-GAPS (sec-ops review B-1): the two new arms of the widened line — a CLI credentials NAME and a .terraform.d SEGMENT
 ('tfc','CAPTURE','x1',11,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service','x','s', NULL,'0ea432e751cc622ffab91d7a90386c66cadf8733'),
 ('tfd','CAPTURE','x1',12,'/content/1/resource/text','get_file_contents','platform-default','gh','github-service','x','s', NULL,'0ea432e751cc622ffab91d7a90386c66cadf8733');
INSERT INTO held_capture_refusals VALUES ('rf1','x1',2,'source-not-pinned','envelope', now()), ('rf2','x1',5,'secret-manifest','envelope', now()),
 ('rf3','x1',13,'credentials-file','arguments', now());
UPDATE held_file_refs SET path = '/terraform/terraform.tfstate' WHERE id = 'tfs';
UPDATE held_file_refs SET path = '/terraform/.terraformrc' WHERE id = 'tfc';
UPDATE held_file_refs SET path = '/x/.terraform.d/credentials.tfrc.json' WHERE id = 'tfd';
-- held-terraform step 3: a held blob whose text is terraform state JSON under any name (capture refuses it state-file by content)
INSERT INTO held_blobs (sha256, scope, content, "storedByteLength") VALUES
 ('tfstateblob', 's', convert_to('{"version": 4, "terraform_version": "1.9.0", "lineage": "00000000-0000-0000-0000-000000000000", "resources": []}', 'UTF8'), 101);

$( cat <<'PRE'
CREATE TEMP VIEW _raw AS SELECT id, name, "executionId", "createdAt", content FROM agent_artifacts
  WHERE name IN ('result.json','pipeline-index.json') AND content LIKE '{%';
CREATE TEMP TABLE _a AS SELECT id, name, "executionId" eid, "createdAt" t, content::jsonb j FROM _raw;
PRE
)
$SECTION
SELECT 'HELDLEG ' || coalesce(string_agg(id, ',' ORDER BY id), '') FROM _heldleg;
SELECT 'EXECLEG ' || string_agg(eid || '=' || coalesce(legproto, '-'), ',' ORDER BY eid) FROM _execleg;
SQL
)

fail=0
expect() { # $1 = line prefix (fixed string), $2 = expected value
  # a MISSING line is the exact failure this script reports, so the grep must not kill it under pipefail (sec-ops B-1, 2026-10-22)
  local got; got=$( { grep -F -- "$1" <<<"$OUT" || true; } | head -1 | awk -F'|' '{gsub(/^ +| +$/, "", $NF); print $NF}')
  if [ "$got" = "$2" ]; then echo "  ✅ $1 = $2"; else echo "  ❌ $1 — expected $2, got '${got}'"; fail=1; fi
}
expect '🔴 9 a SUCCESS execution' 1
expect '🔴 10 a successful file-tool call' 1
expect '⚪ 9/10 control: declared file calls examined' 3
expect '⚪ 9/10 github exempt — directory listing' 1
expect '⚪ 9/10 github exempt — owning leg not a Git file source' 1
expect '· 9/10 github NOT judged — truncated' 0
expect '🔴 a SUCCESSFUL github-service call whose stored arguments break the pin' 1
# x1 [3] (production refusal shape) + [4] (lab fixture-tier refusal shape) are both refused AND both break the pin (repo evil; ref v1)
expect '⚪ github-service calls examined: all / successful / refused' '7 / 5 / 2'
expect '⚪ github-service calls whose stored arguments break the pin, any outcome' 3
expect '🔴 a github-service CAPTURE ref with a NULL sourceRevision' 1
expect '🔴 a ref whose sourceRevision is not 40 lowercase hex' 1
expect '🔴 a BASE / CANDIDATE whose sourceRevision differs' 1
expect '🔴 a github-service CAPTURE on an execution whose owning leg is not a Git file source' 1
expect '⚪ secret-manifest refusals' 1
# 🔴 12 over the G-1-ELIDED stored record: the one real ref (ok1, positional /content/1/resource/text) resolves and its sha matches.
# The three planted 🔴 rows (nul, bad, oos) point at call indices with no stored call, so they read unresolved — by construction here.
expect '⚪ 12 control: refs compared' 1
expect '🔴 12 a comparable stored leaf whose sha256' 0
# held-terraform step 3: + the planted state-path ref 'tfs' (its blob 'x' resolves to nothing, like 'nul'/'bad'/'oos');
# TF-PATH-RULE-GAPS: + 'tfc' and 'tfd' the same way
expect '🔴 12 refs unresolved' 6
# a PREFIX, so the next widening of the label does not silently break this control (sec-ops B-1)
expect '🔴 a held ref whose path is a terraform state' 3
expect '⚪ credentials-file refusals' 1
expect '🔴 a held blob whose text is terraform state or plan JSON' 1
grep -q '^ *HELDLEG L2 *$' <<<"$OUT" && echo "  ✅ _heldleg = {L2} (the obs leg composed 1.10.0 first; the k8s leg is not held-capable)" || { echo "  ❌ _heldleg: $(grep HELDLEG <<<"$OUT")"; fail=1; }
grep -q 'x1=kubernetes-gitops-protocol,x2=observability-config-protocol,x3=kubernetes-gitops-protocol,xl2=observability-config-protocol' <<<"$OUT" \
  && echo "  ✅ _execleg resolves leaf → leg and a PIPELINE to itself" || { echo "  ❌ _execleg: $(grep EXECLEG <<<"$OUT")"; fail=1; }
[ "$fail" = 0 ] && echo "✅ MI-13 held git-file-source control: every planted hit fired" || { echo "❌ MI-13 held git-file-source control FAILED"; exit 1; }
