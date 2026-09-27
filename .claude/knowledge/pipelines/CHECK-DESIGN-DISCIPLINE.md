# Check-Design Discipline — how our own checks fail, and what shape a good one has

> **Created**: 2026-09-12, distilled from one long session (the mechanical-net registry arc, two
> protocol bumps, a program run, and ten wrong checks).
> **Sibling to**: `EVIDENCE-FLOW-DISCIPLINE.md`. That document is about **LLM tiers judging each
> other**. This one is about **the checks WE write** — CI gates, protocol clauses, mechanical facts,
> equivalence gates, audit scripts, git habits. Different subject, same epistemics.
> **Owner**: pipeline-harness-specialist, with `execution-facts-specialist` for the fact-production half.
> **Register**: INTERNAL. Customer-facing counterpart: `~/paichart/verification/OVERVIEW.md`.

## Why this exists

On 2026-09-12 the checking tools were wrong **ten times**. The things they were checking were wrong
about four. Every single one of the ten was caught by RUNNING something — never by reading it.

A wrong check is worse than a missing one, because it answers confidently. That is the whole subject.

## 1. A rule is usually a PROXY for a property. Verify the property.

Four instances in one day, two of them mine:

| The rule | The property it stood for | How the gap showed |
|---|---|---|
| "every stage-children `findMany` carries `take: 50`" | bound a read you SEARCH; never cap one you AGGREGATE | a cap on an aggregate returns a *different answer*, not a truncated one |
| "lib pino adoption ≥ 40%" | of the files that LOG, how many use pino | 229 non-logging files sat in the denominator; three correct pure modules failed the build |
| "wait until the program run is terminal" | do not change protocol text a PENDING execution will read | the gate was deliberately BLOCKED — never terminal — so the rule was **unsatisfiable** |
| "stage by explicit path, never `git add -A`" | commit only what you intend | `git commit` commits the INDEX; a teammate's prior `add -A` rides along regardless |

**Test**: state the rule, then ask *what would have to be true for this rule to be satisfied and the
thing still be wrong?* If you can answer, you are holding a proxy. Verify the property instead —
usually it is directly checkable and the proxy was never necessary.

### 1a. The sharpest form: a SYMPTOM shared by the right answer and the wrong one cannot be the test

Earned 2026-09-12, and the author of the defect diagnosed it better than the reviewer did. A clause was
drafted to gate *"a stated blast radius NARROWER than the selector allows"* — the observable that the
defective package exhibited. But the CORRECT package exhibits it too: a selector reaching every pod in
a namespace, with a harvested census showing the namespace holds two, legitimately states a reach of
two. Testing on the symptom gates both.

> *"I had written the symptom as the test. The symptom is shared by the correct answer and the
> fabricated one, so testing on it gates both. The discriminator was never the narrowing — it is
> whether the evidence accounting for it is present. I reached for the observable rather than the
> property."*

**The discriminator test**: before writing a check, describe the CORRECT artifact that would trip it.
If you can describe one, you are testing a symptom. Ask what distinguishes the two cases — that is the
property, and it is usually shorter than the rule you were about to write. Here both failure directions
(silence, and a confident unevidenced number) collapse into ONE requirement: *the harvested extension
must be present.* A single property also cannot be discharged by pattern-matching one of two listed
cases.

This is the same failure as a mechanical net with no notion of leg intent confidently blocking a clean
removal package — one layer up, in prose.

### 1b. A check must match the ARTIFACT, never the PROSE ABOUT IT — and knowing 1a does not prevent this

Earned 2026-09-13, three times in one day, by someone who had cited 1a earlier the same hour to reject
somebody else's check for exactly this reason. **That is the finding.** 1a is stated as a thinking
discipline, and a thinking discipline you can quote while violating is not doing the work. 1b is its
mechanical half.

The three instances, all caught only by RUNNING the check:

| check | matched | should have matched |
|---|---|---|
| `grep -c 'EnvironmentFile' *.service # expect 0` | 2 — the comments explaining why `EnvironmentFile` is REFUSED | `^EnvironmentFile` — the active directive |
| `grep -c 'BindsTo\|Requires=' *.service # expect 0` | 2 — the comments naming them as REJECTED alternatives | `^BindsTo\|^Requires=` |
| skip-path guard (`assertTrue(true,'…SKIP…')`) | 18 — its own docblock quoting the bad output, plus the explanatory comment each FIXED file now carries | the same patterns with comments stripped first |

