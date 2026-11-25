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

# The 1.12.0 join (2026-11-23): the planted world is run TWICE — against the section as it is (observability's `_gitsrcleg` row
# present: its text is live) and against the same section with that ONE row removed (the text reverted). `run_control` reads $SECTION.
# QUOTED heredocs (sec-ops, join review): the SQL below is passed to psql byte for byte — the shell expands nothing in it. It was one
# UNQUOTED heredoc, so a backtick in an SQL comment was executed as a command ("command not found" on stderr at best). The section
# under test is the one thing that varies; it is printed between the two literal parts.
run_control() { { cat <<'SQL_SETUP'
SET client_min_messages = warning;
CREATE TEMP TABLE tasks (id text, title text, type text, metadata jsonb, stage_id text, "agentRole" text, created_at timestamptz DEFAULT now());
CREATE TEMP TABLE stages (id text, metadata jsonb);
CREATE TEMP TABLE agent_executions (id text, "taskId" text, status text, "supersededById" text, "createdAt" timestamptz DEFAULT now());  -- STEP 3 P2: R2 reads createdAt
CREATE TEMP TABLE agent_artifacts (id text, name text, "executionId" text, "createdAt" timestamptz, content text);
CREATE TEMP TABLE held_file_refs (id text, kind text, "executionId" text, "toolCallIndex" int, selector text, "sourceTool" text, "declaredBy" text,
  "serviceId" text, "serviceName" text, "blobSha256" text, scope text, "redactedCount" int DEFAULT 0, "redactorVersion" text DEFAULT 'paichart.r10/3',
  "fromRefId" text, "sourceRevision" text, "createdAt" timestamptz DEFAULT now(), "storedByteLength" int,
  "legTaskId" text, "rootTaskId" text, -- Config sources STEP 2: MI-13's two cross-leg reads (held / edited by more than one leg) read them; without them this control aborted
  path text, target text DEFAULT 'file');  -- held-terraform step 2: MI-13's state/variables-path 🔴 line (step 1) reads it; without it this control aborted
CREATE TEMP TABLE held_capture_refusals (id text, "executionId" text, "toolCallIndex" int, refusal text, "identitySource" text, "createdAt" timestamptz DEFAULT now());
CREATE TEMP TABLE held_blobs (sha256 text, scope text, content bytea, "storedByteLength" int, "lastReferencedAt" timestamptz DEFAULT now());
CREATE TEMP TABLE held_views ("rewrittenLines" int);

-- legs: k8s leg L1 (stage S1), obs leg L2 (stage S2, composed obs 1.10.0 first ⇒ a held leg)
INSERT INTO tasks VALUES
 ('L1','Scale web (protocol: kubernetes-gitops)','PIPELINE','{"protocol":"kubernetes-gitops-protocol","pipelineStageId":"C1"}','P','pipeline_harness', now()),
 ('L2','OTLP (protocol: observability-config)','PIPELINE','{"protocol":"observability-config-protocol","pipelineStageId":"C2"}','P','pipeline_harness', now()),
 ('H1','Harvest','ACTION','{"protocol":null}','C1','infra_state_harvester', now()),
 ('H2','Harvest','ACTION','{"protocol":null}','C2','infra_state_harvester', now()),
 ('H3','Harvest','ACTION','{"protocol":null}','C1','infra_state_harvester', now()),
 -- Config sources STEP 3 P2 (plan W10 / A7) — the observability-lane controls:
 --   L3  an observability leg carrying a snapshot whose state is NOT parsed (takenAt = protocolResolvedAt, long before any execution);
 --   L4  a Kubernetes leg carrying a snapshot that is wrong three ways: grammar 2 (R4), another protocol's (R5), takenAt ≠
 --       protocolResolvedAt (R1) and LATER than the leg's own execution xl4 (R2).
 ('L3','Tune (protocol: observability-config)','PIPELINE','{"protocol":"observability-config-protocol","pipelineStageId":"C3","protocolResolvedAt":"2020-01-01T00:00:00.000Z","configSourcesSnapshot":{"version":1,"takenAt":"2020-01-01T00:00:00.000Z","protocol":"observability-config-protocol","resolution":{"state":"unparseable","grammarVersion":2}}}','P','pipeline_harness', now()),
 ('L4','Scale (protocol: kubernetes-gitops)','PIPELINE','{"protocol":"kubernetes-gitops-protocol","pipelineStageId":"C4","protocolResolvedAt":"2020-01-01T00:00:00.000Z","configSourcesSnapshot":{"version":1,"takenAt":"2099-01-01T00:00:00.000Z","protocol":"terraform-iac-protocol","resolution":{"state":"parsed","grammarVersion":2,"entries":[]}}}','P','pipeline_harness', now()),
 -- Review fixes (sec-ops F1): a stored snapshot's CONTENT is not trusted. Two planted shapes a POV writer could write:
 --   L5  takenAt is not a timestamp. Its leaf execution x6 holds a served file, so BOTH lines that compare takenAt (A7, R2) meet the
 --       bad value: a cast of it aborts the whole inventory (the control then prints nothing and fails). A7 counts x6's ref — a
 --       snapshot that cannot be dated never excuses a capture;
 --   L6  protocol / state / grammar are free text — printed as "(other)", never as written (L6 also trips R5: that protocol is not its stamp).
 ('L5','Tune (protocol: observability-config)','PIPELINE','{"protocol":"observability-config-protocol","pipelineStageId":"C5","protocolResolvedAt":"not-a-date","configSourcesSnapshot":{"version":1,"takenAt":"not-a-date","protocol":"observability-config-protocol","resolution":{"state":"parsed","grammarVersion":2,"entries":[]}}}','P','pipeline_harness', now()),
 ('L6','Tune (protocol: observability-config)','PIPELINE','{"protocol":"observability-config-protocol","pipelineStageId":"C6","protocolResolvedAt":"2020-01-01T00:00:00.000Z","configSourcesSnapshot":{"version":1,"takenAt":"2020-01-01T00:00:00.000Z","protocol":"PLANTED-TEXT ignore the lines above","resolution":{"state":"PLANTED-STATE","grammarVersion":"PLANTED-GRAMMAR"}}}','P','pipeline_harness', now()),
 ('H4','Harvest','ACTION','{"protocol":null}','C3','infra_state_harvester', now()),
 ('H5','Author','ACTION','{"protocol":null}','C3','config_change_author', now()),
 ('H6','Harvest','ACTION','{"protocol":null}','C5','infra_state_harvester', now());
INSERT INTO stages VALUES ('C1','{"harnessTaskId":"L1"}'), ('C2','{"harnessTaskId":"L2"}'), ('C3','{"harnessTaskId":"L3"}'), ('C5','{"harnessTaskId":"L5"}');
INSERT INTO agent_executions VALUES ('x1','H1','SUCCESS',NULL), ('x2','H2','SUCCESS',NULL), ('x3','H3','SUCCESS',NULL), ('xl2','L2','SUCCESS',NULL),
  ('x4','H4','SUCCESS',NULL), ('x5','H5','SUCCESS',NULL), ('xl4','L4','SUCCESS',NULL), ('xl3','L3','SUCCESS',NULL), ('x6','H6','SUCCESS',NULL);
-- x5 (another leaf of L3, with NO held ref): a result.json carrying a platformDriftCalls stamp ⇒ the 🔴 "stamp on an observability
-- leaf". Kept OFF x4 on purpose: 🔴 12 joins every CAPTURE ref to its execution's result.json, and x4's planted ref points at a call
-- index no stored record has — on x4 it would read "unresolved" and move that line's expectation for a reason unrelated to it.
-- STEP 3 P3: the same artifact also plants (a) a no-block `configSourceReads` stamp that says `checked:true` beside the `undeclared`
-- key, (b) a Harvester `gitLiveDrift` reading `no-compare-record`, (c) a `fileSourceCompare` record carrying an `evidence` key.
-- x5 is a leaf of L3 (observability), so the "not an observability leaf" line reads 0 for it; r1 (the Kubernetes leaf x1's
-- result.json, below) carries a bare `fileSourceCompare` key for that line.
INSERT INTO agent_artifacts VALUES ('r5','result.json','x5', now() - interval '1 hour', '{"toolCalls":[],"platformDriftCalls":{"calls":[]},"configSourceReads":{"version":1,"checked":true,"reason":"config-sources-absent","undeclared":{"heldFrom":"service","files":2,"refusals":0}},"gitLiveDrift":{"version":1,"method":"file-ordered-lines/1","point":"harvester","checked":false,"reason":"no-compare-record"},"fileSourceCompare":{"version":1,"method":"file-ordered-lines/1","files":[{"label":"obs-otelcol","state":"differs"},{"label":"obs-ingress.a","state":"not-checked","reason":"compare-error"}],"capture":[{"label":"obs-otelcol","kind":"git-file","outcome":"held"},{"label":"obs-otelcol","kind":"live-read","outcome":"file-from-other-service"},{"label":"obs-ingress.a","kind":"service-held","outcome":"registered-under-other-name"}],"unresolvedServices":["https://example.invalid/descriptor.json"],"evidence":"planted"}}');

INSERT INTO agent_artifacts VALUES ('pi2','pipeline-index.json','xl2', now() - interval '3 hours',
  '{"protocolInjection":{"delta":{"name":"observability-config-protocol","version":"1.10.0"}}}');

-- x1 (k8s leaf): [0] file read (elided status + resource) ⇒ a CAPTURE ref; [1] a directory listing (G-1 placeholder) ⇒ no row;
-- [2] a SUCCESSFUL pin violator (owner attacker) ⇒ a source-not-pinned refusal; [3] refused at call time (PINNED_ARGUMENT, repo evil)
-- in BOTH stored shapes (held-terraform step 2, sec-ops SW-1): [3] production's agent loop — success:true, result.isError, the hub
-- message in result.content (read off live leg T-W2) — and [4] the lab fixture tier — success:false, result:null, the message under the
-- error key, in the pre-F-T1 escaped wording (L-T1 H-T-OFFREF sample-02). The earlier plant's text ("PINNED_ARGUMENT: refused") is a
-- message no call ever carries, so the control passed while the real column read 0.
INSERT INTO agent_artifacts VALUES ('r1','result.json','x1', now() - interval '2 hours', $J${"fileSourceCompare":{"version":1},"toolCalls":[
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
$J$);
-- x2 (obs leaf): [0] a github file read ⇒ OUT OF SCOPE (no row by design) — plus a PLANTED github CAPTURE row (🔴 non-k8s leg)
INSERT INTO agent_artifacts VALUES ('r2','result.json','x2', now() - interval '90 minutes', $J${"toolCalls":[
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/a.yaml"},
   "result":{"content":[{"type":"text","text":"s"},{"type":"resource","resource":{"uri":"repo://paichart/paichart-lab-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/k8s/a.yaml","text":"kind: Namespace\n"}}]}}}]}}
]}
$J$);
-- x3 (k8s leaf): [0] an in-scope github file read with NO held row ⇒ 🔴 9 and 🔴 10 (a capture miss)
INSERT INTO agent_artifacts VALUES ('r3','result.json','x3', now() - interval '100 minutes', $J${"toolCalls":[
 {"tool":"services","success":true,"arguments":{"action":"call","targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/b.yaml"}},
  "result":{"content":[{"type":"data","data":{"targetService":"github-service","tool":"get_file_contents","arguments":{"owner":"paichart","repo":"paichart-lab-configs","path":"k8s/b.yaml"},
   "result":{"content":[{"type":"text","text":"s"},{"type":"resource","resource":{"uri":"repo://paichart/paichart-lab-configs/sha/0ea432e751cc622ffab91d7a90386c66cadf8733/contents/k8s/b.yaml","text":"kind: Service\n"}}]}}}]}}
]}
$J$);

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
-- Config sources STEP 2 (operator-only cross-leg reads): one Git file HELD by two legs of one program, and one EDITED (a BASE) by two
-- legs. A service name no other line keys on, so no existing expectation moves.
INSERT INTO held_file_refs (id, kind, "executionId", "serviceId", "serviceName", "blobSha256", scope, "sourceRevision", "legTaskId", "rootTaskId", target, path) VALUES
 ('xl1','CAPTURE','xl-e1','cfg','config-git','x','s','0ea432e751cc622ffab91d7a90386c66cadf8733','leg-1','root-1','github:acme:configs','/k8s/shared.yaml'),
 ('xl2','CAPTURE','xl-e2','cfg','config-git','x','s','0ea432e751cc622ffab91d7a90386c66cadf8733','leg-2','root-1','github:acme:configs','/k8s/shared.yaml'),
 ('xl3','CAPTURE','xl-e1','cfg','config-git','x','s','0ea432e751cc622ffab91d7a90386c66cadf8733','leg-1','root-1','github:acme:configs','/k8s/only-leg-1.yaml'),
 ('xb1','BASE','xl-a1','cfg','config-git','x','s','0ea432e751cc622ffab91d7a90386c66cadf8733','leg-1','root-1','github:acme:configs','/k8s/shared.yaml'),
 ('xb2','BASE','xl-a2','cfg','config-git','x','s','0ea432e751cc622ffab91d7a90386c66cadf8733','leg-2','root-1','github:acme:configs','/k8s/shared.yaml'),
 ('xb3','BASE','xl-a3','cfg','config-git','x','s','0ea432e751cc622ffab91d7a90386c66cadf8733','leg-9','root-2','github:acme:configs','/k8s/shared.yaml');
