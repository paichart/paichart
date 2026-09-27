# Program Workflow Evolution Protocol (Protocol 13)

> **Purpose**: the repeatable finding→fix loop for evolving the autonomous-delivery stack (pipeline
> harness, pov-program, their protocols/templates/role guidance, and the platform machinery under
> them) from LIVE-RUN findings — the procedure the evidence-flow arc ran ~10 times across runs 2-7
> (2026-07-17/18) and the born-ready / confidence-demotion batch ran again the next day.
> **Owner**: pipeline-harness-specialist (domain owner). **Created**: 2026-07-18 (KC-2).
> **Companions**: Protocol 10 (fact-vs-verdict gate on any signal the fix ships), Protocol 11
> (the closing drift sweep), EVIDENCE-FLOW-DISCIPLINE.md (the invariant set this loop produced),
> the two RUN-FORENSICS guides (how findings are extracted from persisted records).

## When to use

A LIVE program/pipeline run produced a defect, a near-miss, or a suspicious pass — and you intend to
change the system in response. This protocol is the path from "the run did X" to "the fix is shipped
at the right layer, validated on a real run, and can't silently regress." It is NOT for greenfield
feature work (use discovery-first + specialist review) and NOT for pure doc updates (Protocol 11).
If the finding is a bug CLASS (the same root cause can manifest at multiple sites, not just this
run), escalate to Protocol 6 (bug-class eradication) rather than treating it as a single-run fix.

## The loop (each step earned by a live failure — skip one and you repeat its incident)

### 1. Preserve the specimen, extract the finding forensically
Work from persisted records (RUN-FORENSICS guides): the artifact ids, toolCalls, frozen configs,
chained inputContext, quality/degradation facts. Never delete the failing run's rows until the fix is
verified against them (the HARNESS_NO_OUTPUT specimen was the only reproduction in existence).
Archive any evidence a later study needs BEFORE cleanup (the 45-vs-92 calibration pair survived
deletion only because it was pulled to the repo first).

### 2. Measure before building
Base rates decide whether a detector/behavior change is EARNED: query the full run population for
how often the shape occurs and what it correlates with (the empty-output rarity earned
HARNESS_NO_OUTPUT; 60-firings/0-true-positives retired P9 per its retirement record;
every-p99-under-4s declined the M2 ceiling — each figure from that fix's own session record). A fix justified
only by the single specimen needs the cheapest additive form (a fact, a banner) — not enforcement.

⚠️ **MEASURE THE PREDICATE, NOT ONLY THE PROBLEM — and CLASSIFY every match, never just count
them.** The rule above asks how common the PROBLEM is. The inverse question is the one that fails
silently: *run the predicate I am about to ship against the whole archive — what does it match, and
is any single match a genuine instance of the thing I claim to catch?* Measured 2026-09-16 on a
terminalization net: **33 matches, ZERO genuine instances.** Every one was a PROTOCOL-SANCTIONED
EXIT (the base protocol instructs an escalating harness to *"Leave your status IN_PROGRESS. Exit."*,
and the 50-69 band to re-execute a child and exit awaiting retrigger). Six matches would have FAILED
legs that went on to complete healthily. A count alone would not have saved it — 33 looks like
plenty of evidence. Only classifying each match revealed that none was the target.

**This applies with MOST force to a predicate that ENFORCES** (terminalizes, fails, blocks). The
corpus-measure practice is usually invoked for a proposed FACT; a fact that matches nothing is
merely useless, whereas an enforcement rule that matches the wrong things is actively destructive.
And beware a specimen that "proves" the defect: the net above was built from a run whose own
deliverable said *"did NOT call `task.complete`, per protocol's explicit rule…"* — the protocol
working as designed, read as a hang.

### 3. Classify the OWNING LAYER — fix there and ONLY there
Four layers, in escalation order. Misclassification is the loop's most expensive error.

| Layer | What it is | Fix here when… | NOT here when… |
|---|---|---|---|
| **Role guidance** | what the LLM reads about being its role (shared across protocols via ROLE_GUIDANCE_LIBRARY) | the behavior is role-shaped and spans domains (reviewer grading, author quoting rules) | the rule is one domain's procedure (that's protocol) |
| **Template** | thin identity: name/type/defaultRole/model params | wrong specialist identity or model economics | anything behavioral (templates are deliberately thin; they also BAKE at seed time — changes need re-baking, see step 5) |
| **Protocol (seeded prompt)** | the domain's procedures + contracts | the procedure/contract itself is wrong or missing | the LLM already ignores an equivalent instruction (see rules below — add a mechanical net instead) |
| **Platform code** | mechanical facts, validators, reactors, invariants | the guarantee must hold against a non-compliant/degraded agent | a prompt-level contract hasn't been tried and the behavior isn't safety-load-bearing |

