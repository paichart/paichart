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
echo; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
