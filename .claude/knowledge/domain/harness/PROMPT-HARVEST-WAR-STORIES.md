# Continuation Prompt: Harvest War Stories for the arxiv Paper

**Purpose**: Use this prompt at the start of any Pipeline Harness session (past or active) to extract idiosyncratic engineering stories — the kind of "we chased this bug for three hours and the root cause was surprising" anecdotes that give a research paper an unmistakably human voice. The stories are destined for `WHITEPAPER-ARXIV-v1.md` and `WHITEPAPER-REFERENCE-v1.md`.

**Why this matters**: LLM-generated academic writing has predictable tells — symmetry, hedging, exhaustive enumeration, mechanical parallelism. The most effective defense is to bury 3-6 genuinely human observations in the paper that an LLM would never invent on its own. The `WHITEPAPER-ARXIV-v1.md` draft already has three: (a) the template registry and harness prompt drifting out of sync for about a day, (b) a harness cheerfully writing a celebratory summary despite rate-limit failures leaving three of four children incomplete, and (c) an Australian customer's pipeline referencing ASD Essential Eight and APRA CPS 234 without the harness prompt mentioning either framework. We need more, and the richest source is other harness sessions.

**What to do with the harvested stories**
                                                                        
  When WAR-STORIES-HARVEST.md has content, come back to this session (or a new paper-editing session) and:                                      
                                                                                                                                                
  1. Review each story — kill duds, keep the vivid ones                                                                                         
  2. Fold the best 3-5 into WHITEPAPER-ARXIV-v1.md at the suggested placement                                                                   
  3. Add a hidden source comment so the lineage survives: <!-- story: X, harvested from session Y, date -->
  4. Target 6-8 total stories in the final paper (you have 3 right now)                                                                         
                                                                                    
  The sweet spot is fewer than 10 — you want the paper to read like engineering research, not a devlog.                 
---

## Paste this into a new harness session

> I am harvesting engineering war stories from the Pipeline Harness development history for an arxiv paper draft. The paper is at `.claude/knowledge/domain/harness/WHITEPAPER-ARXIV-v1.md` and the comprehensive reference is at `.claude/knowledge/domain/harness/WHITEPAPER-REFERENCE-v1.md`.
>
> The goal is not to write prose for the paper — I will do that myself. The goal is to extract **specific, unexpected, human-sounding anecdotes** from this session's history (git log, cline_docs, conversation context, anything in scope) that the paper author can fold into the draft to counter the "sounds AI-generated" critique.
>
> **What counts as a good war story:**
>
> 1. **Specific and concrete** — exact error messages, exact file names, exact line numbers where possible. "A session ID collision" is vague; "two executions both claimed execution ID `cmnjoo31t` within 17ms of each other and the CAS pattern saved us" is a story.
>
> 2. **Unexpected** — the failure mode was not what we expected from the design. The kind of thing where the root cause surprised us.
>
> 3. **Has a character arc** — what broke, how long it took to diagnose, what the surprise was, what the fix was. Ideally 2-4 sentences.
>
> 4. **Hard for an LLM to invent** — involves specifics that only someone present for the event could know. Wall-clock durations, specific log messages, odd coincidences, how many tries it took to get it right, what the first wrong hypothesis was.
>
> 5. **Either a bug or an emergence** — the system failing in a weird way counts; the system succeeding in a way we did not expect also counts. Example of the second: the harness independently designing a parallel dependency graph when the prompt specified only that dependencies should be explicit.
>
> **Stories already captured** (do not re-report these — I have them):
>
> - Template registry and harness prompt drifted out of sync for about a day; every new template required a prompt edit.
> - A rate-limited harness wrote a celebratory summary despite leaving three of four children incomplete; the summary read almost exactly like an actual success summary. Led to the self-completion guard.
> - Australian POV context propagated ASD Essential Eight, APRA CPS 234, and Privacy Act 1988 into a security task description without the harness prompt enumerating regional frameworks.
> - Production deployment restart killed mid-pipeline execution, leaving two zombie RUNNING records in the database. Led to the orphaned execution watchdog.
> - Non-linear dependency graph emerged in Experiment 4 — three parallel roots, synthesis fan-in — not prompted.
> - Cross-phase stage distribution emerged in Experiment 4 — harness placed tasks across two phases without being told which phase for which task type.
> - `agent-results-handler.ts` had an inline DEMO_USER-only access check instead of calling `validatePOVAccess`; found by routine audit, not by incident. Three specialists confirmed the gap.
> - TRUSTED_PROXY environment variable was not set, causing all users to collapse into a single rate-limit bucket. Found by specialist review, not by load failure.
> - PgBouncer hint was enabled unconditionally in `lib/prisma.ts`, disabling Prisma prepared statements for a PgBouncer that was not actually running — ~10-15% query performance loss for no benefit.
> - Web search tool was being added to every agent execution "for testing" regardless of configuration. Confirmed by reading the chunks on production; zero evidence agents were actually using it, but the tool definition itself cost tokens.
>
> **What I want from you:**
>
> Scan this session's context, git log, cline_docs, conversation history, and any relevant files. Return **5-10 war stories** in this format:
>
> ```
> ### Story: [one-line title]
>
> **What happened:** [1-2 sentences — the concrete event]
>
> **Why it was surprising:** [1 sentence — what made this memorable]
>
> **Resolution:** [1-2 sentences — what we did, with file/commit references if possible]
>
> **Paper relevance:** [where in the paper this could go — e.g., "Section 4.14 self-completion guard backstory" or "Section 5 Experiment 3 fragility story"]
> ```
>
> If a story does not fit all four elements, include it anyway and flag the missing element. Incomplete stories are still useful; I can dig deeper on the good ones.
>
> **What to avoid:**
>
> - Do not report general architectural decisions (those are in the paper already).
> - Do not report things that worked smoothly from the start.
> - Do not invent or speculate — only report things for which you can cite specific evidence from this session.
> - Do not return a list longer than 10; pick the most vivid.
>
> **Where to write:**
>
> Append your findings to `.claude/knowledge/domain/harness/WAR-STORIES-HARVEST.md`. If the file does not exist, create it with a top-level heading noting which session produced the stories (e.g., `## From session: <session name or date>`). If the file exists, append under a new session heading. Do not overwrite or reorder existing content.