Every one produced the worst possible orientation: **clean on a broken tree and broken on a clean one.**
A file that documents why it refuses a thing looks, to a word-count, exactly like a file that does the
thing. And the better the documentation, the louder the false positive — so a check written this way
punishes precisely the codebase that explains itself.

**The mechanical rules, which need no judgement:**

1. **Strip or exclude non-code before matching.** Blank comments (preserving line numbers), or anchor to
   line start so a directive is distinguishable from a mention of it.
2. **A guard cannot scan itself.** Its patterns and its error messages necessarily contain what it
   hunts. Exclude it by name — this is correct, not a loophole. (Prior instance: a sweep for `AppError`
   subclasses matching the base class it mandated.)
3. **Never count a word that appears in prose about the defect.** If the word is the whole predicate,
   the predicate is wrong. `nohup` fails this; `nohup npm run start` — the unsupervised production
   start — passes it.
4. **Run it against the CURRENT tree before committing the expectation.** Protocol 11 Part C. All three
   above were caught this way and none by reading.

**The generalisation worth keeping**: 1a says do not test a symptom the correct artifact also exhibits.
1b is the same error in a different medium — *documentation of a defect is a symptom of the defect*, and
a check that cannot tell an explanation from an instance is testing the wrong text entirely.

## 2. Convert an ABSENCE into a DECLARED, NAMED state

An absence and an oversight are indistinguishable. A declared not-applicable can be judged.

| Before | After | Why it matters |
|---|---|---|
| a net silently produced no stamp on an out-of-scope lane | `lane-not-supported` + the lane | "adding a restore block would get this adjudicated" was a FALSE implication of the old reason |
| a specimen set silently covered no arm | `ARM NOT EXERCISED`, printed and counted | a net can be fully in-window with an arm no specimen has taken |
| a topology with no `links` failed a mandatory check | `linksNotApplicable` + a stated reason the reader must EVALUATE | the only alternative was fabricating network structure |
| non-logging files counted as non-adopters | `excluded (log nothing — nothing to adopt)` | the number finally measured what its name claimed |

The form that cannot be gamed: a declared reason is a **visible lie** if false, whereas invented data
is invisible. Prefer "declare and justify" over both "require always" and "make optional".

### 2a. The shipped vocabulary — four states, and "inapplicable" is not "unchecked" (2026-09-20)

A single standalone pipeline leg stamped all four registers in one run, and they are **not
interchangeable**:

| stamp | register | what a consumer may conclude |
|---|---|---|
| `derivationContainment: checked, 0 violations` | RAN, clean | the check answered its question |
| `dialectLint: NOT checked (no-contract)` | did not run, reason given | unmeasured — **not** clean |
| `contractApplicability(dialectLint): none expected (no-program-parent)` | structurally INAPPLICABLE | its absence is not even a gap |
| `containmentDisposition: benign (harvested-pool-empty)` vs `benign (checked-clean)` | same disposition, **different reason** | one means "nothing to derive from", the other "derived and clean" |

The third row is the one §2's table does not yet cover. `lane-not-supported` says *the check does not
apply here*; `none expected (no-program-parent)` says *the world this check needs does not exist in
this shape of run*, so a reader chasing the absence is chasing nothing. That is a statement about the
WORLD, not about the check, and collapsing it into "not checked" sends someone looking for a missing
contract that was never owed.

The fourth row matters because both are `benign`. A consumer reading only the disposition sees two
identical passes; the reason distinguishes "the harvest was empty" from "the derivation was verified".
On 2026-09-20 the FIRST of those was `checked-clean` **over a value imported from another pipeline** —
technically true, substantively meaningless — and became `harvested-pool-empty` once the leg was
re-authored honestly. **A disposition without its reason is not a fact.**

⚠️ **Independently arrived at twice.** `report:template-freshness` reports NOT COMPARABLE separately
and states why: *"Not clean — unmeasured. Reported separately on purpose: folding these into 'clean'
is Register Pattern 1."* Two subsystems, no shared code, same conclusion. That is evidence the rule is
correct rather than a house preference.

### 2b. The same discipline for WRITES — a partial write must name what it could NOT write

§2 is about checks that do not run. The harder case is a **write that half-succeeds**, because a
stale value reads as current, where a missing one reads as missing.

