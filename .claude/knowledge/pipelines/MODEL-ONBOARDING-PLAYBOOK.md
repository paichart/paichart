# Model Onboarding Playbook — evaluate a new model for a pipeline role, then switch

> **Created**: 2026-10-08 · **Worked example**: Claude Opus 5.5 for `config_change_author` (decided and switched 2026-10-07)
> **Owner**: pipeline-harness-specialist (coordination) · agent-execution-specialist (wire/capability audit) ·
> template-system-specialist (tiers, seeds, reseed)
> **Executor (2026-10-08)**: `model-evaluation-specialist` runs Phases 0, 2, 2b, 3, 4 and hands out Phase 1 and Phase 6.
> **Instrument reference**: `PIPELINE-RUN-FORENSICS-GUIDE.md` §7f (the leg replay lab's mechanics). Choosing between the lab and a byte-identity replay: §7g. This doc is the
> PROCEDURE around it. It does not repeat §7f; read §7f before Phase 3.

Use this when a new model ships, or when you want to move a role to a different model or effort, and the question
is *"does it approve correct packages and refuse wrong ones at least as well, at a cost we accept?"*. It covers the
whole path: wire safety, the lab comparison, the decision, the switch, the watch.

**Why it is a playbook and not a lab note:** on 2026-10-07 the lab comparison was about a third of the work. The
other two thirds were (a) a wire defect that would have silently disabled four reflection passes for any customer
org created on or after 2026-08-31, and that our own runs could never show, and (b) a switch path with a GUI list, a
tier constant, four owning seeds, a manual reseed and a freshness report that cannot see model drift. Skipping
either is how a lab-proven model ships broken.

---

## Phase 0 — Frame the question (no spend)

1. **Name ONE role and ONE lever.** Model, or effort, never both at once in an arm. 2026-10-07: role
   `config_change_author`, lever model (Sonnet 5 → Opus 5.5). Effort was a SEPARATE arm, run afterwards.
2. **Keep the instrument fixed.** The Reviewer is the measuring instrument. Leave it on its production model while
   you test an Author model, and the other way round. Change both and you cannot tell which one moved the count.
   Testing the Reviewer itself needs a bench with known answers instead: Phase 2b.
3. **Write down what "better" means, as refusal classes.** For the Author it was: refused cases that refuse less,
   approved controls that do not start refusing. Approval rate on its own means nothing, because a lax reviewer or
   a vague package also "approves".
4. **Name the alternatives you are comparing against**, including ones that cost no model change. On 2026-10-07 that
   was a revision pass (second Author run fed the blocking items). Owner decision: pay for the model rather than
   take on a revised execution's risks. Record that decision. It changes what the lab has to prove.

## Phase 1 — Wire and capability audit (no spend, BEFORE any paid run)

A new model can differ in what the API accepts, not just in quality. Do this first. A lab run on a mis-wired model
measures the wiring.

1. **Read the model's release notes and API docs for behaviour changes**, not just pricing. Opus 5.5 brought
   *preserved thinking*. Its thinking blocks are bound to the prefix: the system prompt, the SET of tools, and the
   earlier messages. `tool_choice`, effort, max_tokens, output_config, metadata and cache_control are excluded from
   the binding. It is enforced by default only for accounts created on or after 2026-08-31.
   **Your own account may not enforce what customers' accounts do.** Steve's org did not enforce it, so none of our
   runs could have shown the defect.
2. **Audit every call site that edits or truncates the message history.** In the tool loop these are: normal tool
   turns, pause_turn, the truncation retry, read_more, the R9 rewrite, the 8 KB cap, and the four REFLECTION paths
   (the #89 correction turn, budget fail-fast, form correction, the #90 diagnostic retry). Hand this to
   agent-execution-specialist. Record: `cline_docs/reviews/opus55-loop-audit-2026-10-07/AUDIT.md`. It found C1: the
   reflection paths sent `functions: []`, so the tools were dropped and every reflection call would 400 on an
   enforcing org. Each path fell back gracefully, so the failure was SILENT, not FAILED.
3. **Fix behind a per-model capability flag**, so requests to other models stay byte-identical. Example:
   `bindsThinkingToPrefix` in `lib/services/llm/model-capabilities.ts`. Flagged models keep their tools on
   reflection calls and send `tool_choice: none` (`dbef8984`). **Make the silent failure a fact.** Example:
   `toolLoop.reflectionErrors` (`[{site, status, errorType, errorCode}]`).
4. **Check the capability branch ORDER.** Model IDs are matched by substring. `claude-opus-5-5` contains `opus-5`,
   so it silently resolved to Opus 5's capabilities (forced tool_choice, so a 400) until a branch ahead of it was
   added.
5. **Prove the fix against the live API, cheaply.** `scripts/probe-opus55-binding.ts` refuses to run without
   `--spend`. It cost $0.0055 and tested: (b) the pre-fix shape with strict mode on → 400; (a)(c)(d)(f) the shipped
   shapes → OK; (e) the pre-fix shape without the opt-in → OK, which proved our org does not enforce. Copy that
   probe for the next model's specific behaviour.
6. **Pricing**: verify against the live pricing page and record it in `lib/services/llm/model-pricing.ts`. (The
   2026-09-26 check also found Sonnet 5 had been priced 50% too high for 25 days.)
7. **Throughput**: the lab's timestamps give the duration. Compare it with the 1080 s watchdog. Opus Author median
   was 152–213 s, max 308 s; Sonnet median 100 s, max 226 s.

**Exit**: capability entry with the flag set correctly, a pinned test (e.g. `test:reflection-history-binding`, in
CI), the fix deployed BEFORE any production switch, probe result in the register.

## Phase 2 — Choose the nodes (no spend)

The lab replays persisted executions (NODES). The choice of nodes decides what the result can claim.

- **Refused nodes**: production legs that were refused for a reason the model could plausibly fix (an Author error
  class), each with its class named in `why`. Do NOT pick refusals caused by missing evidence or the platform.
  A better model cannot fix those, and they dilute the count.
- **Approved controls, beside every refused node.** A model that "fixes" refusals by making packages the reviewer
  waves through shows up as a control flipping. On 2026-10-07 a text change (gap 3) was caught exactly this way: a
  control went from 0/5 to 3/5 refused.
- **Every domain the role ships to.** `config_change_author` is shared across four domains. The first result was
  observability only. The production switch was gated on a second run covering network, terraform and kubernetes
  (`inputs/2026-10-07-opus-author-xdomain/`).
- **Today's texts.** Pin the live protocol rows (`build-candidates --refresh-baseline`) and the live role guidance.
  A node whose class was fixed since it ran becomes a CONTROL. Read it as one (2026-10-07: K-R, fixed by k8s 1.15.0).

### Phase 2b — Testing a REVIEWER (model or text): the ground-truth bench

Phase 2 assumes the Reviewer is the fixed instrument. When the REVIEWER is what changes, there is no instrument left,
so refused/approved counts on real legs cannot tell a better reviewer from a stricter or a laxer one. Build a bench
whose right answers are known **by construction**, independent of any reviewer. First built for WARNINGS-INVISIBLE
batch 2 (`scripts/leg-replay-lab/inputs/2026-10-08-batch2-v4/experiment.json`; results
`cline_docs/reviews/warnings-invisible-2026-10-08/LAB-RESULTS-B2.md`).

**How it is built:** `authorSource: 'persisted'` (the Author is a saved package, $0, identical in every arm), optionally
with ONE planted edit (`authorPlant`, an exactly-once EditSpec) that adds a single known property. Each node states its
expected verdict, so every sample is scored right or wrong, not just counted.

| Node kind | Built from | Right answer | What it catches |
|---|---|---|---|
| Must refuse | approved control + a planted defect (false restatement, self-grade table, unproven "check is met" sentence) | REFUSED, naming the planted item | a lax reviewer; one that adopts the package's own claims |
| Must approve | production legs approved and correct; a plant that is legal (a sanctioned pointer) | APPROVED, no label | a strict reviewer; a rule read too widely |
| Must label | a plant that is true but should be recorded (a restated conclusion, a missing reachability step) | APPROVED + the named label, transcribed | label hygiene: form, id, position, truth of the label text |
| Real refusals | production legs refused for the class under test | per class | whether the change moves the real cases |

**Why it is better than refusal rates:** it scores both directions on every node, so "fewer refusals" cannot hide a
reviewer that waves defects through, and "more refusals" cannot pass as "more careful". The Author is held fixed, so
only the reviewer varies. It costs only reviewer calls (~$0.24/sample on Sonnet 5, 2026-10-08).

**Lessons from its first two runs (each cost a gate):**
- **Score the REASON, not the wording.** A plant can trip a second rule. P-CERT's "acceptance check is satisfied"
  sentence was also refused under terraform's "never certify it as met", so a gate on "names the missing step"
  failed correct refusals (baseline refused 3/5 the same way). Gate on "refused on the planted sentence" plus an
  approval ceiling, and record the wording as a subcount.
- **Re-check every control on today's text, in the baseline arm.** One approved control (an observability node)
  was refused in BOTH arms after a protocol change the day before. It measured nothing, so it was dropped.
- **Say exactly where a "0 labels" rule applies.** P-POINT's rule said "0 labels", but the labels landed on other
  prose, not on the pointer under test. Write "0 labels on <the planted line>".
- **Hand-read what the proxies measure.** `negatedLabel` matched quoted "none"; `blockingNamesMissingStep` read 3
  where a hand read found 1–2. The proxies narrow the reading; they are not the score.
- **Re-parse old samples when the parser changes**, so both arms are measured by one grammar.

**For a reviewer MODEL** (not text): one arm per model on the SAME text, so the model is the only difference. Add the
real historical cases whose right answer is settled (a drift refusal that was correct; a refusal later judged a
reviewer error). Pre-register both directions: better on must-refuse **and** no new false refusal on must-approve.
A reviewer model change cuts every `change_reviewer` soak series (CLAUDE.md), so time it against the next soak read.

## Phase 3 — Pre-register, then run (paid; Steve's call)

1. **Write the decision rule into `experiment.json` `purpose` BEFORE the run.** Include: the refused-case target,
   the control tolerance, and what each outcome triggers. The observability arm's rule was *refused ≤1/10 with
   controls no worse ⇒ strong signal*. Apply it as written, even when the result is disappointing.
2. **Dry run** (no `--spend`): every per-node control must pass (§7f step 1).
3. **Arms**: `baseline` and `<model>Author`, identical except for `authorModel` (or `authorEffort`). Reuse an
   earlier baseline arm only if its saved prompts are byte-identical (`cmp` the `*.system.md` / `*.user.md`). n=5 per
   cell. That detects only large effects, which is the right bar for a model switch.
4. **Budget**: the estimator does not model a longer model's output; Opus ran ~60% over it. Size `--max-usd` from the actual
   $/sample for that model+role in `LAB-EXPERIMENT-LEDGER.md` (same folder).
5. **Stop early by rule, not by mood.** Opus-medium was stopped at 4 samples: O7 had 3/4 refused (worse than Sonnet)
   at roughly Opus-high cost. That met a pre-written stop condition.

## Phase 4 — Read, don't count (no spend)

1. **Read every refusal in both arms** (rule 8). Classify each one as a correct finding on a real defect, a
   format/reasoning slip, or a reviewer error. On 2026-10-07 both Opus observability refusals were correct findings
   (off-by-one read-back line numbers; behavioural checks written as prose). Sonnet's network refusals on today's
   text were all one clause (f) class.
2. **Check that approvals are earned, not lax.** Use measures that do not depend on the reviewer: defect patterns
   found by a script, coverage of admitted and denied cases, use of a protocol-aware probe client. Opus improved
   these (probe 5/20 → 12/20, coverage 17/20 → 20/20, known defect patterns 0 in both). Otherwise "fewer refusals"
   could mean "worse reviewer input".
3. **Is the extra length substance or padding?** A stronger model writes longer packages, and the Reviewer has to
   read them. Opus packages were mostly substance (rationale, full files, verbatim rollback), with ~10–15%
   restatement.
4. **Cost per LEG, per domain**, not per call: Author + Reviewer, since a longer package costs the Reviewer too.
   Opus/Sonnet ≈ network 1.7× · terraform 1.6× · k8s 2.0× · observability 1.9×.
5. **Pool only like with like.** Pooled across domains: refused-case samples Sonnet 9/25 → Opus 2/25; control samples
   3/30 → 1/30. Report the per-domain table beside the pooled number, never the pooled number alone.
6. **Correct overclaims before they are written down.** One draft said "0 undercounts in 15 Opus terraform samples".
   The truth was 1/10 (Sonnet 4/10). Check every number against `summary.md` and the samples before it goes into
   the register.

## Phase 5 — Decide (owner) and record

The cost is a production-cost decision, so it is Steve's. Bring: the per-domain table, the read refusals, the cost
multiple per leg, the alternatives from Phase 0, and the Phase 1 status. Record the decision, and the arms that were
rejected with their reasons (Opus-medium, revise mode), in the open register (`MODEL-CHOICE`).

## Phase 6 — Switch (production mutation: pause, show the commands, get a "yes")

1. **The model must be selectable**: add an `anthropicModels` entry in `lib/services/llm/types.ts`. It drives the GUI
   dropdown; without it the GUI showed only "Opus 5".
2. **Tier constant**: add or point a tier in `lib/agents/model-tiers.ts` (`AGENT_MODELS.infraAuthor =
   'claude-opus-5-5'`) with a doc comment naming the role and the decision.
3. **Owning seeds**: point the role's template at the tier in EVERY owning seed (`grep -rln "defaultRole:
   '<role>'" scripts/seed-*.ts` — four for `config_change_author`). Use `modelParameters: { ...COMMON_MODEL_PARAMS(…),
   model: AGENT_MODELS.<tier> }`.
4. **Deploy first**, with the Phase 1 fix live. Never push while a run is in flight.
5. **Reseed manually** through the owning seeds (the deploy seeds protocols only).
6. **Verify the row directly in `agent_templates`.** ⚠️ `report:template-freshness` checks that the model is ON A
   SANCTIONED TIER, not that it equals the seed's model. It read 0 STALE BEFORE the reseed (filed
   FRESHNESS-MODEL-BLIND-SPOT). Also read its 📌 overrides section: a task with a pinned `metadata.modelParameters`
   is not reached by the reseed.
7. **Record the series cut in CLAUDE.md** with the timestamp (2026-10-07 09:14:14Z). Name every series it splits:
   refusal rate, cost/tokens/duration, the reviewer soak (the reviewer's input changes), form-check rates, and the
   non-literal and marker-placement rates.

### Phase 6b — Codifying a switch already made in the GUI (worked example: `requirements_author`, 2026-10-08/10)

Sometimes the owner switches a role's model on the live row through the GUI before any lab run. That is a real
production change made outside this playbook. Bring it under the playbook as follows:
- **The seed reverts it silently until it is codified.** The next reseed of any owning seed writes the seed's model
  back, and `report:template-freshness` cannot see model drift (Phase 6 step 6). Record the GUI switch in CLAUDE.md
  as a series cut at once (2026-10-08 22:01:09Z), with "a reseed reverts it" in the entry.
- **Read the live row before codifying it** (read-only). The GUI save writes more than the model. On 2026-10-08 it
  also wrote `modelParameters.systemPrompt`, a 42,879-char copy of the prompt, and `stopSequences: []`. Both are
  inert on the engine path (`buildSystemPrompt` uses the template's `promptTemplate`), so the reseed that removes
  them changes no runtime behaviour. Confirm "inert" from the code; don't assume it.
- **Give the role its own tier** when the decision belongs to that role alone (`AGENT_MODELS.requirementsAuthor`,
  not a reuse of `infraAuthor`). Then reverting one role's decision cannot move another role's model.
- **Codifying it is not lab evidence.** It ends the silent-revert risk. Phases 0–5 are still owed, and the decision
  stays open in the register until a lab result supports it (for this example: REQ-SPEC-TRIAL-FOLLOWUPS M1 and the
  M-B fidelity lab).
- **Steps 4–7 of Phase 6 still apply**: deploy, reseed, verify the row directly, and record the cut.

## Phase 7 — Watch the first production legs

- **Served model** on the execution equals the new model.
- **The Phase 1 fact is empty** (`toolLoop.reflectionErrors`).
- **Refusal rate and cost per leg against the lab's prediction.** The lab predicted refusals at about a quarter of
  before, and Author cost about 1.6–2× per leg. A lab result is evidence, not a substitute for this watch (§7f limits:
  tool calls stubbed, today's schemas, n=5).
- **Output size and truncation**: a stronger model writes more, so measure the risk; don't assume it. Per CALL against
  the `maxTokens` ceiling (production stores only the per-execution sum, so read per-call figures from the lab's
  `sample.json` `calls`). Package chars against the downstream caps (8 KB tool-result window → `read_more` pages,
  128/512 KB §6 chain). In production, `result.json` `toolLoop.truncationRetryUsed` / `deliverableTruncated` /
  `finalStopReason`. 2026-10-07 measure: largest Opus Author call 23,836 output tokens (network) against the 48,000
  ceiling, so ~50% headroom (Sonnet max 19,833). 0 `max_tokens` stops in 85 lab samples. Package median ≈1.4–1.8×
  Sonnet, max 26,023 chars, ~5× under the 128 KB chain cap. Production Sonnet baseline since the 48K ceiling
  (2026-09-24): 0 of 97 Author legs used the truncation retry.
- **Name the BINDING downstream cap for the role, not only the chain caps.** For a role whose output a reader pages
  through, that reader's read capacity is the cap that binds. The requirements Author's `requirements.md` is read by
  the Program Architect, which then received at most 50,000 characters: the 8 KB first window plus 6 × 7 KB `read_more`
  pages, within at most 8 pages per run. The 2026-10-08 GUI switch to Opus produced drafts over that limit. (Since
  2026-10-12, owner decision R1, the Architect alone reads 9 pages per document / 12 per run — 71,000 — and the checked
  limit is 64,000: `lib/agents/role-read-budget.ts`.)
  That is the size limit behind the requirements form check and its correction turn, and the 128 KB chain cap
  never came close to binding. Before switching a role, find what reads its output and how much of it that reader
  can reach.
- If production diverges from the lab, read the legs before reverting. The revert is a seed change plus a reseed.

---

## Checklist

| # | Step | Spend | Evidence it is done |
|---|---|---|---|
| 0 | Role, lever, fixed instrument, alternatives named | $0 | `experiment.json` `purpose` |
| 1 | Release notes + history-edit audit + capability flag + pinned test + live probe + pricing | ~$0.01 | review doc, test in CI, register |
| 2 | Refused nodes (fixable class) + approved controls, every domain, today's texts | $0 | `experiment.json` `nodes` |
| 3 | Decision rule pre-registered, dry-run controls pass, arms run | paid | `runs/<stamp>/summary.md` |
| 4 | Every refusal read; approvals corroborated; length audited; cost per leg per domain | $0 | register entry |
| 5 | Owner decision recorded with rejected arms | $0 | register `MODEL-CHOICE` |
| 6 | anthropicModels + tier + all owning seeds + deploy + reseed + row verified + series cut | $0 | `agent_templates` row, CLAUDE.md |
| 6b | (GUI switch only) cut recorded at once; live row read; own tier; Phases 0–5 still owed in the register | $0 | CLAUDE.md, register |
| 7 | Served model, reflection fact empty, refusal/cost vs prediction | $0 | first production legs |

**Cost of the 2026-10-07 onboarding**: lab ≈ $16.78 (observability) + ≈ $31.69 (cross-domain) + the stopped
Opus-medium arm + $0.0055 probe. That is small next to one wrong switch across four domains.

## Sources

- Register: `cline_docs/follow-ups/OPEN-REGISTER-2026-09-23.md` — `MODEL-CHOICE`, `OPUS55`,
  `FRESHNESS-MODEL-BLIND-SPOT`, and the DEFERRED Sonnet 5.5 entry (it must get `bindsThinkingToPrefix: true`).
- Audit and probe: `cline_docs/reviews/opus55-loop-audit-2026-10-07/{AUDIT.md, V1-V2-VERIFICATION.md}`.
- Experiments: `scripts/leg-replay-lab/inputs/2026-10-07-opus-author{,-xdomain}/` (`runs/` and `cache/` are gitignored).
- Instrument: `PIPELINE-RUN-FORENSICS-GUIDE.md` §7f.