INSERT INTO held_capture_refusals VALUES ('rf1','x1',2,'source-not-pinned','envelope', now()), ('rf2','x1',5,'secret-manifest','envelope', now()),
 ('rf3','x1',13,'credentials-file','arguments', now()), ('rf4','x1',14,'key-material-file','arguments', now());
UPDATE held_file_refs SET path = '/terraform/terraform.tfstate' WHERE id = 'tfs';
UPDATE held_file_refs SET path = '/terraform/.terraformrc' WHERE id = 'tfc';
UPDATE held_file_refs SET path = '/x/.terraform.d/credentials.tfrc.json' WHERE id = 'tfd';
-- held-terraform step 3: a held blob whose text is terraform state JSON under any name (capture refuses it state-file by content)
INSERT INTO held_blobs (sha256, scope, content, "storedByteLength") VALUES
 ('tfstateblob', 's', convert_to('{"version": 4, "terraform_version": "1.9.0", "lineage": "00000000-0000-0000-0000-000000000000", "resources": []}', 'UTF8'), 101);

CREATE TEMP VIEW _raw AS SELECT id, name, "executionId", "createdAt", content FROM agent_artifacts
  WHERE name IN ('result.json','pipeline-index.json') AND content LIKE '{%';
CREATE TEMP TABLE _a AS SELECT id, name, "executionId" eid, "createdAt" t, content::jsonb j FROM _raw;
-- STEP 3 P2 plants (after the older plants, so their ids never collide):
--   x4 (leaf of L3, snapshot NOT parsed, text not live): a github-service CAPTURE ⇒ 🔴 "not parsed", 🔴 A7, and the 1b-scope 🔴
--       (an observability leg is not a Git file source in this inventory) — which therefore reads 2 with the older x2 plant;
--   x4: a served-file-evidence-only refusal (its leg HAS a snapshot ⇒ not R3);  x2 (leaf of L2, NO snapshot): a
--       service-file-not-declared refusal ⇒ 🔴 R3.
INSERT INTO held_file_refs (id, kind, "executionId", "toolCallIndex", selector, "sourceTool", "declaredBy", "serviceId", "serviceName", "blobSha256", scope, "sourceRevision", path, target)
  VALUES ('p2git','CAPTURE','x4',90,'/content/1/resource/text','get_file_contents','platform-default','github-service','github-service',repeat('c',64),'p','0ea432e751cc622ffab91d7a90386c66cadf8733','/observability/otelcol/config.yaml','github:paichart:paichart-configs');
