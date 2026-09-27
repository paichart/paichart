# Pipeline-Run Forensics — the methodology behind run-assessment tables

> **Created**: 2026-07-08 (Steve's request, after the truncation/caching verification arc) ·
> **Purpose**: the reproducible process for assessing pipeline runs *from persisted records alone* —
> before/after comparisons, truncation analysis, token economics, behavioral verification. No
> instrumentation, no re-running old code: every number comes out of prod rows that already exist.
> **Worked examples produced by this method**: the Test A/B truncation scorecards and the
> envelope-fix before/after table (`cline_docs/reviews/services-envelope-bloat-2026-07-08/`), the
> prompt-caching economics (`cline_docs/reviews/prompt-caching-G-2026-07-08/`).
> **Owner**: pipeline-harness-specialist (methodology) · token-optimizer (economics recipes).
> **Assessing a PROGRAM** (pipeline-of-pipelines)? This guide covers a single pipeline / one leg; the
> composition layer (release gate, coverage facts, inter-pipeline chaining, non-terminal classes) is in
> [`PROGRAM-RUN-FORENSICS-GUIDE.md`](./PROGRAM-RUN-FORENSICS-GUIDE.md).

---

## 🆕 2026-09-15 — WHICH SURFACE HOLDS WHICH FACT (read this before concluding a fact is absent)

Three times in one session a fact was reported ABSENT when it was present on a different surface.
Each time the query was reasonable and the conclusion was wrong. **When a fact looks missing, the
prior should be "I queried the wrong surface", not "the fact is missing"** — measured 3 for 3.

| the fact you want | where it ACTUALLY lives | where people look first (and find nothing) |
|---|---|---|
| `derivationContainment`, `dialectLint`, the mechanical nets | the execution's **`result.json` / `pipeline-index.json` artifact** | `tasks.metadata` — nets stamp the artifact, not the row |
| `qualityGate`, `programReleasable`, `pipelineStageId`, `duplicateHalt` | **`tasks.metadata`** | the artifact |
| which protocol VERSION an agent actually received | the artifact's **`protocolInjection`** block (name, version, `preambleChars`) | `agent_executions.config.systemPrompt` — that holds the TEMPLATE's prompt; protocols are injected at run time and are NOT in it |
| what a role is TOLD (assembled view) | `npm run prompt:directives -- <role> --protocol <p>` | — but see the caveat below |
| **what a child was told on a PAST run** | **nowhere durable** — `tasks.description` is CURRENT state and is overwritten in place | `tasks.description`, which now shows whatever it was last edited to |
| the deliverable text | `result.json.finalResponse`; `report.md` only for leaf/designated tasks | — |
| **whether the engine DECIDED to emit a `report.md`** | the artifact's **`reportMdSource`** block (`{mode:'self'\|'upstream', sourceTaskId?, extractFailureReason?}`) | the presence of the `report.md` artifact itself — which conflates *decided not to* with *decided to and failed* |

⚠️ **A brief is MUTABLE, and your own remediation is a writer to it.** `tasks.description` holds
current state, not history: there is no prior-version record, so once a defective brief is corrected
the evidence that it was ever defective is gone. Measured the hard way on 2026-09-20 — an Author
brief closed with *"unless you find you are reusing a chained value verbatim from elsewhere"*, which
licensed the import that caused the incident; I fixed the brief, then an hour later queried the
corpus for that phrasing and got a clean **0 of 197**, and very nearly reported it. The instance had
been destroyed by the fix.

**When the BRIEF is the thing under investigation, capture it verbatim BEFORE editing it** — into
the follow-up, the review bundle, anywhere immutable. The execution artifacts preserve what an agent
*did*; nothing preserves what it was *told*. The general form is worth more than the instance:
**before measuring a mutable surface for a defect, ask whether you have already repaired one — you
are a writer to the corpus you are querying.**

⚠️ **`prompt:directives` is a FILTERED view, not the prompt.** It lists prohibitions and mandates by
pattern. A reviewer-addressed paragraph added 2026-09-15 does **not** appear in its output even though
it is in the injected protocol — verified against the execution's own `protocolInjection` record.
**Its silence is not evidence of absence.**

⚠️ **Never assert an absence from truncated output.** A `grep` piped through `cut -c1-200` reported
"no such clause exists" for a clause sitting at character ~4,000 of a single ~15,000-char line. The
evidence was in the grep's own result and the formatting discarded it. That false negative was
committed, pushed, and used to brief four review agents. If you are about to write "X does not
exist", re-run the search with no truncation and no `head`.

⚠️ **`reportMdSource` separates the two reasons a deliverable is missing** (added 2026-09-16). It is
written **only** when `getReportMdDecision` returned `produce: true`, so on a harness task with no
`report.md`:
- `reportMdSource` **absent** ⇒ the engine decided *not* to produce. Check the Option-A gate: did the
  `deliverableSourceTaskId` source have a SUCCESS execution **at the moment this execution
  persisted**? Compare `agent_executions."endTime"` on both sides — a source that succeeded *later*
  makes `produce:false` correct, and three of three archive candidates were exactly that.
- `reportMdSource` **present** ⇒ the engine decided to produce and the artifact still is not there.
  That is a real anomaly. Exactly **1** such execution exists in the corpus (`cmrmkegkv…`,
  2026-07-15); retention is ruled out (July retains 147 `report.md` rows).

Without this split, "harness produced no deliverable" reads as one symptom with one cause. It is two,
and only the second is a defect.

⚠️ **`allDependenciesMet` is a CONSTANT — never use it as a coverage fact** (added 2026-09-16).
`true` in **729 of 729** rows; it has never been false, including where `completedDependencies: 0`.
It measures SCHEDULING (are the predecessor *tasks* terminal) while every field beside it in
`pipelineMetadata` measures DELIVERY, so it answers a question nobody asked in a place where it reads
as the answer to the one they did. Filed:
`cline_docs/follow-ups/all-dependencies-met-is-constant-2026-09-16.md`.

⚠️ **A chained fact on a LEG is not a fact about its CHILDREN** (added 2026-09-16). See
PROGRAM-RUN-FORENSICS-GUIDE §3 — measured 51 of 51 upstream edges reaching a leg and 3 reaching any
child (Bug Class 84). Query the child's own `inputContext.chainedFrom` separately; a child whose
entries name only its siblings has not received the upstream deliverable, whatever the leg reports.

⚠️ **A stale stamp keeps reporting.** `metadata.duplicateHalt` is NOT cleared when
`duplicateAcknowledged` resolves it, so `agent.status` keeps returning `halted_awaiting_human` and
recommending a stamp that already exists. Read the metadata, not the workflow recommendation.

## 🆕 2026-09-15 — `protocolValidation.mode` IS A GUESS. `resolvedMode` IS THE RECORD.

An artifact can carry `"resolvedMode": "CREATE"` and `"protocolValidation": {"mode": "ORCHESTRATE"}`
**in the same document**, and the degradation beside them is computed against the SECOND one.
Measured across the corpus: **12 of 68 executions carrying `protocolValidation` are graded against a
mode they did not resolve to, and the graded mode is ORCHESTRATE in 12 of 12.**

Do not treat this as a bug to report on sight — the divergence is *deliberate* and the ruling behind
it is sound. But do not read `protocolValidation.mode` as "the mode this run was in", because it is
not. It is an inference from the tool-call transcript.

**Why inference at all?** `validatePipelineProtocolSteps` runs against an immutable post-execution
snapshot and must decide WHICH step-profile to judge against. It cannot simply trust the stamped
`resolvedMode`, because `pov-program` PLAN-SPAWN legitimately resolves **SYNTHESIZE** (all-terminal
reason code) while doing **CREATE-shaped** work by design and deliberately never calling
`task.complete`. Trusting the stamp would false-flag PLAN-SPAWN on *every run*. So inference is
primary and `resolvedMode` is an **UNKNOWN-only rescue** — never an override of a confident
inference (HARNESS_NO_OUTPUT panel + pipeline-harness ruling, 2026-07-17).

**The inference ladder** (`detectHarnessMode`, first match wins):

| # | test | verdict |
|---|---|---|
| 1 | `task.create` **and** `stage.create` | CREATE |
| 2 | `task.complete` | SYNTHESIZE |
| 3 | `stage.create` alone | CREATE (half-CREATE: stage opened, no children yet) |
| 4 | `agent.assign` **or** `task.update` | ORCHESTRATE |
| 5 | none of the above | UNKNOWN → rescued by `resolvedMode` |

**Rung 4 is the trap.** By the time it is reached we already know no stage was created and the task
was not closed. In that position `agent.assign` is a genuinely distinctive tell — handing work to
children that already exist is what orchestrating *is*. But `task.update` means only "wrote a field
on a task", which **every mode does**: CREATE stamps its `pipelineStageId`, SYNTHESIZE stamps its
results, and a halt stamps the reason it stopped. Identifying an orchestrator by `task.update` is
identifying a horse by counting four legs.

Measured: of the 12 disagreements, **11 have zero `agent.assign`** — they reached ORCHESTRATE on
`task.update` alone. The single exception is the PLAN-SPAWN shape the 2026-07-17 ruling protects.

⚠️ **The sting: obeying the protocol is what triggers it.** A halting agent is *mandated* to record
why it stopped (`metadata.cannotRun` / `metadata.duplicateHalt`) — and the only way to record it is
`task.update`. So compliance with the halt mandate is the exact act that classifies the halt as an
orchestrator, which then emits `PROTOCOL_STEP_SKIPPED` accusing it of skipping a step. **The most
disciplined behaviour in the corpus carries a red flag.**

⚠️ **The same shape for the re-execute exit — fixed 2026-09-26 (RWF A4).** A SYNTHESIZE that re-executes a child
(the 50–69 band) and exits used to be graded `PROTOCOL_STEP_SKIPPED` ("Step 5 not called" + content misses
graded against its interim status note). Since A4 it records `protocolValidation.reExecutionExit {kind,
childTaskIds}` and does not degrade. **Reading rule:** a `PROTOCOL_STEP_SKIPPED` on a SYNTHESIZE that
dispatched a child and is dated BEFORE 2026-09-26 is that artifact, not a skipped step (6 of the 7 prod
instances). Related facts on the same runs: `metadata.deadEndExempt` (an empty SYNTHESIZE NOT terminalized
because a child was in flight or dispatched that run) and `metadata.reactorBudgetExhausted` (Guard 8).

⚠️ **And a halt can never satisfy a step-profile at all.** Its correct behaviour is to do nothing —
no stage, no children, no completion. Re-pointing it at the right profile does not help: judged as
CREATE it simply fails on "stage.create not called", which is *true* and still wrong, because not
creating the stage was the entire point. A sanctioned halt must be **exempt from step validation**,
not merely graded under a different ruleset.

**Forensic rules that follow:**

1. When reading any degradation, **read `resolvedMode` first** and check whether
   `protocolValidation.mode` agrees. If they disagree, the degradation was computed against a
   ruleset the run was never following — treat the finding as unproven until you have checked it by
   hand.
2. `executionDegradation` is a **gate input** (`programReleasable`, leg-tier stamped outcome). A
   wrong mode here is not cosmetic — it propagates.
3. A degradation on an execution that *escalated correctly* deserves suspicion, not confirmation.
   Two hand-verified false positives (2026-09-15): a CREATE duplicate-halt and an observability
   SYNTHESIZE that escalated, wrote `report.md`, and was failed for lacking an ORCHESTRATE
   breadcrumb.
4. `hasBreadcrumb: false` does **not** mean the breadcrumb is absent. The check matches
   ``**Child stage:** `<id>` `` and rejects the same fact in plain text — one execution whose
   comment literally begins `Child stage: cmty0x9jo...` scored `false`. It asserts *formatting*
   while appearing to assert *semantics*.

```bash
# Is a degradation graded against the mode the run actually resolved to?
# Run per-artifact; a disagreement means the finding needs hand-verification.
psql "$DATABASE_URL" -c "
SELECT (a.content::jsonb)->>'resolvedMode' AS resolved,
       (a.content::jsonb)->'protocolValidation'->>'mode' AS graded_against,
       (a.content::jsonb)->'executionDegradation'->>'errorCategory' AS degradation
FROM agent_artifacts a
WHERE a.\"executionId\" = '<execution id>' AND (a.content::jsonb) ? 'protocolValidation';"
```


## ⚠️ 2026-09-16 · 2026-09-17 · 2026-09-19 · 2026-09-20 — SIX RULES FOR MEASURING, earned by getting each one wrong on a live run

A forensics guide is only as good as the queries it leads you to write. On 2026-09-16 a single
investigation produced **five** wrong numbers before the right one, every time by measuring something
adjacent to the property. These rules are what separated them.

### 1. Run a CONTROL before believing a total

A query returning null/zero for **everything** is far more likely to be a broken query than a broken
platform. The control is cheap: find a population that is *known* to have the field and check that it
does.

Live example: `inputContext.chainedContext.predecessors` returned null on all 95 cross-pipeline edges,
which read as *"chaining has been silently broken since 2026-07-16"*. The control — **zero tasks of
ANY type had that path, including ACTION tasks known to chain** — showed the path does not exist. The
real key is `inputContext.chainedFrom`, and chaining is **54 of 54** where the downstream executed.

> **A field that is null for everything is a broken query, not a broken platform.**

### 2. A field NAME is not a field VALUE

`truncated`, `sanitized`, `degraded`, `notChained` are **keys present on every entry**. Matching the
word matches every row.

Live example: `chainedFrom::text LIKE '%truncat%'` returned **642 of 643** — reading as near-universal
truncation. The value test, `(e->>'truncated')::boolean`, returns **0 of 779**. The trim has never
fired. Always test the value, and prefer a jsonb accessor to a text match.

### 3. Count OPPORTUNITIES, not lookalikes

Before reporting a rate, ask: *what is the population in which the thing could have happened?*

Two live examples the same day:
- Backtick-quoted canonical headings: legs *containing* one = **204**; containing one and no parseable
  heading = **157**; containing one adjacent to a JSON fence, i.e. an attempted emit = **11**; legs
  whose **stamped fact actually changes** = **3**. Only the last is the defect. The first three count
  the word.
- Non-terminal PIPELINE tasks reported **71 UNEXPLAINED**; **59** were simply blocked by an incomplete
  dependency — correctly queued, not hung. The bucket was the tool's residual, not a finding.

A corollary for this whole guide: **a residual bucket is not a finding.** "Unexplained" means the
question has not been asked yet. Add the predicate; do not let the pile acquire a reputation.

### 4. A fact is only readable once the thing that stamps it has run

**A harness leg has at least TWO executions** — the CREATE/ORCHESTRATE pass that decomposes it, and
the terminal SYNTHESIZE pass that stamps the leg-level facts. `derivationContainment`,
`upstreamContainment` and the quality gate are written by the SECOND one. Read
`pipeline-index.json` between them and the key is simply not there yet.

That is dangerous rather than merely wrong, because **absence is specified to fail closed**
(`ABSENT ⇒ treat as blocking`). A premature read does not produce "no data" — it manufactures a
false BLOCKING finding about a run that was fine.

Live example (2026-09-17, phase-1 showcase program): the cloud leg was reported as carrying no
containment fact at all, and written up as a gap in cross-leg attestation — *"the consumption is
attested by prose, not by the mechanical net."* The leg has two executions, `01:51:53` (no fact)
and `02:00:43` (the fact). The read happened at ~01:52. The real stamp was
`disposition: benign`, `reason: consuming-leg-consumed-discharged`, carrying
`upstreamContainment.legs[].derivedValues` — the producer's `taskId` **and** its value — with
`green: true`. The mechanical attestation the finding said was missing was the exact thing that
existed.

**Two mechanical habits prevent it:**

```sql
-- (a) Test KEY PRESENCE, never a pretty-print. jsonb_pretty(NULL) prints BLANK,
--     which is indistinguishable from "the key is there and empty".
SELECT (a.content::jsonb) ? 'derivationContainment' AS key_present,
       jsonb_typeof((a.content::jsonb)->'derivationContainment') AS typ

-- (b) Never `ORDER BY "startTime" DESC LIMIT 1` on a leg while anything is still RUNNING.
--     Gate the read on the leg being settled, and say which execution you read.
SELECT e.id, e.status, e."startTime", ((a.content::jsonb) ? 'derivationContainment') dc
FROM agent_executions e JOIN agent_artifacts a
  ON a."executionId" = e.id AND a.name = 'pipeline-index.json'
WHERE e."taskId" = '<leg id>' ORDER BY e."startTime" DESC;   -- read them ALL, then choose
```

⚠️ **`task.status = COMPLETED` does NOT mean the leg is settled.** In the live case the poll printed
`task=COMPLETED exec=RUNNING` in the same row that the read was taken from. The task flips before its
terminal execution finishes persisting. Gate on the EXECUTION, not the task.

> **Absent, benign and not-yet-stamped are three different states, and only one of them is a finding.**

### 5. A leg told to consume a chained value, with nothing chained, is a WIRING finding — not a leg finding

When a leg's brief says *"consume X verbatim from chained context"* and the leg escalates saying it
cannot find X, the defect is usually **upstream of the leg**, in the DAG. Check before reading a
single line of the leg's reasoning:

```sql
SELECT jsonb_array_length(coalesce("inputContext"->'chainedFrom','[]'::jsonb)) AS chained
FROM tasks WHERE id = '<leg id>';   -- 0 on a leg that HAS RUN is the finding
```

⚠️ **Only meaningful once the leg has executed.** `chainedFrom` is written by
`prepareTaskForExecution` at execution time, so before a leg runs it is `0` whether the wiring is
right or wrong. To check wiring BEFORE a run, read the dependency edges instead —
`PROGRAM-RUN-FORENSICS-GUIDE.md` §5.

A `0` here means the leg was **right to escalate** and its own work is not in question. The common
cause at program tier is an APPROVAL gate interposed between producer and consumer: the chainer
walks DIRECT edges and a gate carries no deliverable, so `P1 → G2 → P2` delivers nothing. Full
treatment, including why the previous round chained correctly for the wrong reason:
`PROGRAM-RUN-FORENSICS-GUIDE.md` §5.

⚠️ **A sibling leg succeeding does not clear the wiring.** Given the same empty context on
2026-09-18, one leg harness fetched the value itself via `agent.results` and wrote it into its child
briefs (approved 92), one took a branch that needed no value (approved 84), and only the third
refused (20). Two of three masked it. If one leg escalates on a missing chained value, check
`chainedFrom` on **every** consumer in the stage, not just the one that complained — and see
§5b there for detecting a harness that routed around the chain.


### 6. A cross-domain comparison needs the domains' clauses open side by side

**Before comparing domains on a metric, confirm they mandate the same thing at the same phase.**
Otherwise you are comparing POPULATIONS, not behaviours.

Live example (2026-09-19/20): measuring how often a machine-parsed marker block reads ABSENT gave
network 16% / kubernetes 53% / terraform 100% — which reads as *"the domain that carries the
placement rule fails most"*. Both numbers were population artifacts:

- **Different mandates.** terraform and kubernetes require a `## Harvested Allocations` block
  UNCONDITIONALLY; network does not. A proxy keyed on `"kind"` — present in harvested AND derived
  entries — therefore loaded exactly the two domains that scored worst. Re-keying on `"members"`
  (only a DERIVED entry carries it) took terraform from 17 attempts to **2**; 15 had been harvest
  blocks. Corpus-wide the count fell from ~31 to **~8**.
- **Different phase.** kubernetes emits `## Derived Values` at **Phase 2**; network and terraform
  emit at **Phase 1** and only CARRY at Phase 2. Filtering to two roles therefore samples a
  different point in the chain in each domain.

⚠️ **Neither asymmetry was visible from the query side, however the query was written.** Both were
found by someone holding all four domains' clauses open together, because a porting job required
deciding which were in scope. The lesson is NOT "read prose instead of querying" — it is that a
cross-domain claim made from outside a side-by-side reading of the domains' own texts cannot see
what makes the populations differ.

⚠️ **0 successes is an ABSENCE, not a rate.** terraform's "100% failing" was 0 parsed against 2
attempts — a population that rarely derives at all. The first output said so and it was read past.


## 0. The mental model — four layers of persisted evidence

Every pipeline run leaves a layered forensic record. Know which layer answers which question:

| Layer | Table / artifact | Answers |
|---|---|---|
| **Execution facts** | `agent_executions` row | status, model, `inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheCreationTokens`, timestamps; the `logs` array carries per-run lines like `"Agentic loop: N turn(s), M tool call(s)"` |
| **Evidence-flow facts** (2026-07-18; disposition 2026-08-03) | `pipeline-index.json` → `derivationContainment` | **READ `containmentDisposition` FIRST — it is the answer.** `{ disposition: blocking \| benign \| needs-node-c, reason, inputs }`, computed by `computeContainmentDisposition`. Do **NOT** re-derive a verdict from `checked` + the reason string: `checked:false` is NOT "blocking", and `no-derived-values-block` is a benign *candidate* whose outcome turns on `harvestedCount`. That re-derivation produced a wrong, retracted finding on 2026-08-11. If a reading contradicts the stamp, that is a DEFECT to report, not a judgement to exercise. Supporting fields: `derivedValues` (the value that crossed the DAG edge), `violations[]` (do NOT enumerate the classes here — this list said "covered-not-member / member-not-covered" while FOUR then SIX existed; the authoritative set is the `reason` union in `lib/agents/harness/derivation-containment.ts`), `harvestedCount`, `harvestSource`/`derivedSource` artifact ids. **Consuming legs** (terraform-iac, kubernetes-gitops) carry `consumedValues` + `upstreamContainment{legs[],green}` instead of deriving — a clean one stamps `checked:false` / `nothing-to-derive` / **benign**, which is a *satisfied* state, not a miss. See EVIDENCE-FLOW-DISCIPLINE.md |
| **Rollback provenance fact** (2026-09-11) | the **AUTHOR child's** `result.json` → `rollbackContainment` (NOT pipeline-index.json — it is stamped at the Author leaf's persist so it reaches the Reviewer; SYNTHESIZE hoists it); the Reviewer's `task.inputContext.chainedFrom[].rollbackContainment` shows what the Reviewer actually SAW (null outside the observability-config lane — a withheld field, not a stamp; see the two-lane comment at `render-pipeline-context.ts`) | **READ `rollbackDisposition` FIRST** — nested `{disposition, reason, inputs}`. `restoreLinesFound/restoreLinesTotal` + `missing[{line, blockLine}]` are the fact; `excluded{class: n}` names what was NOT adjudicated (separator, inverse-line, expected-output, verification, comment-line, procedural-rollback-block). **Asymmetric with derivationContainment**: `needs-node-c` / `unmatched-restore-lines` means "lines the check could not adjudicate" — NOT evidence of fabrication, never blocking; the only blocking arm is could-not-check (`enrichment-error`). `checked:false` + `lane-not-supported` (HCL/desired-state legs) is a deliberate no-check, benign, "no opinion" — not a miss. `no-restore-blocks` approves NOTHING (package completeness stays the reviewer's). Before theorizing about a provenance-shaped refusal, run the string test (each disputed line ⊆ the leg's harvest artifact) — three refusals of correct packages preceded this fact (R19 P4, R3a-3, R3b-2); classify (a) evidence-absent vs (b) content-correct-but-unverifiable per EVIDENCE-FLOW-DISCIPLINE §2026-09-11 |
| **Tool-call forensics** | `agent_artifacts` → `result.json` → `toolCalls[]` | every call's `tool`, `arguments`, `result` (Tier-2 ≤50KB), `success`, `durationMs`, and the C2 fields `resultTruncatedForLlm`/`resultChars` |
| **Run structure** | `tasks` rows + `metadata` | root→children linkage (`metadata.pipelineStageId`), `qualityGate` stamp, `deliverableSourceTaskId`; comments carry execution summaries + escalations |
| **Deliverables** | `report.md`, `pipeline-index.json` | what the customer/auditor sees; the harness's own forensic index |

**Access pattern**: read-only psql over ssh. MCP tools (`project`/`fetch`) are fine for orientation,
but real forensics needs greps and jsonb surgery the connector can't do — and `fetch` caps artifact
bodies at ~100K chars, so large `result.json`s are only fully readable via psql.

⚠️ **Log-retention asymmetry** (M2 panel finding, 2026-07-17): prod `web-*` logs (engine/tool-loop
path) retain only **~14 days**; `mcp-*` logs retain ~8 months. A "0 hits in prod logs" claim against
engine-path behavior therefore covers ~2 weeks, not history — the 2026-06-28 reaped-execution row is
permanently unattributable because its logs rotated away. DB-side evidence (`agent_executions` stats,
`result.json` `durationMs`) covers full history; prefer it for any beyond-2-weeks claim, and state the
window whenever citing a log-grep zero (vacuous-zero discipline).

```bash
ssh <PROD_USER>@<PROD_HOST>
cd /var/www/paichart-app/current && set -a && source .env.production && set +a
psql "$DATABASE_URL"
```

⚠️ **Quoting gotchas that will burn you** (all hit live on 2026-07-08): inside a double-quoted ssh
command `$$` expands to the remote shell's PID (breaks dollar-quoting) — use the `'"'"'` dance or a
heredoc; `tasks` columns are snake_case (`pov_id`, `stage_id`, `created_at` — `t."povId"`/`t."createdAt"` both
error) while `agent_executions`/`agent_artifacts` are camelCase-quoted (`"taskId"`, `"executionId"`,
`"inputTokens"`, `"startTime"`); and when capturing exit codes, `npm run x | tail` gives you **tail's**
exit — capture before piping.

⚠️ **`agent_executions` holds NO result/output/metadata column** — its columns are status, model,
timings, token counts, `logs`, `config`, `context`, `errorCode`, `supersededById`. *Every* JSON body
(`result.json`, `pipeline-index.json`, `report.md`) lives in **`agent_artifacts`**, joined
`a."executionId" = e.id`. Likewise there is no `phases` table, and `agent_templates` has no
`model`/`configuration` column. Guessing these cost four failed queries on 2026-08-12.

---

## 1. Resolve the run family

A "run" = 1 root PIPELINE task (2 executions: CREATE + SYNTHESIZE) + N children in a dedicated stage.

⚠️ **The 2-execution rule is PIPELINE-tier only.** A **program** root (title carries `(protocol:
pov-program)`) has **3**: CREATE spans **PLAN** then **PLAN-SPAWN** (a mechanical necessity — the
interface contract is accepted only at `task.create`, and PIPELINE children start only on
dependency-completion), then SYNTHESIZE. Verified live 2026-08-12: program root `execs=3`, both
pipeline legs `execs=2`. Counting a program root as 2 reads the third execution as a retry. A program's
family is also **three tiers** (program root → child PIPELINE legs → each leg's ACTION children), so
the single-`pipelineStageId` roster query below returns only the middle tier — resolve the legs first,
then recurse. Composition-layer method: **PROGRAM-RUN-FORENSICS-GUIDE.md**.

```sql
-- root → child stage → roster
SELECT t.status, t.metadata->>'pipelineStageId' AS stage,
       (t.metadata->'qualityGate')::text AS gate
FROM tasks t WHERE t.id = '<root task id>';

SELECT id, LEFT(title,50), status FROM tasks
WHERE stage_id = '<pipelineStageId>' ORDER BY created_at;
```

The family for totals = root executions **plus** every child's executions:

```sql
SELECT LEFT(t.title,40) AS who, e.status, e."modelUsed",
       e."inputTokens", e."outputTokens", e."cacheReadTokens", e."cacheCreationTokens",
       e."createdAt"
FROM agent_executions e JOIN tasks t ON t.id = e."taskId"
WHERE t.stage_id = '<pipelineStageId>' OR t.id = '<root task id>'
ORDER BY e."createdAt";
```

**Turn/tool counts** (for per-turn math) come from the `logs` array — grep the row's `logs` for
`Agentic loop:` (token-optimizer's recipe: extract `N turn(s), M tool call(s)` per execution).

---

## 2. Dissect toolCalls (the per-call layer)

The canonical jsonb idiom — one row per tool call, with the C2 truncation signal:

```sql
SELECT 't'||(tc->>'turn') AS turn,
       COALESCE(tc->'arguments'->>'tool', tc->'arguments'->>'action') AS what,
       tc->>'success' AS ok,
       tc->>'resultTruncatedForLlm' AS trunc,   -- C2: was the LLM's view capped at 8K?
       tc->>'resultChars' AS chars              -- C2: full post-R9 pretty-printed length
FROM agent_artifacts a,
     jsonb_array_elements((a.content)::jsonb->'toolCalls') tc
WHERE a."executionId" = '<execution id>' AND a.name = 'result.json';
```

Notes that keep the numbers honest:
- `resultTruncatedForLlm: true` means the **LLM's view** was cut at `MAX_TOOL_RESULT_LENGTH` (8000
  chars) — since the 2026-07-08 envelope de-bloat it predominantly means *real payload* at the cap;
  before it, ~45-49% of every response was envelope decoration, so pre-fix `true`s need the §3 split.
- `resultChars` measures the pretty-printed post-R9 string — it will NOT match Tier-2's compact
  byte measure; don't cross-compare the two.
- Harness roots persist `pipeline-index.json` instead of `result.json` — same `toolCalls` idiom,
  different `a.name`.
- The Tier-1 `[truncated]` marker itself is **never persisted** (it exists only in the LLM's view);
  evidence of truncation-handling lives in what the agent *said* (finalResponse GAP flags) and the
  C2 fields — not in stored markers.
- **A truncation flag answers "lost from the agent's view?", never "lost from the record?"** — those are
  two different questions (harvest-truncation-safety.md §2 "THE TWO QUESTIONS"). ≤50 KB the full raw result
  is at Tier-2, so the §3 dissection can always tell you what sat past the cut that the LLM never saw.

## 3. Payload-vs-envelope / content-position splits

When the question is *"what did the LLM actually see vs lose?"*, pull the artifact locally and
dissect in python — SQL substring math gets unwieldy past one probe:

```bash
psql "$DATABASE_URL" -t -A -c "SELECT content FROM agent_artifacts WHERE id='<artifact id>';" > /tmp/x.json
```

```python
import json
d = json.load(open('/tmp/x.json'))
tc = d['toolCalls'][N]
s = json.dumps(tc['result'], indent=2)          # reproduce the loop's serialization EXACTLY
first8k, tail = s[:8000], s[8000:]              # the LLM-view boundary
# then: key positions (s.find('"startup"')), substring membership per segment,
# counts per segment (seg.lower().count('ptp')) — prove WHERE content sat relative to the cap
```

This is how Test B proved the cut tail was envelope junk, not device data: all payload keys ended
by char ~6.7K; the 8K+ region contained only schema-echo. **Reproduce the exact serialization the
runtime used** (`JSON.stringify(result, null, 2)` ⇔ `json.dumps(..., indent=2)`) or the positions lie.

**When SYNTHESIZE contradicts a child, run this position check FIRST** — before theorizing about the
orchestrator's judgment, prove whether the load-bearing signal even survived the 8KB slice of the child's
`result.json` fetch. The 2026-07-14 verdict-misread (harness `cmrk5nzw5…`) looked like an LLM anchoring on
retracted prose; the position check showed the retraction + `VERDICT: APPROVED` sat past char 8000 and was
never in the orchestrator's view. Post-fix, ALL compact fields (confidence, `reviewerVerdict`, the full
trust-signal stack, metrics) are emitted BEFORE the bulky payloads — `finalResponse`/`toolCalls` — (field
order is a contract — see `execution-artifacts.ts`). ⚠️ Until 2026-09-26 that held only for what the builder
emits: keys added at persist — net stamps (`derivationContainment`, `markerPresence`, `rollbackContainment`…),
`supersession`, `reportMdSource` — sat AFTER `finalResponse`. RWF C3 re-orders the whole object at persist
(`orderResultJsonForPersist`), so on an artifact persisted before that date, run the position check on those
keys too. And a stamped
`qualityGate.verdictMismatch: true` marks a stamped outcome that contradicts the reviewer's transcribed
terminal verdict. See `cline_docs/reviews/harness-synthesize-verdict-misread-2026-07-14/finding.md`.

## 4. Phrase-hunting across artifacts (finding events, not reading everything)

To locate truncation events / GAP flags / escalations across a whole POV without reading megabytes:

```sql
SELECT t.id, LEFT(t.title,55), a.name,
       substring(a.content FROM GREATEST(1, position('<phrase>' in a.content) - 250) FOR 450)
FROM agent_artifacts a
JOIN agent_executions e ON e.id = a."executionId"
JOIN tasks t ON t.id = e."taskId"
WHERE t.pov_id = '<povId>' AND a.content ILIKE '%<phrase>%';
```

Phrase choices matter: search for **event-shaped** strings (`"truncated": true`, `GAP`,
`utput truncated`) and expect **prompt-prose false positives** (the protocols themselves discuss
truncation) — classify each hit as *event* vs *prose* before counting it. This distinction is what
separated "the harvester experienced truncation" from "the prompt warns about truncation" in the
2026-07-07 investigation.

---

## 5. The assessment table — framing rules (the part that makes it trustworthy)

The numbers are easy; the comparisons are where assessments go wrong. Rules learned the hard way:

1. **Like-for-like branches only.** The E-verification family total looked FLAT because the baseline
   run *escalated early* (cheap SYNTHESIZE exit) while the new run did *full synthesis*. Compare
   stage-by-stage (harvester vs harvester), and flag branch differences explicitly in the table.
2. **Same objective, same stage, same models.** A root (Sonnet) and a child (Haiku) are different
   populations — never blend them into one ratio. Note the model column in every table.
3. **Facts in cells, verdicts in prose** (Protocol 10). `2/13 truncated`, `269K input` are cells;
   "discipline held" is a sentence you defend under the table.
4. **Cite artifact/execution IDs** for every number so any cell can be re-derived (`fetch(id:...)` /
   the psql row). An assessment nobody can reproduce is an opinion.
5. **Prove-before-write** (Protocol 11 Part C): re-run every query the moment before publishing the
   table. Numbers from memory drift.
6. **Label estimates as estimates.** Second-order effects (e.g. "re-read turns avoided") are
   projections — mark them, don't let them sit next to measured cells unqualified.
7. **Beware metric-definition shifts across the comparison boundary.** After the envelope fix,
   `calculateActualTokenUsage` changed what it measures; after caching, `inputTokens` splits into
   cached/uncached components (`input + cacheRead + cacheCreation` = the real prompt size). When a
   change alters the meter itself, say so in the table's caveats.

### Table skeleton (the shape used across the session's assessments)

| Metric | Baseline (run/exec IDs) | After (run/exec IDs) | Verdict |
|---|---|---|---|
| truncations (C2 true / total calls) | … | … | measured |
| harvester inputTokens | … | … | measured |
| per-stage inputTokens (like-for-like) | … | … | measured |
| wall-clock (first exec createdAt → root terminal) | … | … | measured |
| second-order effects | — | … | **estimate** |

Caveats block under every table: branch differences, meter changes, population notes.

---

## 6. Quick-reference: session-proven one-liners

```sql
-- cache verification (Finding G): the split that proves caching fired
SELECT LEFT(t.title,40), e."inputTokens", e."cacheReadTokens", e."cacheCreationTokens"
FROM agent_executions e JOIN tasks t ON t.id=e."taskId"
WHERE t.stage_id='<stage>' OR t.id='<root>' ORDER BY e."createdAt";
-- real prompt size per request ≈ inputTokens + cacheReadTokens + cacheCreationTokens

-- truncation rate for one execution
SELECT COUNT(*) FILTER (WHERE tc->>'resultTruncatedForLlm'='true') || '/' || COUNT(*)
FROM agent_artifacts a, jsonb_array_elements((a.content)::jsonb->'toolCalls') tc
WHERE a."executionId"='<exec>' AND a.name IN ('result.json','pipeline-index.json');

-- quality-gate stamps across a stage's roots
SELECT id, (metadata->'qualityGate')::text FROM tasks WHERE metadata ? 'qualityGate';
```


---

## 7. Worked example — the multicast-VLAN evolution table (produced entirely by §1–§6)

Three runs of the SAME objective (market-data multicast VLAN, Meridian POV, Network Provisioning
stage), spanning two platform changes: the embedded-envelope de-bloat (E, `803ec916`) and prompt
caching (G, `dc5645d5`). Every cell derives from the recipes above; re-derive any of them from the
cited run IDs.

Runs: baseline `cmque7ho8002qyxg425q8lmoh` (2026-07-07) · post-E `cmrbjgqqr0003yx7uix6z5jiu` ·
post-E+G `cmrbqo4310003yxn3i8xbwynu` (both 2026-07-08).

| Metric | Baseline | Post-E | Post-E+G | Verdict |
|---|---|---|---|---|
| Harvester truncations (§2 recipe) | 10/14 | 2/13 | 3/14 | §3 dissection: 2 of 3 cut only the retained handler `_meta` trailer (no data); 1 (a GROUP-wide config+facts read, 16K) genuinely cut ceos2's portion — recovered via narrower getter reads EXCEPT `spanning-tree mode mstp` (config-only line, no getter covers it; full data safe at Tier-2). Root cause: `filter_group` vs per-device `filter_name` — run-level nondeterminism in read scoping |
| Harvester real prompt volume | 363,448 | 268,988 (−26%) | 334,806 | grew post-G (more calls, fatter device) — **volume ≠ cost** once caching lands |
| Harvester effective billed (§6 cache recipe) | 363,448 | 268,988 | **84,188 (−77%)** | 37 uncached + 290,705@0.1× + 44,064@1.25× |
| Design/Author/Reviewer effective | 72K/49K/82K | 22K/24K/25K | 30K/32K/44K | E's cut holds; low-call executions pay a small write premium — caching wins concentrate in multi-turn execs |
| Roots effective (CREATE+SYNTH) | ~1.78M | 1.82M | **~340K (−81%)** | uncached input literally 24 + 22 tokens |
| Family input cost | ~$4.2 | $3.99 | **$0.87 (−78%)** | matches the G panel projection exactly |
| Wall-clock (§1 CLOCK recipe) | ~11 min | ~6 min | 5m 15s | |
| Descriptor scrape / list_devices resultChars | 16.5K / 7.6K | 7.7K / 3.1K | 7.7K / 3.1K | E's halving stable across runs |
| qualityGate stamp | escalated (42) | needs-revision (72) | approved (87) | run-content nondeterminism; all three stamp branches field-verified |

**Framing rules exercised (§5)**: rows separate *real volume* from *effective billed* (rule 7 —
the G meter change); the baseline's escalation branch is flagged where it distorted family totals
(rule 1); reviewer-score variance across runs is stated as nondeterminism, not attributed to the
platform changes (rule 3); every column carries its run ID (rule 4).


### §7b. Run 4 — the per-device fix verification (2026-07-08, `cmrbs63ha0003yx0ssttaabza`)

First run after the `infra_state_harvester` one-TARGET-per-read rule shipped (`3db6caf1`):

| Check | Result | Verdict |
|---|---|---|
| Read scoping | **14/14 device reads per-device (`filter_name`), single-getter each; 0 `filter_group`** | the role-guidance fix steered behavior on its first live run |
| Truncations | 2/16 — both per-device `config` reads (8,237 / 8,393 chars, just over the 8K cap on the accumulated demo config) | §3 dissection: **0 config-like lines past either cut** (tails = same-device duplicates/envelope) — **no material loss**; flags = facts, working as designed |
| Snapshot completeness | all device facts in the LLM's view; PTP/STP omitted from the summary | editorial scoping to the multicast objective, NOT truncation (the lines sat inside the first 8K this run) |
| Quality gate | `{escalated, reviewerScore: 45}` | stamp's ESCALATION branch verified (red shield); reviewer variance across runs (42→72→87→45) is package-content nondeterminism, not platform |
| Teardown on escalation (F) | registry orphan-check: **0** | F's exact incident scenario re-run — no dangling registration this time |
| Caching (G) | roots uncached input 24 / 18 tokens | holding |

**The arc in one line**: run 1 truncated 10/14 with silent envelope bloat → run 4 truncates 2/16 with
provably-zero material loss, per-device scoping, caching on, and clean escalation hygiene — every delta
traceable to a shipped, reviewed change.


### §7c. read_more pager verification — the Type-A page-through (2026-07-10, `cmrdz81ll0009yx9iqhnqf5br`)

First live run of the `read_more` truncation-recovery pager (commit `3264e28f`). Verifying a *pager* run asks a different question than §2's truncation dissection: not "did it truncate?" but **"did the agent recover the lost tail, and how?"** The same §2 idiom answers it — the pager is loop-served, so each page is a normal `ToolCallRecord` with `tc->>'tool'='read_more'` and `ref`/`offset` in `arguments`.

Objective: "assess open blockers and in-progress workload across the Meridian POV" (113 tasks). Single business_analyst (Haiku), held model.

| Turn | tool / action | trunc | chars | Read |
|---|---|---|---|---|
| 1 | project / pov.details | false | 4,539 | — |
| 1 | project / task.list (broad, no filter) | **true** | 43,797 | LLM saw first ~19/113 |
| 2–7 | **read_more** ref=1 | false | 7,219 → 860 | offsets 8000→15000→22000→29000→36000→43000, self-chained to `[end of result]` |
| 8 | perform / task.comment | false | 586 | assessment written |

Count the pages: `... AND tc->>'tool'='read_more'` (here: 6).

**How to read a pager run:**
- **The read_more ref and the `[truncated]` notice are NEVER persisted** (§2 — Tier-1 view only). You prove page-through from the **offset progression** in the read_more args (8000→43797 covers the full 43,797-char result) and from the **finalResponse** — the agent said it "handled the full 100-task dataset" and listed blockers from BOTH phases (Impl multicast + Validation PTP/latency/acceptance), i.e. tasks that sat past the 8K cut. Material recovery = "what the agent said," not a stored marker.
- **Behavioral PASS criteria**: zero blind-broad-repeat (the broad `task.list` appears exactly once), truncated tail reachable (offset progression reaches result length), caching undisturbed (`inputTokens`=46 uncached, §6 — injection is a stable append, cache-safe). Pages carry `resultTruncatedForLlm:false` (windows ≤7000, never self-truncate).
- **Caps visible in the trace**: 6 read_more on one ref = the per-origin cap (6). ~7000/window → ~42K of tail is pageable before the cap redirects to scope-or-flag. A >~42K-tail read (a POV well past ~110 tasks, or an external scrape) hits the cap mid-page **by design** — the "scope, don't page the ocean" backstop, not a bug.

**Scope-vs-page is objective-dependent (why the nudge is a FACT, not an imperative):** here the agent paged the whole bounded list rather than scoping by status — and that is *correct* for a holistic blocker+workload+completion read (single-status scoping is incomplete; you need OPEN + IN_PROGRESS + COMPLETED, and ~113 tasks page in 6 windows within cap). For network config reads (`infra_state_harvester`) a narrower per-device/getter form genuinely exists and IS cheaper, so the same conditional nudge steers scoping there (and run-3's no-getter `spanning-tree` line is where paging is the ONLY recovery). This is exactly why the nudge ships the cost fact ("cheaper *when* a narrower form exists") not a "PREFER scoping" verdict (Protocol 10) — the preference is right for config, wrong for holistic lists. Reviewed + left as-is 2026-07-10.