Live, 2026-09-20: `task.complete` rejects COMPLETED→COMPLETED, so a re-synthesized leg **cannot
re-stamp its own completion record**. The harness discovered this mid-run and did three things instead
of one: wrote `metadata.qualityGate` directly (the gate input, now correct), posted an addendum naming
**exactly which fields stayed stale and why**, and later stamped `supersedesStaleGate` carrying the
`priorOutcome` and `priorReviewerScore` rather than silently overwriting them. A reader can now see
that the record is partial, which field is authoritative, and what the superseded value was.

The failure it avoided is worse than an absent check: the leg's stored `confidenceScore` still read
65 while its gate read approved/90, and that stale 65 **propagated into the program's headline
confidence** via MIN-across-children. Without the addendum, a releasable program reporting 65 is
simply an unexplained number.

**Rule: when a write cannot complete, record (a) what was written, (b) what was NOT and why, and (c)
which surface is authoritative.** An unannotated partial write is the write-side of §5d — silence a
consumer cannot audit.

⚠️ **This was BEHAVIOUR, not a mechanism.** The harness noticed the rejection and compensated because
an LLM chose to. Nothing enforces it, and the next one may not. Cite this as the shape a good partial
write has — never as a property the platform guarantees.

## 3. ENUMERATION vs PROPERTY — and let the corpus decide which

A list cannot anticipate its next member. A property survives novel members but is vaguer and easier
to satisfy hollowly. **Both failure modes are real, so measure before choosing.**

On one day, the same corpus went both ways:
- **Refused** a broad property rewrite of the constraint-evidence clause: 1 FAIL in 45 packages, and
  the failing package had satisfied the enumeration *completely* — restating four listed kinds plus a
  fifth the clause never lists. The enumeration was not the defect.
- **Earned** a narrow property (for any object whose selector matches a SET rather than a named object,
  quote the harvested extension of that set), because the marginal case was an **evidence REGRESSION**:
  a revision silently dropped a census its predecessor had volunteered, and was approved at 90.

**The rule that falls out**: a regression is invisible to any check that compares an artifact against a
list it still satisfies. If the failure you are fixing is *something that used to be there and stopped
being there*, only a property-shaped obligation catches it.

## 4. Coincidental agreement is NOT coverage

An equivalence gate reported 3 uncovered pairs. Applying *"its answer happens to agree" is not "it was
produced by this code"* took that to **12** — and the increase was the correct number. Two things had
been counted as coverage that were not: a comparison with a field subtracted (still measured against a
baseline from different code), and a match produced by a no-op path.

Corollary: **a gate that has been taught which differences are acceptable has stopped being a gate.**
No expected-diff list. Every mismatch triaged.

## 5. Mutation-verify the checker, not just the code

A window mechanism that suppresses phantoms is indistinguishable from one that suppresses findings
until you try it. The minimum pair: falsely declare a withheld case covered (must FAIL), and delete a
declaration (must THROW). Two assertions written the same day *passed under the exact mutations they
existed to catch* — a bare `/rollback/i` match that unrelated prose satisfied, and a substring check
that survived a subset-pick.

## 5b. A guard can be STRUCTURALLY BLIND to the thing it guards — and it stays green

§5 mutation-verifies that a checker FIRES. This is the failure one level up: the checker is fine,
and **cannot see the input it exists to judge**. It passes, forever, asserting nothing. Four
instances on 2026-09-15, in one day, on one subsystem:

| the guard | why it could never see the defect |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | `tsconfig.json` **excludes `scripts/**/*.ts`**. A required field added to a shared input type breaks every fixture and typechecks clean. CI found it and blocked the deploy. |
| pre-commit `pipeline-protocol validator unit tests` | green on the very commit *documenting* the validator's defect — it pins behaviour without pinning that `protocolValidation.mode === resolvedMode` |
| `BREADCRUMB_RE` | asserted **formatting** (bold + backticks) while appearing to assert **semantics** (did the harness name its child stage). Rejected a comment literally beginning `Child stage: cmty0x9jo…` |
| the halt-exemption tests (mine) | passed `metadata: { duplicateHalt }` **directly into the validator** — a state the call site cannot produce, because that metadata is the PRE-EXECUTION snapshot and the agent stamps the halt mid-run |

The fourth is the instructive one: **I built a blind guard while fixing a blind guard**, nine tests
green, shipped to production, completely inert. The module's own header said the rule I broke —
*"tool calls are the authoritative record of what the agent actually did"* — and I read past it while
editing that module.

**The test, for any fixture you construct by hand:**

> *Where does this value come from at the real call site, and could it be there at that moment?*

A fixture is a claim about reachable state. If you cannot name the code path that puts the value
there by that point, the test asserts a fiction and will pass forever.

