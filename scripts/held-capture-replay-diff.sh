#!/bin/bash
# held-capture-replay-diff.sh — compare two capture-replay outputs, execution by execution. PURE: reads two files, calls nothing.
# (CAPTURE-REPLAY-NOT-CLEAN-SINCE-PIN-CUT, 2026-11-15; the archive shape and the "one pass only" class: Config sources STEP 3 P0, 2026-11-21.)
#
# It reads two shapes, told apart by the header line, and both files must be the SAME shape:
#   `replay-held-capture.sh --compare-all`   header `# --compare-all…`, a ✅/❌ verdict line per execution, indented detail lines
#   `replay-held-capture.sh` (archive mode)  header `# --archive…`, one `exec <id> …` line per candidate execution
#                                            (the aggregate report and its CPU line are NOT compared)
#   `replay-held-capture.sh --config-lane`   header `# --config-lane…`, one `leg <id> …` line per relevant leg and one
#                                            `snapshot <id> …` line per stored snapshot (the summary lines are NOT compared; the
#                                            awaiting-list line is not either — it is what a lane change changes)
#
# WHY: `--compare-all` predicts every stored execution with TODAY's pin and snapshot rule, so an execution that ran under an earlier
# one reads ❌ forever (36 of 40 on 2026-11-15 held a file from the retired repo). Its own exit code therefore says "history
# differs from today's rules", not "this change moved a capture". THIS comparison is the gate: a change is safe when the base tree
# and the new tree give the SAME verdict and the SAME detail lines for every execution.
#
#   scripts/held-capture-replay-diff.sh <base-output> <new-output>
# Exit 0  identical on every execution (the absolute ✅/❌ counts are printed — they are history, not the gate)
# Exit 1  at least one execution DIFFERS (verdict, detail or archive line), or is PRESENT IN ONE PASS ONLY — two classes, each listed:
#         a differing execution is a moved capture; an execution in one pass only is a moved POPULATION (a run finished, or retention
#         removed one, between the passes) and says nothing about the change. A header that differs alone also exits 1.
# Exit 2  an output is not a completed run (no header line, or no execution line), or the two are different shapes — never "identical"
set -u
BASE="${1:-}"; NEW="${2:-}"
[ -f "$BASE" ] && [ -f "$NEW" ] || { echo "usage: $0 <base-output> <new-output>"; exit 2; }
clean() { grep -a -v '^{"level"' "$1"; }   # logger JSON lines are not replay output
shape() { clean "$1" | grep -a -m1 -o -E '^# --(compare-all|archive|config-lane)' | sed 's/^# --//'; }
SB="$(shape "$BASE")"; SN="$(shape "$NEW")"
for pair in "$BASE:$SB" "$NEW:$SN"; do
  [ -n "${pair##*:}" ] || { echo "✗ ${pair%:*} is not a completed --compare-all, archive or --config-lane run (no header line)"; exit 2; }
done
[ "$SB" = "$SN" ] || { echo "✗ the two outputs are different shapes ($SB against $SN)"; exit 2; }
if [ "$SB" = "archive" ]; then HEAD='^# --archive'; LINES='^(# --archive|exec )'; VERDICT='^exec '
elif [ "$SB" = "config-lane" ]; then HEAD='^# --config-lane'; LINES='^(# --config-lane|leg |snapshot )'; VERDICT='^(leg|snapshot) '
else HEAD='^# --compare-all'; LINES='^(# --compare-all|✅|❌|  )'; VERDICT='^(✅|❌)'; fi
# The comparable lines: the header, each execution's line(s).
norm() { clean "$1" | grep -a -E "$LINES"; }
for f in "$BASE" "$NEW"; do
  norm "$f" | grep -a -q -E "$VERDICT" || { echo "✗ $f lists no execution"; exit 2; }
done
count() { norm "$1" | grep -a -c "^$2"; }
if [ "$SB" = "archive" ]; then
  echo "base: $(count "$BASE" 'exec ') executions   new: $(count "$NEW" 'exec ') executions   (archive lines: held count, refusal names, a hash of the held set)"
elif [ "$SB" = "config-lane" ]; then
  echo "base: $(count "$BASE" 'leg ') legs, $(count "$BASE" 'snapshot ') snapshots   new: $(count "$NEW" 'leg ') legs, $(count "$NEW" 'snapshot ') snapshots   (per leg: protocol, governing state in both states, force; per snapshot: read-back and governing)"
else
  echo "base: $(count "$BASE" '✅') ✅ / $(count "$BASE" '❌') ❌   new: $(count "$NEW" '✅') ✅ / $(count "$NEW" '❌') ❌   (absolute counts are history under today's rules, not the gate)"
fi
if diff <(norm "$BASE") <(norm "$NEW") > /dev/null; then
  if [ "$SB" = "config-lane" ]; then echo "✅ IDENTICAL on every leg and every snapshot — the change moved no stored leg's Config-sources state"
  else echo "✅ IDENTICAL on every execution — the change moved no capture"; fi
  exit 0
fi
# One block per execution, keyed by its id: the verdict line's second token (minus a trailing colon) and every line under it.
blocks() { norm "$1" | awk -v v="$VERDICT" '$0 ~ v { id=$2; sub(/:$/, "", id) } $0 ~ v || /^  / { print id "\t" $0 }'; }
ids() { blocks "$1" | cut -f1 | sort -u; }
only_base=$(comm -23 <(ids "$BASE") <(ids "$NEW")); only_new=$(comm -13 <(ids "$BASE") <(ids "$NEW"))
one_pass=$(printf '%s\n%s\n' "$only_base" "$only_new" | grep -a . | sort -u)
differing=$(diff <(blocks "$BASE") <(blocks "$NEW") | grep -a -E '^[<>]' | cut -f1 | sed -E 's/^[<>] //' | sort -u | grep -a -v -x -F -f <(printf '%s\n' "$one_pass" | grep -a . || echo '(none)'))
n=$(printf '%s\n' "$differing" | grep -a -c .)
m=$(printf '%s\n' "$one_pass" | grep -a -c .)
if [ "$n" -gt 0 ]; then
  echo "❌ DIFFERS on $n execution(s):"
  for id in $differing; do
    echo "  $id"
    echo "    base: $(blocks "$BASE" | grep -a "^$id	" | cut -f2- | head -1 | cut -c1-160)"
    echo "    new:  $(blocks "$NEW" | grep -a "^$id	" | cut -f2- | head -1 | cut -c1-160)"
  done
fi
if [ "$m" -gt 0 ]; then
  echo "❌ PRESENT IN ONE PASS ONLY: $m execution(s) — the population moved between the passes (not a moved capture):"
  for id in $only_base; do echo "  $id (base pass only)"; done
  for id in $only_new; do echo "  $id (new pass only)"; done
fi
if [ "$n" -eq 0 ] && [ "$m" -eq 0 ]; then
  echo "❌ the HEADER lines differ (the two passes did not read the same window or population count):"
  echo "    base: $(norm "$BASE" | grep -a -m1 -E "$HEAD" | cut -c1-200)"
  echo "    new:  $(norm "$NEW" | grep -a -m1 -E "$HEAD" | cut -c1-200)"
fi
exit 1