---

## Usage tips

1. **Run this prompt in multiple sessions** — each session's git history and conversation context is different. Running it in 3-4 different historical sessions will surface different stories.

2. **Review `WAR-STORIES-HARVEST.md` manually** — some extracted stories will be duds (too vague, already known, not interesting). That's fine. The ones that pass the human-quality bar get folded into `WHITEPAPER-ARXIV-v1.md`.

3. **Promoted stories get an attribution comment** — when you fold a story into the paper, add a hidden source comment like `<!-- story: zombie RUNNING records, harvested from session X, 2026-04-06 -->` so the lineage survives.

4. **Don't ask a session to *write* the paper prose** — the prompt explicitly tells the harvesting agent not to. The voice pass happens in one place (this paper-editing session) to keep it consistent. Distributed prose generation produces jarring tonal shifts.

5. **Stories are the best defense against AI-detector flags**. LLM detectors look for symmetry, hedge density, and lack of concrete specificity. A paper with 6-8 concrete engineering anecdotes embedded in the right places is much harder to flag than one without them.

---

## Target placement in the arxiv paper

When war stories come in, here are the natural insertion points:

| Paper section | Story type | Current count |
|---------------|-----------|---------------|
| §3.1 Six Capabilities | Specific "we learned this the hard way" per capability | 3 (drift, self-completion, regional framework) |
| §3.3 Context Chaining | Why we moved the chainer to a pre-execution hook specifically | 1 (agent omissions were routine) |
| §4 Design Decisions | A memorable incident that motivated each decision | 2 (TRUSTED_PROXY, POV access gap) |
| §5 Experiments | Fragility stories, unexpected successes, incident recovery | 3 (Exp 3 plan-to-execute, Exp 5 zombies, Exp 4 emergent) |
| §6.2 Scalability | The "found by code review, not by load failure" angle | 1 (existing) |

The sweet spot is 6-8 stories total across the paper. Fewer than 4 and the paper still feels mechanical; more than 10 and it starts to feel like a devlog rather than a research paper.

---

## Version

- **v1** (2026-04-06): Initial prompt for war-story harvesting across sessions
