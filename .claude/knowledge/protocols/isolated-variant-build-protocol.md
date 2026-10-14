# Isolated Variant Build & Promotion Protocol (Protocol 15)

> **Purpose**: change a RELEASED protocol, program or leg shape whose live runs must not move, by building an
> opt-in VARIANT beside it — proving every existing run byte-unchanged, gating the variant before it goes live,
> measuring it in a frozen window, and only then promoting it into the original.
> **Owner**: pipeline-harness-specialist. **Created**: 2026-10-02, distilled from the value-chain build
> (`cline_docs/reviews/producer-leg-2026-10-02/`). **Status**: phases 0–9 PROVEN end to end on value-chain (go-live
> 2026-10-02, frozen window closed 2026-10-03, 5 of 5 runs); **phase 10 (promotion) PROVEN 2026-10-05** (value-chain folded
> into pov-program 2.0.0; four regression controls, 0 stop-line hits) — one positive case still owed: a value leg end to end
> under the promoted protocol, which needs a spec that actually asks for one (see Phase 10).
> **Companions**: Protocol 13 (the entry: its step-back review), Protocol 14 (every panel here), Protocol 11 (drift
> sweeps), Protocol 10 (every new fact), Protocol 12 (where the knowledge lands afterwards).

## When to use

All three must hold:
1. **The change is to the SHAPE, not a defect.** A Protocol 13 step-back concluded that runs keep failing because
   of how the system is built (value-chain: a value-only leg forced through a change-package pipeline — the value
   was right 8 of 8 times and the write-up failed), not because of one fixable bug.
2. **What exists works for someone.** The owner's constraint is that successful runs must not break ("what I don't
   want to do is break all the other successful runs").
3. **The change touches shared, live text or code** — a protocol, role guidance, a mechanical net — so editing it
   in place would move every run that reads it.

**Not for**: a single-finding fix (Protocol 13), a greenfield protocol with nothing live to protect
(`pipelines/ADD-A-PROGRAM-PROTOCOL.md`), or a pure doc change (Protocol 11).

## The decision that defines this protocol: isolate, then promote (D-8)

Build the change as an opt-in variant (a new protocol/role/template set selected by its own token), measure it,
and promote it into the original only after it is proven. The alternative — editing the original behind a flag or
a type switch — is cheaper to write and puts every live run inside the experiment. Record the choice explicitly;
in value-chain it was decision D-8, and every later batch was checked against it.

## The phases

Each phase has an EXIT. Do not start a phase until the previous exit holds. Commit per phase; push only at a
verified exit, and never while a run is in flight.

### Phase 0 — Diagnose (Protocol 13 step-back)
Evidence ledger, actor map, T0 measurements. EXIT: a written diagnosis naming the shape problem with counts, not
impressions (value-chain: 3 of 18 four-domain runs released; 8 of 8 derived values correct; every T1-zero fabric
failure a write-up failure).

### Phase 1 — Design gate (Protocol 14)
Brief → panel (owning specialists + one tangential, each running its discovery prompt first) → synthesis from the
FULL reports → **independent audit** (reads every review BEFORE the synthesis, builds its own item list, diffs) →
amendments win → owner decisions in groups. EXIT: decisions recorded, including the isolation decision (D-8).
*Measured: the design audit found 11 missing items in 78; one was a membership check nobody performed.*

### Phase 2 — Plan gate (Protocol 14 again)
A batch plan with an exit per batch, reviewed by a panel and audited the same way. Every batch must be ADDITIVE or
byte-preserving — ask the owner to confirm that explicitly before starting. EXIT: plan v2 with the audit folded.

### Phase 3 — Baselines (read-only)
Record the BASE commit (the replay baseline for Phase 6), answer the plan's open questions by reading code (not
recalling it), take freshness and size baselines from MEASURED production values. EXIT: a baseline file.

### Phase 4 — Isolation scaffolding (no behaviour change)
1. **Golden pin FIRST.** Before any refactor, pin the sha256 of every agent-facing text the change could reach
   (every rendered protocol, every role entry, the shared base texts) in a CI test: existing keys present-and-equal,
   new keys allowed. Prove the pin by mutation (a one-character edit must fail it, by name).
