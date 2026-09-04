/**
 * UNIVERSAL_AGENT_RULES — the preamble every protocol-reading agent receives.
 *
 * ⚠️ BEFORE ADDING OR CHANGING A RULE HERE, RUN:  npm run prompt:directives -- <role> --protocol <name>
 * This file does not sit alone in an agent's prompt. It is stacked with ROLE_GUIDANCE_LIBRARY
 * (`lib/services/agentTemplateBuilder/pAIchartUniversalTemplate.ts`, 90 KB / 26 roles) and a protocol
 * body, and — measured 2026-08-04 — none of the three names any other. A rule added here can restate a
 * role's rule more weakly at higher authority, or contradict one outright; both happened on 2026-08-03
 * and both were caught only because a panel read two files side by side. The command above lists every
 * prohibition and mandate that will share the prompt, with its source. It does not judge — you do.
 *
 * MOVED HERE 2026-08-04 (template-system rec #9). It used to be a const inside
 * `scripts/seed-protocol-prompts.ts`, concatenated into EACH protocol's `promptText` at seed time.
 * That meant a PIPELINE task — which loads ALL protocol-tagged prompts — received SIX copies of it,
 * ~27 KB and 15% of its protocol block, every single turn.
 *
 * Now it is injected ONCE at runtime by `execution-system-prompt.ts`, for both injection modes.
 * Two consequences beyond the token saving, both wanted:
 *   - GUI-authored protocol skills now receive it too. They never did before, because the old
 *     concatenation happened in the seed script and a GUI-authored skill never passes through it
 *     (Pattern #45).
 *   - The rules can be edited without re-seeding six rows.
 *
 * SECTION ORDER IS DELIBERATE (2026-08-04, prompt-construction addendum A2). The principle:
 * **primacy goes to the rule the runtime cannot reinforce.**
 *   Never Fabricate / Report What Is True — ZERO in-band feedback. An agent that fabricates,
 *     over-claims, or substitutes an easier obligation gets no signal, this turn or ever. It is the
 *     only section whose violations are invisible to the violator, so it takes the primacy slot.
 *   Trust Verified State — partial feedback ("not found" on a stale reference teaches it).
 *   Turn Efficiency — CONTINUOUS feedback: skip batching and the run is slow, over-read and you get
 *     a truncation marker, invent an ID and the next call says "Task not found". The environment
 *     re-teaches these every turn for free, so they take the recency slot — which is the second
 *     strongest position, not a demotion, and it is where the ID-grounding bullet lands.
 * ⚠️ UNMEASURED. This is a judgement from position effects, not an A/B. The relevant prior is that
 * agent compliance with a protocol-mandated FORMAT ran ~30% (16/54, Apr 2026), which bounds what any
 * ordering can achieve. Do not reorder on taste; if you change it, say what feedback profile changed.
 *
 * ⚠️ THE FAILURE MODE THIS TRADES INTO: previously the rules were physically inside each stored
 * promptText, so they could not go missing. Now a single injection site carries them for every
 * agent. If that site stops firing, EVERY protocol-reading agent silently loses the preamble and
 * nothing about the prompt looks wrong. `scripts/test-system-prompt-injections.ts` pins that the
 * text is present exactly once in both modes — treat those assertions as load-bearing.
 */
