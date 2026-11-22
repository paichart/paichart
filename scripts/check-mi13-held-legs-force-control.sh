#!/usr/bin/env bash
# Config sources STEP 3 P5 (whole-diff review F5, F8) — POSITIVE CONTROL for MI-13's force lines of the HELD LEGS section.
#
# WHY: `git-file-not-held` has been TWO forces since 2026-11-15 — the Device-sources one (its stamp carries
# `gitFileDevicesNotHeld`) and the Config-sources one (`gitFilesNotHeld`). The two 🔴 lines written on 2026-10-26 counted every leg
# with that reason, so a correctly forced Kubernetes or Terraform leg read as a Device-sources fault, twice. They are now scoped by
# what each stamp CARRIES. On production every one of these lines reads 0, and a 0 from a line that cannot fire is unmeasured — so
# this runs the lines' OWN SQL, extracted from report-mechanism-inventory.sh unchanged, against planted rows in TEMP tables on the
# LOCAL database (nothing permanent is written). Each plant is one stamp shape; the expected counts below are the control.
# Also the two `captureExecutionId` lines (F8: the stamp had no reader).
#
# Usage: scripts/check-mi13-held-legs-force-control.sh [<inventory script>]   (default: this tree's; a base tree's script shows the
#        two false reds the 2026-10-26 lines print on the same rows). Reads DATABASE_URL from .env; LOCAL only.
set -euo pipefail
cd "$(dirname "$0")/.."
URL=$(grep -E '^DATABASE_URL' .env | sed -E 's/^DATABASE_URL="?([^"?]*).*/\1/')
case "$URL" in *@localhost*|*@127.0.0.1*) ;; *) echo "refusing: not a localhost DATABASE_URL"; exit 2 ;; esac
INV="${1:-scripts/report-mechanism-inventory.sh}"
# The lines, from the first one that names the device-force family to the line before the held-views control. In a tree from
# before this slice the block starts at the 🔴 line itself.
START='a device-force reason (git-file-not-held'
grep -qF "forced git-file-not-held by the CONFIG-sources force" "$INV" && START='forced git-file-not-held by the CONFIG-sources force'
LINES=$(awk -v s="$START" 'index($0, "⚪ held views (all states rendered by construction; count)"){exit} index($0, s) && /^UNION ALL SELECT/{f=1} f && !/^--/{print}' "$INV")
DEVSRC=$(grep -E "^CREATE TEMP VIEW _devsrcleg AS" "$INV")
[ -n "$LINES" ] && [ -n "$DEVSRC" ] || { echo "could not extract the force lines or the _devsrcleg view"; exit 2; }