-- Review fixes (sec-ops F6): the leg's OWN PIPELINE persist (xl3, the harness execution of L3) holding a served file. The A7 line DOES
-- count it (the _execleg view makes a PIPELINE task its own leg) — so it reads 2 with the leaf's Git capture.
INSERT INTO held_file_refs (id, kind, "executionId", "toolCallIndex", selector, "sourceTool", "declaredBy", "serviceId", "serviceName", "blobSha256", scope, path, target)
  VALUES ('p2own','CAPTURE','xl3',93,'/structuredContent/yaml','get_otel_config','platform-default','obs','observability-readonly',repeat('d',64),'p','/etc/otelcol/config.yaml','obs-otelcol'),
         ('p2bad','CAPTURE','x6',94,'/structuredContent/yaml','get_otel_config','platform-default','obs','observability-readonly',repeat('e',64),'p','/etc/otelcol/config.yaml','obs-otelcol');
INSERT INTO held_capture_refusals (id, "executionId", "toolCallIndex", refusal, "identitySource") VALUES
  ('p2ev','x4',91,'served-file-evidence-only','envelope'), ('p2nd','x2',92,'service-file-not-declared','envelope');
SQL_SETUP
printf '%s\n' "$SECTION"
cat <<'SQL_TAIL'
SELECT 'HELDLEG ' || coalesce(string_agg(id, ',' ORDER BY id), '') FROM _heldleg;
SELECT 'EXECLEG ' || string_agg(eid || '=' || coalesce(legproto, '-'), ',' ORDER BY eid) FROM _execleg;
SQL_TAIL
} | psql "$URL" -X -q -v ON_ERROR_STOP=1; }
OUT=$(run_control)

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
# 1 since the 1.12.0 join: x2 (a leaf of L2 — an observability leg with NO snapshot is not a Git file source: a leg that declares
# nothing reads no Git lane). x4 (a leaf of L3, which CARRIES a snapshot object) is a Git file source now that the text is live, and
# is counted by the "snapshot state is not parsed" line below instead. The reverted view at the end of this file shows 2 again.
expect '🔴 a github-service CAPTURE on an execution whose owning leg is not a Git file source' 1
# Config sources STEP 3 P2 (plan W10 / §13 A7): each new 🔴 fires exactly once on its plant; the two ⚪ are their controls
expect '⚪ Config-sources snapshots on legs, by protocol / state / grammar — observability-config-protocol / unparseable / 2' 1
expect '⚪ Config-sources snapshots on legs, by protocol / state / grammar — terraform-iac-protocol / parsed / 2' 1
expect '⚪ Config-sources snapshots on legs, by protocol / state / grammar — observability-config-protocol / parsed / 2' 1   # L5
expect '⚪ Config-sources snapshots on legs, by protocol / state / grammar — (other) / (other) / (other)' 1                   # L6: planted text is never printed
if grep -q 'PLANTED' <<<"$OUT"; then echo "  ❌ a planted snapshot string reached the report"; fail=1; else echo "  ✅ no planted snapshot string is printed"; fi
expect '🔴 a Config-sources snapshot whose takenAt is not the timestamp shape the platform writes' 1                           # L5 — counted, never cast
expect '⚪ declared-files scope refusals (a served file not held on a declared leg) — served-file-evidence-only' 1
expect '⚪ declared-files scope refusals (a served file not held on a declared leg) — service-file-not-declared' 1
# 2, and both are right: x4 (a snapshot whose state is `unparseable`) and the older x2 plant (an observability leg with NO snapshot —
# no snapshot is not a parsed one; a Git capture there is the same defect seen from this line)
expect '🔴 a github-service CAPTURE on an observability leg whose STORED Config-sources snapshot state is not parsed' 2
# 0 since the 1.12.0 join, BY CONSTRUCTION: the line is keyed on observability having no `_gitsrcleg` row (its text not live). It
# can fire only after a REVERT of the join — proven by the reverted view at the end of this file (3).
expect '🔴 A7 a CAPTURE ref on an observability leg that carries a Config-sources snapshot while its protocol text is not live' 0
expect '🔴 R3 a service-file-not-declared / served-file-evidence-only refusal' 1
expect '🔴 R4 a Config-sources snapshot of grammar 2 on a leg that is not observability' 1
expect '🔴 R5 a Config-sources snapshot whose protocol is not its leg' 2   # L4 + L6 (planted protocol text)
expect '🔴 R1 a Config-sources snapshot whose takenAt is not the leg' 1
expect '🔴 R2 a Config-sources snapshot taken AFTER an execution of its leg already existed' 1
expect '🔴 a platformDriftCalls stamp on an observability leaf' 1
# STEP 3 P3 — the file comparison's lines, each with its planted hit (r5)
expect '⚪ configSourceReads stamps on legs that declare NOTHING and ran on the service' '1 / 0'
expect '🔴 a configSourceReads stamp carrying the `undeclared` key that is NOT `checked:false`' 1
expect '⚪ fileSourceCompare records (observability Harvesters): files by state — differs' 1
expect '⚪ fileSourceCompare records (observability Harvesters): files by state — not-checked / compare-error' 1
# The 1.12.0 join (register item 28): the capture-outcome tally and its named zero — r5 plants three capture entries (one held, one
# of each P5 word) and one unresolved service.
expect '⚪ fileSourceCompare capture entries (what capture did with each declared line), by kind / outcome — live-read / file-from-other-service' 1
expect '⚪ fileSourceCompare capture entries (what capture did with each declared line), by kind / outcome — service-held / registered-under-other-name' 1
expect '⚪ fileSourceCompare capture entries (what capture did with each declared line), by kind / outcome — git-file / held' 1
expect '⚪ fileSourceCompare capture entries in all / with outcome file-from-other-service or registered-under-other-name / records carrying unresolvedServices' '3 / 2 / 1'
expect '🔴 a Harvester whose gitLiveDrift reads no-compare-record' 1
expect '🔴 a fileSourceCompare record that carries a file text or an evidence key' 1
expect '🔴 a fileSourceCompare stamp on a leaf that is not an observability leaf' 1
expect '⚪ secret-manifest refusals' 1
# Config sources STEP 2: the shared file is held by two legs of root-1 (the single-leg file and another program's are not counted)
expect '⚪ Git files HELD (capture) by more than one leg of one program' 1
expect '· Git files EDITED (a held base) by more than one leg of one program' 1
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
expect '⚪ key-material-file refusals' 1
expect '🔴 a held blob whose text is terraform state or plan JSON' 1
grep -q '^ *HELDLEG L2 *$' <<<"$OUT" && echo "  ✅ _heldleg = {L2} (the obs leg composed 1.10.0 first; the k8s leg is not held-capable)" || { echo "  ❌ _heldleg: $(grep HELDLEG <<<"$OUT")"; fail=1; }
grep -q 'x1=kubernetes-gitops-protocol,x2=observability-config-protocol,x3=kubernetes-gitops-protocol,x4=observability-config-protocol,x5=observability-config-protocol,x6=observability-config-protocol,xl2=observability-config-protocol,xl3=observability-config-protocol,xl4=kubernetes-gitops-protocol' <<<"$OUT" \
  && echo "  ✅ _execleg resolves leaf → leg and a PIPELINE to itself" || { echo "  ❌ _execleg: $(grep EXECLEG <<<"$OUT")"; fail=1; }
