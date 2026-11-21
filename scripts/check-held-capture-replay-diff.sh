#!/bin/bash
# Test of scripts/held-capture-replay-diff.sh (pure; no network, no database). Run: bash scripts/check-held-capture-replay-diff.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; D="$HERE/held-capture-replay-diff.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "✅ $1"; else fail=$((fail+1)); echo "❌ $1 (expected $3, got $2)"; fi; }
cat > "$T/base" <<'X'
{"level":30,"msg":"a logger line that is not replay output"}
# --compare-all: 3 executions with a CAPTURE ref or a capture refusal
✅ exec1: predicted 2, rows 2, missing 0, extra 0
❌ exec2: predicted 1, rows 1, missing 1, extra 1
  missing 2		source-not-pinned
  extra 2	/content/1/resource/text	held
✅ exec3: predicted 1, rows 1, missing 0, extra 0
X
# 1 — the same run, with different logger noise, is identical (and the old ❌ does not fail the gate)
sed 's/"a logger line/"another logger line/' "$T/base" > "$T/same"
out=$("$D" "$T/base" "$T/same"); ok "identical outputs exit 0 although one execution reads ❌ (history is not the gate)" $? 0
echo "$out" | grep -q "base: 2 ✅ / 1 ❌   new: 2 ✅ / 1 ❌"; ok "the absolute counts are printed" $? 0
# 2 — a verdict that flips is named
sed 's/^✅ exec3: predicted 1, rows 1, missing 0, extra 0/❌ exec3: predicted 0, rows 1, missing 0, extra 1/' "$T/base" > "$T/flip"
out=$("$D" "$T/base" "$T/flip"); ok "a flipped verdict exits 1" $? 1
echo "$out" | grep -q "DIFFERS on 1 execution" && echo "$out" | grep -q "  exec3"; ok "…and names the execution, only that one" $? 0
# 3 — the SAME ❌ verdict with a different DETAIL line is a difference (a refusal renamed is a moved capture)
sed 's/source-not-pinned/git-file-not-declared/' "$T/base" > "$T/detail"
out=$("$D" "$T/base" "$T/detail"); ok "a changed detail line under an unchanged verdict exits 1" $? 1
echo "$out" | grep -q "  exec2"; ok "…and names that execution" $? 0
# 4 — an execution missing from one side is a difference
grep -v "exec3" "$T/base" > "$T/short"
"$D" "$T/base" "$T/short" > /dev/null; ok "an execution present on one side only exits 1" $? 1
# 5 — an incomplete run is never read as identical
grep -v "^# --compare-all" "$T/base" > "$T/nohead"
"$D" "$T/nohead" "$T/nohead" > /dev/null; ok "an output with no header line exits 2" $? 2
printf '# --compare-all: 0 executions\n' > "$T/empty"
"$D" "$T/empty" "$T/empty" > /dev/null; ok "an output that lists no execution exits 2" $? 2
"$D" "$T/base" "$T/does-not-exist" > /dev/null; ok "a missing file exits 2" $? 2
# 6 — an execution on one side only is its OWN class, not a "differs" (Config sources STEP 3 P0)
out=$("$D" "$T/base" "$T/short"); echo "$out" | grep -q "PRESENT IN ONE PASS ONLY: 1 execution" && echo "$out" | grep -q "  exec3 (base pass only)"; ok "…and is listed as present in one pass only, by side" $? 0
echo "$out" | grep -q "DIFFERS on"; ok "…and is NOT counted as a differing execution" $? 1
out=$("$D" "$T/short" "$T/flip"); echo "$out" | grep -q "PRESENT IN ONE PASS ONLY: 1 execution" && echo "$out" | grep -q "  exec3 (new pass only)"; ok "the same from the other side" $? 0
# 7 — both classes in one comparison are each listed
sed 's/source-not-pinned/git-file-not-declared/' "$T/short" > "$T/both"
out=$("$D" "$T/base" "$T/both"); rc=$?; ok "a changed detail AND a missing execution exits 1" $rc 1
echo "$out" | grep -q "DIFFERS on 1 execution" && echo "$out" | grep -q "PRESENT IN ONE PASS ONLY: 1 execution"; ok "…and both classes are listed with their own counts" $? 0
# 8 — the ARCHIVE shape: one `exec` line per execution; the aggregate report and its CPU line are not compared
cat > "$T/abase" <<'X'
# --archive: 3 candidate executions; result.json createdAt >= 2026-08-01 and < 2026-11-21 03:00:00 (UTC); device-scope gate on; config scope on
exec e1 held 3 refusals {} set aaaa
exec e2 held 0 refusals {source-not-pinned:1} set bbbb
exec e3 no-toolcalls
══ ARCHIVE CAPTURE REPLAY (shipping prepareHeldCapture over stored result.json) ══
  refusals by name: {"source-not-pinned":1}
  pure-half CPU ms p50/p95/max (CPU only — no SELECT, no upsert): 1.0/2.0/3.0