OUT=$(psql "$URL" -X -q -v ON_ERROR_STOP=1 <<SQL
SET client_min_messages = warning;
CREATE TEMP TABLE tasks (id text, metadata jsonb, stage_id text);
CREATE TEMP TABLE agent_executions (id text, "taskId" text);
CREATE TEMP TABLE vleg (id text, metadata jsonb, ps text);
$DEVSRC
-- one leg per stamp shape. he(...) = metadata.qualityGate.heldEdit
INSERT INTO vleg VALUES
 ('N1', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held","gitFileDevicesNotHeld":["sw1"]}}}', 'sN1'),   -- the Device force, correct
 ('K1', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held","gitFilesNotHeld":["web"]}}}', 'sK1'),        -- the Config force, correct (Kubernetes)
 ('T1', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held","gitFilesNotHeld":["main"]}}}', 'sT1'),       -- the Config force, correct (Terraform)
 ('K2', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held"}}}', 'sK2'),                                  -- FAULT: no list at all, on a leg that is not a Device-sources leg
 ('N2', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held"}}}', 'sN2'),                                  -- FAULT: the Device force without its device list
 ('K3', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held","gitFilesNotHeld":[]}}}', 'sK3'),             -- FAULT: the Config force with an EMPTY list
 ('N3', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"git-file-not-held","gitFilesNotHeld":["x"],"gitFileDevicesNotHeld":["sw1"]}}}', 'sN3'),   -- FAULT: both lists on one stamp
 ('K4', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"device-read-not-held","devicesNotHeld":["sw1"]}}}', 'sK4'),      -- FAULT: a device reason on a Kubernetes leg
 ('O1', '{"qualityGate":{"heldEdit":{"forced":false,"captureExecutionId":"e1"}}}', 'sO1'),                                    -- the capture the force was judged against: this leg's own Harvester
 ('O2', '{"qualityGate":{"heldEdit":{"forced":false,"captureExecutionId":"e9"}}}', 'sO2'),                                    -- FAULT: an execution of ANOTHER leg's stage
 ('O3', '{"qualityGate":{"heldEdit":{"forced":true,"reason":"service-held-not-held","captureExecutionId":null}}}', 'sO3');    -- no Harvester had run
INSERT INTO tasks VALUES
 ('N1', '{"protocol":"network-provisioning-protocol"}', 'P'), ('N2', '{"protocol":"network-provisioning-protocol"}', 'P'), ('N3', '{"protocol":"network-provisioning-protocol"}', 'P'),
 ('K1', '{"protocol":"kubernetes-gitops-protocol"}', 'P'), ('K2', '{"protocol":"kubernetes-gitops-protocol"}', 'P'), ('K3', '{"protocol":"kubernetes-gitops-protocol"}', 'P'),
 ('K4', '{"protocol":"kubernetes-gitops-protocol"}', 'P'), ('T1', '{"protocol":"terraform-iac-protocol"}', 'P'),
 ('O1', '{"protocol":"observability-config-protocol"}', 'P'), ('O2', '{"protocol":"observability-config-protocol"}', 'P'), ('O3', '{"protocol":"observability-config-protocol"}', 'P'),
 ('H1', '{}', 'sO1'), ('H9', '{}', 'sK1');
INSERT INTO agent_executions VALUES ('e1', 'H1'), ('e9', 'H9');
SELECT 'control' AS line, '-' AS value WHERE false
$LINES;
SQL
)

fail=0
expect() { # $1 = line prefix (fixed string), $2 = expected value
  local got; got=$( { grep -F -- "$1" <<<"$OUT" || true; } | head -1 | awk -F'|' '{gsub(/^ +| +$/, "", $NF); print $NF}')
  if [ "$got" = "$2" ]; then echo "  ✅ $1 = $2"; else echo "  ❌ $1 — expected $2, got '${got}'"; fail=1; fi
}
if [ "$START" != 'a device-force reason (git-file-not-held' ]; then
  expect '⚪ held legs forced git-file-not-held by the CONFIG-sources force' 4                      # K1, T1, K3, N3
  expect '🔴 a device-force reason (git-file-not-held / device-read-not-held / device-sources-*) on a held leg that is not a Device-sources leg' 2   # K2, K4 — never K1 or T1
  expect '🔴 git-file-not-held / device-read-not-held stamped without its device list' 2             # K2, N2 — never K1 or T1
  expect '🔴 git-file-not-held by the CONFIG-sources force with an EMPTY file list, or on a Device-sources leg' 2   # K3, N3
  expect '⚪ heldEdit.captureExecutionId on held legs: an execution id / null' '2 / 1'
  expect '🔴 a heldEdit.captureExecutionId that is not an execution of a task in that leg' 1         # O2
else
  # A tree from BEFORE this slice: the same rows, the 2026-10-26 lines. K1, T1, K3 and (line 2 only) N3's absence show the false reds.
  echo "  (base form of the lines — printed, not asserted)"
  grep -F '🔴' <<<"$OUT" | sed 's/  */ /g'
fi
[ "$fail" = 0 ] && echo "✅ MI-13 held-legs force control passed" || { echo "❌ MI-13 held-legs force control FAILED"; exit 1; }