**The discriminator, for the snapshot case specifically** (worked out 2026-09-16, and it is NOT
"distrust the snapshot"): `taskContext.metadata` is a **photograph taken before the run starts**.

> A field written by a **PRIOR** execution is in it. A field written by **THIS** execution is not.

That is why the other readers are safe and mine was not: `net-context`, `mechanical-nets` and
`derivation-containment-enrichment` all read `pipelineStageId`, stamped by an earlier CREATE, so it
is genuinely there by the time they run. `duplicateHalt` is stamped by the run being judged, so it
never is. One instance, not a class — checked before proposing a sweep, because manufacturing a
bug-class hunt out of a single instance wastes the sweep and devalues the next one.

⚠️ **This is `boundary-contract-specialist`'s lens, and not consulting them cost the day's most
expensive defect.** "A field that disappears during transformation between layers" is their exact
subject; from inside the harness domain it presented as a validator bug. Related hazard already
noted locally in `context-chainer.ts:361` — *never* `task.metadata.confidenceScore`, which is
last-writer-wins — i.e. someone met a neighbouring form of this and wrote it down in one file
instead of as a rule.

**Corollary — the only reliable cure is running the real path.** A CONTROL RUN against a KNOWN-GOOD
case after any execution-path change is not ceremony. On 2026-09-15 the first control execution cost
**41 seconds** and found that a deployed fix had never worked in production. Unit tests, CI, the
typecheck and a full Protocol 11 drift sweep had all passed over it. Two of four changes shipped that
day were wrong in production despite green local evidence.

## 5c. A correct MEASUREMENT does not confer a correct MECHANISM

Distinct from §1 (rule-vs-property). Here the number is *right* and the causal story drawn from it is
wrong — which feels like evidence-led work and is not.

Measured: **12 of 68** executions were graded against a mode they never resolved to, and the graded
mode was ORCHESTRATE in **12 of 12**. Correct, reproducible, and one-directional. From it I inferred
"the validator falls back to ORCHESTRATE" and proposed making it read `resolvedMode` — which would
have false-flagged `pov-program` PLAN-SPAWN on **every run**, the exact regression a 2026-07-17 panel
ruling exists to prevent. Reading the code showed the precedence is the REVERSE: inference is primary
by design, `resolvedMode` is an UNKNOWN-only rescue.

Second attempt, better measured (11 of 12 reached ORCHESTRATE on `task.update` alone): "require
`agent.assign`". Also wrong — PLAN-SPAWN uses `task.create` and no `agent.assign`, so it would have
gone UNKNOWN and been rescued as SYNTHESIZE. Same regression, different route. Caught by an existing
test that encodes the ruling.

**The measurement told me what the symptom CORRELATED with, never what the code DID.** Between a
measurement and a fix there is always a mechanism, and the mechanism has to be read, not inferred —
especially when the data is clean enough to feel conclusive.

**Two guards saved it**: reading the source, and a test written by someone who had already been
burned. Note which one is cheaper to create.

## 5d. Silence is a verdict nobody can audit (an instance of §2)

⚠️ **CORRECTED TWICE — read the whole note (2026-09-16).** I first called `executionDegradation` a gate input, then "corrected" that to NOT a gate input. **The correction over-shot and the original instinct was closer to right.** Verified by `boundary-contract-specialist`: it is NOT a direct `programReleasable` conjunct — that AND is over leg approval, derivation containment and the integration review (`seed-protocol-prompts.ts:1754`) — **but leg approval IS a conjunct**, and the pipeline-tier reviewer-less rule (`seed-protocol-prompts.ts:362`) says of `PROTOCOL_STEP_SKIPPED` and four siblings, verbatim: *"these mechanical trust FACTS are the fabrication catch — gate inputs here, not advisory."* So on a reviewer-less leg it is **transitively a program-gate input**, and `PROTOCOL_STEP_SKIPPED` is the one category still firing (38 in 30 days). **The lesson is sharper than the fact**: I verified the MECHANISM correctly (not a direct conjunct) and drew the WRONG CONCLUSION from it (therefore not a gate input). §5c says a correct measurement does not confer a correct mechanism; this adds that a correct mechanism does not confer a correct conclusion. Three states on one claim in two days, and only an outside lens settled it.



§2 says convert an ABSENCE into a DECLARED, NAMED state. A live instance worth keeping, because the
wrong version shipped first.

