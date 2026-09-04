#!/usr/bin/env bash
#
# Discovery-Prompt Grep Audit
#
# Runs every grep in the knowledge base that STATES AN EXPECTATION, and compares
# the real result to the stated one. Protocol 11 Part C scopes it exactly this
# way: "every documented 'expect N' grep must be run and match before commit; a
# mismatch IS a finding."
#
# WHY: a drifted grep does not fail loudly — it returns ZERO and reads as "clean",
# so the next health-run passes while the thing it checks goes unverified. Three
# real instances in one session (2026-07-28):
#   - mcp-hub-discovery.md   `z\.union.*z\.string\.transform` went multi-line after
#                            a refactor; returned 0, read as "no union present".
#   - validation-discovery.md `detectInjection|validateSize` — neither symbol still
#                            exists; returned 0, read as "framework absent". Its
#                            `|| echo "0"` made a MISSING FILE indistinguishable
#                            from a genuine zero.
#   - PRODUCTION_OPERATIONS_GUIDE documented log paths that do not exist, so
#                            `grep -c` returned 0 — used twice to wrongly conclude
#                            "this has never happened in production".
#
# BIDIRECTIONAL, which is the point:
#   MISMATCH   result contradicts a documented "expect N" / "expect N+"
#   REGRESSION grep returns hits where the doc says "expect zero" — i.e. the thing
#              the grep was written to guard against has been REINTRODUCED. This
#              direction is the higher-value one; nothing else checks it.
#
# DELIBERATELY NOT AUDITED: greps with no stated expectation. They are exploratory,
# zero is often the correct answer, and including them produced 375 findings on the
# first run — noise on that scale guarantees the check gets ignored, which is the
# exact failure mode this script exists to prevent.
#
# Usage:
#   bash scripts/audit-discovery-greps.sh            # discoveries (default)
#   bash scripts/audit-discovery-greps.sh --all      # whole knowledge base
#   bash scripts/audit-discovery-greps.sh --verbose  # show passes too
#
# Exit: 0 = clean, 1 = findings
# Created: 2026-07-28
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

SCOPE=".claude/knowledge/discoveries"
VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    --all)     SCOPE=".claude/knowledge" ;;
    --verbose) VERBOSE=1 ;;
  esac
done

EXTRACTOR="$(mktemp)"
trap 'rm -f "$EXTRACTOR"' EXIT
cat > "$EXTRACTOR" <<'PYEOF'
import os, re, sys
scope = sys.argv[1]
EXP_MIN  = re.compile(r'(?:should be|expect(?:ed)?\s*:?)\s*(\d+)\s*\+', re.I)
EXP_ZERO = re.compile(r'expect(?:ed)?\s*:?\s*(zero|0\b|no hits|none)', re.I)
EXP_N    = re.compile(r'expect(?:ed)?\s*:?\s*(?:exactly\s*)?(\d+)', re.I)
UNSAFE   = re.compile(r'[;&`]|\$\(|\|\s*(rm|mv|tee|xargs)\b')

def split_cmd_comment(line):
    """Split a shell line into (command, trailing-comment) the way bash does.

    `#` begins a comment ONLY at the start of a word and ONLY outside quotes —
    `grep "#define" lib/x.ts` is a command, not a command plus a comment. A naive
    line.split('#') truncates that into a DIFFERENT, still-runnable command, which
    is a worse failure than the one this function exists to fix.
    """
    in_s = in_d = esc = False
    for i, ch in enumerate(line):
        if esc:
            esc = False; continue
        if ch == '\\':
            esc = True; continue
        if ch == "'" and not in_d:
            in_s = not in_s; continue
        if ch == '"' and not in_s:
            in_d = not in_d; continue
        if ch == '#' and not in_s and not in_d and (i == 0 or line[i-1].isspace()):
            return line[:i], line[i+1:]
    return line, ''

for root, _, files in os.walk(scope):
    for fn in sorted(files):
        if not fn.endswith('.md') or '.backup' in fn:
            continue
        path = os.path.join(root, fn)
        try:
            lines = open(path, encoding='utf-8').read().split('\n')
        except UnicodeDecodeError:
            # A file no UTF-8 scan can read is itself a finding — it drops silently
            # out of every sweep and makes them look complete.
            print(f"{path}\t0\tENCODING\t-")
            continue
        for i, line in enumerate(lines):
            if not re.match(r'^grep\s', line):
                continue
            if not re.search(r'\b(lib|app|scripts|prisma)/', line):
                continue
            # SCOPE THE SAFETY TEST TO THE COMMAND, NOT THE LINE (fixed 2026-08-08).
            # It used to test the whole line, comment included — so a markdown
            # backtick or a semicolon in the PROSE of an expectation comment removed
            # that grep from the audit, silently, while the run still printed
            # "every documented expectation still holds". 27 greps across 7 discovery
            # files were excluded that way, ~30% of the documented corpus, and the
            # 2026-07-28 "CLEAN baseline" was measured without them. Worse, the
            # 2026-07-28 pass that reworded un-parseable prose arithmetic could not
            # SEE those 27, so two of them still carry the old broken form today.
            # Characters after an unquoted `#` are inert to bash, so testing them
            # bought no safety and cost a third of the coverage.
            # Expectation may be an INLINE trailing comment on the grep line itself
            # (`... # expect 0`) or on the following lines. Read the inline one FIRST:
            # reading only the lookahead mis-attributed a NEIGHBOURING grep's
            # expectation to this one, which is what produced most of the first run's
            # findings — including reporting "expects ZERO" for a line whose own
            # comment said "# expect 1".
            # ONLY the grep's OWN inline comment. Lookahead attribution was tried and
            # abandoned (2026-07-28): these docs state expectations in free prose, often
            # BEFORE the grep in an echo line, or attached to a following `npm run`. Every
            # sampled lookahead finding was a mis-attribution —
            #   pipeline-harness:906  took "EXPECT 26 pass" from an npm run two lines down
            #   auth-permissions:825  took the NEXT block's "should be 31+"
            #   auth-permissions:1245 compared "5 endpoints" against 190 CONTEXT lines
            #                         emitted by -B5 -A10 — different units entirely
            # An inline `# expect N` is unambiguous about which command it describes.
            cmd_part, look = split_cmd_comment(line)
            if   EXP_MIN.search(look):  exp = 'MIN:'   + EXP_MIN.search(look).group(1)
            elif EXP_ZERO.search(look): exp = 'ZERO'
            elif EXP_N.search(look):    exp = 'EXACT:' + EXP_N.search(look).group(1)
            else:                       continue
            # Expectation-first, THEN safety: a grep with no stated expectation is
            # out of scope by design, so counting it as "skipped" would be noise.
            if UNSAFE.search(cmd_part) or '$' in cmd_part:
                # REPORTED, never silent. Silent skipping is the root cause of the
                # 2026-08-08 hole — the regex scope was only its instance. An
                # exclusion that shows up in the summary cannot hide a third time.
                print(f"{path}\t{i+1}\tUNSAFE\t{line}")
                continue
            print(f"{path}\t{i+1}\t{exp}\t{line}")