X
sed 's#1.0/2.0/3.0#9.0/9.0/9.0#' "$T/abase" > "$T/asame"
out=$("$D" "$T/abase" "$T/asame"); ok "archive: identical exec lines exit 0 although the CPU line differs" $? 0
echo "$out" | grep -q "base: 3 executions   new: 3 executions"; ok "archive: the execution counts are printed" $? 0
sed 's/^exec e1 held 3 refusals {} set aaaa/exec e1 held 3 refusals {} set cccc/' "$T/abase" > "$T/ahash"
out=$("$D" "$T/abase" "$T/ahash"); rc=$?; ok "archive: a changed held-set hash exits 1" $rc 1
echo "$out" | grep -q "DIFFERS on 1 execution" && echo "$out" | grep -q "  e1"; ok "…and names that execution" $? 0
sed 's/{source-not-pinned:1}/{git-file-not-declared:1}/' "$T/abase" > "$T/aname"
"$D" "$T/abase" "$T/aname" > /dev/null; ok "archive: a renamed refusal exits 1" $? 1
grep -v "^exec e3" "$T/abase" > "$T/ashort"
out=$("$D" "$T/abase" "$T/ashort"); rc=$?; ok "archive: an execution in one pass only exits 1" $rc 1
echo "$out" | grep -q "PRESENT IN ONE PASS ONLY: 1 execution" && echo "$out" | grep -q "  e3 (base pass only)" && ! echo "$out" | grep -q "DIFFERS on"; ok "…as its own class, not as a differing execution" $? 0
sed 's/< 2026-11-21 03:00:00/< 2026-11-21 04:00:00/' "$T/abase" > "$T/ahead"
out=$("$D" "$T/abase" "$T/ahead"); rc=$?; ok "archive: a different window in the header exits 1 (the passes did not read the same window)" $rc 1
echo "$out" | grep -q "HEADER lines differ"; ok "…and says the header differs" $? 0
# 9 — never a false "identical": different shapes, an archive run with no execution line
"$D" "$T/base" "$T/abase" > /dev/null; ok "a --compare-all output against an archive output exits 2" $? 2
grep -v "^exec " "$T/abase" > "$T/aempty"
"$D" "$T/aempty" "$T/aempty" > /dev/null; ok "an archive output that lists no execution exits 2" $? 2
# 10 — the CONFIG-LANE shape (review F1): `leg` and `snapshot` lines, keyed by task id; the summary and awaiting lines are not compared
cat > "$T/cbase" <<'X'
# --config-lane: 3 PIPELINE tasks read (every one, no date bound) from database d; held tables present
# awaiting list (CONFIG_SOURCE_AWAITING_TEXT) in this tree: []; table (CONFIG_SOURCE_LANES): ["k"]
leg t1 kubernetes-gitops-protocol [stamp] as-shipped parsed all-shipped parsed live parsed snapshot present force as-shipped stored:none predicted:none all-shipped stored:none predicted:none collisions 0
leg t2 observability-config-protocol [stamp] as-shipped not-config-source-leg all-shipped not-config-source-leg live - snapshot absent force as-shipped none all-shipped none collisions 0
══ CONFIG LANE CORPUS ══
  kubernetes-gitops-protocol: 1 legs
snapshot t1 PIPELINE kubernetes-gitops-protocol state parsed grammar 1 entries 2 readback equal canon aaaa governing parsed/parsed
X
sed -e 's/in this tree: \[\]/in this tree: ["o"]/' -e 's/: 1 legs/: 9 legs/' "$T/cbase" > "$T/csame"
out=$("$D" "$T/cbase" "$T/csame"); ok "config-lane: identical leg and snapshot lines exit 0 although the awaiting and summary lines differ" $? 0
echo "$out" | grep -q "base: 2 legs, 1 snapshots   new: 2 legs, 1 snapshots"; ok "config-lane: the leg and snapshot counts are printed" $? 0
sed 's#governing parsed/parsed#governing snapshot-changed/snapshot-changed#' "$T/cbase" > "$T/cgov"
out=$("$D" "$T/cbase" "$T/cgov"); rc=$?; ok "config-lane: a snapshot that stops governing exits 1" $rc 1
echo "$out" | grep -q "DIFFERS on 1 execution" && echo "$out" | grep -q "  t1"; ok "…and names that leg" $? 0
sed 's/^leg t2 \(.*\) all-shipped not-config-source-leg live/leg t2 \1 all-shipped snapshot-absent live/' "$T/cbase" > "$T/cleg"
out=$("$D" "$T/cbase" "$T/cleg"); rc=$?; ok "config-lane: a leg whose governing state moves in ONE awaiting state exits 1" $rc 1
echo "$out" | grep -q "  t2"; ok "…and names that leg" $? 0
grep -v "^leg t2" "$T/cbase" > "$T/cshort"
out=$("$D" "$T/cbase" "$T/cshort"); echo "$out" | grep -q "PRESENT IN ONE PASS ONLY: 1 execution" && echo "$out" | grep -q "  t2 (base pass only)"; ok "config-lane: a leg in one pass only is its own class" $? 0
"$D" "$T/cbase" "$T/abase" > /dev/null; ok "a config-lane output against an archive output exits 2" $? 2
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
