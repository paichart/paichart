# Program-Run Forensics Guide

> **Purpose**: how to forensically assess a **program** run (a pipeline-of-pipelines). This covers only the
> **composition layer** — the release gate, coverage facts, inter-pipeline chaining, and the non-terminal
> classes. For everything INSIDE a leg (per-execution tokens, `toolCalls[]`, payload-vs-envelope, phrase
> hunting), a leg IS a pipeline → use [`PIPELINE-RUN-FORENSICS-GUIDE.md`](./PIPELINE-RUN-FORENSICS-GUIDE.md)
> unchanged. This guide assumes you've read its §0 (the four evidence layers) + §1 (run-family resolution).
>
> **Design/acceptance ledger** (the worked findings this generalizes): `cline_docs/reviews/program-architect-design-2026-07-15/PROGRAM-TEST-PLAN.md` (T2–T5, F16–F21, Exhibits 1–4).

## 0. The mental model — the composition layer sits ON TOP of the pipeline layers

A program leaves the same four persisted layers as a pipeline (execution facts / tool-call forensics / run
structure / deliverables — pipeline guide §0), plus **one composition layer** you assess separately:

| Composition question | Where it lives | Answers |
|---|---|---|
| **Did release compute true?** | program task `metadata.programReleasable` + `metadata.qualityGate` | the deterministic AND verdict + the MIN-confidence score |
| **Did every leg's deliverable reach the reviewer?** | the coverage facts (`chainCapablePredecessors` / `degradedPredecessors` / `notChained`) | chaining completeness — the CC2b BLOCKING consumer |
| **Did an upstream leg's design flow into a downstream leg?** (S2) | the downstream leg's chained §6 + chainer `source` | inter-pipeline chaining fired vs silently skipped |
| **Why didn't it hang / why did it escalate?** | the non-terminal-family record (F16/F17/F20/R4) | the settled-but-mute / can-never-run / escalated classes |

**Golden rule (D10)**: assess the program from **structured facts only** — `programReleasable`, `qualityGate`,
the coverage facts, Node C's structured verdict. A chained `report.md` may literally contain `## VERDICT:`
text; never let a prose read override a fact read (the 2026-07-14 incident class, one altitude up).


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

### 5. A dependency edge carries governance AND data — check the consumer can SEE its producer

**Verifying that a gate sits in the right PLACE is not the same as verifying the value can still
REACH the consumer**, and the first check passing is what makes the second one easy to skip.

`context-chainer.ts` walks DIRECT dependency edges. An APPROVAL gate is template-less — no
execution, no deliverable — so it carries **nothing**. A consumer wired `P1 → G2 → P2` therefore
receives an EMPTY chained context, even though the gate is exactly where governance wants it.

Live 2026-09-18 (phase-5 showcase, round 3): three consumer legs were wired through their gates
only. All three had `chainedFrom = 0`; none could see the derived range their own descriptions told
them to consume verbatim. The round BEFORE it had chained correctly **for the wrong reason** — its
gates hung off their legs as leaf dead-ends, so consumers happened to take direct edges from the
producer. Fixing the governance defect is what severed the data path.

**Checkable at the plan gate — but on the EDGES, not on `chainedFrom`.**

⚠️ `chainedFrom` is populated by `prepareTaskForExecution` at EXECUTION time, not at create
time. Before a leg runs it is `0` on every leg, correctly wired or not, so a pre-run read of it
manufactures a false finding about a healthy run. (Written into this guide as a pre-run check on
2026-09-19 and corrected the same day, when it returned 0 across a run whose edges were provably
right.) Use it as the POST-run confirmation; use the edges as the PRE-run check.