`protocolValidation` is conditionally emitted (`...(protocolValidation ? {protocolValidation} : {})`),
and every consumer is instructed that **absence means "no issues detected"**. So when a sanctioned
halt was exempted by returning `null`, a harness that correctly REFUSED to spawn a duplicate program
became **indistinguishable in the artifact from a flawless run**. The first fix traded a false
accusation for a false all-clear — the worse of the two, because nothing downstream can question it.

Now: `haltExempt: true` + `haltReason` + empty `missingSteps`, and consumers gate on
`missingSteps.length`, never on presence. A test pins that a clean run still emits nothing, so the
two cannot collapse into each other.

**Rule**: when you exempt something from a check, emit the exemption. An un-emitted exemption is
indistinguishable from a pass, and it is the *interesting* cases that get exempted.

## 5e. A TRIGGER written for the wrong failure mode reads "not yet" forever

Filing-with-triggers is the practice that stops a premature build. It has a failure of its own: the
trigger encodes **the failure you imagined**, and if the defect recurs in a different shape the
trigger stays unmet while the cost accrues.

*Earned 2026-09-19.* A follow-up recorded that three domain protocols never state whether they
license a non-literal validation shape, and filed it with triggers — the load-bearing one being
*"a leg uses the shape on a pre-apply command and is **APPROVED**"*, i.e. a reviewer misses it. One
instance would have been enough.

Meanwhile the defect recurred **three times in three rounds**, each time a different invented form,
**and every one was caught by its reviewer**. So the trigger was never met, correctly, while the
thing it was filed about cost three rounds. The real failure was not *a reviewer missing it* but
*an author burning a round re-inventing a category because its domain declares no position*.

**The check on your own trigger:** write down what the defect COSTS when it happens as designed, not
only what it looks like when it escapes. If the answer is "a round", the trigger must fire on
recurrence, not on escape. And when a filed item's instance count rises while its trigger stays
unmet, **that mismatch is itself the signal** — re-read the trigger before re-reading the evidence.

## 5f. A check must be scoped to the UNIT it is counting — five instances in one day

§1 says a rule is a proxy for a property. The commonest way that goes wrong in practice is not a
wrong property but a **wrong unit**, and it is invisible because the output is a plausible number.
All five of these were mine, 2026-09-19:

| what I ran | what it counted | what I wanted |
|---|---|---|
| `grep -c "pattern" file` | matching **lines** (34) | occurrences (88) |
| `grep "expected output"` on a package | a **phrasing** | whether a sanctioned shape was used |
| regex over `promptText` per protocol | the **shared clause** prepended to all four | each domain's own body |
| single-line grep for `writing rule` | a line-bounded string | a citation that **wraps** across a line break |
| `chainedFrom` before a run | a field written at **execution** time | whether the wiring is right |
| `agent_executions.status` on a halted leg | whether the **execution** succeeded (it did) | whether the **task** was terminalized (`task.executionStatus`) |

Five of the six would have produced a confident false finding; two of them **shipped**. `chainedFrom`
reached two forensics guides; the last row is worse — it produced a false *"the platform did not
terminalize this leg"*, which was told to the user twice, written into a specialist config, a run
sheet and an operator playbook, and survived several hours until someone read the code. F17 had
fired perfectly: it writes `task.executionStatus` and walks the forward cone, and both were correct
the whole time. **A neighbouring field with a plausible value is the most expensive unit error**,
because nothing about the answer looks wrong. **Two habits catch all of them**: run a control whose
answer you already know, and say out loud what one unit of the thing you are counting IS before you
count it. A checking tool that is wrong produces *confident* false findings.

## 6. What actually moves the pass rate — and why two of the three levers cannot be pushed

Measured 2026-09-12 on gated PIPELINE roots: **60% approved all-time** (109/181), **64% in the last 30
days** (51/80); escalations 11% → 7.5%.

