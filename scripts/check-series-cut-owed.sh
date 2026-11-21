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
# SERIES-CUT-PATHS-GAP (2026-11-04, found shipping Config-sources push 0): the list had drifted — 13 of the 22 modules mechanical-nets.ts
# imports were missing, so most fact changes shipped unflagged. It is now PROPERTY-shaped where it can be (every `*-enrichment.ts`, every
# held-bytes module) and `scripts/test-series-cut-paths.ts` fails when any module the nets import is not covered.
# + execution-nets.ts / execution-core.ts (2026-11-16, PLATFORM-DRIFT-CALLS-DROPPED): the hop that hands the nets their inputs; a change
#   there moved a stored fact (gitLiveDrift) and this list did not flag it.
# + prepare-task-for-execution.ts / net-context.ts (2026-11-21, Config sources STEP 3 P0, W19): the first-execution stamp writer takes
#   the declaration snapshots every Device- and Config-sources fact governs from, and net-context builds the inputs every net reads
#   (the leg's declarations, the chained record, the read record) — a change to either can move a stored fact with no net file touched.
#   (`file-source-compare.ts` joins this list in the slice that creates it, P3 — a path for a file not in the tree pins nothing.)
CUT_PATHS='^(scripts/seed-protocol-prompts\.ts|scripts/seed-[a-z0-9-]*templates?\.ts|lib/services/agentTemplateBuilder/pAIchartUniversalTemplate\.ts|lib/agents/harness/(render-pipeline-context|render-rollback-containment|marker-presence|mechanical-nets|derivation-containment(-enrichment)?|value-leg-containment-enrichment|dialect-lint(-enrichment)?|quote-fidelity(-enrichment)?|rollback-containment(-enrichment)?|held-bytes-nets|held-edit-carrier|held-edit-correction|sanitize-chained-output|redact-artifact-secrets|build-agent-prompt-body|strip-tool-call-results|context-chainer|agentic-tool-loop|role-read-budget)\.ts|lib/services/execution-artifacts\.ts|lib/mcp/tasks/action/handlers/agent/agent-results-handler\.ts|lib/agents/harness/[a-z0-9-]+-enrichment\.ts|lib/agents/harness/(apply-block-placeholder|chained-record|net-context|prepare-task-for-execution|device-source-facts|device-sources|device-sources-read|git-device-comparison|net-registry|package-form-check|validation-tool-calls|live-evidence|live-evidence-render|config-hierarchy|config-sources|config-sources-read|config-source-facts|git-live-drift|plan-witness|platform-drift-run|plan-spawn-carry|service-descriptors-derivation)\.ts|lib/agents/harness/held-bytes/[a-z0-9-]+\.ts|lib/services/(held-bytes-capture|platform-drift|execution-nets|execution-core)\.ts|lib/mcp/server/config/(git-file-source-pin|service-call-policy|platform-drift-call)\.js)$'
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
