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
Unit fixtures prove the mechanism; only a live run proves the behavior. Re-run the same objective
against unchanged rig state (comparable by construction) and check BOTH arms: the fix fires on the
defect shape AND stays silent on the healthy shape (the HARNESS_NO_OUTPUT recovery run was
deliberately also the live negative test). For prompt-layer fixes, expect partial compliance —
that's what step 3's mechanical-net rule is for.

### 7. Write the VT at test time; close with the drift sweep
If the round is verification-worthy (customer-facing claim), author the VT doc CONTEMPORANEOUSLY
(paichart/verification, customer register, sanitized) — never reconstructed later. Then Protocol 11:
sweep code siblings AND doc claims (specialist configs update their paired discovery in the same
commit; expectation-greps proven live before writing — KC-1's blocks are the worked example). A
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

## Proven impact

Runs 2-7 (evidence-flow arc): three reviewer tiers approving a real defect at rising confidence
(88/92/94) → a clean pass with every tier green and the defect classes mechanically watched —
`programReleasable: true` earned through five falsification rounds, VT-09 published from the run.
Next-day batch (born-ready + confidence demotion): the same loop shipped a reactor-family fix
(4-specialist panel, min 90) and retired an uncalibrated gate across every tier without a regression.