# ── THE REVERTED VIEW (the 1.12.0 join, 2026-11-23): the same planted world, the section with observability's `_gitsrcleg` row
# removed — what an operator reads after the join is reverted. A7 must fire on its three plants and the 1b-scope line must count
# the observability leg's Git capture again. Without this pass A7's positive control would have ended at the join.
SECTION_JOINED=$SECTION
SECTION=$(sed "s/, ('observability-config-protocol', 'snapshot-object')) v(name, rule);/) v(name, rule);/" <<<"$SECTION_JOINED")
[ "$SECTION" != "$SECTION_JOINED" ] || { echo "could not remove observability's _gitsrcleg row for the reverted view"; exit 2; }
OUT=$(run_control)
echo "  — the reverted view (observability's _gitsrcleg row removed) —"
expect '🔴 A7 a CAPTURE ref on an observability leg that carries a Config-sources snapshot while its protocol text is not live' 3   # x4 (a leaf's Git capture) + xl3 (the leg's OWN persist holding a served file — sec-ops F6) + x6 (a leg whose snapshot cannot be dated)
expect '🔴 a github-service CAPTURE on an execution whose owning leg is not a Git file source' 2   # x2 (the older plant) + x4 (an observability leg, text not live)
SECTION=$SECTION_JOINED
[ "$fail" = 0 ] && echo "✅ MI-13 held git-file-source control: every planted hit fired" || { echo "❌ MI-13 held git-file-source control FAILED"; exit 1; }