| Lever | Constraint | Pushable? |
|---|---|---|
| **Mechanical facts that stop WRONG refusals** — the strongest (`rollbackContainment` killed a three-instance class) | Path-3 earn-it: ≥2 live occurrences of a judgement made by a party structurally blind to the evidence, PLUS a corpus bounding false positives | **No — reactive by design.** You cannot pre-build one |
| **Protocol clauses that state an obligation before a reviewer discovers it** | the corpus decides the scope, and it is consistently narrower than intuition wants | Partly — but each clause buys a narrow band, and the tail of novel object classes is unbounded |
| **Input quality** (a defective `topology.json` blocked a program run; FW-A3.1's phantom zone parked a whole round) | **currently unmeasured — there is no metric for "runs blocked by a defective input artifact"** | **Yes — and it is the only one** |

⚠️ **Do not target a high approval rate directly.** The likeliest cause of a jump to 90% is not better
authors but softer reviewers, and that failure is documented: byte-identical inputs scored 45 and 92;
across three verdict mismatches the reviewer was right in **one**. Some refusals are the product working.

**Track refusal CORRECTNESS instead**: of the packages we refused, how many were later shown correct?
That number was three this quarter (the provenance family, all now fixed mechanically). Driving it to
zero is worth more than driving approvals to 90%.

## Noted, not built — nothing lints seeded protocol markdown

A collapsed clause briefly left a stray bolded semicolon (`**;**`) in a protocol body. **No suite would
have caught it** — the pinned suites check versions, markers, clause counts and public parity, none of
them markdown well-formedness — and seeded bodies render verbatim into the public mirror, so the defect
would have shipped to customers looking like a typo in a contract. Caught by reading.

One instance, so: recorded, not built. A balance check on emphasis markers per seeded body is trivial
if a second instance appears. **Trigger**: the next malformed-markdown escape into `~/paichart/protocols/`.

## Named candidate, NOT built — artifact pre-flight lint

Two instances of one class: an input artifact claims something the world does not contain, and it is
discovered only after an Architect execution plus an operator ruling.
- 2026-09-12: `topology.json` with no `links` — blocked at confidence 25, cost one execution and a ruling.
- FW-A3.1: an untrust zone mapped to a nonexistent port — parked an entire round (VT-18).

A pre-launch lint over `topology.json` + `requirements.md` would catch the schema half in seconds. The
bindable-targets half needs live state and is harder. **Trigger**: a third instance, or the first
session where a program launch is blocked by an artifact defect that a schema check would have caught.
Corpus-measure first, per the standing rule — count how many archived program launches were blocked by
artifact defects before building anything.

---

## 2026-09-16/17 — THREE inert guards in two days, and the one habit that caught all three

A guard that cannot fail is worse than no guard: it reads as coverage in every review. Three shipped
or nearly shipped in 48 hours, each by a different route.

| guard | why it could not fail | caught by |
|---|---|---|
| the halt exemption (2026-09-15) | read a pre-execution snapshot for a mid-run stamp — **nine green tests asserted an impossible state** | a control run, 41 seconds |
| regex "variant B" (2026-09-16) | passed a 9-case bench 9/9 and **regressed 3 production legs while fixing 3** | the corpus, not the bench |
| the injection role exclusion (2026-09-16) | `agentRole` was selected **nowhere** in `prepare-task-for-execution`, so the predicate read `undefined` for every child and excluded nobody | a reviewer reading the SELECT, not the predicate |

**The habit: mutation-prove the guard.** Remove the thing it guards; the test must go red; restore;
green. Every fix in this arc that claimed a guard now carries that proof, and two were re-shaped
because the first version passed both ways.

### Four shapes this arc adds

**A single-case fixture cannot express a multi-case interaction.** Variant B's failure lived in
`lastIndex`, fence parity and an inversion arm — state *across* matches. A single-heading fixture has
no second match to interact with. **Corpus over bench whenever the function carries state between
iterations.**

**A test keyed on a value the code never reads passes for the wrong reason.** No role-name test could
have caught the missing `agentRole` SELECT, because every role was `undefined` — so the
"not excluded" cases passed. Fix: assert the POSITIVE (a named harvester IS excluded) and pair it
with a null-role case. Neither alone distinguishes a working predicate from a blind one.

**A shape-matching tripwire must be proven non-vacuous in both directions.** The
`/review|harvest|acquir/i` reconciliation check asserts it matches the shapes it guards AND does not
match the consuming roles. A regex that matched everything, or nothing, would pass a one-directional
test.

**Exclusion lists fail toward delivery; inclusion lists fail closed.** Choose by which direction is
harmful. For the cross-pipeline injection, delivery is normally safe (a new consuming role gets the
value) — **except** for harvest- and review-shaped roles, where delivery is the harm. Hence an
exclusion list plus a shape tripwire for the two dangerous shapes, rather than an inclusion list that
would silently stop delivering to a new domain.

**And: `tsc --noEmit` is FALSE-CLEAN for `scripts/**`** (excluded by tsconfig). It returned exit 0
while a suite did not compile against new required fields. **ts-node is the only compiler that ever
sees the suites.**
