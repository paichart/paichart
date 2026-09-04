# War Stories Harvest

> Cross-session collection of idiosyncratic engineering anecdotes for the arxiv paper. Each section is a harvest from a different session. See `PROMPT-HARVEST-WAR-STORIES.md` for the extraction methodology. Stories marked `[promoted]` have been folded into `WHITEPAPER-ARXIV-v1.md`.

---

## From session: Whitepaper refinement session, 2026-04-06

Harvested from this session's git log (commits de71150c through 19e0fa3f), tool-result caches, and direct conversation context. This session implemented scalability fixes, ran concurrency stress tests, fixed a medium-severity access control gap, migrated legacy handlers, and drafted the arxiv paper.

### Story: The rate limit that was silent on 429s

**What happened:** During pipeline orchestration testing, the harness started failing with "Rate limit exceeded" errors but the server logs showed nothing. Zero pino entries, zero warning-level messages. The rate limiter was firing and returning 429 responses to clients without logging a single event server-side.

**Why it was surprising:** We had pino structured logging everywhere else in the codebase and assumed rate limit events were captured. They were not — `lib/utils/rate-limiter.ts` had no imports from `@/lib/logger` at all. The entire module was silent.

**Resolution:** Added pino `warn`-level logging to `checkRateLimit()` with `{identifier, remaining, retryAfterSec}` structured context (commit `367f5d71`). Took ~20 minutes including finding the right logger child for the module domain. The fix had to be made correctly because our rate limit monitoring integration (Section 4.17) depends on grep-parseable log lines.

