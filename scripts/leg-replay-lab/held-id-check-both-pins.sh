#!/bin/bash
# held-id-check-both-pins.sh — G-HOLD-ID across the 2026-11-11 pin cut ($0, read-only on production).
#
# WHY: `held-id-check` rebuilds every production Harvester's held files with the pin THIS process loads. Production's Git file
# source pin moved from paichart/paichart-lab-configs to paichart/paichart-configs on 2026-11-11, and the pin is not stored per
# execution — so no single pin rebuilds the whole population (2026-11-15: 105 / 123 refs under the former pin, 88 / 123 under the
# current one, and NO execution fails under both). An execution reproduces when it reproduces under the pin in force when it ran;
# this runs the check under each pin and fails only for an execution that reproduces under NEITHER.
#   bash scripts/leg-replay-lab/held-id-check-both-pins.sh
# Exit 0  every execution reproduces under one of the two pins        Exit 1  at least one reproduces under neither (listed)
# Exit 2  a pass did not complete (no G-HOLD-ID line) — never read as a pass
set -u
HERE="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$HERE"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT; umask 077
PINS=("paichart/paichart-lab-configs" "paichart/paichart-configs")
for i in 0 1; do
  GIT_FILE_SOURCE_PIN="${PINS[$i]}" npx ts-node -r tsconfig-paths/register scripts/leg-replay-lab/lab.ts held-id-check > "$T/p$i.out" 2>&1
  line="$(grep -a -v '^{"level"' "$T/p$i.out" | grep -a -m1 '^G-HOLD-ID:')"
  [ -n "$line" ] || { echo "✗ the pass under ${PINS[$i]} did not complete:"; grep -a -v '^{"level"' "$T/p$i.out" | tail -5; exit 2; }
  echo "pin ${PINS[$i]}: ${line#G-HOLD-ID: }" | cut -c1-150
  # the executions with a mismatch under this pin: the id that starts each mismatch line (after the ❌ on the first, indented on the rest)
  grep -a -v '^{"level"' "$T/p$i.out" | grep -a -E 'not in the lab store|lab holds [0-9]+ file|no result\.json|L-1' \
    | sed -E 's/^(❌ +| +)//' | awk '{ id=$1; sub(/:$/, "", id); print id }' | sort -u > "$T/fail$i"
done
comm -12 "$T/fail0" "$T/fail1" > "$T/both"
n=$(grep -c . "$T/both")
echo "executions with a mismatch: former pin $(grep -c . "$T/fail0") · current pin $(grep -c . "$T/fail1") · under BOTH $n"
if [ "$n" -eq 0 ]; then echo "✅ G-HOLD-ID holds across the pin cut: every held Harvester reproduces under the pin in force when it ran"; exit 0; fi
echo "❌ reproduces under NEITHER pin:"; sed 's/^/   /' "$T/both"; exit 1
