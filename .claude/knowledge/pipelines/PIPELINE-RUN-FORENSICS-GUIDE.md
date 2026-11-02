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


> **Reliability bar (owner decision, 2026-10-19 — "the goal should be that a pipeline run works at least 9 out of 10 runs"):**
> (1) **Correct-outcome rate ≥ 90% per domain** over a rolling window of LIVE runs — a correct outcome is a correct package released OR a
> correct refusal/escalation (refusing a bad change is the pipeline working); (2) **false releases: 0** — each one is a stop line + a root
> cause; (3) **fix priority:** below 90% ⇒ fix; above it ⇒ fix only false-release risks or a cheap fix that GENERALISES — everything else
> is filed and waits (no perfection-chasing on 1-in-25 safe failures); (4) read at the health-run with COST-PER-RELEASED-LEG. Lab gates
> already follow this shape (G-APPLY ≥ 23/25 is the 9-in-10 side; the `0` gates are the false-release side).
> **Score every run assessment against it:** classify each run as correct-release / correct-refusal / false-refusal /
> **false-release**, and state the domain's rolling rate.

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

⚠️ **The third sanctioned exit — POST-COMPLETION (COMPLETE-THEN-FAIL, 2026-10-05).** A SYNTHESIZE that called
`task.complete` and then failed on a later call is rescued and records `protocolValidation.postCompletionExempt: true`.
**Reading rule:** a `PROTOCOL_STEP_SKIPPED` on a row with `postCompletionExempt: true` names ONLY a gap BEFORE
completion; the Step-5 items the run never reached are in `postCompletionSteps`, never in `missingSteps`. See the
program guide §5a for the rest of the rescued record (`postCompletionFailure`).

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


## ⚠️ 2026-09-16 · 2026-09-17 · 2026-09-19 · 2026-09-20 · 2026-10-07 — EIGHT RULES FOR MEASURING, earned by getting each one wrong on a live run

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

### 7. Know which code produced a number before you read it

A measurement belongs to the code that produced it, not to the code you are looking at now. When the code
under test changes during an investigation, check the run's timestamps against the code's commit or
modification time before using the result.

Live example (2026-10-07, the form-correction replay): the first paid replay reported **14 of 15
adopted**. It ran 20:28–20:35Z; the reviewed adoption guard and collateral metric were saved at
20:42–20:44Z. The number described a guard that no longer existed. It was discarded and the run repeated
on the committed code.

> **Run timestamp vs code commit time: check it before quoting any result from a script that changed today.**

### 8. Before believing a failure rate, diff ONE failing case

A low pass rate can be the instrument's fault, not the subject's. Before reasoning from the rate,
diff a single failing case against its input and look at what actually differs.

Live example (2026-10-07): the re-run on the committed code reported **2 of 15 adopted**, rejected
almost entirely as `prose-changed`. That read as "the model's corrections are bad". One diff showed
the correction itself was exact (a hunk header `+1,19` → `+1,20`, nothing else), and the only other
change was the confidence line: **our own correction prompt** had told the model to end with
`"Confidence: N/100"` while the package's line was `Confidence: 70 — <rationale>`. The guard rejected
the harmless reformat our prompt had asked for. The rate measured our prompt, not the model.

> **A uniform failure reason across nearly every case ("outside-named 2" fifteen times) is a sign the
> cause is shared — usually the harness, prompt or guard — not fifteen independent failures.**


## 0. The mental model — four layers of persisted evidence

Every pipeline run leaves a layered forensic record. Know which layer answers which question:

| Layer | Table / artifact | Answers |
|---|---|---|
| **Execution facts** | `agent_executions` row | status, model, `inputTokens`/`outputTokens`/`cacheReadTokens`/`cacheCreationTokens`, timestamps; the `logs` array carries per-run lines like `"Agentic loop: N turn(s), M tool call(s)"` |
| **Evidence-flow facts** (2026-07-18; disposition 2026-08-03) | `pipeline-index.json` → `derivationContainment` | **READ `containmentDisposition` FIRST — it is the answer.** `{ disposition: blocking \| benign \| needs-node-c, reason, inputs }`, computed by `computeContainmentDisposition`. Do **NOT** re-derive a verdict from `checked` + the reason string: `checked:false` is NOT "blocking", and `no-derived-values-block` is a benign *candidate* whose outcome turns on `harvestedCount`. That re-derivation produced a wrong, retracted finding on 2026-08-11. If a reading contradicts the stamp, that is a DEFECT to report, not a judgement to exercise. Supporting fields: `derivedValues` (the value that crossed the DAG edge), `violations[]` (do NOT enumerate the classes here — this list said "covered-not-member / member-not-covered" while FOUR then SIX existed; the authoritative set is the `reason` union in `lib/agents/harness/derivation-containment.ts`), `harvestedCount`, `harvestSource`/`derivedSource` artifact ids. **Consuming legs** (terraform-iac, kubernetes-gitops) carry `consumedValues` + `upstreamContainment{legs[],green}` instead of deriving — a clean one stamps `checked:false` / `nothing-to-derive` / **benign**, which is a *satisfied* state, not a miss. See EVIDENCE-FLOW-DISCIPLINE.md |
| **Rollback provenance fact** (2026-09-11) | the **AUTHOR child's** `result.json` → `rollbackContainment` (NOT pipeline-index.json — it is stamped at the Author leaf's persist so it reaches the Reviewer; SYNTHESIZE hoists it); the Reviewer's `task.inputContext.chainedFrom[].rollbackContainment` shows what the Reviewer actually SAW (null outside the observability-config lane — a withheld field, not a stamp; see the two-lane comment at `render-pipeline-context.ts`) | **READ `rollbackDisposition` FIRST** — nested `{disposition, reason, inputs}`. `restoreLinesFound/restoreLinesTotal` + `missing[{line, blockLine}]` are the fact; `excluded{class: n}` names what was NOT adjudicated (separator, inverse-line, expected-output, verification, comment-line, procedural-rollback-block). **Asymmetric with derivationContainment**: `needs-node-c` / `unmatched-restore-lines` means "lines the check could not adjudicate" — NOT evidence of fabrication, never blocking; the only blocking arm is could-not-check (`enrichment-error`). `checked:false` + `lane-not-supported` (HCL/desired-state legs) is a deliberate no-check, benign, "no opinion" — not a miss. `no-restore-blocks` approves NOTHING (package completeness stays the reviewer's). Before theorizing about a provenance-shaped refusal, run the string test (each disputed line ⊆ the leg's harvest artifact) — three refusals of correct packages preceded this fact (R19 P4, R3a-3, R3b-2); classify (a) evidence-absent vs (b) content-correct-but-unverifiable per EVIDENCE-FLOW-DISCIPLINE §2026-09-11 |
| **Validation tool-call fact** (2026-10-23, network legs only) | the **AUTHOR child's** `result.json` → `validationToolCalls`, in the OPERATOR TAIL after `toolCalls` (a head-only read misses it) | for each tool call written in a validation step: the arguments the tool accepts vs the call (`findings[].source` = `service-row` / `harvest-registration` = schema-backed, `harvest-observed` = observation only); read it first when a network Reviewer refused, or a device rejected, a validation `services` call. A WARNING fact — it gates nothing |
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

### 2a. Reading a PAGED read (`read_more`) — did the agent read the whole document? (2026-10-12, R2 + Phase 4 run 1)

An agent's own claim ("paged to its end", "fully parsed") is not evidence. Read the `read_more` calls in order:
- **Count pages correctly.** `read_more` calls are the pages; the first fetch is the 8,000-char first window, not a page. R2's
  Architect said "7 paged reads" — it made 6 (`read_more` ×6), which was within the OLD cap, so the run never exercised the
  new budget.
- **Check the offsets are contiguous.** Each call's `offset` should be the previous one plus its `limit`. A jump is a skipped
  span: R2 went 36,000 → 43,000 → **59,000**, leaving 16,000 chars unread (the writing-rules section, skipped by guidance).
- **The real size is the tool result's `originalSize`, not a script's estimate.** The requirements size estimate ran ≈ 4.6%
  high (68,445 estimated, 65,439 delivered).
- **The last trailer tells you what is left, and whose text it is.** Phase 4 run 1 ended "334 characters remain": that tail
  was the browser service's response wrapper (its "next steps" suggestions), not document content. Read what the final page
  contained before calling a read short.
- **Per-role caps:** a refusal "already paged … N times" is the role's budget (`lib/agents/role-read-budget.ts`; Program
  Architect 9 per document / 12 per run, every other role 6 / 8), not a defect.

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

