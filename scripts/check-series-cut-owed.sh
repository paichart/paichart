#!/usr/bin/env bash
# check-series-cut-owed.sh — WARN (never block) when a push carries a SERIES CUT without a ledger entry.
#
#   scripts/check-series-cut-owed.sh <base> <head>     # e.g. origin/main HEAD
#   (also run by .githooks/pre-push for every ref being pushed)
#
# A series cut = a change to what a pipeline agent READS (protocol seeds, role guidance, template seeds, the §6 renderer, the
# chainer, the tool loop and read budget, the agent.results surface and lean card) or to
# how a stored FACT is computed (the mechanical nets, R9 sanitize, R10 redaction, held-edit facts). Every such deploy needs an
# entry in .claude/knowledge/pipelines/SERIES-CUT-LEDGER.md (CLAUDE.md § SERIES CUTS). The F9-s7 entry was missed at its push on
# 2026-10-31 and recorded late; this is the cheap reminder. It is a heuristic: a cut-relevant path that changed only a comment is
# a false warning (say so in the ledger as "NOT A SERIES CUT" or ignore it); a cut through a path NOT listed is missed — extend
# CUT_PATHS when a new fact producer or agent-facing text source ships. Exit code is always 0.
set -u
BASE="${1:-origin/main}"; HEAD="${2:-HEAD}"
LEDGER='.claude/knowledge/pipelines/SERIES-CUT-LEDGER.md'
CUT_PATHS='^(scripts/seed-protocol-prompts\.ts|scripts/seed-[a-z0-9-]*templates?\.ts|lib/services/agentTemplateBuilder/pAIchartUniversalTemplate\.ts|lib/agents/harness/(render-pipeline-context|render-rollback-containment|marker-presence|mechanical-nets|derivation-containment(-enrichment)?|value-leg-containment-enrichment|dialect-lint(-enrichment)?|quote-fidelity(-enrichment)?|rollback-containment(-enrichment)?|held-bytes-nets|held-edit-carrier|held-edit-correction|sanitize-chained-output|redact-artifact-secrets|build-agent-prompt-body|strip-tool-call-results|context-chainer|agentic-tool-loop|role-read-budget)\.ts|lib/services/execution-artifacts\.ts|lib/mcp/tasks/action/handlers/agent/agent-results-handler\.ts)$'
files=$(git diff --name-only "$BASE" "$HEAD" 2>/dev/null) || exit 0
cut=$(printf '%s\n' "$files" | grep -E "$CUT_PATHS" || true)
[ -z "$cut" ] && exit 0
if printf '%s\n' "$files" | grep -qxF "$LEDGER"; then
  echo "series-cut check: cut-relevant changes AND a ledger edit in this push ✓"
  exit 0
fi
echo "⚠️  series-cut check: this push changes what agents read or how a fact is computed, with NO edit to $LEDGER:"
printf '      %s\n' $cut
echo "    After the deploy lands, prepend a ledger entry (cut = the release's process restart; movers keyed on stored fields;"
echo "    rollback) and update the CLAUDE.md index — or record \"NOT A SERIES CUT\" if nothing an agent reads or a fact computes moved."
echo "    (warning only — the push continues)"
exit 0
