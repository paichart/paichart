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