### 6b. Live-window reads (held-network windows, 2026-10-24/25) — every one used repeatedly

```sql
-- a leg and its children (the leg's own row + every task in its child stage), with the leg outcome
SELECT t.id, t."agentRole", t.status, e.status es, to_char(e."endTime",'HH24:MI:SS') et
FROM tasks t LEFT JOIN agent_executions e ON e."taskId"=t.id
WHERE t.id='<leg>' OR t.stage_id=(SELECT metadata->>'pipelineStageId' FROM tasks WHERE id='<leg>')
ORDER BY e."startTime";
SELECT status, "executionStatus", metadata->'qualityGate', metadata->>'cannotRun' FROM tasks WHERE id='<leg>';

-- what the harness told the Harvester (the brief beats the protocol — read it first)
SELECT description FROM tasks WHERE id='<harvester task>';

-- what the Harvester actually called, in order (service + arguments)
SELECT tc->>'tool', left(tc->>'arguments',160) FROM agent_artifacts a
JOIN agent_executions e ON e.id=a."executionId", jsonb_array_elements((a.content::jsonb)->'toolCalls') tc
WHERE e."taskId"='<harvester task>' AND a.name='result.json' AND tc->>'tool' IN ('registry','services');

-- held capture: refs (kind, eligibility, path, revision) and refusals (named reason) for a leg's executions
SELECT r.kind, r."serviceId", r.eligibility, r.path, left(r."sourceRevision",10)
FROM held_file_refs r JOIN agent_executions e ON e.id=r."executionId" WHERE e."taskId"='<task>';
SELECT row_to_json(r)::text FROM held_capture_refusals r JOIN agent_executions e ON e.id=r."executionId" WHERE e."taskId"='<task>';

-- secrets: a real lab value in ANY persisted artifact of the window's POV (expect 0), and leftover self-provisioned rows (expect 0)
SELECT count(*) FILTER (WHERE a.content LIKE '%<lab secret prefix>%'), count(*) FROM agent_artifacts a
JOIN agent_executions e ON e.id=a."executionId" JOIN tasks t ON t.id=e."taskId" WHERE t.pov_id='<pov>';
SELECT name FROM mcp_tools WHERE name ILIKE '%<service>%';
```
- **A persisted `<<REDACTED-SECRET>>` inside an agent's fenced quote means the AGENT wrote the value in clear and R10 removed it
  at persist** — confirm on the persist log line (`grep "R10 backstop" /var/log/paichart/mcp-out-0.log` → `redactedCount`,
  `echoRedactedCount`, `echoOverflow` per execution). A 0-secret scan of persisted bytes does not prove the agent obeyed the rule.
- `agent_executions` has no cost column; read cost from the lab summary or the token columns × the pricing table.
- Read the stored record before explaining a miss (L-NB2: the first explanation of F-NB1 — "long copies" — was wrong; the quotes
  were short and the fixture had never served a clear secret).


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
- **Caps visible in the trace**: 6 read_more on one ref = the per-origin cap (6) for every role EXCEPT the Program Architect, whose budget since R1 (2026-10-12) is 9 per document and 12 per run (`lib/agents/role-read-budget.ts`; maxToolTurns 48). Read the cap off `agentRole`, never assume 6. ~7000/window → ~42K of tail is pageable before the cap redirects to scope-or-flag. A >~42K-tail read (a POV well past ~110 tasks, or an external scrape) hits the cap mid-page **by design** — the "scope, don't page the ocean" backstop, not a bug.

