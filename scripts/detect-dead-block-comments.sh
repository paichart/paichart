#!/usr/bin/env bash
#
# Dead Block Comment Detector
#
# Flags large multi-line /* ... */ comments containing executable-looking
# patterns. These are the bug class that fooled three fix attempts on
# 2026-05-13 (UpdatePOVSchemaInline in lib/pov/handlers/put.ts:265-364) and
# was observed FOUR times in the May 2026 types-cleanup session:
#
#   - UpdatePOVSchemaInline (95 lines, fooled 3 fix attempts before noticing)
#   - taskSearchService.ts:553 (39 lines)
#   - taskActivityService.ts:217 (24 lines)
#   - pov-original.ts (600+ lines as a whole shadow file)
#
# Block comments with executable code are misleading: future fixers edit
# inside the comment thinking it's live code, and the edits silently have
# no runtime effect. Use `git log -p path/to/file` for rollback reference
# instead. Don't leave live-looking code in comments.
#
# Heuristic: block comment > 20 lines AND contains an executable pattern
# (z.object, async function, prisma.X.find/create/update, export schema).
# Short JSDoc with code examples is allowed (under 20 lines).
#
# Bypass: `git commit --no-verify` (use sparingly with a documented reason).
#
# Created: 2026-05-14 (CODE-REVIEW-OBSERVATIONS item #1)
# Pattern reference: .claude/knowledge/patterns/two-execution-path-drift-pattern.md
# Registry: .claude/knowledge/domain/mcp/bug-class-registry.md § Bug Class 75
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Only check staged TS/JS files
staged=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx)$' || true)

if [ -z "$staged" ]; then
  exit 0
fi

violators=""

for file in $staged; do
  [ -f "$file" ] || continue
  # AWK scanner: find /* ... */ blocks, check size + executable patterns
  result=$(awk '
    BEGIN { in_block = 0; start_line = 0; block = ""; }
    /\/\*/ && !in_block {
      in_block = 1
      start_line = NR
      block = $0 "\n"
      # Single-line /* ... */ — check close on same line
      if (index($0, "*/") > 0) {
        in_block = 0
      }
      next
    }
    in_block {
      block = block $0 "\n"
      if (index($0, "*/") > 0) {
        in_block = 0
        block_lines = NR - start_line + 1
        if (block_lines > 20) {
          # Check for executable patterns inside the comment
          if (block ~ /z\.object\s*\(/ ||
              block ~ /async function/ ||
              block ~ /prisma\.[a-zA-Z_]+\.(create|find|update|delete|upsert|count|aggregate|groupBy)/ ||
              block ~ /export const [a-zA-Z_]+\s*=\s*z\./ ||
              block ~ /\.findMany\s*\(\s*\{/) {
            printf "%s:%d  (block spans %d lines, contains executable patterns)\n", FILENAME, start_line, block_lines
          }
        }
      }
    }
  ' "$file")
  if [ -n "$result" ]; then
    violators="${violators}${result}
"
  fi
done

if [ -n "$violators" ]; then
  echo ""
  echo "✗ pre-commit FAILED: dead block-comment detected"
  echo ""
  echo "Large block comments (>20 lines) containing executable-looking code"
  echo "are the anti-pattern that fooled three fix attempts on 2026-05-13"
  echo "(UpdatePOVSchemaInline). Future fixers edit inside the comment thinking"
  echo "it's live code, with no runtime effect."
  echo ""
  echo "Use 'git log -p path/to/file' for rollback reference instead."
  echo ""
  echo "Violators:"
  printf "%s" "$violators" | sed 's/^/  /'
  echo ""
  echo "To bypass with a documented reason: git commit --no-verify"
  exit 1
fi

exit 0