```sql
-- PRE-RUN (plan gate): does every consumer have a DIRECT edge to its producer,
-- as well as to its gate? A consumer whose only dependency is an APPROVAL is the finding.
SELECT left(t.title,30) AS consumer, left(d.title,34) AS depends_on, d.type
FROM task_dependencies td JOIN tasks t ON t.id=td."taskId" JOIN tasks d ON d.id=td."dependsOnId"
WHERE t.stage_id = '<program child stage>' AND t.type='PIPELINE' ORDER BY 1,2;
-- expect each consumer to appear TWICE: once with [APPROVAL], once with [PIPELINE]

-- POST-RUN (after the leg executes): did the value actually arrive?
SELECT t.id, left(t.title,44),
       jsonb_array_length(coalesce(t."inputContext"->'chainedFrom','[]'::jsonb)) AS chained
FROM tasks t WHERE t.stage_id = '<program child stage>' AND t.type = 'PIPELINE'
ORDER BY 3;   -- a 0 on a consumer leg that has RUN is the finding
```

⚠️ **Do not read a `0` as "the upstream had nothing to give".** Check the producer separately: in
the live case the producer was approved at 88 with a clean containment stamp. The value existed and
was correct; it had no path.

**And the failure is not uniform across legs, which is why one clean leg proves nothing.** Given the
same empty context, the three legs did three different things: one leg harness went and retrieved
the value itself via `agent.results` and wrote it into its child briefs (approved 92), one took a
branch that needed no value (approved 84), and only the third refused and escalated (20). **Two of
three masked it.** Never conclude delivery works because a leg succeeded — conclude it from
`chainedFrom`.

### 5b. Did a harness route around the chain? (the diversion)

A leg harness that cannot see a value may go and fetch it. The package it produces then carries a
provenance sentence indistinguishable from a properly-chained one — live example:
*"consumed verbatim from the fabric leg (task `cmu6lmwao…`) — not recomputed, not widened"*,
written by a leg whose `chainedFrom` was 0.

```sql
-- agent.results calls OUTSIDE the caller's own child stage and own direct dependencies.
WITH calls AS (
  SELECT DISTINCT e."taskId" AS caller, (tc->'arguments'->>'taskId') AS target
  FROM agent_artifacts a JOIN agent_executions e ON e.id=a."executionId"
  CROSS JOIN LATERAL jsonb_array_elements(a.content::jsonb->'toolCalls') tc
  WHERE a.name='pipeline-index.json' AND tc->'arguments'->>'action'='agent.results'
    AND tc->'arguments'->>'taskId' IS NOT NULL)
SELECT c.caller, left(ct.title,30), left(tt.title,34), left(ts.name,26) AS target_stage
FROM calls c JOIN tasks ct ON ct.id=c.caller JOIN tasks tt ON tt.id=c.target
JOIN stages ts ON ts.id=tt.stage_id
WHERE c.caller <> c.target
  AND tt.stage_id IS DISTINCT FROM (ct.metadata->>'pipelineStageId')
  AND NOT EXISTS (SELECT 1 FROM task_dependencies d
                  WHERE d."taskId"=c.caller AND d."dependsOnId"=c.target);
-- BASELINE 2026-09-19, whole corpus: 6 pairs / 2 callers, out of 681 calls / 236 callers.
-- Both callers are the SAME pattern (reaching into another pipeline's private child stage),
-- so any NEW caller is the finding — not a non-zero count by itself. This becomes
-- 'expect zero' only once the scoping predicate ships; it is not enforced today.
```

Reading its own children is the normal, load-bearing case (531 of 681 calls) — SYNTHESIZE and
PLAN-SPAWN both require it. The finding is a target in **someone else's** stage.

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


## 1. Resolve the PROGRAM family (a two-level stage structure)

A program is a root PIPELINE task whose children live in ONE "Program: X" stage; **each leg then has its OWN
child stage** (a disconnected subgraph — D3). So resolution is two levels deep:

```sql
-- the program root + its program stage
SELECT t.status, t.metadata->>'pipelineStageId' AS program_stage,
       t.metadata->>'programReleasable'         AS releasable,
       (t.metadata->'qualityGate')::text        AS gate
FROM tasks t WHERE t.id = '<program root id>';

-- the program roster: plan gate + per-team gates + leg pipelines + producer + Node C
SELECT id, LEFT(title,48) AS who, type, status,
       metadata->>'pipelineStageId' AS own_leg_stage   -- non-null ⇒ this row is itself a leg pipeline
FROM tasks WHERE stage_id = '<program_stage>' ORDER BY created_at;
```