2. **Draft the new text, then cut the seams.** Write the variant's delta first; the points where it differs from
   the original ARE the seams. Implement them as parameterised builders (called with the original's values they
   must render byte-identically) and shared section constants — not copies. Fixes then reach both.
3. **Golden identical after EVERY step**, and **scanner output IDENTICAL, not just green.** Source-reading scanners
   pass vacuously when text moves out of the constant they slice: diff each scanner's output before/after, and make
   scanners follow `${CONST}` interpolation. Prove it by mutation (plant a defect only in moved text; the old
   scanner must miss it, the new one must catch it).
4. Record every deviation from the seam map, with its reason.
EXIT: golden 100% identical, scanner diffs empty, deviations recorded.

### Phase 5 — Additive text, seeded DRAFT
1. New protocols are seeded **DRAFT** (inert: injection filters ACTIVE; a DRAFT program stamp fails loudly). The
   ACTIVE flip is a seed-SOURCE commit — the deploy rewrites status every time.
2. **Layering rules, pinned** (memory `feedback_protocol_layer_independence.md`): domain protocols rig-independent;
   program protocols domain-independent. Domain vocabulary lives in the architect role and code sets. Pin it: no
   leg-protocol token may appear in the variant more often than in the original.
3. **Size budgets** in the golden test, set before writing; raise one only as a recorded owner decision after trimming.
4. **Roles**: each new role in the role library + any role SET it needs (reviewer set, injection exclusion) in the
   SAME commit; the coverage audit names what the original's architect must NOT offer (with reasons) and checks the
   variant's vocabulary against the sanctioned-token sentence only (a whole-text check passed with the token dropped).
5. **Seeds refuse a name collision** (a row matched by name but bound to another role/protocol): nothing written.
6. **Template bindings are part of the design**: a child reads its TEMPLATE's protocol, never its leg's. List every
   template the variant assigns by name and its binding; a reused row may carry the wrong tier's protocol (the
   value-chain Node C was bound to a domain protocol at program tier).
EXIT: golden still identical for every existing text; budgets and pins green; local reseed; freshness 0 STALE.

### Phase 6 — Isolated code, proven byte-identical on production
1. New behaviour in a NEW module; existing computations byte-unchanged; dispatch inside the existing entry, keyed on
   the variant's stamp, never on a pattern (an exact role match, never a regex — a regex would have reached 261
   existing architects).