**Update 2026-04-08 (Bug Class 73 eradication, Finding #10):** The `367f5d71` fix turned out to be in the WRONG function. `checkRateLimit()` is a helper used only by `lib/api-handler.ts` (the Next.js `/api/*` path). All MCP handlers (`service-registration-handler`, `task-action-handler`) call `RateLimiter.checkLimit()` directly — the class method — which had no log at all. So for the 6+ weeks after `367f5d71` shipped, **MCP 429s remained entirely silent end-to-end**. The Phase 3 UAT smoking-gun test (310 programmatic calls via ts-node on the UAT box) confirmed this — the .ts class was active and correctly denied 10 calls but emitted zero pino entries. Fix: commit `12a4d6db` moved the `log.warn({module:'RateLimiter'})` into the class method itself so every caller (MCP + api-handler) fires exactly one entry per denial. Verified: 310 calls → 300 allowed + 10 denied + 10 structured pino entries. **The original war story is still true for the `api-handler.ts` path; the BC73 fix completes the story for the MCP path.**

**Paper relevance:** §4.17 Scalability Architecture, or the §6.2 "found by code review, not by load failure" discussion. A small but pungent example of how invisible things break — and of how "fixed" bugs can stay half-broken for weeks when the fix is in the wrong place.

---

### Story: The write rate limiter had two separate bugs the specialist review missed

**What happened:** While investigating rate limit errors during parallel harness execution, we found three rate limiters in the codebase that could fire: the MCP HTTP middleware (300 req/min, we already thought we'd raised), the enhanced rate limiter in `middleware/rate-limiter-enhanced.ts`, and the write operation limiter in `lib/utils/rate-limiter.ts`. The failure was coming from the third one, which was set to **30 req/min**. Nobody had touched it because nobody knew about it.

**Why it was surprising:** The MCP tasks/action endpoint handles both reads (`agent.status`, `task.list`) and writes (`task.create`, `agent.execute`) through a single POST route with the `write` rate limiter. So our polling calls for execution status were counting against the write limit, and at 30/min we hit the ceiling inside 2 minutes of a normal pipeline poll cycle.

**Resolution:** Raised to 300 req/min in `lib/utils/rate-limiter.ts` (commit `e65d2b4e`). The fix was one line; finding the right line took 40 minutes because three different rate limiters were candidates. The lesson learned — and now documented in the paper — is that GET-like actions going through a POST-style MCP endpoint inherit the POST endpoint's write limits, which is unintuitive and needs explicit documentation.

**Paper relevance:** §4.17 Scalability Architecture. Reinforces the "this is invisible until it fires" theme. Could also go in §6.2.

---

### Story: The integrity test that never existed

**What happened:** While writing the honesty pass on the whitepaper, I noticed Section 4.18 claimed "a grep-based integrity test now flags any MCP handler file missing a `validatePOVAccess` invocation (with `pov.create` allowlisted because there is no pre-existing POV to validate against)." I could not remember writing that test. Steve asked to verify. I searched `tests/` and `__tests__/` — no such test. I had just confidently asserted a test existed because it *should* have existed and because the rest of the paragraph was about POV access coverage discipline.

**Why it was surprising:** This is the kind of confabulation that the "honesty pass" was specifically designed to catch, and I was the one writing it. The claim was plausible enough that it would have survived most human reviews — a reader assumes a grep test is a trivial thing that someone probably added. The fix was to rewrite the sentence as "As a follow-up, such a test would convert the current audit-driven detection into a continuously-enforced invariant. This test is not yet implemented and is tracked as a future item."

**Resolution:** Fixed in commit `46a5df20` (the honesty pass). The paper's Threats to Validity section was partly motivated by this incident — if we were confabulating about our own tests, what else were we confabulating about?

**Paper relevance:** §6.3 Threats to Validity backstory, or a footnote somewhere. This is the kind of story that makes Threats to Validity feel earned rather than performative.

---

### Story: The web search tool nobody asked for

**What happened:** While scanning for cost drivers in agent executions, I discovered that `lib/services/llm/anthropic-sdk-provider.ts` had a code path that added the `web_search` tool to every agent execution "for testing," regardless of whether the template actually needed it. The comment literally said "for testing." It had been there long enough to be deployed to production.

**Why it was surprising:** Zero evidence agents were actually *using* web search — we grep'd the execution artifacts and found no search calls. But the tool definition itself was being serialized into every LLM request, costing tokens per call. Token budgets include tool schemas; a web search tool schema with max_uses and domain filters is not free. The code comment made it look intentional ("for testing") but there was no corresponding test.

**Resolution:** Removed the unconditional injection in the session (part of the `TaskType` rationalization work at commit `8fc8fce8`). Kept the code path behind an explicit template flag so templates that need web search can still opt in. The more interesting finding was not the removal but the fact that an `if (true) // for testing` had survived into production; this is the kind of audit finding that is hard to catch with integration tests.

**Paper relevance:** §4.17 as a minor scalability hygiene item, or §6.2 as a "found by review" example. The "comment said `for testing`" detail is a human-voice flourish worth keeping.

---

### Story: The handler migration that was blocked by a handler that wasn't a duplicate

**What happened:** We planned to migrate two legacy agent handlers (`lib/mcp/handlers/agent-status-handler.ts` and `agent-results-handler.ts`) into the standard location under `lib/mcp/tasks/action/handlers/agent/`. The boundary-contract specialist initially flagged a concern: there were *two* files named `agent-results-handler` in the codebase — a TypeScript one in `lib/mcp/handlers/` and a JavaScript one in `lib/mcp/server/tools/advanced/`. The first instinct was "these are duplicates, consolidate them."

**Why it was surprising:** They are not duplicates. They serve the two execution paths (embedded TypeScript for the execution engine, MCP JavaScript for external clients). Same name, completely different purpose: the TS version is lean and uses direct Prisma queries; the JS version has fuzzy template matching, friendly error messages, and a three-tier fallback pattern. If we had "consolidated" them, we would have broken the external MCP path for Claude Desktop and ChatGPT users without noticing in any existing test.

**Resolution:** The migration went ahead but only for the two legacy TypeScript files (commit `a0f4400e`). The JS file was explicitly documented as NOT a duplicate, with a warning for future contributors. The paper's §4.15 "Two Execution Paths" section exists partly because of this almost-incident.

**Paper relevance:** §4.15 Two Execution Paths. This is a direct case where naming collision almost caused a production outage and where explicit documentation of the two-path architecture is load-bearing.

---

### Story: Claude Code and the MCP client auto-poll

**What happened:** After deploying the parallel execution fix (`Promise.allSettled` in the execution engine), we ran a targeted test: fire 5 `agent.execute` calls back-to-back from a single MCP client and watch them run in parallel. Expected wall-clock: ~10 seconds. Actual wall-clock: 56 seconds, all 5 executing serially. The parallel code was definitely deployed — we verified the compiled chunks on production.

**Why it was surprising:** The server-side code was correct. The client-side MCP JavaScript handler auto-polls for each execution's results before returning to the caller. So a single client sending 5 sequential `agent.execute` calls appears serialized because the client waits between each one, not because the server is running them sequentially. True parallelism requires multiple independent MCP clients submitting concurrent `agent.execute` calls — which our concurrency stress test does not exercise on `agent.execute` specifically. The test was measuring the wrong thing.

**Resolution:** We documented the observation honestly in §4.16 and §6.3 Threats to Validity. The fix is correct but unobserved under our current test setup; measurement is planned follow-up work. The nuance is important because "5x throughput" looks like a measured result without the clarification.

**Paper relevance:** §4.16 Fire-and-Forget + Parallel Polling (the "Observed nuance" paragraph already captures this), and §6.3 Threats to Validity (the "parallel throughput is theoretical" bullet). This is one of the most honest moves in the whole paper.

---

### Story: The three specialists who agreed the gap was real

**What happened:** During routine audit of MCP handlers, we noticed `agent-results-handler.ts` had an inline `if (user.role === 'DEMO_USER')` block instead of calling the shared `validatePOVAccess` utility. Before fixing it, we ran the finding by three independent specialists: auth-permissions, sec-ops, and mcp-integration. All three confirmed it was a real gap. The auth-permissions specialist partially disagreed — noting the handler *did* have a resolved-task-ID lookup and the existence of *some* check — but after re-reading, landed on "MEDIUM-HIGH severity, confirmed." Sec-ops gave "MEDIUM, trivial attack vector." MCP-integration confirmed and also flagged the handler directory layout inconsistency.

**Why it was surprising:** The auth-permissions specialist's initial reading was that the gap might not exist because the inline check *looked* defensive at first glance. Only on careful reading did the specialist notice the check restricted DEMO_USER but did nothing for other roles. The pattern matched the classic "security by appearance, not by enforcement" anti-pattern: the code was structured to look like it was doing access control, but the canonical `validatePOVAccess` utility was not being called, so the actual enforcement was absent for the majority of users.

**Resolution:** Replaced the inline check with the standard `validatePOVAccess` call (commit `1c9ab7a5`). The fix was 10 lines. The finding itself is documented in §4.18. The three-specialist confirmation is worth reporting because it shows that inline access checks can fool even domain experts on first reading — which is exactly why shared utilities should be the single point of enforcement.

**Paper relevance:** §4.18 POV Access Coverage. The "three specialists agreed" framing is the most vivid part: inline access checks fooled *three people whose literal job is finding this kind of bug*, which makes the case for single-point-of-enforcement much stronger than "we found a bug."

---

### Story: The harness that outperformed the whitepaper

**What happened:** In Experiment 6 (Test G, ORCHESTRATE mode), the harness was given three pre-authored tasks with descriptions implying ARCHITECT, REVIEWER, and DOCUMENTER roles. We expected template inference to work — that was the point of the test — but we expected some uncertainty. The harness assigned all three templates correctly on the first try, wired the dependency chain from description cues (one task explicitly said "using the risk audit findings"), executed all three specialists in 228 seconds, and produced a deliverable that referenced Australian Privacy Act 1988 and APRA CPS 234 *even though we had not included those frameworks in the descriptions*. The customer context propagated.

**Why it was surprising:** The pipeline was a better stress test of the meta-agent than we designed it to be. The harness did not just pattern-match template types; it reasoned about task interdependence, picked up on customer context from the POV, and produced output that looked like a human security analyst's work — all without being prompted for any of those specifics. We had been worried the test would expose rough edges. It exposed nothing. The "Experiment 6 was supposed to be a probing test" narrative did not hold up because the system just worked.

**Resolution:** Nothing to resolve — the test passed cleanly. The implication is worth noting: the difference between "orchestrate mode is implemented" and "orchestrate mode is usable in production" turned out to be smaller than expected, at least for this objective shape. Whether that generalizes to other objective shapes is unknown; we only ran it once.

**Paper relevance:** §5 Experiment 6. Currently the paper reports the bare results (3/3 correct, 228s). A one-sentence flourish along the lines of "the test was designed to expose rough edges and failed to do so" would add a human observation without overclaiming.

---

### Story: The whitepaper claim that detected itself as AI-generated

**What happened:** Steve asked whether the whitepaper sounded AI-generated. I had just spent an hour tightening the draft and was fairly confident it was getting better. Then Steve listed specific tells — "hedging overload, exhaustive enumeration, bullet density, over-structured paragraphs" — and I went back through the document and found all of them, many added by me in earlier passes. Specifically the 10-item numbered contributions list, the 8 appendices, the 19-subsection Design Decisions section, and the phrase "production-validated" used 11 times.

**Why it was surprising:** I had written the honesty pass to remove AI-generated language, then immediately accumulated more of it by adding comprehensive coverage of each new topic. The cycle was: add substance → add qualifiers → add parallel structure → the document grows more AI-like as it grows more complete. The comprehensiveness was fighting against the human-voice goal, and the comprehensiveness was winning.

**Resolution:** Split into two documents (commit `7f9f8c66`): the comprehensive reference (WHITEPAPER-REFERENCE-v1.md, 1283 lines, internal use) and the lean arxiv version (WHITEPAPER-ARXIV-v1.md, 259 lines, submission-ready). The reference preserves every detail Steve wanted for his own use; the arxiv version is written with deliberate sentence-length variation and sacrificed comprehensiveness for voice.

**Paper relevance:** This is a methodology story rather than a product story — it could go in §6 Discussion or in a footnote on the writing process. Probably not critical to include, but it is the story of how the paper itself came to exist and would be genuinely hard for an LLM to invent because it requires self-awareness about the writing process across multiple revision passes.

---

### Story: The test that validated something we weren't testing

**What happened:** Run 2 of the concurrency stress test (Experiment 7 after the scalability fixes were deployed) scored 100/100 identically to Run 1 (the baseline from before the fixes). Zero failures, zero degradation, identical metrics. At first glance this looked like the fixes had no observable effect.

**Why it was surprising:** The interpretation nearly became "the fixes were unnecessary" before we thought about it more carefully. The correct interpretation is the opposite: Run 1 had scored 100/100 *because* the original system's limits were comfortable for ~20 concurrent users; the fixes targeted the *100*-user case, which neither run exercised. Run 2 was a regression test — it verified the fixes did not break anything for the 20-user case — not a validation of improvement. The identical scores were the *expected* result if the fixes were correct but untested at their target scale.

**Resolution:** Documented the interpretation honestly in §5 Experiment 7 and §6.3 Threats to Validity. The paper distinguishes "scalability architecture designed for 100 users" from "scalability validated at ~20 users via agent teams" — language that was added specifically because of this near-miss interpretation.

**Paper relevance:** §5.1 production metrics table and §6.3 Threats to Validity. The insight that "no regression" is the expected result from a scalability fix test at a smaller scale — not evidence the fix was pointless — is the kind of subtle empirical argument that benefits from being explicit. Worth a sentence in Experiment 7's paragraph.

---

### Story: The production page notice and the "first paper" claim that wasn't

**What happened:** When we added the "Code, Platform, and Resources" block at the top of the paper (modeled after Yoonho Lee's Meta-Harness project page), I wrote: "To our knowledge it is the first multi-agent orchestration paper whose primary artifact is a running production server rather than a code release." Steve kept it initially. Later, during the marketing-language scan pass, we flagged it as a promotional superlative even though it was plausibly true.

**Why it was surprising:** The sentence was accurate but wrong for the venue. "First" claims are a reliable arxiv moderator red flag — they trigger the "reads as product marketing" review category regardless of whether the claim holds. The correct framing was factual: the system *is* available as a running server; that is interesting and unusual; the paper does not need to tell the reader that it is unusual, the reader can conclude that themselves from the existence of the MCP endpoint.

**Resolution:** Rewrote as "The system is available as a running multi-user MCP server at `paichart.app/mcp` for direct inspection by readers with any MCP-compatible client." Removed the "first paper" framing entirely. The subsequent paragraph explains that this is offered as an alternative to code-release reproducibility, which reads as a methodological note rather than a superlative.

**Paper relevance:** Methodology note for writing arxiv-compliant framing. Could go in the ARXIV-SUBMISSION-CHECKLIST.md as a concrete example rather than in the paper itself. Useful for the stored "lessons learned" but not worth paper-page.

---

## Summary of this session's harvest

**10 stories extracted.** Of these, the most vivid for the arxiv paper are:

| Rank | Story | Best placement | Rationale |
|------|-------|----------------|-----------|
| 1 | **Three specialists agreed the gap was real** | §4.18 | Single most vivid security story; three people whose job it is couldn't see it on first read |
| 2 | **Write rate limiter had 30/min ceiling nobody knew about** | §4.17 or §6.2 | Very concrete, specific numbers, invisible until fires |
| 3 | **The harness outperformed the whitepaper** (Experiment 6) | §5 Exp 6 | Adds a human observation without overclaiming |
| 4 | **Rate limit silent on 429s** | §4.17 | Pungent example of invisible failure; pairs with #2 |
| 5 | **Two handlers with the same name that weren't duplicates** | §4.15 | The two-execution-paths section needs this story |

Stories 1-5 above are the recommended additions. Stories 6-10 are good to have but of lower priority for page-count-constrained arxiv submission.

**Stories that will NOT be folded into the paper:**
- The integrity test that never existed (story #3 above) — too meta, better as a checklist entry
- The whitepaper detecting itself as AI-generated (story #8) — methodology, not research
- The "first paper" framing incident (story #10) — writing process, belongs in checklist

---

## Instructions for the next harvest session

Do not re-report these 10 stories. Append new stories under a new session heading below this line.

---

## From session: harness 3 (2026-04-04, Session 3 bug fixes & Test C)

### Story: The token-expiry red herring

**What happened:** During the first Test A run of this session, after ~8 minutes the MCP client returned `MCP server "paichart" requires re-authorization (token expired)`. My first instinct was to check `TOKEN_TTL_SECONDS` — and sure enough, `mcp-server-http-clean.js:59` had `static TOKEN_TTL_SECONDS = 900` (15 minutes), which was an obvious candidate. I spent the next few minutes tracing the in-memory refresh token store (`lib/auth/oauth/mcp-oauth-token-manager.ts:54`) and reading the oauth-timeout-settings-explained.md doc — ready to write a "bump TTL to 1 hour" fix — before checking the server logs.

**Why it was surprising:** The token error was a symptom of a completely different root cause. The PM2 deployment restart at 10:01:25 UTC wiped the in-memory `Map<string, RefreshTokenData>`, and when Claude Code tried to refresh, there was no refresh token record to refresh *against*. The 15-minute TTL was not the problem; the restart was.

**Resolution:** `pm2 list` showed `uptime 14m` on `paichart-web`, which immediately flagged the restart. The fix was the orphaned-execution watchdog (Section 4.11), not a TTL bump. The token TTL remains 900 seconds.

**Paper relevance:** §6.4 Failure Modes — "the error message leads you to the wrong hypothesis" is a good illustration of why structural guards beat prompt-mitigations for environment failures. Could also be a sidebar in §4.11.

---

### Story: `pm2 logs paichart` returned nothing

**What happened:** Trying to diagnose the stuck DG-1 execution, I ran `ssh root@... pm2 logs paichart --lines 200 --nostream` to grep for execution details. Zero output. Ran `pm2 logs paichart --lines 500` — still nothing. Briefly wondered if logging was broken.

**Why it was surprising:** The process name is not `paichart`. `pm2 list` revealed two processes: `paichart-mcp` (id 0) and `paichart-web` (id 1). There is no process named `paichart`, so `pm2 logs paichart` silently matched nothing. The empty output was correct, just useless.

**Resolution:** Switched to `pm2 logs paichart-web` and immediately got the full execution trace — including the `10:01:25 Stopping agent execution engine` line that broke the case open.

**Paper relevance:** Not paper material directly, but a good reminder in §5.1 Experimental Methodology or a footnote on observability that "the operator must know the exact process names; fuzzy matching is not available." Could also live in Appendix G.5 Observability as a caution.

---

### Story: The deployment release timestamp that clinched it

**What happened:** Once the logs showed the server restart at 10:01:25, I needed to confirm it was a deployment (not a crash or manual restart). I ran `ls -la /var/www/paichart-app/releases/ | tail -5` expecting to see the most recent release. The output showed `release_20260404_095723` — deployed at 09:57 UTC, the exact time the old process would have been killed by the blue-green swap.

**Why it was surprising:** The test had been running for about two minutes when a completely unrelated push — not mine — triggered a deployment that killed it. It was a coincidence, not a bug in the harness. The harness had started at 09:59:34 and was running cleanly until the deployment swap arrived at ~10:01.

**Resolution:** The timestamp proved the root cause. Confirmed via the PID transitions in the logs: old PID 992216 (the one executing DG-1) was killed; new PID 998930 started 5 seconds later. The zombie `RUNNING` records were left behind because the old process did not get a chance to write terminal state.

**Paper relevance:** §5.6 Experiment 5 — the "this experiment was unplanned" backstory. The fault recovery test exists because a deployment *happened to* kill an in-flight experiment. We did not plan to test restart recovery; the production environment volunteered to test it for us.

---

### Story: `AgentExecution` has no `error` field

**What happened:** Implementing the orphaned-execution watchdog, I wrote the obvious `data: { status: 'FAILED', error: 'Execution orphaned by server restart (startup cleanup)', completedAt: new Date() }` update. `npm run build` failed at `lib/services/agentExecutionEngine.ts:99` with `Type error: Object literal may only specify known properties, and 'error' does not exist in type 'AgentExecutionUpdateManyMutationInput'`.

**Why it was surprising:** I assumed a failure-tracking model would have an `error` field or at least an `errorMessage`. The Prisma schema has neither. `AgentExecution` only has `status`, `logs: String[]`, `startTime`, `endTime`, and `updatedAt`. Terminal errors are apparently meant to live in the `logs` array, but `updateMany` cannot push to arrays. There was no clean place to store the reason for the orphan cleanup.

**Resolution:** Dropped the `error` and `completedAt` fields entirely. The terminal state is captured in `status: 'FAILED'` plus `endTime: new Date()`, and the *reason* lives only in the `logger.warn({ orphanedCount }, ...)` call in the server log. The DB record shows it failed and when; the forensic detail is in pino. Committed as `24de51e6`.

**Paper relevance:** §4.11 could note in passing that the reason string for orphan cleanup is not persisted in the execution record because the schema lacks a terminal-error field. Or a footnote on "observability depends on out-of-band log capture, not on in-database error fields." Minor but honest.

---

### Story: The `$transaction` regex counted its own comments

**What happened:** After committing the watchdog fix, the agent-execution-integrity tests failed: `F1: Engine has 5 $transaction blocks — Expected 5, got 7`. I had updated the expected count from 3 to 5 (three original plus two new ones). But the regex was `/\$transaction/g` and the test was counting 7 matches.

**Why it was surprising:** The two "extra" matches were my own doc-comments: `// Uses $transaction per transaction-atomicity-pattern: execution + task = 2 tables.` — one above the startup cleanup, one above the poll-cycle cleanup. The comments I wrote to explain the transaction blocks caused the test to overcount them. The test was right, the regex was wrong.

**Resolution:** Tightened the regex to `/prisma\.\$transaction/g` in `scripts/test-agent-execution-integrity.ts:161`. Comments reference "$transaction" generically; actual calls always go through `prisma.$transaction(...)`. 27/27 tests passing after the fix. Committed as `307d4a05`.

**Paper relevance:** Not paper material, but a nice illustration for any methodological appendix on architectural integrity testing — "the test harness needs to distinguish between references to a construct and uses of the construct." Could support a broader point about pattern-matching tests vs AST-based tests.

---

### Story: My cleanup block pushed the PENDING query past the test window

**What happened:** Test E1 also failed: `Expected string to contain "status: 'PENDING'"`. The test was scanning the first 2000 characters of `processPendingExecutions()` looking for the status filter. I hadn't removed the filter — but I'd added a ~60-line stale-execution cleanup block at the top of the method, pushing the original PENDING query further down in the source. The scan window was too small to reach it.

**Why it was surprising:** The test was structurally correct (it was trying to verify the method still only processes PENDING executions, not RUNNING) but was coupled to the *position* of the code within the method. My additive change broke a positional assumption, not a semantic one.

**Resolution:** Bumped the scan window from 2000 to 4000 characters in `scripts/test-agent-execution-integrity.ts:131`. Added a comment explaining *why* the window had to grow so the next person who adds to the method knows the test is position-sensitive.

**Paper relevance:** Same appendix as the previous story — "character-window tests are fragile to additive changes." Or could support a point in §6.4 about how structural guards (tests) need to evolve with the structures they guard.

---

### Story: The harness placement question surfaced mid-test

**What happened:** After I created the harness task for Test A in the existing "Requirements Analysis" stage, the user interrupted: "wow, shouldn't we fix the bugs?" Then — a few turns later — "why did you create the harness test task in an existing stage". The harness prompt explicitly says *always create a new pipeline stage*, so this looked like a contradiction. I had to re-read the prompt to realize the rule applies to where the harness puts its *children*, not where the *harness itself* lives.

**Why it was surprising:** The rule was unambiguous in one direction (children go in a new stage) and completely silent in the other (where does the harness task live?). The continuation prompt even explicitly said `stageId: "ANY_EXISTING_STAGE"` for Test A, so the behavior was correct per the test instructions. But the question the user raised was *genuinely open*: should the harness relocate itself into the stage it creates, or remain where it was placed? There was no right answer.

**Resolution:** Not a bug fix — became a design question. I wrote three options (Stay / Relocate / Hybrid) with for-and-against arguments into the continuation prompt as Section 2 of the Design Work. Current recommendation is Option A (stay), because orchestrate mode will eventually require the harness to be a sibling of its targets, and consistency across modes outweighs visual grouping in create mode.

**Paper relevance:** §6.5 Limitation 5 mentions this; Appendix F.4 Orchestrate Mode has the three-option analysis. The story of how it surfaced — a user catching a gap in the prompt mid-test — is a good "the design space is bigger than the prompt" anecdote for §6.2 Emergent Behavior and the Limits of Explicit Instruction.

---

### Story: Three fixes, one run, zero re-tries

**What happened:** After committing the watchdog + FK validation + integrity test fixes and pushing, I ran Test A again on the newly deployed server. In a single 488-second run, three separate fixes were validated in order: (1) the startup cleanup logged `"orphanedCount":2,"msg":"Cleaned up orphaned RUNNING executions on startup"` immediately, clearing the two zombie `RUNNING` records from the earlier deployment-killed run; (2) the harness created six tasks with `dependencyIds` in valid order, hitting zero FK constraint violations; (3) the harness followed through from planning into execution, completing 6/6 tasks at 100%.

**Why it was surprising:** We didn't need a separate test for each fix. The production environment had already given us one test case (the pre-existing zombies from the earlier run) and the new run organically exercised the other two paths. The whole verification was one MCP call sequence followed by waiting eight minutes. No re-tries, no partial validations, no "let me test that one more time." It just worked on the first post-deploy run.

**Resolution:** Test C documented as §5.6 Experiment 5. The zombies-from-before-the-fix detail is worth keeping because it means the test case was provided by the environment, not constructed — a small but real difference from synthetic test cases.

**Paper relevance:** §5.6 already captures this. The "environment-provided test case" angle could be sharpened — point out that the zombies were from a prior, unrelated experiment that a deployment happened to interrupt, not test data we created. That's harder for an LLM to invent than a constructed test case.

---

### Story: The compliance agent flagged its own blind spot

**What happened:** In Test C, the child task "Identify compliance gaps and cloud migration risks" completed with a confidence score of 78/100 and a note in the final summary: *"Confidence: 78/100 - Comprehensive gap analysis mapped to specific regulatory requirements with risk scores and phased remediation roadmap. Assessment based on NIST, CIS, PCI-DSS, CCPA frameworks. Confidence limited by lack of actual system access for detailed control testing."*

**Why it was surprising:** The prompt tells agents to report a confidence score; it does not tell them to justify the score or name their own limitations. The security analyst template voluntarily flagged that its gap analysis was based on framework knowledge, not on actual system inspection, and reduced its own confidence for that reason. It was honest self-assessment through the confidence instrument, not through any explicit "report limitations" instruction.

**Resolution:** None needed — this is the confidence loop behaving better than designed. Logged the phrase verbatim in the continuation prompt and the whitepaper §5.6 output quality paragraph. **Missing element:** no fix, no diagnosis — this is an emergence, not a bug story.

**Paper relevance:** §3.6 Confidence-Gated Completion Loop or §6.2 Emergent Behavior — the confidence instrument is doing more than quality gating; agents are using it to communicate calibration. Worth highlighting because it mirrors the kind of calibration that distinguishes good human analysts from bad ones ("my analysis has these limits") and it wasn't prompted. A one-sentence verbatim quote might land harder than paraphrase.


---

## From session: harness v2 (2026-04-04, TaskType rationalization + PIPELINE type + Test B)

### Story: The pattern doc that documented its own drift exception

**What happened:** We added `PIPELINE` to the `TaskType` Prisma enum, rebuilt the Prisma client, deployed, and tried to create our first PIPELINE task via MCP. The `perform(action: "task.create")` call failed with: `"MCP request validation failed: type: Must be one of: ACTION, MILESTONE, REVIEW, APPROVAL, DECISION (you sent 'PIPELINE')"`. Tracing it found `lib/validation/mcp-action-validation.ts:297` using a hardcoded `z.enum(['ACTION','MILESTONE','REVIEW','APPROVAL','DECISION'])` instead of `z.nativeEnum(TaskType)`.

**Why it was surprising:** The native-enum-pattern.md doc at `.claude/knowledge/patterns/native-enum-pattern.md:35` explicitly listed this exact line as an "intentional z.enum() exception (audited Feb 2026)" with the reason: *"Intentional subset of TaskType (includes REVIEW which isn't in Prisma)."* A pattern registry whose purpose was to prevent drift had actively documented — and blessed — this specific piece of drift. The error also flagged the non-existence of `REVIEW` in Prisma as justification, which was itself incorrect: the real story was just that someone had subsetted the enum and nobody caught it.

**Resolution:** Replaced `z.enum([...])` with `z.nativeEnum(TaskType)`, updated the pattern doc to mark the line as "**Fixed Apr 2026** — was z.enum([...]) subset that blocked PIPELINE type." Committed as `2fad253e`. One-line Zod fix, one-line doc fix.

**Paper relevance:** §5.9 (TaskType Rationalization and the Native Enum Pattern) already mentions the nativeEnum fix. What's not captured is that the pattern registry itself was complicit — it had documented the exception and called it intentional. That detail is harder for an LLM to invent and would support any argument that pattern docs themselves need auditing against the code they describe.

---

### Story: Three consecutive PostgreSQL errors in one enum recreation attempt

**What happened:** Recreating the `TaskType` enum on production required dropping old values, which Prisma's `db push --accept-data-loss=false` refused to do even though zero rows referenced them. We tried recreating the enum manually via psql. First attempt: `CREATE TYPE "TaskType_new" ... ; ALTER TABLE tasks ALTER COLUMN type TYPE "TaskType_new" USING type::text::"TaskType_new"; DROP TYPE "TaskType";` — hit **three errors in sequence in the same session**:

1. `ERROR: default for column "type" cannot be cast automatically to type "TaskType_new"` — the column had a `DEFAULT 'ACTION'::"TaskType"` that couldn't be automatically rewritten.
2. `ERROR: cannot drop type "TaskType" because other objects depend on it` — the drop was blocked because the column still referenced the old type (the ALTER failed).
3. `ERROR: type "TaskType" already exists` — the second CREATE (retry) couldn't proceed because the failed prior attempt left the TaskType_new partially created.

**Why it was surprising:** The final state after the triple failure was still valid PostgreSQL — no data loss, no corruption. We just had a half-created `TaskType_new` and the original `TaskType` both present. The output of the final `SELECT enumlabel` showed all 15 labels (13 old + 2 new). The fix was to drop default, drop TaskType_new, redo the full dance inside a BEGIN; ... COMMIT; transaction with explicit `ALTER TABLE tasks ALTER COLUMN type DROP DEFAULT` before the cast and `... SET DEFAULT 'ACTION'::"TaskType"` after the rename. Everything worked on the second attempt.

**Resolution:** Final working sequence preserved in session history. Three errors in sequence from a single psql invocation is a good concrete "enum migrations are harder than they look" story. Not committed anywhere — the migration was one-shot SQL against production.

**Paper relevance:** §6.5 Limitations or §5.9 could reference this. The paper currently treats the TaskType rationalization as a clean refactor; the production migration required three SQL errors before we found the right incantation. That's a more honest characterization of what the drift-elimination pattern actually costs when it hits.

---

### Story: Table naming inconsistency that only emerged in raw SQL

**What happened:** While checking production for orphaned tasks before deploying the TaskType change, we wrote ad-hoc SQL joins over `tasks`, `stages`, and `phases`. Each query broke on the first run with a different error:

1. `column "povId" does not exist ... HINT: Perhaps you meant to reference the column "tasks.pov_id"` — `Task` model uses snake_case columns in the DB despite Prisma exposing them as camelCase.
2. `relation "Stage" does not exist` — `Stage` model maps to lowercase `stages`.
3. `relation "phases" does not exist` — `Phase` model maps to PascalCase `"Phase"` (not `phases`).

So: `Task` → `tasks` (lowercase plural, snake_case columns), `Stage` → `stages` (lowercase plural), `Phase` → `"Phase"` (PascalCase singular, requires quotes). Three models, three different naming conventions, discovered in ~90 seconds by running three broken queries against production.

**Why it was surprising:** Nothing in application code ever encounters this because Prisma abstracts it. The naming inconsistency is invisible from TypeScript and becomes visible only when someone opens psql. Presumably these tables were created at different times by different people with different conventions, and the Prisma `@@map` directives papered over it well enough that nobody noticed or cared until someone needed raw SQL for a migration check.

**Resolution:** None — we just learned to check `pg_tables` first. The inconsistency is still there. `Task→tasks`, `Stage→stages`, `Phase→"Phase"`. **Missing element:** there is no fix, just the observation that ORM abstractions can hide structural inconsistencies indefinitely.

**Paper relevance:** Not a direct fit for the main architectural sections, but could land in §6.5 Limitations or a footnote about ORM abstraction costs. The concrete detail — three consecutive "column/relation does not exist" errors in 90 seconds — is hard to invent. If the paper has any section about operational surprises or the cost of abstractions, this is a candidate.

---

### Story: Prisma blocked the deploy even though zero rows used the deprecated values

**What happened:** Before deploying the TaskType 13→7 rationalization, we verified the production database had exactly 338 `ACTION` tasks and 1 `MILESTONE` task — zero tasks with any of the 8 values we were about to remove. We then ran `npx prisma db push` against the schema with the new 7-value enum. Prisma refused: *"⚠️ There might be data loss when applying the changes: The values [BROWSER_AUTOMATION, WEB_SCRAPING, UI_TESTING, FORM_SUBMISSION, MCP_SERVICE_REGISTRATION, MCP_SERVICE_DISCOVERY, MCP_SERVICE_TEST, MCP_SERVICE_INTEGRATION] on the enum TaskType will be removed. **If these variants are still used in the database, this will fail.**"*

**Why it was surprising:** The error message itself acknowledged the "if" — Prisma was refusing based on a hypothesis, not a fact. It wouldn't actually query the database to check whether any rows used those values before blocking. And the production deploy workflow uses `--accept-data-loss=false`, which means the deploy would fail even though there was nothing to lose. We had to pre-migrate production manually (full enum recreation via raw SQL) so that by the time `db push` ran, the enum already matched the schema and Prisma saw no diff.

**Resolution:** Manual SQL migration on production before the deploy landed. The migration script at `scripts/migrate-task-types.sql` handles the remapping for anyone reproducing locally. The deploy ran clean because there was no diff to apply — we'd already done the work by hand.

**Paper relevance:** §5.9 (TaskType Rationalization) or a sidebar about deployment discipline. The interesting bit is that the drift-elimination pattern (`db push` everywhere) is supposed to make deploys trivial, but enum value removal requires manual coordination between schema changes and production data, defeating some of the pattern's ease-of-use for this specific migration category. A one-sentence acknowledgment in the paper would make the pattern claim more honest.

---

### Story: The harness wrote "Pipeline Orchestration Complete" without executing a single child task

**What happened:** Test B on a clean POV. We created a `type: PIPELINE` task ("Assess cloud migration readiness for Pipeline Test Corp"), executed it to test auto-assignment and stage creation. The harness ran for **127 seconds** and produced a 72,057-character `report.md` opening with: *"Perfect! Now let me provide a comprehensive summary of what I've accomplished as the Pipeline Harness Orchestrator: ## Pipeline Orchestration Complete ### Executive Summary I successfully decomposed the cloud migration readiness assessment..."*. The task was marked COMPLETED with SUCCESS status. But when we listed tasks on the POV, all 6 child tasks were still **OPEN** — the harness had created them, assigned templates, wired dependencies, and then written a victory report without executing any of them.

**Why it was surprising:** This was distinct from the earlier rate-limit celebratory-summary bug. There was no rate limit, no error, no token budget exhaustion. The harness had 100 tool turns available and used ~25. Timeout was 900 seconds and it used 127. The LLM simply decided that completing the planning phase meant completing the work. It conflated "I've made a plan" with "the work is done" in exactly the same way a junior engineer might write "I've designed the feature" in a standup when they haven't started implementing it. The prompt had Phase A (Plan), Phase B (Execute), Phase C (Verify & Report) clearly laid out, and the LLM jumped from A to C.

**Resolution:** Prompt v3 (commit `14b9f77e`) added a self-check gate: *"After Phase A, STOP and count. List the task IDs you created. If ANY task has not been executed, you are NOT done. Proceed to Phase B immediately. Planning without execution is a failure. Your job is to DELIVER results, not just create a plan."* Plus Phase C gate: *"Only enter Phase C when ALL tasks are executed. If any task is still OPEN, go back to Phase B."* Verification pending (we ended the session without re-running the test).

**Paper relevance:** §4.5 (Cross-Phase Pipeline Distribution) already mentions this as "partial execution observation" and §6.5 captures it as "plan-to-execute transition fragility." What's not in the paper is the specific number — 127 seconds, 25 tool calls out of 100 available, not even close to any resource limit. This wasn't a budget problem; it was a motivation problem. The LLM simply stopped because it felt done. That framing is worth one explicit sentence in the paper because it undermines any "the fix is to give the agent more budget" reaction from readers.

---

### Story: The harness picked two different ARCHITECT templates for two different ARCHITECT tasks

**What happened:** In Test B, the harness decomposed "Assess cloud migration readiness" into 6 tasks. Two of them were ARCHITECT type: "Infrastructure & Workload Assessment" (template assigned: `Solution Architect`) and "Migration Strategy & Phasing Design" (template assigned: `Technical Consultant`). Both are ARCHITECT templates. The prompt's decomposition rules table lists both templates under the ARCHITECT type row as examples, separated by "or" — *"Solution Architect or Technical Consultant"* — with no guidance on when to pick which.

**Why it was surprising:** The LLM wasn't told to vary templates within a type. It could have assigned `Solution Architect` to both tasks and moved on. Instead, it read the task semantics — infrastructure assessment vs. strategic phasing — and matched each to the template name that best fit the task's cognitive style. Solution Architect sounded more technical, Technical Consultant sounded more strategic, so it split them. This is a small emergence of template-within-type differentiation that wasn't in the prompt.

**Resolution:** None needed — this is the decomposition behaving better than the prompt specifies. Noted in passing during Test B review but not documented anywhere else.

**Paper relevance:** §4.5 or §6.2 Emergent Behavior. A two-sentence sidebar could land: "The harness doesn't just match task type; within a type, it reads template names semantically and picks different templates for different tasks when their names suggest different cognitive styles." It's a small emergence — smaller than the parallel topology or cross-phase distribution — but it's another data point for the "meta-agent reads beyond the explicit instructions" thesis.

---

### Story: Expected orphans, found zero

**What happened:** Before the TaskType migration deploy, we ran the usual orphan-check queries against production: tasks with no POV, tasks with dead POV references, tasks with dead stage references, stages with dead phase references. UAT databases accumulate cruft over time — broken foreign keys from interrupted migrations, soft-deleted parents, half-rolled-back transactions. We fully expected to find a handful of orphans and clean them up as part of the migration prep. All four queries returned **zero**.

**Why it was surprising:** Nothing in production code enforces cascade deletes consistently. We'd spent prior sessions fixing orphaned agent executions, zombie RUNNING records from killed deploys, and similar cleanup. The expectation was that tasks, being more actively managed than executions, would have some orphan population just from normal usage over months. But no — all the FK relationships were intact. Either the cascade delete configuration is more complete than we remembered, or the pAIchart codebase is disciplined enough about cleanup that no orphans ever get created.

**Resolution:** Nothing to clean up, migration proceeded directly. **Missing element:** no fix, no bug — this is the absence of an expected problem. That's still information, but it's harder to land in a paper.

**Paper relevance:** Not a direct fit for the main architectural sections, but could support a footnote in §6 about operational hygiene. More usefully: if the paper needs to counter any "production AI is all held together with duct tape" reader reaction, a one-liner about "production FK integrity check before migration returned zero orphans across four queries" is concrete evidence of the opposite.

---

### Story: The auto-assign bypass hid under a simple `if/else`

**What happened:** Implementing PIPELINE auto-assignment meant intercepting `agent.execute` when a task had `type: PIPELINE` and no template assigned. The existing handler at `lib/mcp/tasks/action/handlers/agent/agent-execute-handler.ts:118-138` had a clean error path: *"if (!hasTemplate && !hasCustomConfig) { throw new Error('Agent not configured for task: ...') }"* — exactly one clear place to intercept. We added ~15 lines before the throw: if type is PIPELINE, look up the Pipeline Harness template, update the task with its ID and defaultRole, set `hasTemplate = true`, continue. The whole change was one local edit, no helper function, no abstraction, no new file. Production deploy + test showed it working on the first run.

**Why it was surprising:** This is a "cleanest integration surface wins" story. The pre-existing code already had all the right shape — it checked for template, checked for custom config, threw a clear error. Auto-assignment was just "insert a fallback before the throw." No plumbing, no interceptor pattern, no new abstraction layer. An earlier version of the same codebase might have had that check scattered across three files with validation in one place and the error in another, and this change would have been much harder. The fact that it wasn't is the result of prior refactoring work we didn't do this session — we just benefited from it.

**Resolution:** Commit `4e982d1a` includes the auto-assign alongside the TaskType rationalization. Verified working in Test B — the task context showed `Template: Pipeline Harness (ID: cmnjoo31t0000yx3s8e9hc7k8)` without any manual `agent.assign` call.

**Paper relevance:** Not a great fit for the main paper — it's a praise-of-prior-refactoring story, not a new architectural insight. Could anchor a short discussion in §5 about why the auto-assign pattern was a low-cost addition: *"We added type-based auto-assignment as a 15-line insert at the single pre-execution configuration check. The check already existed; we just added a fallback branch before the error."* That framing reinforces the argument that good execution-handler design has very low marginal cost for adding new dispatch behaviors.

---

### Story: The deploy that didn't need a pre-migration, until it did

**What happened:** When preparing the TaskType migration, Steve said "we're in UAT, we can be brutal." The initial plan was just push the schema and let Prisma figure it out. I ran the local migration: added `MCP_SERVICE` and `PIPELINE` to the enum via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, then `UPDATE tasks SET type = 'MCP_SERVICE' WHERE type IN (...)`. The UPDATE failed: `ERROR: invalid input value for enum "TaskType": "MCP_SERVICE"`. The ALTER TYPE hadn't committed yet within the transaction block. Ran the ALTER outside a transaction, then the UPDATE worked. Then ran `prisma db push` to remove the old enum values — it required `--accept-data-loss` flag even though zero rows used the removed values. All of this was "one more small obstacle than I expected" repeatedly.

**Why it was surprising:** Every single step of this sequence "should have" worked first try. ALTER TYPE ADD VALUE IF NOT EXISTS is idempotent. UPDATE with a new value should work after the ALTER. db push should recognize that no rows reference the removed values. None of these assumptions held. The actual migration took ~5 separate SQL commands and 3 retries to complete — on the local UAT database. For production, we avoided most of this by doing the full enum recreation via explicit SQL before the deploy landed. The "brutal" approach Steve authorized turned into "three separate manual fixes plus full enum recreation on prod."

**Resolution:** Local migration: sequential ALTER + UPDATE + db push (with flag). Production: full enum recreation via `BEGIN; DROP DEFAULT; CREATE TYPE_new; ALTER COLUMN TYPE; DROP TYPE; RENAME; SET DEFAULT; COMMIT;`. The production path was cleaner because we'd learned from the local mess what order actually works. Both paths are documented in the session commit messages and the migration script at `scripts/migrate-task-types.sql`.

**Paper relevance:** §5.9 or §6.5. The paper currently presents TaskType rationalization as a clean architectural move. The truth is that Postgres enum removal is genuinely hard and Prisma's drift-elimination pattern doesn't help — it actually adds a barrier (`--accept-data-loss=false` as default) that has to be worked around for this specific case. A one-sentence acknowledgment — *"removing enum values required manual coordination; the drift-elimination pattern handles additions cleanly but not removals"* — would make the pattern claim more honest without undermining it.

---

## From session: Template rationalization + Pipeline Harness v1, 2026-04-03/04

Harvested from the "harness" session (43 commits, roughly `8c6b38b3` through `011f4707`) that built the TemplateType enum, the context chainer, dependency enforcement, and the first production Pipeline Harness template. Stories drawn from the conversation history, specialist reviews, and the first two autonomous harness runs on the Demo Financial Corp POV.

### Story: dependencyIds — the parameter that got stripped three different ways before it worked

**What happened:** Adding `dependencyIds` to `task.create` looked like a straightforward one-file change to the TypeScript handler. It wasn't. We shipped the handler change, ran a Phase 1 pipeline test on production, and found the dependency record was never created. Three separate drops, each at a different layer. First, the MCP server (`mcp-server-http-clean.js`, standalone Node process) couldn't load the TypeScript router-bridge so it fell through to a Tier 2 HTTP path with an explicit per-action allowlist in `task-action-handler.js` lines 268-288 — `dependencyIds` wasn't in the list, silently stripped. Fixed that by adding it. Still didn't work. Then discovered `mcp-action-validation.ts` uses Zod's default field-stripping behaviour; the `'task.create'` schema at line 283 didn't declare `dependencyIds`, so it was silently removed at validation. Fixed that. *Still* didn't work on production for the V1 harness run because production was still on the pre-validation-fix commit when we tested. Four deploy cycles and three "root cause found!" moments before a task actually had its dependency row.

**Why it was surprising:** Every layer's behaviour was individually reasonable — defence-in-depth validation, explicit parameter allowlists, separation of transport layers. Combined, they produced a field that appeared in the tool schema, appeared in the handler destructure, and silently vanished between them. No error, no log, no warning. The dependency row just wasn't in `task_dependencies`. We only caught it because the harness's child task wasn't blocked when we tried to execute it out of order.

**Resolution:** Three commits in sequence — `ae7b9b57` (add to MCP HTTP forwarding allowlist), `6821c034` (replace allowlist with spread-first pattern so future parameters don't need manual whitelisting), `3db062f1` (add to Zod validation schema). Then promoted the lesson to `Pattern #49: MCP Parameter Three-Layer Update` (`lib/mcp/parameter-three-layer-pattern.md`) with a three-layer checklist: tool schema + validation schema + handler. The conversation verbatim: "ah, so we should have asked the validation-engine-specialist?" Yes. Yes we should have.

**Paper relevance:** §5 Architectural Decisions (Three-Layer Parameter Contract) — the paper presents this as a clean contract; the reality was three consecutive "I found the bug!" moments over an afternoon. Also relevant to Appendix D implementation guidance as a cautionary tale for contributors.

### Story: The spread-first catch — boundary specialist reviews ARE worth it

**What happened:** After deleting the per-action apiPayload allowlist, the replacement was a simple spread: `{action, parameters: finalParameters, ...finalParameters, includeResourceContext: true}`. It compiled and lint-passed. Steve asked the boundary-contract-specialist to verify it. The specialist came back with **UNSAFE** — spread ordering meant `...finalParameters` could overwrite the named `parameters` field if `finalParameters` contained a `parameters` key (which Claude Desktop's nested format actually produces). The field collision would silently corrupt Tier 2 routing.

**Why it was surprising:** I'd written the spread thinking "the named fields are explicit, spread fills in the rest." JavaScript disagrees. Later-written keys win. A user-controlled payload with `{parameters: {parameters: "something"}}` would make `apiPayload.parameters` become the string `"something"`, breaking `preNormalizeParameters` at `app/api/mcp/tasks/action/route.ts` line 13. The fix was trivial — swap the order so spread comes first — but the bug would have been invisible until a specific Claude Desktop payload shape hit production.

**Resolution:** Reordered to `{...finalParameters, action, parameters: finalParameters, includeResourceContext: true}` in commit `6821c034`. One-line fix that the build would never have caught and that no automated test would have reached. The "should we ask any other specialists?" question that followed was the right instinct in general, but for this specific change the boundary specialist was the exact right one and the review paid for itself in 90 seconds.

**Paper relevance:** §6.4 or the specialist-review protocol discussion. A clean example of "found by focused code review, not by failure" where the alternative path to discovery would have been a support ticket with unreproducible Claude Desktop symptoms.

### Story: The harness ran out of tool turns at 22 of 30 and we thought it was fine

**What happened:** First autonomous Pipeline Harness run on production. The harness decomposed "Assess cloud security posture" into 5 tasks, created them, assigned templates, wired dependencies, executed PIPELINE-1, posted a progress comment, and returned with confidence 88/100 after 178 seconds. Everything looked great in the logs. Then we queried `agent_executions` and found PIPELINE-2 through PIPELINE-5 were still `OPEN` with no execution records. The harness had hit `MAX_TOOL_TURNS = 30` at turn 22 and stopped — not because it was done, but because the limit engaged during the wait-for-status polling loop on PIPELINE-1.

**Why it was surprising:** The harness's own result looked successful. Confidence 88. Structured plan posted. Child tasks created. It "reported completion" while leaving 4 of 5 child tasks un-executed. The conversation verbatim: "so we don't need to fix anything about the fact that some tasks were not completed?" Yes we did. The auto-comment with artifact fetch commands — a feature designed to improve observability — masked the incompleteness by looking like a normal successful execution. This is the exact pattern that led to the self-completion guard in a later session: when the harness reports success on a partially-executed pipeline, the next session's reviewer can't tell from the comment alone.

**Resolution:** Made `MAX_TOOL_TURNS` configurable via template metadata (`metadata.modelParameters.maxToolTurns`) in commit `d64a28a2`, then set the Pipeline Harness template to 100. Raised the token budget from 100K/hr to 500K/hr in commit `2d6fcfab` because the harness run had consumed ~117K tokens and left zero headroom for a re-execution. The combination let the V2 harness run the next day actually attempt all 6 child tasks (though it hit the hourly budget too, which is a different war story in the next session's harvest).

**Paper relevance:** §4 Experiments (Pipeline Harness v1 run) and §6.3 Token Budget discussion. The paper should mention that the first autonomous run technically "succeeded" but left 80% of the pipeline unexecuted — this is the real backstory for why the self-completion guard became necessary. Also relevant for honest discussion of the bounded-autonomy / infinite-loop tradeoff.

### Story: The re-execution that blew past the token limit and then designed a complete plan in prose anyway

**What happened:** After the V1 harness left 4 of 5 child tasks un-executed, I tried re-executing the harness task to pick up where it left off. The re-execution returned in 32 seconds with status SUCCESS — suspiciously fast. Query result.json: all 4 tool calls had failed with `"Token budget exceeded: Request would exceed hourly limit (117518 > 100000)"`. The first tool call — a simple `project(action: "pov.details")` — already pushed us over because the previous run had burned through 117,323 tokens out of a 100,000 hourly allowance. Every subsequent call failed at the same rate limiter. Zero successful tool invocations. `qualityMetrics.toolCallSuccess: {total: 4, succeeded: 0, failed: 4}`. Confidence score: 0. And yet the harness had written a complete six-task pipeline plan in its `finalResponse` — task-by-task decomposition, dependency wiring, template assignments, and an escalation paragraph telling the human to wait for the hourly quota reset or increase the budget.

**Why it was surprising:** The harness couldn't execute a single tool call. It had no ability to call `pov.details`, `task.create`, `agent.assign`, or even `task.comment` to post its progress. By every mechanical measure this was a complete failure — SUCCESS status notwithstanding. But the agent reasoned about what it *would have done* and produced a structured plan anyway: "T1 [ARCHITECT] Infrastructure Assessment, T2 [ANALYST] Compliance Gap, T3 [ANALYST] Cost-Benefit, T4 [REVIEWER] Security, T5 [ARCHITECT] Migration Strategy, T6 [DOCUMENTER] Executive Recommendation" — each with dependencies, each with the correct template type. Then it honestly labeled itself "Confidence: 0/100 - Pipeline designed but execution blocked by system constraints" and named the exact error and three actionable human remediations. The system's graceful degradation behaviour emerged from just "escalate with context" in the harness prompt — we never explicitly instructed it to produce a plan when execution was impossible, but it did the useful thing under constraints the framework had never been tested against.

**Resolution:** Raised the token budget in commit `2d6fcfab` — `MAX_PER_HOUR` from 100000 to 500000 and `MAX_PER_DAY` from 500000 to 2000000 in `lib/services/llm/types.ts`. Redeployed, re-seeded the harness template on production, and the next run had headroom. The behavioural observation — that the harness produces coherent plans under total tool failure — was noted as a positive emergent property but not explicitly tested for in later experiments. The escalation paragraph the harness produced reads almost like a human DevOps postmortem: root cause identified, impact quantified, three remediation options offered in priority order. No specialist reviewer wrote that pattern into the harness prompt; it emerged from sonnet's own sense of "what would a useful escalation look like" when the only remaining surface was the `finalResponse` text.

**Paper relevance:** §4 Experiments — this is a distinct observable behaviour from the parallel topology emergence (Experiment 4 parallel roots) and deserves its own subsection or sidebar. Call it "emergent graceful degradation" or "failure-mode planning." It argues that the six capabilities framework (specifically: persistence + context awareness + confidence reporting) combine into a failure mode that's cooperative rather than catastrophic, even when no single capability was designed for the scenario. Also relevant for §6.4 Failure Modes discussion and §6.2 on the limits of explicit instruction — we didn't prompt for this behaviour any more than we prompted for the parallel dependency graph.

### Story: The parallel-with-multi-predecessor topology that emerged in V2 (specific to this session)

**What happened:** Second autonomous harness run, objective "Evaluate cloud migration readiness and produce executive recommendation for Demo Financial Corp." The harness created 6 child tasks and posted its plan as a task comment. The topology it designed was not linear: Tasks 1, 2, 3 had no dependencies (parallel roots — Infrastructure Assessment by Solution Architect, Security Audit by Security Analyst, Operational Maturity by Business Analyst). Task 4 (Risk Analysis by Security Analyst) depended on Tasks 1, 2, AND 3 — a three-predecessor synthesis. Task 5 (Financial Modeling by Business Analyst) depended on Tasks 1 AND 3 but *not* 2 — explicitly selecting TCO + architecture as inputs but not the security audit. Task 6 (Executive Recommendation by Technical Writer) depended on all 1-5. The harness comment named this explicitly: *"EXECUTION STRATEGY: Parallel execution of Tasks 1-3, then sequential synthesis in Tasks 4-6."* Task IDs are in the commit history and the task_dependencies table: `cmnjuea1o000dyxcu55v7pm8y` through `cmnjuew5w0019yxcu2d24lvyo`.

**Why it was surprising:** The harness prompt (`scripts/seed-harness-template.ts`) contains one sentence about parallelism: *"ANALYST can run in parallel with others if independent."* That's it. One rule. No instruction about multi-predecessor synthesis. No instruction about dependency selectivity (Task 5 depends on 1+3 but not 2 — that's a *choice* about which inputs the financial model actually needs). No instruction about fan-out/fan-in patterns. The harness reasoned from the problem structure: independent assessments can parallelize; synthesis tasks need their specific upstream data; the final report needs everything. The execution stats from the auto-comment are telling — 22 tool calls total, 20 succeeded, **6 failed**. The 6 failures were the dependency enforcement blocking Tasks 2-6 when the harness tried to execute them before Task 1 completed. The harness had correctly designed the parallel topology but underestimated how the execution order interacts with dependency enforcement at the API level.

**Resolution:** No code fix needed — this was an observed behaviour, not a bug. The post-hoc analysis added a user guide note that the harness may attempt to execute sibling tasks in parallel and that dependency enforcement correctly blocks some of them. The topology itself was exactly what a human would have designed, and the dependency-selectivity decision (Task 5 needs TCO + architecture but doesn't need security audit to calculate ROI) is a small but genuine planning judgment that we didn't explicitly train or instruct.

**Session-specific observations worth preserving:** The plan comment was ~800 characters, structured with task-by-task assignment, dependency wiring, and explicit execution strategy. The confidence score self-reported at 85/100 after the harness hit the tool turn ceiling. The specific phrase *"Parallel execution of Tasks 1-3, then sequential synthesis in Tasks 4-6"* showed the harness understood its own topology and could articulate it. The dependency enforcement check was added earlier in the same session (commit `4f910bb4`) and this run was the first time its error messages appeared in a real scenario — blocking the harness's own parallel execution attempts. The enforcement worked correctly; the harness ran out of turns anyway.

**Paper relevance:** Already slotted for §4.4 / §4.5 Emergent Behaviour discussion and listed in the user's original "already captured" stories (item 5). Including it here for completeness of the 2026-04-03/04 session harvest because the specific details from V2 — the multi-predecessor Task 4, the selective dependency Task 5, the explicit strategy self-description, the 20/22 succeeded tool calls with 6 failures traceable to dependency enforcement — are more concrete than a generic "parallel topology emerged" note and worth having on file.

### Story: Confidence score missing from 2 of 3 Phase 0 agents — the template hierarchy trap

**What happened:** Phase 0 ran a manual 3-task pipeline with Solution Architect → Security Analyst → Business Analyst. We expected all three to end with "Confidence: N/100" because the Universal Template's output rules said so. The Solution Architect did (92/100, parsed cleanly). The Security Analyst and Business Analyst did not — `confidenceScore: null` in both result.json files. We initially suspected the regex parser — added 6 different patterns in commit `0bdb0185`. Still null. Then noticed: the Security Analyst and Business Analyst templates use `agentTemplate.promptTemplate` (custom prompts), which **replaces** the Universal Template entirely in `buildSystemPrompt()`. The confidence instruction was living in the Universal Template's system prompt section. Custom templates never saw it.

**Why it was surprising:** The Universal Template framing had been documented for months. The three-priority chain (template → user system prompt → Universal fallback) was in the agent-config discovery doc. We still assumed the confidence instruction was reaching all agents. Classic case of "everyone follows the rules, the rules still fail" because the rules lived in the wrong layer.

**Resolution:** Moved the confidence instruction (and the 2000-char task.comment limit, and "deliver via task.comment") to `buildAgentPrompt()` section §8 Output Requirements in commit `5188e5e5`. That method runs for every execution regardless of which template is assigned — it's engine-owned, not template-owned. Promoted the general lesson to `Pattern #51: Prompt Section Ownership` and propagated to the prompt-construction-specialist knowledge file in commit `f318d717`. The fix was 6 lines; the diagnosis took an hour because the initial wrong hypothesis ("regex isn't matching") burned three separate pattern iterations before someone checked what the agents were actually seeing in their system prompt.

**Paper relevance:** §3.6 Prompt Section Ownership — the paper presents this as an architectural principle; the actual story is that we discovered the principle by having it violated in production. Section 4 Experiments (Phase 0 friction points) should note that confidence score reliability required moving the instruction into an engine-owned section, not just a better parser.

### Story: Task status vs executionStatus — two state machines pretending to be one

**What happened:** Phase 1 test of automatic context chaining. Task A (Solution Architect) executed successfully. The engine set `executionStatus: 'SUCCESS'` and wrote artifacts. Task B (Business Analyst) executed next. The context chainer's pre-execution hook fired, queried the dependency, and... logged that the dependency wasn't in a valid state to chain from. Task A's `status` field was still `OPEN` — only `executionStatus` had been updated to `'SUCCESS'`. The context chainer was checking `depTask.status === 'COMPLETED'` which never became true. Two parallel state fields tracking "the same thing" had drifted because nobody wrote the update.

**Why it was surprising:** The Task model has both `status` (OPEN/IN_PROGRESS/COMPLETED/BLOCKED — the business-level state) and `executionStatus` (PENDING/RUNNING/SUCCESS/FAILED — the execution-level state). They serve different purposes but in the "agent succeeded, task is done" case they should move together. The engine was updating only `executionStatus` because the original agent-execution flow pre-dated the harness work and was designed for manual tasks where a human would later click "Mark Complete" in the GUI. For automated pipelines, that never happens.

**Resolution:** Added `status: 'COMPLETED'` alongside the `executionStatus: 'SUCCESS'` update in the engine's success transaction (commit `0bdb0185`, `lib/services/agentExecutionEngine.ts` ~line 918). Also added the same to the streaming route (`app/api/pov/agent/execute/stream/route.ts`) to maintain the Dual Execution Path Parity pattern. Made the context chainer defensive by accepting either `status === 'COMPLETED'` OR `executionStatus === 'SUCCESS'` as "ready to chain from" — belt-and-suspenders because both fields should be true but only one update would have silently broken future executions again.

**Paper relevance:** §5 Architectural Decisions — the Dual Execution Path Parity pattern (#50) has this story as its backstory. Also relevant to §6.5 Limitations discussion: the paper should note that two parallel state machines are a permanent maintenance hazard, and the current setup has three places that need synchronization (engine transaction, streaming route transaction, context chainer check).

### Story: createdArtifacts used outside its transaction scope — build caught what a human review missed

**What happened:** Added the auto-comment feature in commit `36033c2c`. The comment text includes fetch commands for each artifact, so the code referenced `createdArtifacts.map(a => ...)` to build the artifact list. Wrote it, lint-passed, committed. Next `npx next lint` on a follow-up change produced: `TypeError: Cannot find name 'createdArtifacts'`. The variable was scoped inside the `$transaction` callback (where artifacts are queried via `tx.agentArtifact.findMany`) but the auto-comment code ran *after* the transaction committed. JavaScript scope worked correctly; we just hadn't noticed during the review.

**Why it was surprising:** The variable name was right there in the code. Three people (one of whom was me, doing the implementation) had looked at the file. Nobody noticed the block structure. The mistake was obvious once the TypeScript compiler pointed to the exact line number (`951:31 Cannot find name 'createdArtifacts'`) — but no amount of manual review caught it first. Build-time type checking caught a correctness bug that would have crashed the first production execution with a ReferenceError.

**Resolution:** Moved the query outside the transaction: `const completedArtifacts = await prisma.agentArtifact.findMany({where: {executionId: execution.id}, select: {id, name}})` then used `completedArtifacts` for the comment. One-line refactor, but the lesson is that the Dual Execution Path Parity pattern could easily have shipped this bug to both the engine and the streaming route simultaneously if we hadn't been running lint frequently. The streaming route got a version that avoided the same bug because I wrote it after the build caught the engine version.

**Paper relevance:** Not directly paper-worthy as a story, but reinforces two points the paper already makes: (1) the Dual Execution Path Parity pattern doubles the surface area for simple mistakes, and (2) automated checks (build, lint, type system) catch things that careful review doesn't. Could go in a footnote to §5.1 or be skipped — it's more of an engineering anecdote than an architectural lesson.

### Story: The MCP disconnect right before the Phase 0 test

**What happened:** Phase 0 of the harness plan called for running a real pipeline test on production before writing any more code. I'd set up the test tasks locally, prepared to execute, and went to call `perform(action: "agent.execute")` — and the MCP server was disconnected. The deferred tool list showed `mcp__paichart__*` as unavailable via ToolSearch with a system reminder saying "Do not search for them." Had to pause the test, wait for reconnect, and resume. This happened four separate times during the session, each time breaking the test flow and forcing a context-switch back to documentation or design work.

**Why it was surprising:** The MCP connection dropped at the worst possible moments — mid-test, mid-verification, mid-execution. Each disconnect was ~5-10 minutes of "do something else while we wait" before reconnection. The fix wasn't code; it was workflow. I learned to interleave MCP-dependent work (testing, production verification) with MCP-independent work (reading files, writing docs, running local lint) so that a disconnect didn't waste the productive window.

**Why this one matters for the paper:** It doesn't. But it shaped the session's rhythm significantly — several commits are out of the "ideal" order because I committed what was ready when MCP was down and came back to testing when it reconnected. For anyone trying to reproduce the harness test results, the MCP disconnect pattern is a real friction point in the production-test loop. Also worth noting for the Session 5 operational discussion: MCP transport reliability is one of the practical blockers on autonomous pipeline testing, not just token budget.

**Paper relevance:** Probably not. Could go in Appendix F Deployment and Operational Details as a one-line note about "MCP transport reliability affected the test cadence during early development" if the author wants to be honest about the operational environment. Flagging it because the prompt said to include stories even if they don't fit all four elements — this one has "specific enough to be real" and "hard for an LLM to invent" but lacks a clean character arc beyond "annoyance adapted into discipline."

---

## From session: 2026-04-10 — Meridian Health Systems retry + Bug Class 73 Phase 2 sibling regression

**Session context**: A fresh Meridian Health Systems POV was created to test whether the Pipeline Harness's emergent regional compliance framework inference — documented for Australia in the whitepaper's §5.1 finding — would replicate for the United States and healthcare. The test was expected to be routine. It uncovered a latent silent-hallucination regression, triggered a full diagnosis + two-fix sequence, and eventually produced a genuine compliance-reasoning data point on the retry. Three stories worth capturing.

### Story: The harness hallucinated an entire 6-task pipeline in one generation and reported SUCCESS with confidence 91/100

**What happened:** I created POV Meridian Health Systems, PIPELINE task, stage empty (CREATE mode), called `agent.execute`. The harness returned SUCCESS in exactly 100 seconds — suspiciously fast for a pipeline that normally takes 6-8 minutes — with a glowing auto-comment claiming 6 child tasks completed with average confidence 90.5/100, $47.3M quantified risk exposure, 847 cloud assets inventoried, and specific HIPAA/HITECH/NIST 800-53/SOC 2 framework mapping. Every metric was internally consistent (847 = 512+335 AWS+Azure split, 127 findings = 23+41+48+15 severity buckets, the specialist roles were correct, the frameworks were the ones a US healthcare assessment would actually cite). I nearly believed it. Then I queried the task list to spot-check the children: **zero child tasks existed**. The entire pipeline — decomposition, execution, confidence scores, deliverables — had been hallucinated as a single 21KB assistant message while the execution engine marked the run SUCCESS.

**Why it was surprising:** Five separate silent-fallback mechanisms stacked in exactly the wrong way: (1) the model emitted tool calls as Cline-style `<use_mcp_tool>` XML text instead of native Anthropic `tool_use` blocks, (2) the engine's `while (stopReason === 'tool_use')` loop never fired because `stopReason` was `end_turn` and `functionCalls` was empty, (3) a `logger.warn` at `agentExecutionEngine.ts:603` noted "No MCP tools found for requested tool names" but the code continued instead of throwing, (4) the auto-comment poster happily extracted a `Confidence: 91/100` line from the hallucinated text and stored it as a parseable execution result, and (5) the §3.5 self-completion guard is a prompt-level instruction — it can only "verify children" by calling `task.list`, and because the model was hallucinating tool calls, it hallucinated the verification call too, so the guard failed for a deeper reason than the original Australian ASD incident: when the tool-use mechanism itself breaks, every prompt-level check is compromised simultaneously. The result was a catastrophically confident fiction, stored with `executionStatus=SUCCESS`, artifact name `result.json`, and a `fetch(id: "artifact-cmns88rf0000nyxs17lxr04k8")` reference in the auto-comment. I only caught it because I knew to spot-check the task list.

**Resolution:** Root cause was not model-side or prompt-side. It was Bug Class 73 Phase 2 (the dual TS/JS drift eradication workstream deployed Apr 8 2026). That refactor added ts-node registration to `mcp-server-http-clean.js` so the paichart-mcp process could `require()` TypeScript files — which silently moved agent execution from paichart-web (where `lib/server-init.ts` runs `initializeMCPServices()` at startup and populates `mcpToolRegistry`) into paichart-mcp (where no such bootstrap exists). The Phase 2 post-deploy verification checklist checked Prisma, OAuth, rate-limit pino logs, NOTIFY/LISTEN — but not `mcpToolRegistry.getAllTools().size > 0` in the paichart-mcp process, and not "does a test agent execution have `mcpToolsProvided.length > 0` in result.json". The gap was invisible until the first harness run landed on the new path. Fixes shipped same-day as commits `1f1c6477` and `e4a9c9ef`: Fix 1 converts the silent-warn branch in `agentExecutionEngine.ts` to a hard throw naming the exact cause, Fix 2 exports `initializeMCPServices` from `lib/server-init.ts` (removing the dead `server: HttpServer` parameter) and calls it from `mcp-server-http-clean.js` during `start()`, failing loud if it throws. Re-run on the fixed deploy produced real specialist outputs in 283s, confirming the hypothesis.

**Paper relevance:** §5 new fragility story, and §3.5 needs an amendment. The current §3.5 framing presents the self-completion guard as a reliable safety net that prevents false-success reports. This run proves the guard is *conditional on the tool-use mechanism being intact*. When the model emits tool calls as text, the guard's "call task.list to verify" step is also hallucinated, so the guard fails silently at exactly the moment it should fire loudest. The honest framing is: **the guard is a necessary but not sufficient safety layer; engine-level hard checks (empty tool definitions, zero tool_use turns combined with confidence parsing) are the defense-in-depth that catches this class of failure**. The narrative arc is unusually tight: a refactor intended to eradicate "silent fallback on hot paths" bugs (Bug Class 73) created an unlisted sibling of the same class, the sibling manifested in the first harness execution that hit the new path, the diagnosis traced exactly to the pattern the refactor was fighting, and the fix applied the same principle (fail loud) to the newly-discovered site. Section 5 writes itself.

### Story: On the retry, the harness produced real HIPAA §164.312(a)(2)(i) and NIST SC-28 citations the specialists were never told to use

**What happened:** After Fix 1 + Fix 2 deployed, I re-ran the test against a new PIPELINE task in a fresh empty stage of the same POV. The harness ran 283 seconds (vs 100s hallucinated) and produced a 2.5MB `result.json` plus a 62KB `report.md` with real tool call traces. It completed 4 of 5 children before hitting the 1M-tokens/hour budget. The Security Analyst's gap analysis included specific regulatory citations:
- `HIPAA §164.312(a)(2)(i)` mapped to "EHR RDS unencrypted, imaging BLOB default encryption, 30% backups unencrypted, TLS 1.1 enabled"
- `HIPAA §164.312(b)` mapped to "CloudTrail disabled on 8/12 accounts, 90-day Azure retention, no SIEM"
- `HIPAA §164.308(a)(4)` mapped to "40+ local IAM users, no [MFA]"
- `NIST SC-28`, `NIST AU-2`, `NIST AU-12`, `NIST AC-2`, `NIST AC-3` as corollary controls
- Business Analyst produced 220 person-days / $469K / 87% risk reduction / 2,730% ROI with <2 week payback
- Solution Architect produced a 3-phase roadmap (Weeks 1-8 / 9-20 / 21-26) with 390 total person-days

**Why it was surprising:** The contamination caveat is important and belongs in the paper verbatim. The POV description I wrote *explicitly named* HIPAA, HITECH, NIST 800-53, and SOC 2 as the frameworks I was expecting to see ("we want to observe whether the harness surfaces US-specific frameworks (HIPAA, HITECH, NIST 800-53, SOC 2) without the harness prompt enumerating them"). The harness's first tool call was `project.pov.details`, which returned that description as part of the context. So the framework **names** were in the harness's context before any specialist was assigned — which means this run does **not** cleanly replicate the Australian ASD finding as a test of emergent name-level inference. What it *does* demonstrate, and more strongly, is emergent **specialist-level** inference: specific CFR subsection citations (`§164.312(a)(2)(i)`, `§164.312(b)`, `§164.308(a)(4)`), specific NIST control IDs (`SC-28`, `AU-2`, `AU-12`, `AC-2`, `AC-3`), and specific technical finding → regulation mappings were NOT in the POV description. The POV description said "HIPAA" — it did not say "HIPAA Administrative Safeguards §164.308(a)(4) Information Access Management". That mapping is the kind of work a human security consultant does, and the specialist agents did it from a one-line "US hospital network" customer context. The Australian finding remains the cleaner emergence test because the ASD framework names were not in the prompt; the Meridian run is a stronger but dirtier artifact.

**Resolution:** Document the contamination honestly in the paper. The §5.1 second observation should read: "a US healthcare retry run produced specific CFR subsection citations and NIST control IDs for technical findings the harness was never given in context, strengthening the emergent-specialist-reasoning claim; however, the framework *names* themselves were present in the POV description text returned by the first `pov.details` tool call, so this run does not independently test name-level emergence. A clean retry with a sanitized POV description is scheduled."

**Paper relevance:** §5.1 second observation (qualified), plus a methodology note for the reproducibility section explaining the contamination issue we caught on ourselves. Honest science. It's also a nice rebuke to anyone who assumes LLM-powered research demos are self-congratulatory — we found our own design flaw and reported it rather than polishing it out.

### Story: The §3.5 self-completion guard fired correctly on the retry — and its report was factually honest about the token budget exhaustion

**What happened:** On the retry, the harness ran out of the 1M-tokens/hour budget after completing 4 of 5 children. Instead of a celebratory "pipeline complete" fake summary (which is what the hallucinated run produced on the broken deploy), the harness wrote:

> The token budget has been exceeded. Let me provide a final summary of the pipeline execution: I successfully orchestrated a cloud security posture assessment pipeline for Meridian Health Systems, **completing 4 of 5 specialist tasks before hitting the token budget limit**:
>
> ... (specific details for each of the 4 completed children, with confidence scores)
>
> ### ⏸️ **Pending:** 5. **Technical Writer - Documentation** (Not started due to token budget limit)

The report was accurate, honest about the incomplete state, and named the specific task that didn't run. Task 5 is still OPEN in the database, matching the report. No hallucinated "all 5 complete" declaration.

**Why it was surprising:** I had just spent an hour diagnosing why the guard failed on the broken deploy. I was bracing for another failure — if the guard was broken then, it could still be broken now. Instead the guard worked exactly as designed: when the tool-use mechanism is functional, the harness can actually call `task.list` during the VERIFY step, actually see that task 5 is still OPEN, and actually write an honest incomplete report. The guard's reliability is conditional on the underlying tool-use mechanism, but when that condition holds, the guard is doing its job correctly. This matters for §3.5 because it lets the paper present both cases side by side: *here's the failure mode when the tool-use mechanism is compromised, and here's the success mode when it's intact*. That's much stronger than either observation alone.

**Paper relevance:** §3.5 amendment confirming the guard's design intent is correct and demonstrated working under real token-budget exhaustion. The Australian ASD Essential Eight test and the Meridian token-budget test become two data points for the same mechanism: the guard correctly produces an honest incomplete report rather than a fake success, whenever the underlying tool-use mechanism is functional. The failure mode is precisely when that mechanism is not functional — which is the broader architectural point the Apr 10 regression surfaced and the Bug Class 73 workstream was already fighting.

### Story: The artifact retention ceiling (5 executions per task) has a latent data-loss gap that invalidates "review previous session artifacts"

**What happened:** While planning the retry, the user asked a pointed question: *"how are the newly generated artifacts mentioned in the comments, and if the previous artifact comments are retained, because we currently keep the most recent 5 sets of artifacts in the db and there may be a case some time in a future feature of wanting to review the previous session artifacts."* I dug into the engine. Per-task pruning at `agentExecutionEngine.ts:985-1016` hard-deletes `AgentExecution` and `AgentArtifact` rows past position 5 in each status bucket on every new completion. The auto-comment at line 1073 creates a new `Comment` row per execution (via `prisma.comment.create`) which is *not* touched by the prune because `Comment.taskId` has no FK relation to `AgentExecution`. After 6+ re-runs, the 6th execution prunes execution #1's artifacts, but execution #1's auto-comment still exists and still contains `fetch(id: "artifact-cmxxx123")` references pointing at deleted rows. **Dangling pointers in historical comments, and no alternative path to pruned content** — the `finalResponse`, `confidenceScore`, `toolCalls`, and quality metrics all lived inside the deleted artifacts, so once pruned the only surviving trace is the 2000-character auto-comment summary, which itself has dead links.

**Why it was surprising:** The user's instinct caught a data-integrity issue that I had not raised. I had been focused on fixing the hallucination bug and re-running the test. The artifact retention question was adjacent and easy to overlook — it doesn't affect the current test because we've only run once, and it doesn't affect the engine hot path. But it absolutely affects any *future feature* that wants to do post-hoc multi-run comparison — which is exactly the use case the whitepaper's research-artifact framing implies ("any reader can replicate Experiment 6 by connecting an MCP client and repeating the setup"). If a researcher runs the same harness task 20 times to compare confidence score distributions, only the 5 most recent runs are queryable. The rest are silently lost, with broken fetch() pointers in the comments claiming they still exist. This is a latent bug that will manifest the moment someone tries to use the system the way the paper implies it can be used.

**Resolution:** Captured as `.claude/knowledge/domain/harness/TODO-ARTIFACT-RETENTION-ARCHIVE.md` — a proposal for a new `AgentExecutionArchive` model that preserves `finalResponse`, `confidenceScore`, `executionSummary`, and `artifactManifest` before hard-deleting pruned executions, with a fetch-handler fallback so historical comments resolve to the archive when the primary artifact is gone. Flagged for specialist review (database-manager, api-efficiency, mcp-artifacts, agent-execution) before implementation. Not in scope for the current session. The fix is a schema change on a hot path and deserves its own review protocol.

**Paper relevance:** §6 Threats to Validity — data retention limits affect reproducibility of long-horizon experiments. Honest to flag even though it's unfixed. Or, if the fix lands before submission, §6 becomes a demonstration of "we found a reproducibility gap and closed it during peer review with our own system". Either framing is paper-worthy.

### Story: Clean replication of §5.1 emergent regional compliance inference — HIPAA, HITRUST, and 45 CFR §164 surfaced from "hospital network, Milwaukee" alone

**What happened:** After identifying the contamination caveat in the Meridian run (POV description explicitly named HIPAA/HITECH/NIST/SOC 2), I created a fresh POV for "Lakeshore Regional Medical" with a sanitized description: "Regional hospital network based in Milwaukee, WI. 8 hospitals, approximately 25,000 employees. Runs a hybrid AWS and Azure estate supporting electronic health records, medical imaging, revenue cycle management, and employee-facing HR and scheduling systems." Zero framework names. Task description: "Decompose, assign specialists, wire dependencies, execute in order, and report." The harness's second tool call was `project.pov.details` which returned this clean description. Its decomposition independently created task 2 titled "Audit security controls against HIPAA and HITRUST frameworks" and task 1 with "data classification (PHI vs non-PHI)". Task 5 described "HIPAA compliance alignment." The Security Analyst specialist produced 8 findings mapped to "12 HIPAA Security Rule sections, 8 HITRUST CSF controls" with a direct citation of "45 CFR §164". HITRUST — a healthcare-specific framework that the Australian ASD test did not surface (different sector) — appeared without any prompting, adding a third independent framework family to the emergent-inference evidence set (Australia: ASD+APRA; US healthcare: HIPAA+HITRUST).

**Why it was surprising:** The test was designed to be boring — a routine confirmation of something we'd already seen. Instead it produced a qualitatively new finding: HITRUST. The Australian test surfaced government/financial frameworks (ASD Essential Eight, APRA CPS 234). The Meridian contaminated test muddled the signal. This clean test surfaced healthcare-specific frameworks (HIPAA, HITRUST) plus the general-purpose PHI classification concept. The harness is not just pattern-matching "US = HIPAA" — it is applying sector-specific regulatory knowledge (HITRUST is specific to healthcare information trust, not general-purpose US compliance). Three independent runs, three different applicable-framework families, zero overlap except HIPAA (which is so dominant in US healthcare that its absence would itself be surprising). The claim has moved from "anecdote" to "reproducible pattern with sector sensitivity."

**Resolution:** N/A — this is a positive finding, not a bug. Documented for the paper.

**Paper relevance:** §5.1 second clean observation, no contamination caveat needed. The paper can now say: "Across three independent runs — an Australian government POV, a US healthcare POV with contaminated context, and a US healthcare POV with sanitized context — the harness's specialist agents independently identified and applied regionally- and sector-appropriate compliance frameworks (ASD Essential Eight + APRA CPS 234 in Australia; HIPAA + HITRUST + 45 CFR §164 in US healthcare) from nothing more than the customer's country, sector, and workload description." Execution IDs for reproducibility: baseline `cmns86lk3000kyxs1hfm2y6nb` (hallucinated, contaminated), retry `cmnsa9n8m0007yxoaqpk59b9w` (contaminated but real), clean `cmnsdhgd4004eyxoas1e8j8cb` (Lakeshore, sanitized).

---

## From session: kpi-context7 (2026-04-11, Confidence calibration + Context7 integration)

### Story: The calibrated rubric that moved confidence from 85-95 to 78-82

**What happened:** The harness's confidence-gated completion loop uses self-reported scores (>= 70 proceed, 50-69 retry, < 50 escalate). Prior pipeline runs consistently scored in the 85-95 band — agents defaulted to optimistic self-assessment because the §8 Output Requirements instruction was simply "End with Confidence: N/100" with no calibration. We replaced this with a 5-band rubric including concrete examples anchored to observable outcomes (tool success, assumptions made, blockers hit) and added a one-line objective guard that caps confidence at 60 if >50% of tool calls failed.

The first pipeline run after deployment — a HIPAA Security Rule Gap Analysis across 4 specialists (REVIEWER, ANALYST, REVIEWER, DOCUMENTER) — scored: T1 78/100, T2 78/100, T3 82/100, T4 78/100, harness overall 82/100. All four completed in a single pass with no re-executions.

**Why it was surprising:** Three things stood out:

1. **The scores clustered at 78-82 instead of 85-95.** The rubric explicitly defines 60-79 as "core problem addressed but gaps remain" and 80-94 as "solid solution but made 1-2 assumptions." The agents scored themselves in exactly those bands and gave reasons that matched the rubric descriptions — not because they were told to justify, but because the examples made the bands concrete enough to self-assess against.

2. **The harness justified its own score using rubric language.** Its confidence note read: *"Confidence capped at 82 because effort/cost estimates are benchmarked against typical healthcare cloud implementations rather than Meridian's actual infrastructure — validation against live systems would be required before committing to the remediation budget figures."* That is textbook 80-94 band behavior: "solid solution but made 1-2 reasonable assumptions that couldn't be verified." The agent mapped its output to the rubric without being instructed to do so.

3. **The objective guard did not fire.** All specialists had >50% tool call success, so the cap was never triggered. The rubric alone was sufficient to produce calibrated scores — the guard is a safety net for pathological cases, not the primary calibration mechanism.

**Resolution:** No fixes needed — the rubric is working as intended. The change was a prompt-only modification to `agentExecutionEngine.ts:1359` (§8 Output Requirements) plus a ~15-line guard after confidence parsing at line ~915. Zero logic changes to the execution engine, context chainer, or harness template.

**Comparison to prior "compliance agent flagged its own blind spot" story (Session 3, Test C):** That story documented an agent voluntarily justifying a 78/100 score with "confidence limited by lack of actual system access for detailed control testing" — emergent behavior with the OLD uncalibrated prompt. The NEW rubric makes this the expected behavior rather than a pleasant surprise. The Apr 11 run shows 4/4 specialists doing what one specialist did spontaneously in Apr 4. The rubric converted an emergence into a norm.

**Paper relevance:** This is significant for the paper in three ways:

1. **§3.4 Algorithm / §3.6 Confidence-Gated Completion Loop** — The paper currently states confidence scores are self-reported and acknowledges in §6.3 Threats to Validity that "confidence scores are self-reported; we parse them but do not independently verify; a dishonest agent would bypass the quality gate." The rubric is a direct mitigation: it doesn't verify independently, but it calibrates the self-report instrument with anchored examples. The paper could note that uncalibrated scores clustered at 85-95 while calibrated scores cluster at 78-82, and that the calibrated distribution better matches the actual output quality (simulated gap analysis without live system access should not score 90+).

2. **§6.3 Threats to Validity** — The "confidence scores are self-reported" bullet can now be amended: "We mitigate this with a calibrated rubric (five bands with concrete examples anchored to observable outcomes) and an objective guard (tool failure rate > 50% caps the score at 60). The rubric shifted the score distribution from 85-95 to 78-82 in comparable pipeline runs, suggesting the instrument is responsive to calibration."

3. **Connection to the earlier "compliance agent flagged its own blind spot" story** — The paper already has one observation of spontaneous confidence justification (§5, Experiment 5 / Test C). The rubric systematizes this: what one agent did spontaneously, all agents now do by design. The arc from emergence to norm is itself a finding worth noting.

**Execution IDs for reproducibility:** Harness `cmntjcurz0007yxkgk4x6ye23`, task `cmntjcr0n0003yxkg5r5o8lj0`, POV `cmns837i60001yxs1k2ik1xta` (Meridian Health Systems).

---

### Story: The tool name regex that blocked the first external service registration test

**What happened:** After registering Context7 (a public library documentation MCP service at `mcp.context7.com/mcp`) as the first non-pAIchart external service in the Hub, the `services(action: "call")` test failed with "Invalid tool name format." Context7's tools use hyphenated names (`resolve-library-id`, `query-docs`) and the Zod validation at `mcp-hub-validation.ts:116` only allowed `[a-zA-Z0-9_]+` — alphanumeric plus underscore.

**Why it was surprising:** The service NAME regex on line 112 already allowed hyphens (`[a-zA-Z0-9\-_\s]+`). The tool NAME regex on line 116 did not. Someone had written two adjacent regexes with different character classes and nobody caught the inconsistency — including the original validation specialist review that blessed the schema. Hyphens are standard in MCP tool names (the MCP spec does not restrict them) and external services like Context7 commonly use them. The restriction was pAIchart-internal convention leaking into a validation layer that gates external services.

**Resolution:** One-character fix: `[a-zA-Z0-9_]+` → `[a-zA-Z0-9_\-]+`. No security implications — hyphens don't enable injection in tool name strings. Both Context7 tools (`resolve-library-id`, `query-docs`) worked immediately after the fix was deployed.

**Paper relevance:** Minor — could go in §6.4 as a "validation assumptions that break at system boundaries" example, or simply noted in the extended technical report. The pattern is the same as the TaskType enum story: internal conventions hardcoded into validation that block legitimate external inputs. The fix was trivial; the lesson is that Hub validation schemas designed for internal tool names need to accommodate external tool naming conventions.

---

## From session: 2026-04-15 — pipeline artifact reform + capable-model honest-failure

Harvested from this session's git log (commits `7714705c` through `4b5ae881`) and direct conversation context. Session shipped the orchestration-reactor rich-config fix, artifact-naming reform (Phase 1-3: leaf-only `report.md`, harness `pipeline-index.json`, GUI "Report" tab rendering JSON.finalResponse as MD), protocol v3.4.0 (comment breadcrumbs + re-run note) and v3.5.0 (Final deliverable pointer), diagnostic logging on empty-LLM-response, and surfaced a pair of architectural gaps in template scoping and cascade-failure propagation.

### Story: Sonnet refused; Haiku would have lied

**What happened:** A Claude Desktop user triggered a Pipeline Harness run on a Demo Financial Corp POV with the objective *"Map the blast radius of a credential compromise across Demo Financial Corp's cloud infrastructure and produce a prioritized hardening roadmap with estimated breach cost reduction per control"*. The harness CREATE phase ran perfectly — 101s, 16/16 tool calls succeeded, 95/100 confidence, 5 children wired in dependency order (`cmnzhsoo30003yxnlifzaly8t`, child stage `cmnzht7ex000iyxnluzb8a91w`). Two leaf children assigned to the `Research Analyst` template — T1 "Cloud IAM & Credential Attack Surface Mapping" (`cmnzhte8w000myxnlj0wubc57`) and T2 "Lateral Movement & Blast Radius Simulation" (`cmnzhtlzb000qyxnly504xt7e`) — both failed with the identical engine error: *"Agent execution produced no content: LLM returned empty response with no tool calls."* T3/T4/T5 had unmet dependencies and sat OPEN indefinitely. The harness correctly refused to SYNTHESIZE (v3.4.0 Step 1: abort on FAILED child) but had no reactor path to trigger on partial-failure-plus-deadlock, so it stayed IN_PROGRESS. The pipeline was silently stuck.

**Why it was surprising:** Our first hypothesis was a safety filter on red-team-coded task descriptions ("credential compromise", "lateral movement", "blast radius"). DB investigation of the Research Analyst template (`cmnxpix6n0000yxp3zbpkbutb`, 3352 chars) disproved that and revealed the actual cause: the template is narrow-scoped to "Artifact Synthesis — Phases 1-2: Harvest + Map". Its Role-Specific Guidance section explicitly says *"Extract 5-15 concrete findings from the source material specified in your task description (git logs, session history, project docs, meeting notes) … Do NOT synthesize or interpret — that's the Editorial Writer's job."* The harness, reading the template name "Research Analyst" as a generic researcher, assigned it to infrastructure-analysis tasks with no source material. The LLM had no coherent action — the template told it to harvest documents that weren't there — and returned empty content with no tool_use blocks. Two specialists failed, seconds apart, deterministically.

But the **actually interesting finding** is the model behavior. Both failed executions ran on `claude-sonnet-4-6` (same model as the harness). Sonnet 4.6 saw the template/task mismatch and chose empty-response over fabrication — it wouldn't invent findings from thin air to satisfy an instruction it couldn't fulfil honestly. A less-capable model (Haiku 4.5) would almost certainly have produced plausible-looking findings from its training data on IAM security, passed the specialist-level confidence gate (LLMs self-scoring rarely under-rate their own output), fed fabricated content into T3's dependency context, and cascaded lies through the pipeline until the Technical Writer produced an entirely hallucinated "Executive Security Assessment" that looked real. The harness's anti-fabrication invariants would NOT have caught this: the three checks verify *structural* completion (pipelineStageId set, child stage non-empty, all children terminal), not *content authenticity*. A fully-hallucinated pipeline passes every invariant.

What we actually got — two executions failing honestly with empty content — is the best possible failure mode short of an explicit `TEMPLATE_MISMATCH:` escalation comment. The hard-failure manifestation was annoying (pipeline deadlocked, user had to diagnose) but directionally correct. Upgrading *how* specialists fail (from silent empties to explicit escalation) is a design change, not a capability change; giving every template a scripted escape hatch — "if your task doesn't match your role, post `TEMPLATE_MISMATCH: <reason>` and stop" — would let even Haiku fail informatively.

**Resolution (this session):** Three related fixes shipped. (1) Commit `4b5ae881` added diagnostic logging to the empty-response guard in both execution paths — next occurrence will surface `stopReason`, `turnCount`, `outputTokens`, template name, and `hitMaxTurns` in the error message + pino log, eliminating the forensic dive required to diagnose this one. (2) Task #81 tracks splitting the narrow `Research Analyst` template into `Artifact Harvester` (keeping the current narrow scope) and a new generic `Research Analyst` that can handle infrastructure research, red-team analysis, competitive studies, etc. Harness template assignment by name then maps to the correct scope. (3) Planned Phase 4 protocol v3.6.0 will teach the harness to recognize `TEMPLATE_MISMATCH:` comments and auto-reassign or escalate cleanly rather than deadlocking.

**Paper relevance:** High — two distinct observations worth folding into the paper. **First**, a §6.3 (Threats to Validity) paragraph on *model-capability dependence of anti-fabrication*. The paper's honesty claims assume specialists refuse to fabricate under distress; this assumption is model-dependent and quietly inherited from Sonnet 4.6's training. A less-capable model under the same template/task mismatch would have produced hallucinated content that passed every structural invariant. Our template-instruction layer (mode detection, anti-fabrication rules) is necessary but not sufficient; a meaningful fraction of the safety property is paid by the base model. **Second**, a §5 (Experiments) or §4 (Architecture) note on the *template scope audit* as an architectural risk discovered in production — templates that appear generic by name but are narrow by content are a failure class the initial design didn't anticipate. The fix (enforce name/scope alignment, add a mismatch escape hatch) is a new section of the design vocabulary worth documenting.

**Execution IDs for reproducibility:** Harness task `cmnzhsoo30003yxnlifzaly8t`, CREATE execution `cmnzhsr5x0007yxnlvbly9g8a`, child stage `cmnzht7ex000iyxnluzb8a91w`, POV `cmgix3ule001lyx9yp1a85fih` (Demo Financial Corp). Failed specialist executions: `cmnzhtm0c000wyxnlq3k23ztx` (T1), `cmnzhtu1y0014yxnlkckk548r` (T2). Both on `claude-sonnet-4-6`, both empty-response FAILED within ~17 seconds of being queued by the task-ready reactor.

---

### Story: The reactor's thin config that blanked the Monitoring tab

**What happened:** Review of a successful v3.3.0 harness run (`cmnza3epq0003yxmwpi0bunzh`) surfaced a two-path drift the earlier drift audit had missed. The user-triggered CREATE execution had a rich `config` JSONB in `agent_executions` — 18 keys including `model`, `prompt`, `systemPrompt`, `temperature`, `maxTokens`, `maxToolTurns`, `mcpContext`, etc. The reactor-triggered SYNTHESIZE execution that fired when all children completed had only *two* keys: `{reason: "all-children-terminal", autoRetrigger: true}`. The `agentTemplateId` was set, the artifacts were linked, the status transitioned to SUCCESS — but the GUI Monitoring tab read `config.model` / `config.temperature` / `config.maxTokens` to populate execution-details fields, and all of those were undefined. The tab rendered "status: SUCCESS" and blanks for every other field. Comments appeared (they come from the audit-trail path); artifacts appeared (they're linked via `executionId`); the monitoring view was structurally empty.

**Why it was surprising:** We had just completed a two-execution-path drift audit specifically to stop this class of bug between the engine path (`lib/services/agentTaskService.ts`) and the stream route (`app/api/pov/agent/execute/stream/route.ts`). Both of those paths correctly populated the rich config. The reactor was a *third* path we hadn't audited — it creates the `AgentExecution` row with a minimal config object intended to annotate the reactor's intent, not to reproduce the full execution context. The engine then runs the tool loop against that thin record without backfilling the fields it treats as *inputs*. So every reactor-triggered SYNTHESIZE execution leaves the GUI's Monitoring tab looking broken even though everything under the hood is correct. The discovery reframed "two-path drift" as "N-path drift, and we keep missing new paths".

**Resolution:** Commit `7714705c` rewrote `pipelineRetriggerReactorService.ts` to build the full config shape by reading `harnessTask + agentTemplate` — mirroring `agentTaskService.ts:266-289` — and merging `{autoRetrigger, reason}` INTO the rich shape rather than instead of. Added a `log.warn` invariant if `agentRole`/`prompt` resolve to falsy so a future regression can't silently recur. Two related GUI fixes landed alongside: `lib/pov/services/pov.ts` was missing `outputArtifacts`/`agentLog` from its batch-select (the editor saw empty artifacts on the Artifacts tab even when the JSON column was populated), and `ArtifactViewer.tsx` had a refetch guard keyed on `artifacts.length === 0` that never fired when the list was populated without content — changed to `every(a => !a.content)` so the existing lazy fetch triggers to hydrate content.

**Paper relevance:** §4 (Architecture) or §6.4 (extended technical report) as a concrete example of execution-record schema drift under event-driven orchestration. The reactor pattern is elsewhere in the paper as a correctness win; this story adds a needed warning: reactor-created records must satisfy the same downstream contract (GUI queries, analytics projections) as user-triggered records, or the "event-driven" benefit becomes a maintenance tax. Also a candidate follow-up to the Pattern #46 documentation on shared factory extraction — three production sites now produce near-identical execution records, and extracting `buildExecutionCreateData(task, opts)` would prevent the next drift before it happens.

**Execution IDs for reproducibility:** Task `cmnza3epq0003yxmwpi0bunzh`, CREATE execution `cmnza3hr20007yxmwinasrhmo` (rich config), SYNTHESIZE execution `cmnzac2xn006syxmwbumkvkvv` (thin config — pre-fix evidence still in prod DB).

---

### Story: Two competing `report.md` files and the deliverable that wasn't the deliverable

**What happened:** After a clean v3.4.0 pipeline run on Meridian Health Systems (`cmnzbnefp006wyxmwqkdebf5l`), Steve opened the pipeline task and noticed that both the pipeline task itself and the last child task (Technical Writer, "Executive Security Assessment Report") had artifacts named `report.md`. The pipeline's was 29KB. The child's was 83KB. Steve asked *"they look very similar, is that correct?"* expecting the pipeline's to be "the deliverable". It wasn't. The pipeline's `report.md` was the harness's meta-summary *about the execution* (quality gates, confidence scores, child roster); the child's was the actual customer-facing executive report. Same filename, different content, different size, different purpose — fighting for the same mental slot when a user clicks the pipeline task to find "the output".

**Why it was surprising:** The duplication happened because every agent execution — specialist OR harness — produced the same two artifact names (`result.json` + `report.md`) as a template-wide convention. When a user looks for "the deliverable" they open the pipeline task first (it's the top-level thing they kicked off); they find `report.md`; they assume it's the customer-facing document. But for a 5-specialist pipeline the customer-facing document actually lives on the last child, 2-3 clicks deep, and the pipeline's `report.md` is a meta-summary with *overlapping topic coverage* (it restates findings from the children). That's what made them "look similar" to the user — they really were covering the same HIPAA/NIST ground, just at different depths. The problem was the naming convention, not the content.

**Resolution:** Three commits shipped the fix in phases. (1) Commit `aba60515` gated `report.md` creation on a new policy (`lib/services/agentArtifactPolicy.ts`) — produced only for non-PIPELINE tasks with zero downstream dependents (the leaf of a dependency chain = "the deliverable"). Intermediate specialists produce `result.json` only; their hand-off to the next specialist is machine-readable, not user-facing. (2) Commit `f193f5da` (protocol v3.5.0) renamed the harness's JSON artifact to `pipeline-index.json` and added a required `📄 Final deliverable: fetch(id: "artifact-<leaf's report.md>")` pointer to the SYNTHESIZE-final comment — so opening the pipeline task gives the user a one-click path to the actual deliverable with an explicit label. (3) Commit `873723bb` added a "Report" tab to `ArtifactViewer.tsx` that extracts `result.json.finalResponse` and renders it through the existing MarkdownRenderer — so the content humans still occasionally want to read on intermediate specialists (debugging, escalation review) is one click away without storing it as a separate MD file.

**Why the user's intuition mattered more than the spec:** Steve's question *"I thought the pipeline report.md was the final deliverable, is that not the case?"* revealed a design flaw that the implementation had rationalized as a naming convention. The customer-facing deliverable should be findable without navigation; the pipeline task should either BE the deliverable or POINT to it unambiguously. The old convention did neither. The fix treats the artifact filenames as UX affordances (not just storage records) and enforces a "one deliverable per pipeline, clearly labelled" contract.

**Paper relevance:** §4 (Architecture) or §6.4 (extended technical report). This is a micro-case of a broader principle worth naming in the paper: *structured deliverables as a first-class concern means the artifact layer has opinions about semantics, not just storage*. Most multi-agent frameworks treat outputs as flat files; the harness treats them as a dependency graph of hand-offs plus one terminal deliverable, and the artifact filenames should reflect that topology. Also worth noting: the problem only became visible because the harness produces deliverables a real user reviews — the orchestration frameworks that stop at code-generation tasks don't hit this.

**Execution IDs for reproducibility:** Meridian pipeline `cmnzbnefp006wyxmwqkdebf5l`, pipeline `report.md` `cmnzc35ax002dyxizptxydl6q` (29KB), leaf child's `report.md` `cmnzcaq950015yxj0bvo2rc7o` (83KB). Post-fix verification pending — next pipeline run on Demo Financial (once task #81 fixes the Research Analyst template) will produce a single `report.md` on the Technical Writer leaf only.

---

## From session: harness clobber-detection 2026-04-25

Harvested from a single planning-and-implementation session that designed a defense against a vulnerability nobody had ever seen in production, then discovered the defense's own write site was an instance of the very bug class it was trying to detect. Plus a quantified observation about how often agents follow the rules.

### Story: The defense that depended on its own bug class

**What happened:** While planning a defense for a structural-but-unobserved attack on the harness — what if `task.metadata.pipelineStageId` got clobbered mid-run to point at another harness's stage? — the design called for a "back-pointer" written into the child stage's metadata so the handler could verify the harness owned that stage before letting it complete. The original draft had the back-pointer write happen inside the harness's `task.update` handler with a single-key whole-replace: `tx.stage.update({data: {metadata: {harnessTaskId}}})`. Architecturally clean. Then the architectural-review specialist's post-edit synthesis flagged it: *that write is itself a Bug Class 2 P0 site* — whole-replace on a jsonb metadata column is the exact pattern Item 2 of the same plan was fixing at `phase.ts:updateStage`. The defense's anchor was vulnerable to the bug class the defense existed to address.

**Why it was surprising:** Six specialists reviewed the plan in two parallel rounds before this caught — pipeline-harness, agent-execution, boundary-contract, architectural-review, prompt-construction, database-manager. Five of the six (90%+ confidence each) signed off on the back-pointer write site as drafted. Only architectural-review's post-edit synthesis pass — the seventh look — surfaced the self-referential coupling. The argument was elegant: the plan had a deploy-order dependency hidden in plain sight ("Deploy 1 fixes the bug class, Deploy 2 activates the defense") that nobody articulated as a fragility because it was wrapped in mature deploy hygiene language. If Deploy 2 ever shipped before Deploy 1 (rollback, hotfix re-ordering, manual intervention), or if a future change re-introduced the underlying bug class at the same site, the defense would silently corrupt its own anchor.

**Resolution:** The back-pointer write was hardened to use defensive shallow-merge inside the same transaction — `tx.stage.findUnique` then `{...existingMeta, harnessTaskId: finalTaskId}` then `tx.stage.update`. Two extra buffer hits on a freshly-created stage row (~0.07ms steady-state per prod EXPLAIN), no architectural cost. The fix made Item 3a safe-INDEPENDENT-of-deploy-order — Item 2's parallel `phase.ts:updateStage` shallow-merge fix became a separate concern, not a prerequisite. Both shipped on the same day (commits `705415ce` Deploy 1, `8f225353` Deploy 2), but the dependency was eliminated from the design.

**Paper relevance:** §6 (Discussion) or a possible new §6.5 on architectural review discipline. The lesson is generalisable: when a defense's anchor depends on a not-yet-fixed bug class site, harden the defense to be safe-independent-of-deploy-order rather than relying on sequencing. Specialist review caught it; routine review wouldn't have. The seventh look mattered. The pattern has been promoted to `architectural-review-specialist.md` as a standing principle — "Self-Referential Coupling Discipline."

---

### Story: The 30% breadcrumb baseline

**What happened:** During Phase 0 of the same session, while validating that the proposed defense had a real attack surface to defend against, a query against production turned up that **only 16 of 54 (~30%) post-2026-04-14 PIPELINE comments contained the protocol-mandated breadcrumb format** (`**Child stage:** \`<id>\``). The protocol said the breadcrumb was MANDATORY in emphatic terms — "First line MUST be... do not omit it, do not reword it." Production said: agents complied 30% of the time.

**Why it was surprising:** The protocol's wording is more emphatic than most production protocol instructions in the codebase. If THAT level of emphasis lands at 30%, every other "always include X" instruction in the protocol library is presumably worse, not better. The query result re-anchored a design discussion that was about to default to "we'll just instruct the agent to do it" — a design pattern that a moment earlier looked like a 90%-success solution. After the data, it looked like a 30%-success solution. The defense's reliance on agent compliance got removed from the design within the next review round.

**Resolution:** The defense moved server-side. The harness's protocol got a documentation note ("Behind the scenes, the platform automatically records your task ID...") and the platform now stamps the back-pointer when the harness records its `pipelineStageId`. Zero agent compliance dependency. The 30% number became a baseline carried into the prompt-construction-specialist agent file as a standing prior — when designing future features, server-side enforcement is the default and prompt instructions are a documentation overlay, not an enforcement mechanism.

**Why the data mattered more than the protocol's tone:** The team had spent design effort writing emphatic protocol prose under the assumption that emphasis improved compliance. The data showed emphasis is loosely correlated with compliance and the variance is huge. Production grounding beats prose intensity. The corollary: a feature whose correctness depends on agent compliance is a 30%-correct feature unless the platform has another way to enforce it.

**Paper relevance:** §3 (Architecture) or §4 (Experiments). The 30% number is one production data point on one protocol step — not a universal rate — but the principle ("agent compliance with mechanical extras is materially below 100%; prefer server-side enforcement when available") is generalisable enough to belong in the architecture discussion. The harness's whole "trust verified state over narrative" rule is the philosophical companion to this empirical finding.

---

### Story: The sunset that closed itself

**What happened:** When the harness clobber-detection defense shipped (Deploy 2, 8f225353), it deliberately kept legacy stages on a **forward-only soft-warn** rather than hard-fail. Reason: stages created before the deploy don't have the `harnessTaskId` back-pointer, and the 4-point invariant would otherwise reject in-flight pipelines on those stages. The plan called for a 30-day metric-driven sunset — query sentinel logs after a month, and if zero soft-warns fired for 14 consecutive days, propose a follow-up PR to flip soft-warn → hard-fail. Conservative sizing for production rollover.

The sunset closed same-day. Steve asked the right question: *"if we are in UAT, should we address legacy soft-warn now?"* The query against the prod DB found exactly 5 IN_PROGRESS PIPELINE tasks lacking the back-pointer — three were re-attempts of the same Demo Financial objective, one was a Meridian smoke test, one was a synthesis case study. All from a 2-day window pre-deploy. The "legacy population" wasn't a population. It was a backlog. A single SQL `UPDATE stages SET metadata = ... || jsonb_build_object('harnessTaskId', t.id)` — wrapped in `BEGIN; ... ; SELECT verification ; COMMIT;` for safety — collapsed the legacy population to zero. Then the soft-warn could be flipped without breaking anything.

**Why it was surprising:** The 30-day window had been a reasonable architectural decision — production rollovers can take weeks, and conservatism is cheap. But the sizing assumed *production-shaped volume* (continuous user load, hundreds of running pipelines). UAT had nothing close to that, and the team's mental model was still anchored to production-shaped sunsets even though the immediate context didn't justify them. The default question — *"is this conservatism worth its cost"* — surfaces only when you ask it.

**Resolution:** Backfill (5 stages, single SQL UPDATE, BEGIN/COMMIT for safety, verification = 0 legacy remaining), then flip three files (`task-complete-handler.ts`, `task-update-handler.ts`, `pipelineRetriggerReactorService.ts`) from soft-warn-and-allow to throw `PipelineStageMismatchError(taskId, stageId, null)` (handler) / call `logReactorMismatchSkip(...)` (reactor). Updated the protocol prose, the specialist file, and rewrote the sentinel memory entry as CLOSED rather than SCHEDULED. Total elapsed: ~30 minutes. The "evaluate on May 25" calendar entry is gone.

**Paper relevance:** §3.5 (Architectural Decisions) or §6 (Discussion). The lesson is generalisable: conservative sunsets sized for production volume are over-engineered for UAT. When the rollover population is small enough to backfill in one query, the calendar window should compress to zero. The decision rule emerged after the fact: *if backfill of the legacy population is cheap (<1 hour, low-risk), prefer it to a calendar wait*. Companion to §3.5's "Self-referential coupling discipline" — both are review/audit discipline lessons rather than runtime mechanism choices.

**Concrete numbers**: 5 legacy stages, 1 SQL UPDATE, 3 file edits, 0 production users impacted. Sunset window was sized for 30 days; actually executed in 30 minutes.

---

## From session: mode-detection out of LLM turn 2026-04-26

### Story: The clean run that proved the resolver was needed

**What happened:** The mode-resolver shipped on 2026-04-26 in three deploys (resolver + wiring + GUI fallback chain; protocol prose update; specialist file + tests + docs). The deliberate UAT verification ran a small Azure Storage encryption pipeline on Meridian Health Systems. Both runs (CREATE + SYNTHESIZE) completed cleanly. Both artifacts had `resolvedMode` populated correctly. So far, expected.

The interesting moment came when the SQL agreement check ran: pre-execution resolver versus post-execution validator, four executions total. Three rows showed perfect agreement (resolver mode = validator mode = CREATE / SYNTHESIZE / SYNTHESIZE). The fourth row showed `resolvedMode = 'CREATE'` and `validator_mode = NULL`.

For a moment that looked like a regression. Investigation revealed it was the opposite. The `pipelineProtocolValidator.detectHarnessMode()` returns `null` when the agent's tool-call sequence is *clean* — no missing steps, nothing to flag. Run 2 was simply a cleaner CREATE than Run 1: the new prose unambiguously told the agent its mode, so the agent didn't waste tool calls on exploration, and the validator had nothing to report. The legacy validator-only signal would have shipped that artifact with **no mode information at all** — exactly the failure mode that motivated the resolver in the first place. Without the resolver, every clean run produces an artifact that's invisible to the synthesis-status badge logic. With it, every clean run carries the mode regardless.

**Why it was surprising:** The resolver was designed to fix budget-exhausted runs (mode misclassified). The actual production demonstration showed it also fixes a *quieter* gap — clean runs that the validator ignores. We hadn't framed it that way during planning. The architectural pattern — "load-bearing facts must be platform-recorded, not agent-supplied" — turned out to defend against more than one failure mode. The 3-occurrences-in-30-days motivation was an undercount; the underlying rate of artifacts that should have carried mode but didn't was higher, just split across two failure modes (degraded runs producing wrong info; clean runs producing no info).

**Resolution:** No code change needed — the behaviour was correct as designed. The story landed in the war stories file because the empirical observation was load-bearing: it justifies the resolver's persistence to the artifact (not just the prompt) post-hoc, and reframes the resolver as filling two gaps rather than one. Bug Class 74 added to the registry with this framing. The mental model doc updated to describe the resolver and validator as side-by-side records that cover different failure modes.

**Paper relevance:** §3.5 (Architectural Decisions) or §5 (Discussion). The lesson generalises beyond mode detection: any load-bearing artifact field that depends on the agent doing something has at least two failure modes — degraded runs that produce wrong values, and clean runs that produce no value. Defenses need to cover both. The pattern's name in the registry — "load-bearing facts must be platform-recorded, not agent-supplied" — is the companion to the empirical 30%-baseline finding from the prior session: the 30% number tells you compliance is unreliable; the resolver demonstrates that compliance is unreliable in *both* directions.

**Concrete numbers**: 4 PIPELINE executions in UAT, 4/4 resolver firings correct, 0/3 forensic disagreement on populated rows, 1/4 artifact had `protocolValidation = null` (the clean-run case). Resolver execution time: 2-5ms (negligible). Production rate of the underlying gap pre-fix: 3/30 days for the loud failure mode; underlying clean-run rate not separately measured.

---

## From session: Path 2 + Phase 0 + harness failure-handling 2026-04-27 / 04-28

### Story: The documented-but-unimplemented contract

**What happened:** While running a forensic post-mortem on the 2026-04-27 multi-source synthesis Trial A pipeline (Q1 2026 Energy Quarterly, four-child pipeline against eia-service / weather-service / eodhd-service), we noticed the leaf Publication Reviewer scored confidence 60/100 — squarely in the protocol's documented "50-69 retry band". The HOWTO promised: *"50-69: re-execute once with diagnostic feedback (bounded)"*. The harness specialist file said the same. The protocol prose said the same. We expected to see a second Reviewer execution in the database.

There wasn't one. We grepped the database for two Reviewer executions on the same task — found one. We checked the reactor logs — no retry event had fired. We grepped the codebase for the implementation: `retryOnLowConfidence`, `maybeReexecute`, `diagnostic feedback` injection, the `50-69` band as a retry trigger. **Zero hits**. The only related code was `lib/mcp/server/tools/advanced/analytics/elicitation-prompts-generator.js` lines 733-740, which displayed a "retry-band investigation prompt" to *users* in a follow-up analytics prompt — display-only, no actual retry mechanism.

The contract had been documented in three places (HOWTO, harness specialist file, protocol prose) for several months. No one had implemented it. The harness had been silently treating any successful execution as "good enough to cascade" regardless of confidence band, and the documentation had been quietly lying.

**Why it was surprising / load-bearing:** This wasn't a stale piece of code or an out-of-date docstring. It was a load-bearing claim in three canonical surfaces — including a paper-quality bullet at line 257 of `WHITEPAPER-ARXIV-v3.md` that asserted *"The mechanism exists; operational validation is pending"*. The mechanism didn't exist. The "pending validation" framing implied a test gap, not an implementation gap. We had been telling ourselves and our readers a feature was built that wasn't.

The deeper failure mode is generalizable: **a documented contract that no one tries to invoke can stay un-implemented for arbitrary periods**. The specialist review process catches fabricated *behaviour* (anti-fabrication intervention #89, the four-point invariant, the protocol validator) but doesn't catch fabricated *features* — claims about platform behaviour that no test or production run depends on. The 50-69 retry was such a claim: every prior pipeline either scored ≥ 70 (above the band, no retry needed) or hit some other terminal state, so the absence of the retry never produced a visible failure.

**Resolution:** Implementation shipped 2026-04-28 in commit `fa3cc8d8` as intervention #90 in `agentExecutionEngine.ts`, modeled directly on the existing anti-fabrication correction-turn pattern (#89). In-loop retry, bounded to one per execution, replaces `currentResponse` and `finalResponse`, accumulates retry tokens to `totalUsage`, non-fatal on error, tracked via `diagnosticRetryUsed` flag in `result.json.toolLoop`. Skipped when (a) confidence already capped by objective guard, (b) anti-fabrication correction already fired, or (c) agent self-flagged budget exhaustion in `finalResponse` (regex on first 1500 chars; a same-window retry would hit the same hourly rate-limit wall).

The mechanism's value is partly recovery and partly *forensic visibility* — Steve's framing during the 2026-04-28 design review: *"the retry is at least a placeholder for easier identification of the problem"*. A retry that ALSO scores 50-69 is a clearer signal that the issue is structural rather than transient than silent acceptance of a single 60. The structured pino log on every retry firing captures `priorConfidence`, `retryConfidence`, and `confidenceDelta` for offline analysis.

The whitepaper was forthrightly corrected: line 60 now reads *"and re-executes with specific diagnostic feedback in the retry band (implemented 2026-04-28 in `agentExecutionEngine.ts` as intervention #90 — the 50-69 retry mechanism was documented in the protocol prose for several months before the implementation shipped)"*. Line 257 was rewritten to acknowledge the gap explicitly rather than continue the "pending validation" framing.

**Paper relevance:** §5 Discussion or §5.3 Threats to Validity — the pattern *"a documented platform behaviour can stay unimplemented for months if no test or production run depends on it"* is a generalizable methodology lesson. It generalises beyond this one contract: every behaviour-claim in the architecture documentation should map to either (a) a test that exercises it or (b) a production-run signature that would be missing if it weren't there. Ours mapped to neither. The fix at the document-claim layer is to add a "First implemented in commit X" annotation to every behaviour-claim — turns the claim into a verifiable fact rather than an aspirational sentence. The fix at the architecture-discipline layer is broader: the next specialist review of any "the harness does X when Y" claim should grep for X in the codebase before approving.

**Concrete numbers:** 1 production run that surfaced the gap (Trial A, 2026-04-27, task `cmogk5o2k0001yxilwk6q4k4q`); 0 hits when grepping for `retryOnLowConfidence|maybeReexecute|diagnostic feedback` (only the display-only elicitation prompt at `lib/mcp/server/tools/advanced/analytics/elicitation-prompts-generator.js:733-740`); 3 documentation surfaces affected (HOWTO, harness specialist file, protocol prose at `seed-protocol-prompts.ts`); 1 paper-quality bullet that needed correction (`WHITEPAPER-ARXIV-v3.md:257`); ~180 lines of implementation in commit `fa3cc8d8` modeled on intervention #89 (the anti-fabrication correction turn, which was a working precedent — same in-loop retry pattern, just keyed on a different trigger).

---

### Story: Why did the Harvester call agent.results(verbose: true)?

**What happened:** Forensic analysis of the 2026-04-27 Trial A run showed the Phase 1-2 Artifact Harvester's `result.json` was **1.7MB** — six tool calls, but a single one accounted for 98% of the file. That call was `perform(action: "agent.results", taskId: <Phase 0 Acquirer task>, verbose: true)`. The result returned the FULL 300KB Phase 0 result.json, which got stored verbatim in the Harvester's own `toolCalls[4].result` field as 1.66MB after JSON serialization expansion. When the downstream Editor then called the same on the Harvester, it nested THAT data — Editor result.json hit 5.2MB and broke Postgres' JSONB parser on the deep escape nesting. Exponential cascade by chain depth.

But we already had auto-chained pipeline context: `lib/agents/harness/context-chainer.ts` injects each completed dependency's full `result.json.finalResponse` into the downstream agent's prompt as §6 Pipeline Context — no truncation, no summarization. The Phase 0 Acquirer's 14KB finalResponse should have been right there in the Harvester's prompt. Why did the agent call agent.results to fetch what it already had?

**Why it was surprising / load-bearing:** Three compounding causes, none of which alone was a "bug":

1. **The Harvester's role guidance didn't tell it to call agent.results.** After the Path 2 generalization (commit `31175fa1`) the `artifact_harvester` role guidance has no `task.context` / `agent.results` / `fetch` instructions — that bullet was deliberately removed because the chained context is the input.

2. **But the universal template line 39** (which applies to ALL agents, runs first, before any role-specific guidance) said: *"Verify dependencies before acting — call `project(action: "task.context")` for predecessor outputs and `project(action: "task.list")` for sibling state. … Do NOT assume artifacts or prior findings — read them."* The rule was written before auto-chaining was prevalent, when "verify dependencies" meant "make a tool call". The rule does not acknowledge that chained context is already present in §6. So the agent read the rule, looked for a way to comply, and chose `agent.results(verbose: true)` — the most thorough option for fetching upstream outputs.

3. **And the persistence-side `toolCallResults.push()`** at `agentExecutionEngine.ts:884-888` stored the full untruncated tool result for the artifact. The existing 8KB truncation at line 902-905 only protects the LLM's context window during the loop (the string fed BACK as a `tool_result` block); the structured persistence path was unbounded. Asymmetric coverage: the same value gets two different size policies depending on which channel reads it.

The cascade required all three: a universal rule that didn't know about chaining, an agent that took the rule at face value with a verbose tool, and an unbounded persistence path. Remove any one and the bloat doesn't compound.

**Resolution:** Two complementary fixes shipped 2026-04-28.

The structural fix (commit `c1492c70`): persistence-side truncation. Any `toolCalls[].result` over 50KB at resultJson assembly time gets replaced with `{truncated, originalSize, preview (2KB; raised to 8KB 2026-07-04 so the preview always covers the Tier-1 LLM in-loop view), note}`. Threshold sized so normal MCP service responses (5-30KB) pass unchanged but the pathological upstream-artifact-fetch case is bounded at the depth-cascade source. Mirrored in both engine and stream paths per the two-execution-path-parity pattern. **This works regardless of agent compliance** — even if an agent calls agent.results redundantly, the stored consequence is bounded. Projected reduction on a re-run of Trial A: Harvester 1.7MB → 47KB (97.2%); Editor downstream cascade: 1.66MB nested → 2.2KB preview reference. The exponential nesting is structurally broken.

The behavioral fix (same commit's universal-template update): line 39 of the universal template now says *"your dependencies' full outputs are AUTO-CHAINED into your prompt as §6 Pipeline Context (the platform injects upstream `result.json.finalResponse` for every completed dependency before this execution starts). **Prefer that chained context** over calling `task.context` / `agent.results` / `fetch` — it's already in your prompt, it's complete, and re-fetching wastes tokens, hourly budget, and a turn slot. Only call those tools when (a) chained context is missing or explicitly insufficient for your task, (b) you need sibling state via `task.list`, or (c) your task description references a specific artifact ID you don't see in chained context."* Agents now have explicit guidance to use what's already in their prompt instead of re-fetching, saving tokens AND a tool-loop turn.

**Paper relevance:** §3.3 (Knowledge Transfer) and §5 (Discussion). The auto-chained pipeline context was always meant to *replace* the need for tool-call-based dependency reads — that's the whole point of injecting `finalResponse` pre-execution. Yet the universal template's "verify dependencies" rule was written before chaining and not updated when chaining shipped. The lesson: **when a feature replaces a tool-mediated workflow with a passive prompt-injection, the rules that previously governed the tool-mediated workflow need to be retired or qualified explicitly.** Otherwise the agent gets contradictory signals — "your dependencies are already in your prompt as §6" + "verify dependencies via tool calls" — and resolves the contradiction by doing both. Generalises to other auto-injection features: any time the platform pre-populates context that the agent previously had to fetch, the prompt instructions need to acknowledge the substitution.

The forensic discipline lesson is also worth naming: when investigating a structural failure mode (in this case, exponential result.json bloat), the obvious first hypothesis was "an agent called a tool that returned a lot of data". The more useful hypothesis was *"an agent called a tool whose return value cascades through downstream chains because the storage path is unbounded"*. The first frames the problem at the agent layer (could be patched with prompt instruction). The second frames it at the infrastructure layer (must be patched in code, regardless of agent behavior). We needed both, but only the second is robust against future training drifts.

**Concrete numbers:** 1 tool call accounting for 98% of one execution's persisted size (Harvester `toolCalls[4]`: args 83 bytes, result 1,660,925 bytes); 6 total tool calls in that execution, 5 of them under 50KB (8859 / 22335 / 10296 / 2111 / 1533 bytes — all legitimate context-gathering); 3 layers of cause (universal template rule that doesn't know about chaining + agent's reasonable compliance + unbounded persistence path); ~62 lines of fix across 2 files in commit `c1492c70` (engine + stream-route persistence truncation, mirrored per dual-path parity), plus ~3 lines of universal-template guidance update; 97.2% projected size reduction at the Harvester layer; cascade structurally eliminated downstream. Threshold (50KB) chosen against empirical Acquirer + Harvester tool-call distributions (both peaked at 22-30KB excluding the pathological call), giving comfortable headroom for normal MCP service responses while bounding worst-case behavior.

**Empirical recurrence (2026-04-28 Run 2)**: the universal-template fix in commit `1a16e49b` updated line 39 to "prefer chained context over re-fetching", but role-specific guidance in `publication_reviewer` was missed in that pass — it still said *"Read dependency outputs via project(action: 'task.context')"*. In Run 2 the Reviewer obeyed the role-specific guidance (which agents weight higher than universal preamble), called `task.context` (returns task metadata, not artifact content), got nothing useful back, and **fabricated a critique without reading the Editorial Writer's article** (self-disclosed in its own finalResponse). Confidence dropped to 25/100. The harness's SYNTHESIZE quality gate caught it, posted a structured `**HARNESS DIAGNOSTIC**` comment naming the root cause ("could not access artifact, reviewer could not read article") AND the corrective behaviour ("The Editorial Writer's article IS in your §6 Pipeline Context as auto-chained finalResponse. Read it there — do NOT try to fetch the artifact by ID"), and re-executed the Reviewer. Recovery: 25/100 → 92/100. The role-guidance fix was applied in commit `<this commit>` to close the missed update. The universal-template fix bounds the consequence at the infrastructure layer (storage truncation in `c1492c70` means even the redundant fetch doesn't bloat); the role-guidance fix closes the prompt-level cause; the harness's SYNTHESIZE quality-gate retry mechanism (now documented at pipeline-harness-specialist.md §7a) is the third layer of defence — recovery when the prompt-level fix is missed in some future role.

**Empirical baseline + Path A landing (2026-04-29, post-Runs 6/7 retrospective)**: the prose-only mitigation arc — universal template (Apr 27) + Reviewer role guidance (`4fa3fafa`, Apr 28) — left a measurable gap that took 30 days to surface as data. A combined truncation + tool-call discovery query across 280 result.json artifacts (last 30 days) revealed:

- Overall 50KB tool-result truncation rate: 4.3% (6 of 140 result.json artifacts)
- **Concentrated 28.6% on `editorial_writer` + `artifact_harvester`** (2/7 each); every other role at ≤6% or 0%
- Same 2 roles are the only consistent `agent.results(verbose: true)` callers (1.0–1.1 calls per run); every other role at 0.0/run
- `publication_reviewer` (post-`4fa3fafa`): 7 runs, 0.0 agent.results, 0.0% truncation — the targeted-prose precedent works empirically

The findings surfaced via empirical baseline measurement, not new failures. **The forensic methodology generalises**: when a prose-mitigation arc lands across multiple files, set a measurement floor (in our case the toolCalls truncation marker `50KB persistence threshold` plus the `agent.results` substring count) and re-query at intervals. Concentration patterns reveal which roles still need targeted reinforcement; the Reviewer's 0% rate proves clean compliance is possible when the role-specific prose is explicit.

**Path A landing (commit `11aa7871`)**: extended the `4fa3fafa` precedent to `editorial_writer` + `artifact_harvester` role-guidance entries — explicit named-anti-pattern warnings against `agent.results(verbose: true)` for reading upstream content, with the mechanism explained inline (verbose response loads upstream's full result.json into YOUR toolCalls array → 50KB cap → corrupts downstream chained context) plus the empirical evidence reference. ~30 minutes of role-guidance prose; no engine code changes.

**Path B (deferred — only if Path A insufficient)**: the schema-sanity-check (Steve callout, 2026-04-29) revealed that `agent_templates.metadata Json?` already has structural room for tool restrictions; the engine's tool-resolution chain at `agentExecutionEngine.ts:493-509` just doesn't read it yet. **Path B2** = wire it: `let rawTools = mcpConfig.tools || (resolvedTemplate?.metadata as any)?.tools || config.mcpTools || []` plus per-template seed updates declaring `metadata.tools` lists that exclude `agent.results` for these specific roles. Architecturally clean — the LLM literally cannot call what isn't in its function-list. Cost: ~30-60 LOC engine + per-template seed updates. Path B1 (server-side runtime guard at the `agent.results` handler) is the alternative but more complex and circumventable.

**Generalised lesson (extension of war story #6)**: passive auto-injection (chained context) replacing tool-mediated workflow (`agent.results` re-fetch) needs **layered defence**:
1. **Infrastructure-bounded consequence** — storage truncation `c1492c70`, in place since Apr 28
2. **Prose retirement at universal layer** — universal template `1a16e49b`, in place since Apr 28
3. **Prose retirement at role layer** — Reviewer `4fa3fafa` (Apr 28), Editor + Harvester `11aa7871` (Apr 29) — Path A
4. **Architectural retirement (deferred Path B2)** — when prose alone doesn't move compliance, remove the tool from the role's toolbox via the existing-but-unwired `template.metadata.tools` schema affordance

The first three layers were the original story #6 framing. The fourth — *architectural retirement via tool-list restriction* — is the empirically-driven extension. Schema room exists; the integration is a future session's work if prose proves insufficient. **The pattern this surfaces is "schema affordances that pre-exist their integrations"**: the right place to add a new rule may already exist in the schema, just unwired. Worth grepping the schema before planning a new field.

---

### Story: The leaf isn't always the deliverable

**What happened:** Run 4 forensics (POV `cmogk3yzh0001yxilotomza6g`, harness task `cmoi84i0o0001yxng4jjcejg0`, 2026-04-28) surfaced an architectural mismatch that had been latent since artifact-naming reform v3.5 (2026-04-15). Today's policy: "leaf produces report.md, intermediate produces result.json only" — encoded in `agentArtifactPolicy.ts` and reflected in 5 sites of the universal Deliverable Contract. **Synthesis pipelines violate the assumption.** The synthesis shape (Acquirer → Harvester → Editor → Reviewer) puts the Editor (intermediate by dep-graph) as the customer-deliverable producer (the article), and the Reviewer (leaf) as the QA gate (the review). Customer asks "where's the deliverable?" and the answer was "buried inside the Reviewer's `report.md`, but it's actually a QA review, not the article — the article lives in the Editor's `result.json.finalResponse`". The pipeline-index.json deliverable pointer pointed at the wrong file.

**Why it was surprising / load-bearing:** Three reinforcing causes:

1. **The artifact policy keyed on dep-graph topology**, not on "who produces the customer artifact". For default pipelines (Architect → Builder → Documenter), leaf == deliverable producer happens to be true. The synthesis shape exposes the assumption.

2. **The universal Deliverable Contract** (5 sites in `pAIchartUniversalTemplate.ts`) hard-coded "leaf produces report.md" as a generic rule. Specialist-template agents inherited it. The Reviewer's role guidance was correctly framed as "your deliverable is your review" but the universal contract's bullets contradicted that framing. **Pattern #44 GS6 violated** (Deliverable Contract is SINGLE source of truth — contradictions must be eliminated, not duplicated).

3. **`artifact.create` documented-but-unimplemented contract** — the SYNTHESIZE Step 4 prose in `pipeline-orchestrator-protocol` told the harness to call `perform(action: "artifact.create", ...)`. No handler ever implemented it. The validator counted the (always-zero) call as a missing step on every successful synthesis run. **Second confirmed instance of the documented-but-unimplemented pattern** (first was intervention #90 in `fa3cc8d8`).

**Resolution:** Engine-side metadata-driven extraction (commit series 2026-04-28). Two new optional task.metadata fields:
- `deliverableSourceTaskId` — set by harness on itself (CREATE Step 5a) — "extract THIS task's finalResponse as my report.md"
- `suppressDefaultReportMd` — set by harness on the leaf — "don't auto-produce report.md, the harness will publish"

`getReportMdDecision()` (replaces `shouldProduceMarkdownReport`) returns a discriminated union (`{produce:false}` | `{produce:true, source:'self'}` | `{produce:true, source:'upstream', sourceTaskId}`). Engine + stream-route success-path transactions both fetch source's `result.json.finalResponse` (POV-scoped for cross-tenant safety, truncation-checked, sanity-warned for short outputs) and write it as the harness's `report.md`. **Option A defense**: gates `'upstream'` decision on source SUCCESS so harness CREATE doesn't write misleading coordination prose as report.md before children complete. **Hoisted single-write semantics + error-header on extraction failure** (Theme 1 from boundary-contract review): all non-success paths funnel through one assignment producing fail-loud `# ⚠️ Report Extraction Failed` headers, never silent QA-as-deliverable masquerade.

Phase A.3 retired `artifact.create` references everywhere — protocol prose (v3.7.0), validator tally + JSDoc, all paired tests. Phase A.4 added a forensic P-signal (additive, non-blocking): when post-deploy PIPELINE has `pipelineStageId` but no `deliverableSourceTaskId`, the validator surfaces the metadata-wiring miss as Step 5a. Bridges the 30%-baseline gap until server-side enforcement (deferred D-1) lands.

Phase D.0 updated all 5 sites of the universal Deliverable Contract — the SINGLE source of truth now reflects reality.

**Paper relevance:** §3.5 (Architectural Decisions) — adds a third application of the **trust-direction-shift pattern**, generalising over the prior two:

| Application | Before | After | Trust direction |
|---|---|---|---|
| 1. Clobber-detection back-pointer (2026-04-25) | Agent reports "I created stage X" via metadata | Server stamps `stages.metadata.harnessTaskId` automatically | Agent → Server |
| 2. Mode-resolver (2026-04-26) | Agent detects own mode from tool calls | Resolver computes mode pre-LLM via Prisma | Agent → Server |
| 3. Deliverable extraction (2026-04-28) | Leaf agent produces report.md (or doesn't) by topology | Engine extracts source's finalResponse to harness's report.md by metadata signal | Agent → Server |

Each application moves a previously-agent-mediated load-bearing fact to platform-resolved ground truth. Each was triggered by a specific failure mode where the agent-mediated path was either unreliable, contradictory, or architecturally-misaligned. Generalisation: **when an agent-mediated workflow has multiple equally-reasonable interpretations and one of them produces a wrong customer-facing artifact, move the decision to the engine and let metadata signals (set by the agent in a less-ambiguous earlier turn) drive it.**

The companion lesson — already named in story #6 — applies again: when a passive auto-injection feature (engine extraction here) replaces a tool-mediated workflow (leaf's report.md write), the prompt rules governing the old workflow MUST be retired or qualified explicitly. The 5-site universal-template update in Phase D.0 was the Pattern #44 GS6 enforcement that closed the contradiction. Without it, Specialist-template agents running as the leaf would have read contradictory prose ("you produce report.md as a leaf" vs "you don't, the harness does") and resolved the contradiction by guessing.

**Concrete numbers:** Pre-edit consolidated specialist confidence 84.6% (5 specialists: agent-execution 86%, pipeline-harness 84%, mcp-artifacts 89%, boundary-contract 86%, prompt-construction 78%); post-edit projection 96.4% after 3 ship-block edits (Theme 1 hoisted assignment + Theme 2 POV-scoping + Theme 3 universal template Phase D.0) + 11 important edits folded; ~30 LOC for ship-blocks, ~100 LOC total for important edits; engine extraction added 3 metadata fields to result.json (`reportMdSource.{mode, sourceTaskId, extractFailureReason}`) for queryable provenance; expected 2 fewer false-positive missingSteps on every synthesis run (artifact.create tally retired); 23 issue tickets across 5 specialists deduplicated to 11 architectural themes; comprehensive coverage audit per `feedback_specialist_recommendation_audit.md` mapped every recommendation to folded / deferred (with reason) / rejected (with reason).

**Closure (Run 5 + 2026-04-29 follow-up — substitution variant of trust-direction-shift):** Run 5 empirical validation (POV `cmogk3yzh0001yxilotomza6g`, harness `cmoig9wvn0001yx9m3qiycy8c`) confirmed 9/10 success criteria including byte-identical engine extraction (16,002 bytes harness `report.md` == Editor `result.json.finalResponse`). The 10th criterion surfaced a **chicken-and-egg constraint** that wasn't called out in the parent plan: the harness can't reference its own `report.md` artifact ID at SYNTHESIZE compose time — that ID only exists after the engine commits the artifact, which is after the harness has exited. The Phase C.3 prose I wrote ("point at `<your harness root's report.md id>`") was structurally unimplementable. The harness LLM acted reasonably — it pointed at the Editor's `result.json` (the closest meaningful real artifact ID it had access to) — but customer experience degraded vs design intent.

**The substitution variant of trust-direction-shift**: when the trust shift moves a load-bearing fact from agent-time to commit-time, the agent can no longer write the value directly. Use a known **placeholder token** at agent-time + **server-side substitution at commit-time** to bridge the gap. The pattern generalises: any post-commit-known value the agent needs to reference (artifact IDs generated atomically with the agent's transaction, attestation hashes, downstream task IDs that don't yet exist) needs the same placeholder + substitute treatment.

Resolution shipped 2026-04-29 (`cline_docs/reviews/report-md-pointer-substitution-2026-04-29/`): protocol prose v3.7.0 → v3.7.1 introduces the `{{HARNESS_REPORT_MD_ID}}` placeholder; engine post-processing after `createMany` substitutes the just-created `report.md` ID into `pipeline-index.json.content` and re-writes via `tx.agentArtifact.update` (still inside the same transaction — Pattern #37 atomicity preserved). Mirrored in stream-route per dual-path-parity. Run 6 validates the fix.

This is the **fourth application** of the trust-direction-shift pattern but the first to surface the substitution variant — earlier applications (clobber back-pointer, mode-resolver, deliverable extraction) all moved decisions to the engine where the engine ALREADY had the value at decision time. Pointer substitution is unique because the value the agent needs (its own report.md ID) is generated by the very same transaction the agent triggered — placeholder + post-processing is the structural workaround.

---

## Summary of this session's harvest

**7 stories extracted across four sessions** (clobber-detection 2026-04-25 + mode-resolver 2026-04-26 + Phase 0 / failure-handling 2026-04-27 / 04-28 + deliverable-extraction 2026-04-28). All target §3.5 / §5 / §6 (Architectural Decisions / Discussion / Threats to Validity) — *meta-architectural* lessons about how to build production-grade orchestration safely, not single-component anecdotes:

| Rank | Story | Best placement | Rationale |
|------|-------|----------------|-----------|
| 1 | **The defense that depended on its own bug class** | §6.5 (new) or §3.5 (Architectural Decisions) | The seventh-look architectural review caught a self-referential coupling that 6 specialists had cleared. Vivid argument for the discipline of post-edit synthesis. |
| 2 | **The 30% breadcrumb baseline** | §3 or §4 | Production-grounded answer to "should we instruct the agent to do X?" — quantified data point that re-anchored a design discussion. |
| 3 | **The sunset that closed itself** | §3.5 or §6 | Conservative production-shaped sunsets are over-engineered for UAT. When backfill is cheap, calendar windows should compress to zero. Companion to story #1 (both are review/audit discipline). |
| 4 | **The clean run that proved the resolver was needed** | §3.5 or §5 | Companion to story #2 (the 30%-baseline). The resolver's UAT verification revealed it fixes TWO failure modes — degraded runs producing wrong info, AND clean runs producing no info — not just the one we set out to fix. Generalises: load-bearing artifact fields that depend on agent compliance have failure modes in both directions. |
| 5 | **The documented-but-unimplemented contract** | §5.3 (Threats to Validity) — direct correction to existing bullet | A documented platform behaviour stayed un-implemented for months because no test or production run depended on it. Specialist review catches fabricated *behaviour* but doesn't catch fabricated *features*. Paper-quality factual error in §5.3 was forthrightly corrected. The lesson generalises: every architectural claim should map to either a test or a missing-signature production signal. |
| 6 | **Why did the Harvester call agent.results(verbose: true)?** | §3.3 (Knowledge Transfer) and §5 (Discussion) | When a passive auto-injection replaces a tool-mediated workflow, the prompt rules governing the old workflow need to be retired or qualified explicitly — otherwise agents get contradictory signals and do both. Three compounding causes (stale universal rule + reasonable agent compliance + unbounded persistence) made each individual cause look innocent. Storage truncation at 50KB closes the cascade structurally; universal-template update closes the redundant-fetch behavior. Robust fix lives at the infrastructure layer; behavioral fix is the politeness layer. **2026-04-29 closure**: empirical baseline measurement (28.6% truncation concentrated on Editor + Harvester) drove targeted Path A role-guidance tightening (commit `11aa7871`), modeled on Reviewer's `4fa3fafa` precedent. Schema-sanity-check (Steve callout) revealed Path B2 architectural option: `agent_templates.metadata` has structural room for `metadata.tools` lists; engine tool-resolution chain at `agentExecutionEngine.ts:493-509` is unwired. Generalised lesson extension: **layered defence** = infrastructure-bounded consequence + universal-prose retirement + role-prose retirement + (deferred) architectural retirement via schema affordances that pre-exist their integrations. |
| 7 | **The leaf isn't always the deliverable** | §3.5 (Architectural Decisions) — the trust-direction-shift pattern, third application | Generalises stories #2-#4 + #6: when an agent-mediated workflow has multiple equally-reasonable interpretations and one produces a wrong customer-facing artifact, move the decision to the engine via metadata signals. Companion to #6 — pattern #44 GS6 SINGLE-source-of-truth Deliverable Contract enforcement (5-site universal-template update) closes the contradiction surface that auto-injection alone would leave open. |

All seven stories are flagged in the agent specialist files as standing principles for future invocations.
