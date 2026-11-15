#!/bin/bash
# held-capture-replay-diff.sh — compare two `replay-held-capture.sh --compare-all` outputs, execution by execution. PURE: reads two
# files, calls nothing. (CAPTURE-REPLAY-NOT-CLEAN-SINCE-PIN-CUT, 2026-11-15.)
#
# WHY: `--compare-all` predicts every stored execution with TODAY's pin and snapshot rule, so an execution that ran under an earlier
# one reads ❌ forever (36 of 40 on 2026-11-15 held a file from the retired repo). Its own exit code therefore says "history
# differs from today's rules", not "this change moved a capture". THIS comparison is the gate: a change is safe when the base tree
# and the new tree give the SAME verdict and the SAME detail lines for every execution.
#
#   scripts/held-capture-replay-diff.sh <base-output> <new-output>
# Exit 0  identical on every execution (the absolute ✅/❌ counts are printed — they are history, not the gate)
# Exit 1  at least one execution's verdict or detail differs (each is listed)
# Exit 2  an output is not a completed --compare-all run (no header line, or no execution line) — never read as "identical"
set -u
BASE="${1:-}"; NEW="${2:-}"
[ -f "$BASE" ] && [ -f "$NEW" ] || { echo "usage: $0 <base-output> <new-output>"; exit 2; }
# The comparable lines: the header, each execution's verdict, and its indented detail lines. Logger JSON lines are not replay output.
norm() { grep -a -v '^{"level"' "$1" | grep -a -E '^(# --compare-all|✅|❌|  )' ; }
for f in "$BASE" "$NEW"; do
  norm "$f" | grep -a -q '^# --compare-all' || { echo "✗ $f is not a completed --compare-all run (no header line)"; exit 2; }
  norm "$f" | grep -a -q -E '^(✅|❌)' || { echo "✗ $f lists no execution"; exit 2; }
done
count() { norm "$1" | grep -a -c "^$2"; }
echo "base: $(count "$BASE" '✅') ✅ / $(count "$BASE" '❌') ❌   new: $(count "$NEW" '✅') ✅ / $(count "$NEW" '❌') ❌   (absolute counts are history under today's rules, not the gate)"
if diff <(norm "$BASE") <(norm "$NEW") > /dev/null; then
  echo "✅ IDENTICAL on every execution — the change moved no capture"
  exit 0
fi
# Which executions differ: the verdict line's id (the token before the first colon), for any block whose lines differ.
blocks() { norm "$1" | awk '/^(✅|❌)/ { id=$2; sub(/:$/, "", id) } /^(✅|❌|  )/ { print id "\t" $0 }'; }
differing=$(diff <(blocks "$BASE") <(blocks "$NEW") | grep -a -E '^[<>]' | cut -f1 | sed -E 's/^[<>] //' | sort -u)
n=$(printf '%s\n' "$differing" | grep -c .)
echo "❌ DIFFERS on $n execution(s):"
for id in $differing; do
  echo "  $id"
  echo "    base: $(blocks "$BASE" | grep -a "^$id	" | cut -f2- | head -1 | cut -c1-160)"
  echo "    new:  $(blocks "$NEW" | grep -a "^$id	" | cut -f2- | head -1 | cut -c1-160)"
done
exit 1