**Once you've picked a layer, author the fix TO that layer's implementation standard** (the pattern
is the *how*; this protocol is the *when*):
- **Role guidance / Template** → `.claude/knowledge/patterns/agent-template-gold-standard-pattern.md`
  (Pattern #44) — GS2 role-guidance authoring AND the seed-time bake / re-seed coupling that step 5
  turns on (a role-guidance change rides the TEMPLATE re-bake, never a plain deploy).
- **Platform code (event-driven)** → `.claude/knowledge/patterns/orchestration-reactor-pattern.md`
  (Pattern #46) — the required reactor shape (fire-and-forget, guard-checked, logs BOTH triggered
  and skipped-because-X; never an inline hook). The born-ready and cascade-miss fixes were this shape.

**Layer-selection rules earned live (each is a scar, not a preference):**
- **Prompt warnings are insufficient against a repeatable model failure** — run 6 repeated run 5's
  /31 arithmetic error DESPITE an explicit brief warning naming it. If a failure recurs after its
  warning shipped, stop re-wording and add a **mechanical net** (platform layer) that checks the
  fact — then keep the prompt text as guidance, not as the guarantee.
- **A comment is never enforcement; state channels only.** The harness itself refuses comment-based
  duplicate clearance; F-NEW-5's ":490 comment said 'actually applied' while it wasn't"; run 9's
  agent-stamped `cannotRun` was inert data because no reactor consumed it (a fact with no loop
  closure). Every stamped state either has a consumer or is explicitly labeled emit-only.
- **Never replicate gate/threshold text per-domain — one shared chokepoint.** The confidence-gate
  demotion found the retired `>=85` still alive in three per-domain protocol copies ("any tier"
  claim false until the sweep); the shared-role-guidance relocation covered k8s/terraform in one
  edit. If the same sentence exists in N protocols, the fix is extraction, not N edits.
- **Facts ship; verdicts are earned** (Protocol 10). A new signal ships as a recorded fact
  (stamped, tooltipped, greppable). It gains AUTHORITY (gate conjunct, auto-consumption) only after
  a calibration study demonstrates separation — see the calibration-study method ("Earning or
  Retiring a Verdict" in signal-design-protocol.md, Protocol 10; worked example:
  `cline_docs/reviews/evidence-flow-arc-2026-07/CALIBRATION-STUDY.md` — equivalent inputs, byte-
  identical prompts, a 47-point confidence swing with opposite verdicts ⇒ the number carried no
  signal and every `>=85` gate was retired, at every tier, in one sweep).
- **New structured blocks need variance-tolerant parsers + a variance fixture** — run 6's validator
  was blinded by `**Derived Values**` (bold) vs `## Derived Values`. Agents render mandated
  headings with cosmetic variance; token-locked parsing of LLM output is a latent blind spot.

### 4. Review before shipping — proportionate to blast radius (Protocol 2, applied to this loop)
Small mechanical fix in one file: specialist assessment (the domain owner). Anything touching the
harness contract, persist path, reactor shape, or a seeded contract: a multi-lens panel with claims
to ATTACK, then the domain-owner specialist's GO/NO-GO. This is not ceremony: across the arc the
review layer changed the fix **six consecutive times**, each catch a shipped bug avoided
(authoritative-resolvedMode would have false-flagged every program run; emptiness-alone
terminalization would have killed legitimate runs; the members field, the pre-tx wiring, the
F17/F20 gating, the orphan-re-minting recovery text). Fold findings with a traceability table —
every finding → folded / deferred-with-reason / rejected-with-reason.

⚠️ **A reviewer's summary of PROSE is a reading, not the prose. Open the file before acting on it.**
2026-09-16: a review reported that four domain protocols mandate `task.complete` "on EVERY outcome",
contradicting the base protocol. The full clause reads *"(1) teardown delete … — on EVERY outcome
(approved, needs-revision, escalated); (2) gate stamp; (3) `task.complete`"* — "every outcome"
modifies the **teardown**, and the clause AGREES with the base. Acting on the summary would have
rewritten four correct protocols. The reviewer was right about the symptom and wrong about the
cause, which is the normal and useful state of a good review. **Fold the finding; verify the
mechanism.** The same applies to this loop's own prior conclusions — the same arc produced three
successive states on one claim (`executionDegradation` is / is not / IS-transitively a gate input),
and only reading `seed-protocol-prompts.ts:362` settled it.

### 5. Ship with the coupling rules
- **Version bump + dated changelog, SAME commit** as any seeded-prompt content change (violated
  once in the arc; caught only by a doc-currency review). Verify the seed with **ts-node** (tsc is
  false-clean for seed-protocol-prompts.ts).
- **Reseed-vs-deploy coupling — three change kinds, but only TWO deployment behaviors.**
  (1) Protocols self-seed on deploy. (2) Templates *and the role guidance baked into them* bake at
  seed time and need explicit re-baking: a `ROLE_GUIDANCE_LIBRARY` / `getRoleSpecificGuidance` edit
  in pAIchartUniversalTemplate.ts is INERT until the domain/program template baking scripts
  (`seed-*-templates.ts`) re-run on prod — runtime reads the stored `promptTemplate`, which baked the
  guidance at seed time, NOT the library (wave-2 T3-a REQUIRED op). Role-guidance changes carry the
  TEMPLATE coupling, never a deploy-ride. Know which your change is — the trap is shipping a
  role-guidance edit, deploying, and believing it live while runtime serves the stale baked copy.
- **Deploy-memory rule**: on-box builds peak ~3.5GB — pause the rigs for code deploys until CI
  builds ship. Docs-only pushes (cline_docs/**) do not trigger deploys. `gh run rerun` deploys the
  ORIGINAL run's commit (it regressed prod once — re-verify prod HEAD after any rerun). Key any
  deploy watcher on the commit AND the workflow name ("Production Deploy (Blue-Green)") — the
  "Validation Tests" workflow runs the same SHA and finishes first, so matching any non-health
  workflow declares success mid-build (reactor-cascade AUDIT scar).
- Platform-code fixes need their regression pins in the same commit (incident-shaped fixtures —
  the test carries the exact failing shape, e.g. the specimen's verbatim toolCalls).

### 6. Validate LIVE on a real run
**When the defect shape is RARE, build a probe instead of waiting.** A fix whose trigger occurs in a
small fraction of runs cannot be validated by running one — and a run in which the shape never
appears is **NOT EXERCISED, never a pass** (the `ARM NOT EXERCISED` rule, applied to live rounds).
Measured 2026-09-15: the shape under test occurred in 1 of 38 terraform legs; two live attempts
produced zero instances (one starved on an infrastructure fault, one simply complied). A control
probe — a package clean in every respect except ONE planted, WELL-FORMED instance of the shape,
placed so it inherits the right protocol binding — answered the same question in ~100 seconds.
Well-formed is load-bearing: a malformed plant can be rejected for a missing part, which does not
isolate the rule under test. Worked example + the construction rules:
`cline_docs/reviews/witnessed-rendering-obligation-2026-09-14/LIVE-VALIDATION.md`.

⚠️ **A unit fixture proves the mechanism ONLY IF the input shape it builds is REACHABLE.** A
hand-built fixture is a claim about state the call site can actually produce, and that claim is
rarely checked. 2026-09-15: nine green tests passed `metadata: { duplicateHalt }` straight into a
validator — but that metadata is the PRE-EXECUTION snapshot and the agent stamps the halt mid-run,
so the exemption could never fire. The fix deployed and was **inert in production**, with unit
tests, CI, typecheck and a Protocol 11 sweep all green. Ask of every fixture: *where does this
value come from at the real call site, and could it be there at that moment?*

⚠️ **A deployed fix that never fires leaves NO TRACE — it is indistinguishable from "the defect did
not recur".** This is the `ARM NOT EXERCISED` rule turned inward: a silent no-op reads as a pass.
So step 6 is not "did the run succeed" — it is **read the artifact and find the fix's own fingerprint**
(the fact it stamps, the field it sets, the category it suppresses). The inert exemption above was
caught only because the very next halt's artifact was read field by field, 41 seconds after deploy.

⚠️ **Replay a REAL transcript in its ACTUAL live SHAPE — a hand-built fixture encodes the shape
you imagined.** Distinct from the reachability rule above: there the VALUE could not be there; here
the value is there in a FORM your code does not read. 2026-09-16: `extractLastTaskCommentText` read
`arguments.parameters.comment` and handled two of the three live shapes. The third — `parameters`
as a JSON **string** — is **813 of 2146 `task.comment` calls across 319 executions (38%)**, and
`("…").comment` is `undefined`, so the caller's *"skip gracefully if the comment isn't
extractable"* branch ran: the breadcrumb, deliverable-pointer and re-run-note checks **never ran on
38% of executions**. Every hand-built fixture used one of the two working shapes. It surfaced only
when a transcript was replayed verbatim from the artifact. **Corollary: any figure produced by a
check that can silently skip is suspect until the skip rate is known** — the oft-cited "~30%
breadcrumb compliance" baseline was measured by exactly this check.

Unit fixtures prove the mechanism; only a live run proves the behavior. Re-run the same objective
against unchanged rig state (comparable by construction) and check BOTH arms: the fix fires on the
defect shape AND stays silent on the healthy shape (the HARNESS_NO_OUTPUT recovery run was
deliberately also the live negative test). For prompt-layer fixes, expect partial compliance —
that's what step 3's mechanical-net rule is for.

### 7. Write the VT at test time; close with the drift sweep
If the round is verification-worthy (customer-facing claim), author the VT doc CONTEMPORANEOUSLY
(paichart/verification, customer register, sanitized) — never reconstructed later. Then Protocol 11:
sweep code siblings AND doc claims (specialist configs update their paired discovery in the same
commit; expectation-greps proven live before writing — KC-1's blocks are the worked example).
**If the change ADDED A MEMBER to an enumerated family, grep for the count in prose** — nothing
checks a written-out total, so it rots silently: the canonical non-terminal family table read "Four
members" for two months while six existed (2026-09-15). A
role-guidance change also verifies its CI backstop (`validate:role-guidance-coverage` — catches a
role added without a library entry, which would silently bake generic guidance; pairs with step 5).
Findings that are real but out of scope get FILED with owner + trigger, never silently dropped
(the arc filed: atomic-stage-link with its predicate-coupling warning, the cascade-miss audit,
BLOCKED-non-terminal — each later ruled on with its evidence intact).

## Anti-patterns (observed, named, banned)

- **Re-wording a warning after its second failure** (run 6) — escalate the layer instead.
- **Fixing at the symptom tier when the proximate hole is a detector** — HARNESS_NO_OUTPUT's
  original proposal added a new category; the panel found P8's mode-inference was the actual
  inverted detector and a one-line widening was the primary fix.
- **Evidence sections without derivations** — run 4 proved over-applied evidence contracts invite
  fabrication; contracts state when a block is FORBIDDEN, not just when required.
- **Trusting the package's copy of upstream facts** — anchor mechanical checks to the source
  artifact (the harvest), never a retelling.
- **Deleting the specimen before verification** — or the evidence before the study.
- **Shipping a harness-layer change without checking it against PLAN-SPAWN** (2026-09-15, THREE
  times in one day). `pov-program` PLAN-SPAWN resolves **SYNTHESIZE**, produces output, creates
  children, and **never calls `task.complete` — by design**. It therefore looks like a defect to
  almost any reasonable-looking rule about SYNTHESIZE, completion, or mode. Three separate proposed
  fixes would each have terminalized or false-flagged **every program run in the system**: "make the
  validator authoritative on `resolvedMode`", "require `agent.assign` for ORCHESTRATE", and a
  terminalization net without a `task.create` exclusion. Two were caught by reading the code and an
  existing test; one by a live control run. **Before shipping any harness-layer rule, state what it
  does to PLAN-SPAWN and say so out loud.** It is the sharpest edge in the subsystem — enumerated in
  `ARCHITECTURE.md` Invariant 5.
- **Fixing the tier that FAILED rather than the tier that must ACT** (2026-09-15). R13 was a reviewer
  blocking a compliant author; its entire remedy landed on the author side, so as shipped **it did not
  prevent its own incident**, which recurred three weeks later in another domain. Before shipping a
  prose fix, ask which role's section it lands in and whether that is the role that acts on it —
  mode 6 in `PROSE-OBLIGATION-COVERAGE.md`.
- **Diagnosing from the artifact instead of from the agent's INPUT** (2026-09-19, three rounds lost).
  A k8s author was blocked three times for inventing a validation shape; the obvious reading is that
  it improvised. It had not — *"comparison to perform"* is verbatim its own role guidance, which
  grants the escape and defers licensing to the domain. The fix shaped from the artifact (a paragraph
  naming the remedy) **would not have prevented round four**, because the role guidance would still
  have granted the escape. **Before fixing an agent's output, read everything the agent was given.**
  The clause that shipped opens by discharging the deferral BY NAME.
- **Fixing a defect in the layer where it SURFACED rather than where it ORIGINATED** (2026-09-19).
  A consumer leg escalated because a value never arrived; the proximate cause was a DAG wired
  `producer → gate → consumer`. But the requirements artifact **forbade** the direct edge and asserted
  the value *"reaches the leg through"* the gate — a mechanism that does not exist — and the
  _TEMPLATE offered both wirings as a design choice, so a sibling program had taken the working
  branch and it had been a coin flip for months. Three surfaces, one defect. **Ask what made the
  wrong choice available**, not only what chose wrongly.
- **Softening a control because a UAT artifact trips it.** An undeclared planted credential blocked a
  correct package under a drift rule that exists to stop an out-of-band production change being
  laundered through a gate. The available "fix" was to remove the clause. **Declare the artifact
  instead** — unexplained becomes known, scoped to the named artifact, and the rule stays armed. A
  demo that switches off its own control to get a green proves nothing.

## Proven impact

**2026-09-19 — the loop's best R7 instance yet, because the test was written BEFORE the run.**
`kubernetes-gitops` 1.9.0 shipped a behavioural clause and recorded its own pass condition in the
changelog at ship time: *the next package narrows a `kustomize build` step and quotes the projection,
**without the objective carrying the instruction** — if the objective hand-carries it, the run tests
the workaround.* The validating round was then checked **mechanically against that sentence**: the
withdrawn shape absent, narrowing present, and the objective verified to contain no narrowing
language. It also cleared the exact step that had blocked the previous round, and the same run
independently reproduced an unrelated behaviour (refusal-to-invent, n=1 → n=2) that the round was not
designed to test.

Why this is the pattern to copy: **seeded-UNVALIDATED plus a falsifiable sentence is worth more than
a green round.** Without the pre-written condition, "the package narrowed" is unfalsifiable — nobody
can say afterwards whether the protocol did it or the objective did. Write the sentence into the
changelog when you ship, not into the assessment when you read.


Runs 2-7 (evidence-flow arc): three reviewer tiers approving a real defect at rising confidence
(88/92/94) → a clean pass with every tier green and the defect classes mechanically watched —
`programReleasable: true` earned through five falsification rounds, VT-09 published from the run.
Next-day batch (born-ready + confidence demotion): the same loop shipped a reactor-family fix
(4-specialist panel, min 90) and retired an uncalibrated gate across every tier without a regression.

---

## 2026-09-16/17 — what a four-round arc taught about THIS LOOP

The cross-pipeline delivery arc ran this protocol four times in one session (protocol mandate →
parser → delivery → scope correction). Three observations about the loop rather than the defects.

**1. Reviews catch DESIGN errors; builds catch SPECIFICATION errors — and the second class is not
reachable by reading.** Three panels and nine reviews scored the plan 72–89 and folded ~48 findings.
Then the implementers found, in the same plan: an instruction that would have discarded the design's
own benefit at the ceiling; a sort keyed on a field the injected rows do not have; an exclusion that
would have shipped inert because the role was selected nowhere; and a recording requirement
unsatisfiable on 177 of the children it applied to. **Budget a build step before believing a plan,
and tell the implementer that divergence from the plan is a FINDING, not a deviation.** A
transcribing implementer would have shipped every one of those.

**2. The validation run should have its pass condition AND its limits written before it starts.**
Both were put in the run's own gate comments — *"a green run must not be written up as validating
the dep-free path"* — so the caveat is attached to the artifact, not to a reviewer's memory. Caveats
added after a green result are just modesty; added before, they are the experiment's design.

**3. Measure the PROPERTY, not the word — and run a control before believing a total.** Five counts
in this arc fell by an order of magnitude on re-measurement (204→157→11→3; 71→59; 95→54; 23%→40%). One
query against a **non-existent field path** returned null for every row and read as "the platform has
been broken since July" until a control showed the field was null for tasks *known* to have it.
**A field that is null for everything is a broken query, not a broken platform.**

**Also earned**: the loop's own step-3 (validate live) cannot always exercise what step-2 built. Say
which parts are fixture-proven only, in the write-up, at the same prominence as the result.