Each leg's `own_leg_stage` is where that leg's Harvest→Design→Author→Review children live — resolve and
dissect it with the **pipeline** guide. Program-level totals = the program root's executions **plus every
roster row's executions plus every leg-stage's executions** (three levels; the pipeline §1 family query,
run once per leg stage).

## 2. The release layer — recompute `programReleasable` by hand

`programReleasable` is a **deterministic AND** (D5) — its whole value is that you can reproduce it. Never
trust the stamp without recomputing from the child facts:

```sql
-- every gate-bearing child's outcome + score
SELECT LEFT(t.title,40) AS who,
       t.metadata->'qualityGate'->>'outcome'        AS outcome,
       t.metadata->'qualityGate'->>'reviewerScore'  AS score,
       t.metadata->'qualityGate'->>'verdictMismatch' AS mismatch
FROM tasks t WHERE t.stage_id = '<program_stage>'
ORDER BY created_at;
```

Then check, by hand: **`programReleasable === true` ⟺** every leg `outcome === 'approved'` AND no
`verdictMismatch` AND every leg's **`derivationContainment.containmentDisposition.disposition === 'benign'`**
AND Node C's verdict is
APPROVED AND the coverage facts are clean (§3). *(Pre-1.0.10 runs additionally gated `reviewerScore ≥ 85`
— apply that conjunct only when forensicating runs seeded before 2026-07-18; confidence numbers are
recorded facts, not gate inputs, since the calibration study.)* **`programConfidence` / `qualityGate.reviewerScore` = MIN across legs** (the weakest link, not
the average). A stamp that disagrees with your hand-computed AND is a finding — that exactness is a T5
acceptance criterion. **Keyed on OUTCOME, not score**: a leg at 95 that returned `needs-revision` still
blocks release (F-class from the ledger — a high score can't rescue a needs-revision).

⚠️ **`verdictMismatch: true` is not always a defect signal** — it includes the direction where the
harness OVERTURNS an approving reviewer because a fact conjunct failed (anti-fabrication signal,
containment disposition). That is the system working: prose said yes, arithmetic said no, the flag
records the disagreement. Seen live 2026-08-17: a network leg's reviewer approved at 92 while the
mechanical containment stamped `blocking/3 violations` → leg `needs-revision`, `verdictMismatch:
true`, release refused. Read the mismatch flag as "the two tiers disagreed — find out which was
right", never as "the stamp is wrong".

### 2b. The containment conjunct — read the stamp, do not re-derive it (mechanised 2026-08-03)

Each leg's `pipeline-index.json` → `derivationContainment.containmentDisposition` is
`{ disposition, reason, inputs }`, computed by `computeContainmentDisposition`. **It is the answer.**
Hand-deriving a verdict from `checked` + the reason string is how this conjunct gets read wrong — a
retracted 2026-08-11 finding did exactly that. Absence fails closed (`ABSENT ⇒ treat as blocking`).

**Three states, not a boolean:**

| disposition | means | program-tier action |
|---|---|---|
| `benign` | allowlisted clean reason (e.g. `checked-clean`, `nothing-to-derive`) | conjunct satisfied |
| `blocking` | a violation, a refusal/silent drop, or an **unrecognised** reason falling through | release blocked |
| `needs-node-c` | a judgement a LEG cannot make was **delegated to the program tier** | Node C must resolve it — check it actually did, and on the *named subject* |

`needs-node-c` is the state unique to this tier: it is not a failure, it is a handoff, and a program
that released without Node C addressing it is a finding. It rides **nested inside**
`derivationContainment` (never a top-level sibling — the `pickResultJsonSummary` whitelist would strip
it), pinned by E3b in `test-execution-artifacts-parity.ts`.

**A consuming leg** (terraform-iac, kubernetes-gitops) derives nothing, so a clean one stamps
`checked:false` / `no-derived-values-block` / `nothing-to-derive` / **benign**, carrying `consumedValues`
+ `upstreamContainment{legs[],green}` instead. That is a *satisfied* state, not a miss — verified live
on the 2026-08-12 green run, where the upstream `10.99.0.4/31` appeared verbatim in the downstream leg's
`consumedValues` with `upstreamContainment.green: true`; and on 2026-08-17 the full configuration
**machine-released** (`programReleasable: true` with no human-judgement branch) — the consuming-leg
state the T6.2 requirements had carried as "shipped but never yet exercised" (VT-16).

## 3. Coverage facts — did every leg's deliverable actually reach the reviewer?

The CC2b consumer that blocks release on a *missing* deliverable (VT-05) — a count that looks complete can't
mask a gap. Read the three coverage facts (confirm the exact jsonb path against the current schema before
scripting — they ride the program metadata / Node C output):

- **`predecessors` vs `chainCapablePredecessors`** — equal = every expected leg deliverable was chainable.
- **`degradedPredecessors`** — must be `0`; `> 0` means a leg's content chained from the forensic
  `pipeline-index.json` **fallback** instead of its real `report.md` (a degraded, still-numeric signal —
  the v1.0.7 fix so "looks complete" can't hide a soft gap).
- **`notChained: []`** — non-empty names each leg whose deliverable never reached the reviewer, each with a
  reason (`no-report.md` / `no-pipeline-index.json` / source-not-SUCCESS). Any entry BLOCKS the gate.

Clean coverage = `predecessors === chainCapablePredecessors`, `degradedPredecessors 0`, `notChained []`.

⚠️ **`notChained` ABSENT is clean, not suspicious** — the key is written only when there is a skip to
record, so a clean run has no `notChained` at all rather than an empty array. Verified on the 2026-08-12
green run (`notChained` absent, `programReleasable: true`). Treat *absent* and `[]` identically here;
this is the one place in the containment/coverage surface where absence is NOT fail-closed, so don't
generalise it to `containmentDisposition` (§2b), where absence **is** blocking.

⚠️⚠️ **THESE ARE LEG-TIER FACTS. CLEAN COVERAGE HERE SAYS NOTHING ABOUT THE CHILD THAT CONSUMES
THE VALUE.** (Added 2026-09-16 after this section's own procedure certified a real defect as clean,
five times, over two months.)

A program has THREE tiers — program → leg → child — and **every count above is scoped to the tier
you are standing on**. A leg can show perfect coverage while the child that actually designs against
the crossing value received nothing.

Worked example, run 3 of the podrange program (`cmu3pyijl0005yx4hx82erdgt`). Applying §3 verbatim to
the cloud leg `cmu3q4oor002oyx4hd1vhtymc`:

```
predecessors 1 · chainCapablePredecessors 1   → EQUAL
degradedPredecessors 0
notChained []
chainedFrom[0].source  report.md
```

**Clean by every rule in this section.** And the consuming child
(`cmu3qlpbp0041yx4ilet83gyz`, the cloud Architect) *also* reads 1-of-1 clean — because its one
predecessor is its own sibling Harvester, not the upstream leg. Both tiers read clean; the crossing
value never crossed. That child escalated, correctly, saying the value was absent from its context —
and every coverage fact in this guide said otherwise.

**So always run the child-tier query too:**

```sql
-- the LEG has it; do its CHILDREN?
SELECT c."agentRole", c.id,
       jsonb_array_length(coalesce(c."inputContext"->'chainedFrom','[]'::jsonb)) AS n_chained,
       jsonb_path_query_array(c."inputContext"->'chainedFrom','$[*].taskTitle')  AS chained_from
FROM tasks c
WHERE c.stage_id = (SELECT metadata->>'pipelineStageId' FROM tasks WHERE id = '<LEG_ID>')
ORDER BY c.created_at;
```

A child whose `chained_from` names only its own siblings has **not** received the upstream
deliverable, whatever the leg's counts say. This is **Bug Class 84 — Container-Tier Terminus**
(`.claude/knowledge/domain/mcp/bug-class-registry.md`); measured 2026-09-16 at **51 of 51 upstream
edges reaching the leg and 3 reaching any child**. Full record:
`cline_docs/reviews/cross-pipeline-value-delivery-2026-09-16/`.

⚠️ **`allDependenciesMet` is a trap on this surface.** It is `true` in **729 of 729** rows — it has
never been false — because it measures SCHEDULING (are the predecessor *tasks* terminal) while every
field beside it measures DELIVERY. It reads `true` next to `completedDependencies: 0`. Do not use it
as a coverage fact. Filed: `cline_docs/follow-ups/all-dependencies-met-is-constant-2026-09-16.md`.

⚠️ **`reportMdSource` (on the artifact) separates two different absences** — see
PIPELINE-RUN-FORENSICS-GUIDE §"WHICH SURFACE HOLDS WHICH FACT". Absent ⇒ the engine decided not to
produce a deliverable; present with no `report.md` ⇒ it decided to and the artifact is missing. At
program tier the first is usually a timing-correct `produce:false`, the second is a real anomaly
(exactly 1 in the corpus).

## 4. Inter-pipeline chaining forensics (S2 sequenced programs only)

For a sequenced program, verify the upstream leg's *designed output* actually flowed downstream (the whole
point of S2). In the downstream leg's chained context, the chainer stamps a **`source`**:

- `source: 'report.md'` — the real deliverable chained (what you want).
- `source: 'pipeline-index.json'` — the fallback fired (upstream `report.md` absent) → shows as
  `degradedPredecessors` upstream; investigate why the deliverable didn't land.
- absent / `notChained` entry — the chain silently skipped; the downstream designed against nothing.

Timing: the **settledness predicate (F18)** holds the downstream leg until the upstream deliverable is fully
persisted — so a correctly-sequenced run shows the downstream leg's first execution starting *after* the
upstream leg's SUCCESS + deliverable write, never before. A downstream start that precedes the upstream
deliverable is an F18 regression.

## 4b. Protocol-composition facts (2026-08-17, composed injection)

Since `loadProtocols:'composed'`, every execution's `result.json` carries a `protocolInjection`
FACT (before `finalResponse`): `{mode, base{name,version}, delta{name,version}, stampSource,
preambleChars}` — also emitted as one structured `Protocol injection resolved` log line with
execution identity. Program forensics adds one composition check per family: **did each tier
compose the RIGHT protocol?** Program root → `mode:"composed"`, delta `pov-program-protocol`;
each leg harness → `mode:"composed"`, delta = ITS domain protocol only; leaf specialists →
`mode:"named"` with their template binding. `stampSource` should read `"stamp"` on every harness
execution (a `"title-fallback"` on a non-first execution is a stamp-write ordering finding); any
`degraded` value is a finding to chase before reading anything else in the family. PLAN and
PLAN-SPAWN should show byte-identical `preambleChars` (the stamp is frozen — a differing pair
means the composition changed between modes, which it never should).

## 5. The non-terminal-family classes — why it escalated instead of hanging

A well-behaved program **never hangs**; it terminalizes and escalates. Recognize each class in the record
(all four share one signature — *settled children, but the harness must be told, at an event anchor, not a
timer*):

| Class | Signature in the record | Correct outcome |
|---|---|---|
| **F16 — can-never-run** | a leg + its forward cone marked `executionStatus=FAILED` + `blockedByUpstreamFailure`; the leg never executed | program escalates naming the root leg; `programReleasable:false`; program stays IN_PROGRESS awaiting human |
| **F17 — duplicate-halt** | a redundant halt on an already-terminal leg; cone marked once (the R4 cone-gap fold) | no double-terminalization; cone attributed to the real cause |
| **F20 — escalated leg** | a leg `qualityGate.outcome='escalated'`, `reviewerScore 0`; **the escalated leg COMPLETED** (escalation is an outcome, not a hang) | program blocked (`programReleasable:false`), not hung — F20 wins over a truncation branch (the es/db F1 ordering) |
| **R4 — truncation-stall** | a SYNTHESIZE turn `stop_reason:max_tokens` + empty text; `truncationRetryUsed`/`Recovered` on the toolLoop; a residual terminalized in-tx (`metadata.truncationStall`) + cone | auto-recovered in-loop; any residual escalates, never a silent green |

If a program is genuinely stuck IN_PROGRESS with no escalation comment and no terminalized cone, THAT is the
bug — check the reactor retrigger path (CC1: a completing child must retrigger its program parent;
`pipelineRetriggerReactorService.ts` self-ID check) before blaming the leg.

## 6. Quick-reference one-liners

```sql
-- the one-glance program verdict
SELECT metadata->>'programReleasable' AS releasable,
       metadata->'qualityGate'->>'outcome' AS outcome,
       metadata->'qualityGate'->>'reviewerScore' AS min_score,
       status
FROM tasks WHERE id = '<program root id>';

-- gate states (template-less APPROVAL born IN_PROGRESS; a stuck cascade = an un-released gate)
SELECT LEFT(title,40), status FROM tasks
WHERE stage_id = '<program_stage>' AND type = 'APPROVAL' ORDER BY created_at;

-- escalation / terminalization comments (why it stopped)
-- (task_activities schema: comments ride the `details` JSONB under key `comment`; the time
--  column is `timestamp`. The previous form here used c.content/c.created_at — neither exists;
--  it had never been executed. Fixed 2026-08-17 by running it against a live program.)
SELECT LEFT(t.title,32), LEFT(c.details->>'comment',120)
FROM task_activities c JOIN tasks t ON t.id = c.task_id
WHERE t.stage_id = '<program_stage>' AND c.details::text ILIKE '%escalat%' ORDER BY c.timestamp;
```

Access + quoting gotchas (snake_case `tasks` vs camelCase-quoted `agent_executions`, the `$$`/PID trap,
capture-exit-before-pipe) are identical to the pipeline guide §0 — read them there.

## 7. Worked examples (from the demo/ledger — the shapes you're matching)

- **Exhibit 1 — the first-ever green program** (`programReleasable: true`): both legs `approved/92`, Node C
  `APPROVED/93`, coverage `2/2 chainCapable, degraded 0, notChained []`; program `report.md` extracted from
  the producer. This is the fully-clean baseline — every fact in §2/§3 lines up and the hand-computed AND is true.
- **Exhibit 2 — a leg can never run** (F16): the broken leg + its forward cone `FAILED`/`cannotRun`, healthy
  legs preserved, program `qualityGate {escalated, reviewerScore 0}`, `programReleasable:false`, left
  IN_PROGRESS awaiting the human. The escalation comment names the root leg — that attribution is the deliverable.
- **A needs-revision leg** (T4d): a leg `needs-revision/72` drove program `qualityGate: needs-revision/72`
  (MIN) + `programReleasable:false` with **no override** — the outcome-keyed block from §2, on real data.

## See also

- Leg-level forensics: [`PIPELINE-RUN-FORENSICS-GUIDE.md`](./PIPELINE-RUN-FORENSICS-GUIDE.md)
- What the facts mean by design: [`PROGRAM-HARNESS-USER-GUIDE.md`](./PROGRAM-HARNESS-USER-GUIDE.md) §6–§7
- Full findings ledger: `cline_docs/reviews/program-architect-design-2026-07-15/PROGRAM-TEST-PLAN.md`
- Rationale (D1–D12 / CC1–CC8): `.../program-architect-design-2026-07-15/design-proposal.md`

## Evidence-flow tier facts (added 2026-07-18, evidence-flow arc)

When assessing WHO should have caught a defect, pull per tier: the leg reviewers' and Node C's verdict
blocks (grade language VERIFIED-AGAINST-EVIDENCE vs ACCEPTED-FROM-CLAIMS — its absence in a post-1.2.0
run is itself a finding), the legs' `derivationContainment` facts (mechanical tier), and whether Node C
RETRIEVED the structured facts (its result should reference agent.results pulls — pov-program 1.0.9's
access route; "not present in my chained context" alone is a pre-1.0.9 shape). The runs 2-6 worked
example: `cline_docs/reviews/evidence-flow-arc-2026-07/ARC-RECORD.md`. Discipline reference:
`EVIDENCE-FLOW-DISCIPLINE.md` (same directory).