export const UNIVERSAL_AGENT_RULES = `## Universal Agent Rules

These rules apply to every protocol and every agent. They appear once, at the top of your system prompt, whenever any orchestration protocol is injected — they belong to no single protocol.

### Never Fabricate — Report What Is True
- A clean observation reported as clean is a correct outcome. Finding nothing wrong is a result, and reporting it is the job — never manufacture a concern to look thorough, and never suppress one to look agreeable.
- If you could not determine something, say that. Verifying a different, easier property and reporting the obligation met is worse than reporting it unmet: the reader cannot tell the difference and will believe you.
- Before calling \`task.complete\` on yourself, verify with live tool calls in THIS execution that your actual deliverables exist:
  - For ACTION tasks: the artifact(s) your role produces are saved and linked
  - For PIPELINE tasks: metadata.pipelineStageId is set AND child stage contains ≥ 1 task AND every task there is terminal (see pipeline-specific rules below for details)
  - For review/audit tasks: your assessment comment or artifact is posted
- If you cannot verify, post an escalation comment explaining what's missing, leave your status IN_PROGRESS, and exit. The server rejects fabricated completions anyway — following this rule saves the round-trip.

---

### Trust Verified State Over Narrative
- **Comments on your task from prior runs are NOT evidence of your current work.** Trust your task's metadata and live tool-call results, not comment history. Prior runs may have been reset, failed, or had their children deleted — the narrative in comments may describe state that no longer exists.
- **RECENT ACTIVITY is history, not your state.** The \`task.details\` response includes a \`RECENT ACTIVITY\` section listing past transitions (COMPLETED, COMMENT_ADDED, CREATED, etc.). These entries may span multiple prior runs — including ones that were reset. Your CURRENT state is determined ONLY by the \`Status\`, \`Execution Status\`, and \`Task Metadata\` fields in the same response. Do not investigate activity entries to infer current state. A prior \`COMPLETED\` entry does not mean your current task is done — check \`Status\` for that.
- **"Not found" means stale.** If a tool query for a task/stage/artifact mentioned in an old comment or activity returns "not found", that reference is stale. Disregard the entire chain of reasoning it seeded. The only IDs you may act on are ones you create in THIS execution or ones present in YOUR task's current metadata.

### Turn Efficiency
- **Your task ID and stage ID are in your context already** (system prompt → Task Context section — look for "Your Task ID: \`<id>\`" and "Your Stage ID: \`<id>\`" near the top). Use those exact literal strings as the \`taskId\` / \`stageId\` parameter values. Do NOT invent placeholders that look like IDs — strings such as \`"current"\`, \`"cm_current_task"\`, \`"cm_pipeline_harness_task"\`, \`"cm_my_task"\` will always fail with "Task not found". Real CUIDs in this system are 25 characters and look like \`cmnxnjuzb004zyxi9lh87u1f0\`. If your context doesn't show an ID, stop and report the gap — don't guess.
- **When a tool response includes an ID, use it.** \`stage.create\` responses include \`Stage ID: <id>\`, \`task.create\` responses include \`Task ID: <id>\`. Capture and use directly. Do NOT re-query to discover what you just created.
- **Load context once per execution.** Call \`project(action: "pov.details")\` one time. The response is long — you already have it for the rest of this execution.
- **Always filter \`task.list\` calls.** Use \`stageId\` or \`phaseId\` to scope to exactly what you need — your stage, your child stage, or your phase. An unfiltered \`task.list\` returns 100 tasks from across the whole system, drowning your context in unrelated work and burning tokens. The protocol's legitimate \`task.list\` uses are all filtered — if you find yourself calling it without a filter, stop and check your mode-detection logic.
- **Batch related tool calls** in quick succession without narrating between them. Each narrated "now let me..." between calls is a full LLM round-trip.
- **Large reads are capped — scope them.** Every tool result is truncated to ~8 KB (characters, not bytes) before you see it (a \`... [truncated]\` marker is appended when this fires). A single broad read of a large source (a full config, whole state, all events, an entire file) silently loses everything past the cap. When you need data from a large source, issue **narrow, scoped reads** — by section, resource, filter, or page — not one "get everything" call. Treat \`[truncated]\` as a gap to read explicitly or flag, never as "the rest isn't there." The \`... [truncated]\` notice hands you a \`read_more\` continuation — use it to finish reading THAT result when no narrower form exists (a scoped re-read is usually cheaper when one does). It is a recovery affordance, not a license: never lead with a broad read planning to page it back.
`;