2. Fixtures for every new arm; mutation-prove each pin; declare unexercised arms in the equivalence gate.
3. **Byte-identity replay** — **run `scripts/replay-nets-byte-identity.sh`** (usage in its header).
   - *What it is*: a DRY RUN of the real fact code — the same net registry the engine calls — over tasks that already
     exist in production, asking "if this code ran on that task now, what would it stamp and render?". It writes
     nothing.
   - *How*: the population is every PIPELINE leg since the window start AND every child in those legs' stages (nets run
     at leg SYNTHESIZE and at leaf persist; legs alone exercise one point) — value-chain: 2,196 tasks. It runs once at the
     BASE commit (a `git worktree` at the Phase 3 SHA) and once at the new commit, back to back, through an ssh tunnel on
     a session Postgres forces read-only (`default_transaction_read_only=on`; a write is attempted first and must be
     refused; no run may be in flight, so both passes read the same data). Then it diffs the two outputs line by line.
   - *EXIT*: **zero changed or removed lines** (no existing leg or child gets a different fact, card line or
     disposition) and **every added line accounted for exactly** (value-chain: 1,731 added = one informational "does not
     apply" line per leaf task, from the new net correctly declining to run).
   - *What it cannot prove*: behaviour on a shape production does not have yet (the new arm) — fixtures cover that, and
     the first live run is read against the predicted stamps.
   - ~45-50 min per pass for ~2,200 tasks (load ~0.1); a pass cut off by a time limit resumes with `--start-at`.
4. Push only after the replay; re-run it after any later change to the module.

### Phase 7 — Pre-ACTIVE gate (Protocol 14 on the agent-facing prose)
Render the exact bytes agents will receive; brief a prose panel (prompt construction, template system, architecture
for the layering rules, execution facts for every sentence naming a platform fact) + independent audit. Owed items
to name in the brief: the protocol-side directive read done BY HAND (tools that read ACTIVE rows cannot see DRAFT),
both layering rules, shared-text framing, card-fact names against what the code renders, and template bindings.
Fold, re-verify (golden, pins, budgets, freshness, grep audit, replay). EXIT: all reviewers' findings traced;
owner decisions recorded. *Measured: all four reviewers independently found the same blocker (a reused reviewer
would have refused every correct variant leg); the audit then found a clause that broke a shipped rule and an edit
that would have moved the original's live architect.*

### Phase 8 — Go-live (PROVEN 2026-10-02)
Seed templates BEFORE the flip (the reverse leaves a window where an ACTIVE protocol assigns a template that does
not exist); flip via the seed source; deploy; verify each row ACTIVE and hash-equal to the golden; template
rehearsal (existing rows unchanged, new rows CURRENT).
*Measured: seed-first then flip worked in one sitting — 40 pre-existing template rows unchanged (before/after diff),
4 new rows CURRENT, both protocol rows ACTIVE and hash-equal to the golden.*

### Phase 9 — Frozen window (PROVEN 2026-10-03)
≥ 5 runs with the shared text frozen, a pre-declared STOP LINE, first-run live-stamp reads against the predicted
table, and SERIES BREAKS on every metric the variant touches. One trigger per open design question, written before
run 1.
*Measured (value-chain, 5 runs):* the stop line passed (value leg 5/5, 0 write-up failures); the one design trigger
(build a program-tier reviewer if Node C blocks a value leg for a package-shaped reason) never fired. What the window
taught, each now a rule here:
- **Read the first run's live stamps against the prediction table before trusting anything** — it found PARSE-STEAL on
  run 1 (a pre-existing shared defect the variant merely exposed). Separate findings about the VARIANT from findings about
  SHARED code; only the first count against the stop line.
- **Model-performed orchestration steps vary run to run even with frozen text** (contract trimming, dependency shape, a
  skipped clearance carry — each in 1-2 of 5 runs). Check them in every run's hold window; treat each as a candidate to
  make mechanical at promotion.
- **Classify every refusal by what it protects** (config content vs verification vs paperwork) — the window's refusals
  never touched configuration, which turned "the release rate is low" into a policy question.
- **Keep the measurement criteria out of agent-visible text** (run 4's Architect quoted the stop line).
- **Record cost and stop-line state per run in the register**, so a mid-window pause can be decided on evidence (a pause
  before run 5 was considered and declined — the pre-declared count stands).

**Phase 9 amendment (2026-10-04, value-chain C2/C3):** a window finding that a model-performed step should become mechanical MAY ship BEFORE promotion as a SHARED batch when it is purely additive (the model's own step stays in place, nothing is refused that was not refused before, no agent-facing static text moves), is declared as shared code reaching the original, passes its replays as EXIT gates with every changed fact accounted for, and declares series breaks at its deploy. Removing the model's step, and any text change, still waits for promotion (Phase 10) with its own entry criterion recorded in the register.

### Phase 9b — Fix, then re-measure in a fresh container (proven 2026-10-03/04)
When the window's refusals point at fixes, ship them, then re-measure in a FRESH POV with a pre-registered early-stopping
rule (value-chain: 3 runs max, stop at 2 non-releasable-by-slip). Run titles and stage names carry no series position;
every root carries the prior runs' stage ids as its re-run clearance, checked on every leg in the hold window.
Value-chain outcome: 2 of 2 released (frozen window: 1 of 5), stopped early at 2 because run 3 could not change the answer.

### Phase 10 — Promotion (PROVEN 2026-10-05)
Fold the variant's parameters into the original as its own reviewed batch; swap the coverage allowlist for the
vocabulary (never both); the original's golden entries change only here, with a version bump. As run on value-chain
(`cline_docs/reviews/promotion-e-2026-10-05/`: inventory → plan → 7-specialist panel → synthesis → independent audit →
grouped owner decisions → PLAN-v2 → E0–E10, each step built by one specialist and reviewed by two or three):

1. **Inventory first, then a plan written by a FRESH agent** (Phase-0 rule): the planner corrected 12 inventory errors.
2. **Minimal batch.** The fold plus text that is false TODAY; every behaviour change (removing a model step, flipping
   fail-open) goes to its own later batch so a regression stays attributable. Declare the behaviour changes the batch
   does make — "changes no behaviour" was the wrong test (four items changed a PLAN-SPAWN step or a sanctioned exit).
3. **Retire, don't delete.** The variant's protocol row goes DEPRECATED with a tombstone body (golden-pinned by content);
   its name stays in the program-tier name list PERMANENTLY, because that membership is what makes a retired-token
   launch fail loudly instead of composing base-only — pinned by a test with the real name and fenced in the drift sweep.
   Fix the recovery message ("activate the protocol" would re-create the variant) to facts + a pointer; name the
   successor only after the controls pass.
4. **Any new template a protocol will name must exist BEFORE the protocol goes live** (two deploys): template assignment
   fuzzy-matches names, so a missing row silently binds a similarly named one. Gate the second push on an exact-name
   SQL check and key every later check on the recorded row id.
5. **Shadow-test the riskiest swap in isolation** before the second deploy (two arms: new vs old, same frozen inputs),
   read against the corpus, not one pair — one pair is anecdote in both directions.
6. **No-launch window from the PUSH** (the deploy reseeds protocols before the flip) until the template reseed reads 0
   STALE; the reseed rehearsal states the exact expected STALE set and every expected column delta.
7. **Regression controls as a frozen window in a fresh, neutrally named POV** (POV, phase and stage text reach the
   orchestrator): one control per released shape that the fold touches + one that stops at the plan gate for the shape a
   text rule targets; a coverage map from each change to the control that exercises it; a stop line made of named
   classes, never "released". Read a non-releasable control for what caused it before counting it.

Outcome (value-chain → pov-program 2.0.0): ND2 plan-gate PASS; control 1 releasable (88); control 2 fold checks PASS,
not releasable on a pre-existing kubernetes drift-paperwork gap; control 3 releasable (90). 0 stop-line hits; Node C on
its new unbound row gave the right verdict 4/4; the fact-producing code differed from the base only in comments. **Owed:**
the value-leg positive control — the spec used for it typed its derivation leg as a change leg (it also asks the leg to
advertise the range), correctly under the promoted rules; a corrected spec is needed.

## Working disciplines (each earned during the value-chain build)

- **File it or it didn't happen** — every finding outside the current batch goes to a follow-up doc + the register.
- **Every finding gets a disposition** — folded, deferred with reason, or rejected with reason; the audit checks it.
- **Mutation-prove every new pin** — two of this build's own checks were vacuous on first write.
- **A rule is a proxy for a property** — verify the property (what the agent receives; what the commit contains).
- **Retrospective pass** — every variant review also asks: which findings describe the ORIGINAL today? (value-chain
  produced ten for pov-program: `cline_docs/follow-ups/pov-program-retrospective-from-b6-review-2026-10-02.md`.)
- **Pause before production mutations** with the exact commands; read-only production work states its guard.

## Anti-patterns (observed)

- Editing the original "behind a type switch" to save a protocol — every live run becomes the experiment.
- Trusting "suites green" after moving text — scanners slicing source passed while reading nothing.
- Merging reviewers' replacement texts without re-checking each clause against shipped rules (the audit caught one
  that handed a reviewer a check the platform already performs).
- Editing a shared builder line for the variant's sake — it moves the original (caught by the audit before commit).
- Reusing a template by name without reading its protocol binding.

## Proven impact (value-chain, 2026-10-02/03, phases 0–9)

Five reviewed batches shipped with every existing agent-facing text byte-identical (41/41 after every step) and a
2,196-task production replay showing zero changed facts; three panels (design, plan, prose) each followed by an
independent audit; the pre-ACTIVE gate prevented a guaranteed false refusal on the first live run. Go-live moved no
existing row; the frozen window passed its stop line 5/5 at −5.8% program cost (value leg −28%), and surfaced two
shared fail-open defects (PARSE-STEAL, CONSUMER-FAIL-OPEN) as promotion prerequisites. Phase 10 (2026-10-05): see its
section — 9 commits (E1–E9a) each reviewed by 2–3 specialists, 2 deploys, 4 controls, 0 stop-line hits.