PYEOF

mapfile -t ENTRIES < <(python3 "$EXTRACTOR" "$SCOPE")

mismatch=0; regression=0; checked=0; skipped=0

echo "=================================================="
echo " Discovery-Prompt Grep Audit   (scope: $SCOPE)"
echo " auditing only greps with a DOCUMENTED expectation"
echo "=================================================="
echo

for entry in "${ENTRIES[@]}"; do
  IFS=$'\t' read -r file line expect cmd <<< "$entry"

  if [ "$expect" = "ENCODING" ]; then
    echo "  ⚠️  NOT UTF-8 — silently skipped by every scan: $file"
    mismatch=$((mismatch+1)); continue
  fi

  # A documented expectation we decline to run. Counted and named, not dropped.
  if [ "$expect" = "UNSAFE" ]; then
    skipped=$((skipped+1))
    [ "$VERBOSE" -eq 1 ] && echo "  ·  skipped (unsafe command): $file:$line"
    continue
  fi

  # Run the EXACT text. Never round-trip through eval: that mangles regex escaping
  # and produced 7 false "zero hit" reports on 2026-07-28, including on greps that
  # had been proven working hours earlier.
  #
  # `grep -c` prints a COUNT (one line, or `file:count` per file with -r), so piping
  # it to `wc -l` yields 1 regardless of the real number — that single mistake
  # produced the bulk of this script's first-run findings. Read the value instead.
  raw=$(bash -c "$cmd" 2>/dev/null)
  if echo "$cmd" | grep -qE '(^|\s)grep\s+(-[a-zA-Z]*c[a-zA-Z]*)(\s|$)'; then
    hits=$(echo "$raw" | awk -F: '{ n = (NF>1 ? $NF : $0); if (n ~ /^[0-9]+$/) s += n } END { print s+0 }')
  else
    # `grep -c` already prints 0 on no-match; a `|| echo 0` would append a SECOND 0.
    hits=$(printf '%s' "$raw" | grep -c . 2>/dev/null)
    [ -z "$hits" ] && hits=0
  fi
  checked=$((checked+1))

  # -A/-B/-C emit CONTEXT lines, so a line count is not comparable to a documented
  # entity count. Skip numeric judgement for those; ZERO is still meaningful.
  if [ "$expect" != "ZERO" ] && echo "$cmd" | grep -qE '(^|\s)-[ABC][0-9]|(^|\s)-[ABC]\s'; then
    [ "$VERBOSE" -eq 1 ] && echo "  ·  context-flag grep, numeric check skipped: $file:$line"
    continue
  fi

  bad=""
  case "$expect" in
    ZERO)    [ "$hits" -gt 0 ] && bad="R|doc expects ZERO, got $hits — what this guards against is back" ;;
    EXACT:*) w="${expect#EXACT:}"; [ "$hits" -ne "$w" ] && bad="M|doc expects exactly $w, got $hits" ;;
    MIN:*)   w="${expect#MIN:}";   [ "$hits" -lt "$w" ] && bad="M|doc expects $w+, got $hits" ;;
  esac

  if [ -n "$bad" ]; then
    msg="${bad#*|}"
    if [ "${bad%%|*}" = "R" ]; then
      echo "  🔴 REGRESSION  $file:$line"; regression=$((regression+1))
    else
      echo "  ⚠️  MISMATCH    $file:$line"; mismatch=$((mismatch+1))
    fi
    echo "       $msg"
    echo "       \$ $cmd"
  elif [ "$VERBOSE" -eq 1 ]; then
    echo "  ✅ $file:$line  hits=$hits (expect $expect)"
  fi
done

echo
echo "=================================================="
echo "  audited      : $checked  (greps with a stated expectation)"
echo "  ⚠️  mismatch  : $mismatch"
echo "  🔴 regression : $regression"
if [ "$skipped" -gt 0 ]; then
  echo "  ·  skipped    : $skipped  (documented, but command unsafe to run — NOT verified;"
  echo "                  re-run with --verbose to name them)"
fi
echo "=================================================="

if [ "$((mismatch + regression))" -gt 0 ]; then
  echo
  echo "Fix the grep to match the PROPERTY, not the code's current layout — a"
  echo "single-line regex over a formatted schema breaks on reformatting alone."
  echo "And re-run it before writing the new expectation down (Part C)."
  exit 1
fi
echo
echo "✅ every documented expectation still holds"
exit 0
