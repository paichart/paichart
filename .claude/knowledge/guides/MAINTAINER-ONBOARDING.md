# Maintainer onboarding — the rules that keep pAIchart safe to change

**Who this is for:** someone joining to maintain the platform. **Read this page first.** It names the rules and the script or test that
enforces each one, then points to where everything lives. Everything else is detail you look up when a rule sends you there.

**The one idea:** the platform is trusted because a computed fact can only make an outcome stricter, and every change to what agents
read or how a fact is computed has to prove it broke nothing before it ships. Every rule below protects one half of that sentence.

---

## The rules

| # | Rule | Why | What enforces it |
|---|---|---|---|
| 1 | **Facts only tighten.** A computed fact may turn an approval into a refusal, never the reverse. Confidence is never a pass mark. | A reviewer deciding alone released 2 wrong legs to block 1 (2026-08-29). | Pattern #71 `patterns/facts-only-tighten-pattern.md`; code structure (overrides only write the stricter value); the verdict-mismatch guard tests |
| 2 | **Lab before an agent-text or model change.** Pre-register the rule, score both directions, and replay the golden set. | A text that passed its own tests failed a reviewer in the lab (2026-10-28). | Protocol 16 (`protocols/pre-registered-lab-gate-protocol.md`); the lab's spend gate refuses a run with no `goldenSet` declared |
| 3 | **Replay before a fact change.** Old code against new over every stored run; zero unexplained changes. | Quote-check v6 had green tests and would have moved 2 correct outcomes (2026-10-31). | `scripts/replay-nets-byte-identity.sh --snapshot` (read-only snapshot); a person reads every mover |
| 4 | **Canary after an agent-text deploy.** Re-run the latest released program; it must release again before the next text change. | Regression is the main risk once things work. | `npm run report:canary-plan` (prints the launch, filled in) → launch through MCP → `npm run report:canary` (the verdict); `pipelines/LIVE-WINDOW-CHECKLIST.md` § canary |
| 5 | **Gates in a clean copy before a push.** | The checkout is shared; a gate can pass on someone else's edit. | `scripts/run-gates-clean.sh` |
| 6 | **Never push while a pipeline run is in flight.** A push to main deploys, and the restart orphans running executions. | | `scripts/ship.sh` refuses |
| 7 | **A series-cut entry for every change to what agents read or how a fact is computed.** Key on stored fields, never time. | Comparing across an unrecorded cut reads a population change as a behaviour change. | The `.githooks/pre-push` warning; `scripts/series-cut-draft.sh`; `pipelines/SERIES-CUT-LEDGER.md` |
| 8 | **Templates are reseeded by hand after a role-guidance change.** The deploy seeds protocols only. | A correct fix can sit unused while agents run old text. | `npm run report:template-freshness` names stale roles; run the owning seed script |
| 9 | **Commit by pathspec in the shared checkout:** `git commit -- <paths>`, and check the hunks of shared files. Never `git stash` or `git reset`. | Other sessions have uncommitted work in the same tree. | Habit plus the pre-commit hooks; `domain/harness/pipeline-harness-library.md` § shared-worktree hygiene |
| 10 | **The register is the source of truth.** "Filed" means written in it; a closed item moves to the archive in the same commit. Customer claims follow the MVP statement §3, changed only by the owner. | Status copied into several places drifts. | `.claude/KNOWLEDGE-BASE-GUIDELINES.md`; `cline_docs/reviews/mvp-statement-2026-11-01/MVP-STATEMENT.md` |

**Standing rules that are not about code:**
- No AI co-author trailers on commits.
- Agents stay read-only.
- Production access is read-only unless the owner asks.
- Never stop cloudflared on the production host.
- Public material carries no IPs, hostnames, run ids or secrets.

## The daily workflow — three commands

```
scripts/run-gates-clean.sh                 # lint, naming, access checks, full battery, golden set, build — in a clean copy
scripts/ship.sh                            # shows what goes out, refuses if a run is in flight, pushes, watches Production Deploy
GATES=1 scripts/ship.sh                    # same, but a deploying push first passes the full gates + the public export dry-run (each on its own exit status)
scripts/series-cut-draft.sh <push time>    # only if the push changed what agents read or how a fact is computed
```

**Which gate a change needs** (Protocol 16 § standing no-regression rule):

| Change | Gate before shipping |
|---|---|
| Docs, alerts, test tooling | the battery |
| How a stored fact is computed | the replay (rule 3) |
| Agent-facing text, or a model change | a lab plus the golden set (rule 2), then the canary (rule 4) |
| Text that only the program root reads (a lab cannot replay it) | a pre-registered live control on the canary |

## Where things live

| You need | Look in |
|---|---|
| What is open, parked, an idea, or done | `cline_docs/follow-ups/OPEN-REGISTER-2026-09-23.md`, `REGISTER-PARKED.md`, `REGISTER-IDEAS.md`, `REGISTER-ARCHIVE-2026.md` |
| Picking up where someone left off | the latest `cline_docs/follow-ups/*continuation*.md`; the working-record map in `.claude/KNOWLEDGE-BASE-GUIDELINES.md` |
| What changed when (for comparing numbers) | `.claude/knowledge/pipelines/SERIES-CUT-LEDGER.md` |
| A live run's record | `cline_docs/reviews/<topic>/RUN-SHEET.md` or `WINDOW-RUN-SHEET.md` |
| How to run a program | `pipelines/OPERATOR-RUNBOOK.md` (gate evidence: `npm run report:gate -- <gate id>`) |
| How to read a run | `pipelines/walkthroughs/READING-A-RUN.md` |
| How to investigate one | `pipelines/PIPELINE-RUN-FORENSICS-GUIDE.md`, `pipelines/PROGRAM-RUN-FORENSICS-GUIDE.md` |
| Proven implementation patterns | `patterns/PATTERN-REGISTRY.md` |
| The quarterly health run | `guides/HEALTH-RUN.md` (the full procedure; CLAUDE.md keeps the dates and the list of checks — next due 2026-11-29) |

## The specialists you will use most

There are 41 specialists (`.claude/agents/`), each owning one domain. Day to day, these six cover most work:

| Specialist | Owns |
|---|---|
| `pipeline-harness-specialist` | the coordinator: programs, gates, protocols as a whole, decisions, the register |
| `execution-facts-specialist` | how facts are computed: the mechanical checks, replays, fixtures |
| `model-evaluation-specialist` | labs, the golden set, model choices |
| `prompt-construction-specialist` | the protocol text agents read |
| `template-system-specialist` | role guidance and templates |
| `sec-ops-specialist` | security review of any change touching secrets, access or a public surface |

**Before changing anything,** run the owning specialist's discovery prompt: understand before you modify (Protocol 1).

## Your first week

1. Read `pipelines/OPERATOR-RUNBOOK.md` and `walkthroughs/READING-A-RUN.md`, then one domain walkthrough.
2. Read one released run end to end in its run sheet. The telemetry program, `telemetry-held-program-2026-10-28/RUN-SHEET.md`, is a
   good one.
3. Run `scripts/run-gates-clean.sh` once, so you know what green looks like.
4. Make a docs-only change and ship it with `scripts/ship.sh`.
5. Read the open register's active items with the coordinator.