**Scope-vs-page is objective-dependent (why the nudge is a FACT, not an imperative):** here the agent paged the whole bounded list rather than scoping by status — and that is *correct* for a holistic blocker+workload+completion read (single-status scoping is incomplete; you need OPEN + IN_PROGRESS + COMPLETED, and ~113 tasks page in 6 windows within cap). For network config reads (`infra_state_harvester`) a narrower per-device/getter form genuinely exists and IS cheaper, so the same conditional nudge steers scoping there (and run-3's no-getter `spanning-tree` line is where paging is the ONLY recovery). This is exactly why the nudge ships the cost fact ("cheaper *when* a narrower form exists") not a "PREFER scoping" verdict (Protocol 10) — the preference is right for config, wrong for holistic lists. Reviewed + left as-is 2026-07-10.
---

### §7d. A deliverable that claims to be applicable: APPLY it, don't read it (2026-10-05, terraform source-read rehearsals)

Two runs with the same objective on terraform-iac 1.12.0, then 1.12.1: root `cmuuwhx6w0007yxh83txc7yq6`, then `cmuuyf7be0005yxi82euve9u9`. The objective was an in-place `team` tag edit, and the source `.tf` was read from a commit-pinned raw GitHub URL.

**The first run's diff read correctly, and the Reviewer did not object to it, yet `git apply` rejected it.** The quoted lines were exact. The hunk header was `@@ resource "aws_s3_bucket" "app_logs" (tags map) @@`, which has no line numbers, and the Author claimed that "CI recomputes exact hunk offsets", which no tool does. No reading of the package catches this, because the content is right and only the machine form is wrong. So whenever a package states the form of an artifact a person will run (a patch, a config file, a command), test that form with the tool that consumes it.

```bash
# 1. Pull the Author's finalResponse (newest execution per child) → extract the ```diff fence.
# 2. Apply AS WRITTEN on the commit the package names, in a throwaway worktree:
git -C ~/paichart worktree add -q --detach /tmp/wt <commit-sha>
(cd /tmp/wt && git apply --check -v /path/as_written.patch; echo "exit=$?")   # non-zero IS the finding
git -C ~/paichart worktree remove --force /tmp/wt
# 3. If it fails, repair ONLY the header and re-check. That separates "content wrong" from "form wrong",
#    which are different defects with different fixes.
```

**Fidelity check for a quoted source.** Diff the Harvester's verbatim block against the raw file at that commit, using `diff <raw> <quoted>`. The only differences allowed are the lines the protocol excludes. Measured results:
- Run 1: exactly two lines differed. The R9-rewritten injection line was listed as a placeholder, and the AKIA-shaped value was replaced with `<REDACTED-SECRET>`.
- Run 2: the same two lines differed, but the rewritten line stayed INSIDE the quote with its `[NEUTRALIZED-INJECTION:…]` marker visible. That is a compliance variance, filed.

Any other differing line means the quote is not verbatim. ⚠️ Our own MCP client sees fewer escaping layers than the agent, so a fetch made from your seat that comes back "byte-intact" does not prove the agent's quote is.

**A Reviewer block that names something the Author was never told to carry is a wiring finding, not a quality finding.** Run 1's Reviewer blocked because the package had no drift statement. The Architect had made one, but the Author's item list did not carry it, and the Reviewer reads only the Author. Before grading a refusal, check two things: did the protocol's clause for the producing role ask for that property, and does the consuming role have an edge to whoever did produce it? (Same class as Rule 5.)

**Exit 0 is not proof either (2026-10-07).** A hunk header that counts FEWER lines than the body holds is
applied without error **when it is the last hunk in its file**: `git apply --check`, `git apply` and GNU
`patch` all exit 0, write the declared lines, and silently drop the rest — including intended trailing `-`
deletions. (Followed by another hunk, the same undercount fails loudly: exit 128, "patch fragment without header".) Reviewers approved 7 of the
9 terraform packages that had this defect (one replayed: 33 of 36 lines written, an unclosed HCL block).
So after a successful apply, **compare the applied result with the package's body** (or recount each hunk
header against its body) — a clean exit only proves the declared lines fitted. This class is now recorded
mechanically as `toolLoop.formCheck` on `config_change_author` executions (from 2026-10-07; see
`cline_docs/follow-ups/mechanical-reflection-trigger-2026-10-07.md`). A body SHORTER than its header fails
loudly (exit 128) and is not silent.

**psql trap:** `\pset format unaligned` prints `Output format is unaligned.` as the first line of output, which breaks a `json.load`. Use `psql -q`, or filter for lines that begin with `{`.

### §7e. Root-causing a POPULATION of refusals (2026-10-07, network + observability since 09-28)

A refusal RATE says how often; it never says why. To find text fixes, read every refusal in the window
the same way, then count causes — not refusals. Worked example: `cline_docs/reviews/refusal-root-cause-2026-10-07/READ.md`
(13 refusals; 6 already fixed at source and not recurred; the open 7 all one family).

**Per refusal, six answers** (quote, don't paraphrase):
1. **The block** — the reviewer's exact blocking item.
2. **Instruction** — did the protocol or role guidance live AT THAT TIME ask the Author for that property?
   Quote the clause and its version (the clause may have been added since — read the version the leg ran).
3. **Inputs** — did the Author HOLD what it needed (harvest, §6 chain, contract)? Check its `inputContext`.
4. **Correct?** — was the block right? Run the string test before accepting any provenance/fabrication-
   shaped claim (`EVIDENCE-FLOW-DISCIPLINE.md`; ARCHITECTURE Invariant 6).
5. **One cause class** — (a) never asked · (b) ambiguous/contradictory text · (c) clear text, Author ignored
   it · (d) Author lacked the input · (e) reviewer wrong · (f) genuine content defect · (g) other, named.
6. **Layer** — route it with `domain/harness/defect-layer-routing.md` (Step 0 first: does a control ship?).

**Then measure fixes by NON-RECURRENCE, not by the overall rate.** A class fixed at version N is closed if
it has not recurred on legs that ran ≥ N (here: network 3/3 approved since 1.18.1, obs 7/8 since 1.6.0). The
overall rate mixes pre-fix and post-fix legs and will keep reporting the fixed causes.

**Two signatures this read surfaced:**
- **Opposite outcomes on the same step ⇒ contradictory TEXT (class b), not model variance.** Two approved obs
  packages quoted an authored file; a refused one described it instead — because the shared Author guidance
  forbade the quote while the domain protocol called the file the witnessed artifact. When the same move is
  approved in one leg and blocked in another, look for two texts that disagree before blaming either agent.
- **A correct finding can carry a wrong remedy.** A reviewer rightly found a missing check, then prescribed
  `nc -z`, which cannot test an ACL evaluated after the TCP accept. Grade the finding and the remedy
  separately; a text fix that encodes a reviewer's remedy inherits its error.

**What a text fix cannot reach:** class (c) needs detection, not more prose; class (f) is the system working.
Report them separately so the upper bound of a text batch is honest (here 4 of 13, all observability).


### §7f. Test a text fix OFFLINE before shipping it — the leg replay lab (2026-10-07)

§7e names a candidate text fix; this is how to measure it without a live program run. `npm run lab:leg-replay`
(`scripts/leg-replay-lab/`) takes a persisted `config_change_author` execution (a NODE), rebuilds its exact prompt
with the platform's own builders, substitutes the candidate protocol text, calls the real model, runs the shipping
nets, chains the package into the rebuilt Reviewer prompt and parses the verdict with the shipping parser. Old and
new texts run on the SAME nodes, so refusal counts are comparable. Production is read-only throughout.

1. **Dry run first** (`run --experiment <dir>`, no `--spend`): $0. It prints the per-node CONTROLS and the cost
   estimate. Proceed only if every control passes: leaf nets reproduce the persisted facts, chain patch identity,
   shipping parser = persisted verdict. A failed control means the rebuild does not describe what ran.
2. **Smoke on one APPROVED control** (`--only <control> --variants baseline --n 1 --spend --max-usd 1`). It must come
   back approved, and `sample.json` `tokenFidelity` (replay first-call input vs persisted) should agree within ~1%.
   First smoke: TF control APPROVED, 58,728 vs 58,873 tokens (0.25%), $0.51.
3. **Every experiment carries approved controls beside the refused nodes.** A text that "fixes" a refusal by
   making the reviewer refuse less in general shows up as a control flipping. Without controls the lab cannot see it.
4. **Read one sample per cell before believing a count** (rule 8). Every prompt and output is saved under
   `runs/<stamp>/<node>/<variant>/sample-NN/`. The manifest pins the commit, dirty files under lib/scripts/prisma and
   each input text's sha256, and re-checks them at the end (rule 7).

**Limits:** tool calls are stubbed; tool schemas, hub and template constraints are TODAY's, not the run's. The
post-loop order is a ~40-line copy of `execution-core.ts` (unpinned, the one drift point). n=5 per cell detects only
large effects. A lab result is evidence for a text change, not a substitute for the live watch after it ships.
`runs/` and `cache/` hold production data and are gitignored. Never commit them.

**Model and effort (since 2026-10-07):** a variant may set `authorModel` / `reviewerModel` and `authorEffort` /
`reviewerEffort` (unset effort = `high`, which production sends). Change ONE side at a time — keep the Reviewer fixed when
testing an Author model, or the instrument moves with the thing measured. The estimate does not model effort or a longer
model's output (Opus ran ~60% over it); size `--max-usd` from a previous run's real cost per sample.
For the WHOLE model-onboarding procedure around this (wire/capability audit before any paid run, node choice, the
switch path and the post-switch watch), see `MODEL-ONBOARDING-PLAYBOOK.md`.

**Write the decision rule down BEFORE the run** (refused-case target, control tolerance, what each outcome triggers), then
apply it as written. Three of the 2026-10-07 runs reversed or stopped work on that basis: gap 3 (a control flipped 0→3/5 —
reverted before deploy), Opus-medium (stopped at 4 samples), the template Directive (0/5 vs 0/5 → ship). Reuse a prior
run's arm only when its prompts are byte-identical (`cmp` the saved `*.system.md` / `*.user.md`).

**Side use, prompt forensics:** the saved `author.system.md` / `author.user.md` are the exact prompt, so prompt-shape
questions are answered by reading them. The first smoke confirmed TEMPLATE-SENT-TWICE this way: the raw role template
(~18 KB, `${agentRole}` unresolved) sits in the user message's `## Directive` while the resolved copy is in the
system prompt (49 of 51 long lines duplicated), and the token match shows production sends the same.

**When the REVIEWER is what changes** (its text or its model), refusal counts have no fixed instrument. Use the
ground-truth bench instead: a persisted Author plus planted edits, with the right verdict known for each node, scored
in both directions. Procedure and lessons: `MODEL-ONBOARDING-PLAYBOOK.md` Phase 2b.

**Cost mechanics (2026-10-19, LAB-COST-REDUCTION).** All three are in `scripts/leg-replay-lab/`:
- The dry run refuses a planted arm whose Reviewer prompt does not differ from its unplanted twin by the plant
  (`plantPresence`, LK12).
- Each cell's sample 1 writes the cache before its siblings start (warm-first; `--no-warm-first`).
- `--batch` (paid only) sends Author/Reviewer/Architect calls through the Message Batches API at 50%:
  - the body is production's except `betas`/`fallbacks` (Opus) and a 1h cache TTL;
  - the proof is `--fake-llm transport` ($0, `batch-transport.ts`, LK13);
  - requirements_author nodes are refused;
  - it is not for a real lab until the owner's ≈ $1 crib and tier ruling.

When to spend at all: Protocol 16 "Spend only where a sample can change the verdict". How to build a lab: `LAB-ANATOMY.md`.

### §7f2. The golden set — a frozen regression check inside every lab (2026-10-31)

**What it is.** Fifteen real legs whose outcomes were judged correct by hand (four domains, both directions — releases and
correct refusals — the platform-forced class, and since v2 one network value leg), frozen as lab cases:
`scripts/leg-replay-lab/golden/golden-set.json` (v2, 2026-10-31 (owner re-freeze: + CANARY 1's value, terraform and observability legs)). The rule is Protocol 16 § "The standing no-regression rule": every agent-text or model lab replays it, and one
flipped case is a do-not-ship miss unless that lab's pre-registration names it as the intended target. How to run, read
and cost it: `LAB-USER-GUIDE.md` (owner: model-evaluation).

**Where forensics comes in — both ends:**
- **A run becomes a golden case by being READ.** A case enters the set only with a hand-read verdict from its stored
  records — the leg outcome, the agent's verdict, and the platform reason when one forced it — plus provenance (task id,
  run sheet, why the outcome is correct). Use this guide's method for that read; a case whose correctness rests on
  memory or a summary does not go in (the 2026-10-28 observability refusal entered only after the owner's recorded read).
- **A flip is a forensic question.** When a lab flips a case, read the flipped case's STORED run against the lab output
  the same way you would a live refusal: which input moved (protocol text, role guidance, model), which line of the
  verdict changed, and whether the stored outcome is still correct under today's text. A flip that turns out to be the
  stored outcome going stale is retired by recorded owner decision — never by editing the expectation to make it pass.

**What it cannot catch — say this out loud.** It replays LEGS on their own frozen inputs. It does not see:
- how a harness reads its children (`agent.results`, keep-best, the X2 class);
- the program root's SYNTHESIZE, Node C (filed GOLDEN-NODE-C-CELL) or cross-leg effects;
- fact computation (that is the byte-identity replay, §7g);
- requirements-authoring text (no requirements cases yet — register gap entry).
Those go to the nets replay, the canary re-run after every agent-text deploy (LIVE-WINDOW-CHECKLIST), and the
program forensics guide. "Golden set passed" means "these fifteen legs still decide as they did", not "nothing regressed". A value leg is scored on
its persisted derivation only (the scorer does not model the containment net for a live derivation — register GOLDEN-VALUE-LIVE).

**The $0 self-test is not a lab run.** `npm run test:golden-set` (in the gates) proves every stored case still SCORES as recorded;
it re-runs no agent on new text. Only a paid lab with `goldenSet` declared tests a text change against the cases. A gate list that
shows "golden-set 24/24" after a text change has proved the instrument, not the change (Wave 3, 2026-10-31: none of D2 / D3 /
HS-FU5 had a lab — D2's reader is the program root, so its gate was the canary; D3 is a fact, so its gate was the nets replay;
HS-FU5 reached requirements roles, which have no golden cases — byte-identity + a hand read stood in, register REQ-GOLDEN-CASES).

### §7g. Which replay? Two questions, three tools (2026-10-08)

Every replay here runs over **persisted production records** instead of waiting for new runs. Pick by the question.

| | **Byte-identity replay** — "did I break anything?" | **Leg replay lab** — "is this better?" |
|---|---|---|
| Use for | a CODE change to how facts or artifacts are produced | a MODEL, effort or agent-TEXT change |
| Re-runs | the shipping code over stored inputs — **no model call** | rebuilt prompts against **the real model** |
| Nature | deterministic, one pass | stochastic: n samples per cell, decision rule written first |
| Cost | free (a read-only dump + local CPU) | paid (2026-10-07 comparisons: ~$17–32) |
| Pass | **0 changed**, byte for byte | refused-case target met, approved controls not worse |
| Proof it can fail | a **mutation** control must flip a known case; an **injection** control must show exactly the expected change | approved **controls** run beside the refused nodes |
| Tools | `scripts/replay-nets-byte-identity.sh` (stamped net facts; Protocol 15 "existing runs unchanged") · `scripts/replay-reviewer-warnings.ts` (rendered `report.md`) | `npm run lab:leg-replay` (§7f) |

**One change can need both.** WARNINGS-INVISIBLE batch 1 (code: a new net + a report.md section) was proven by the
byte-identity replay — 461/461 `report.md` unchanged, the loose-grammar mutation flipped `cmuw8e6c90010yx9erg4d21t1`,
the injection control added exactly one section in 3 domains. Its batch 2 (reviewer TEXT: clause-f demotion) goes
through the lab. A byte-identity replay covers only the code it runs: text shipped in the same batch still changes
every NEW run, so the batch keeps its version bumps and series cuts — never read the replay as covering them.

**Shape of a byte-identity replay** (copy it for the next one): a read-only SQL dump of the inputs *as they stood when
the artifact was written* (select upstream executions with `startTime <=` the artifact's execution — later re-runs must
not leak in), the SHIPPING pure functions imported (never re-implemented), buckets that sum to the population, and
both controls. The dump holds production data: keep it in the scratchpad, never in the repo.

### §7h. Reading a nets byte-identity replay result (2026-10-26, worked example: held-network step 3 batch 1, P6)

`scripts/replay-nets-byte-identity.sh` ends with one summary line and a `replay.diff`. How to run it is in the script header;
this section is how to READ it.

**How it runs since 2026-10-26 (NETS-REPLAY-FAST-OFFLINE).** Both passes read an OFFLINE SNAPSHOT, never live production:
`--snapshot <scratchpad dir>` (required) is dumped once, read-only, into the scratchpad and restored into a local scratch
database; it is reused while you pass the same dir. So **no pipeline freeze** is needed during a replay, a pass takes about a
minute for 254 tasks (was ~7; 3,087 tasks: see the build record), and a base pass is CACHED per base commit + population +
snapshot. A pass whose database sessions hit ANY error (a table or column the snapshot does not hold) FAILS LOUD and compares
nothing. `--ids <file>` replays a stored run's population; `--scope protocol=<p>` / `role=<r>` narrows a routine check (keep
the full window for releases and health-runs). Take a FRESH snapshot for a release: the summary prints the snapshot's age.
**Retention: 24 h** — every run first calls `scripts/replay-snapshot-gc.sh`, which (also hourly from a systemd user timer) deletes registered snapshot dirs, `--out` dirs and `nets_replay_*` databases whose snapshot is older than 24 h, so a snapshot older than that is re-dumped, never reused.
Record: `cline_docs/reviews/nets-replay-fast-offline-2026-10-26/BUILD.md`. Worked example: `quoteFidelity` v3, base `97351b574`, `--since 2026-07-18`, 3,087 tasks
(record `cline_docs/reviews/held-network-2026-10-22/STEP3-BATCH1-BUILD.md` §8).

**1. Check the run is comparable before reading anything.** `tasks: base N · new N` must match, and both passes must name
the same `snapshot <id>` (they do by construction since 2026-10-26; a REUSED base pass is keyed on the snapshot id). Before
2026-10-26 both passes read live production and the header had to read `in-flight executions: 0` — a pipeline that ran
between the passes made the two read different data, and every difference it caused looked like a code change. If you are
reading such an older run, that rule still applies: re-run; never explain such a diff away. A STALE snapshot is a different
question (it misses tasks newer than its `taken` time) — it never makes the two passes disagree.

**2. The summary's buckets are not verdicts.** `removed/changed` counts every `<` line, `unexplained added` every `>` line
your `--allow-added` regex did not match. A field whose VALUE moves (`"version": 2` → `3`) is a CHANGED line, never an
added one — so a version bump reads `❌ DIFFERS` with an allow-list that never fires. Here: `776 removed/changed · 1120
unexplained added · allowed 0`, and every one of them was expected.

**3. Bucket the diff by content, not by position.** Count `<` lines and `>` lines by their text:
```bash
grep '^< ' replay.diff | sed 's/^< *//' | sort | uniq -c | sort -rn | head
grep '^> ' replay.diff | sed 's/^> *//' | sort | uniq -c | sort -rn | head -40
```
Then account for every bucket against what the change was MEANT to move (the draft series-cut text is the list):
- **by construction** — a stamped version, a field every stamp gains (here 740 × `version` 2→3);
- **the change's own subject** — here 9 stamps gaining `deviceReads` with findings (11 tasks, 13 findings) and the
  disposition moves they cause (`benign` → `needs-node-c` ×7, `no-pairable-quotes` / `all-quotes-complete` →
  `quote-omits-or-changes-lines` ×21);
- **anything else** — a field of ANOTHER net, a card line, a different disposition. That is the finding, even if small.
A bucket you cannot name is the finding. Name the fact each moved field belongs to — map diff lines back to tasks through
`new.out` (each task opens with a `cm…  [TYPE] title` header and `role=… point=…`, then one `▶ <fact>` block per net).

**4. A moved verdict is read by hand, every one.** The replay proves WHAT moved; it cannot say whether the new value is
RIGHT. For each task whose disposition moved, fetch the stored deliverable (`perform agent.results … verbose:true` — the
envelope lands in a tool-results file; slice the `finalResponse` out of it, it is JSON inside JSON) and read the flagged
block with its surrounding prose. Classify each: **true positive** · **false positive (detector defect — name the
shape)** · **true by the rule but low value**. The example's 13: 0 fabricated blocks; 5 false positives in two shapes
(a `! <device>` label comment the agent prepends to a real excerpt; a rollback/command block taken as a device-read
claim from nearby prose); 8 true by the rule (a rendering of a structured result, a reformatted Prometheus API config, or
a stitched excerpt, each SAID to be exact/verbatim) — values faithful, label overclaimed. The lab corpus could not show
any of these: every one is a production shape (LL-N-17 again — a fixture only tests what it serves).

**5. Write the allow-list narrow, or not at all.** `--allow-added` matches whole added lines; a broad regex (`quoteFidelity`)
silently passes a moved field that merely shares a word. Prefer reading the content buckets (step 3) over widening it.
An allow-list never covers a changed line.

**6. Record it.** In the build record: base commit, window, task count, the summary line, each bucket with its count, the
hand-read classification, and what follows (a fix, a filing, or "expected"). In the CLAUDE.md series cut: the base, window
and count, and what moved. A replay result recorded as "byte-identical" must have been — say "N changed lines, all X" when
it was not.

**What it cannot show:** capture- and apply-time behaviour (a new held refusal fires at capture, not on recompute) — that is
the capture replay's and the battery's job, and the first live instance's.
