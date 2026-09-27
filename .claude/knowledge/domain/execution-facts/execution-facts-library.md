# Execution Facts — Domain Library

> **Created**: 2026-09-11 (SPECIALIST-LIFECYCLE-GUIDE §3b split from `pipeline-harness-specialist`)
> **Owner**: `execution-facts-specialist` · **Paired discovery**:
> `.claude/knowledge/discoveries/execution-facts-discovery.md`
>
> Depth evicted per **Protocol 12** — greppable ON DEMAND, never auto-loaded. The paired discovery's
> PROVEN greps outrank this file; this file outranks memory. Everything here is production-side: how
> a fact is produced, stamped and rendered. Consumption (gates, `programReleasable`, verdict wiring)
> stayed with `pipeline-harness-specialist`.

---

## 1. Derivation-containment — net #1 (2026-07-17)

`lib/agents/harness/derivation-containment.ts` — the derived-value checker; the code that "fixes"
the run-5/6 subnetting error. `cidr` and `asn` kinds as of 2026-08-02, NOT CIDR-only.

A `kind`-dispatched pure-function **leaf** that catches under-covering: a `/31` covers `.0`/`.1`, so
a design claiming `10.99.0.0/31` covers members `.1`/`.2` is wrong (`.2` is outside) — and an LLM
reviewer approved that exact error at confidence 92. It is CODE, not prompt, because binary-prefix
arithmetic is the token-level class LLMs cannot be trusted with (the run-5/6 lesson).

**Generic-by-construction**: a new domain's derivation adds a branch; an unsupported kind falls to
`unsupported[]` → Node C. That is graceful **DEGRADATION, not equivalent safety**.

Emitted by network-provisioning's AND (since v1.2.0, 2026-08-16 cross-port ①) terraform-iac's
`## Derived Values` blocks — the evidence contract is cross-domain now.

⚠️ **PUBLICLY MIRRORED** as `@paichart/containment-checks` (`~/paichart/packages/containment-checks/`).
Every edit: canonical → re-copy → package suite → version bump → push both.
`test:containment-public-parity` enforces.

**Wiring**: called PRE-TX from `execution-core.ts` (beside `computeSelfSupersession`) but the
enrichment LOGIC lives in `derivation-containment-enrichment.ts` — **extracted 2026-07-30 so it is
reachable without a 30-50 min program run + rig**. `scripts/replay-containment.ts` runs it against
any completed leg in seconds (`--chain` re-runs the real read-only chainer).

### The five cidr violation classes

| Class | Shipped | What it catches |
|---|---|---|
| `covered-not-member` | original | the aggregate swallows a harvested allocation it never declared |
| `member-not-covered` | original | a declared member falls OUTSIDE its own aggregate (the run-5/6 arithmetic) |
| `prefix-not-minimal` | 2026-07-30 | covers its members, swallows nothing foreign, still LOOSER than minimal — Run 15 shipped `10.99.0.8/30` for members `.8`/`.9` past FIVE tiers, authorizing two addresses no exporter used |
| `misaligned-prefix` | 2026-08-19 | a malformed derived CIDR with non-zero host bits names its `canonical` form, so two tiers can never again tell two collision stories about one value (run-1 incident) |
| `derived-value-orphaned` | 2026-08-04 (`b1e15654`) | containment proves a value came from the harvested pool and says NOTHING about whether the package ACTS on it — both live injections were exactly that shape |

⚠️ **The orphaned rule is usage ANYWHERE in the package, NOT "must appear in the validation
section."** That intuitive rule was measured against three real packages and falsely flagged Run
20's legitimate `asn 65002`. **A rule that fails a clean run is worse than no rule.**

### What else the fact carries

- `derivedValues` — the value crosses the DAG edge, so Node C check 1 stops reading upstream prose
- `harvestedCount` — on the no-derivation branch (A7 2026-07-31, RECLASSIFIED 2026-08-16: `> 0` ⇒
  needs-node-c, `0` ⇒ benign `harvested-pool-empty`, absent ⇒ benign, consuming+green ⇒ benign
  discharged). CIDR-ONLY on purpose: a kind-blind total would read an ASN-harvesting leg that
  derives nothing as a REFUSAL — the run-14 false-park shape via a data-shape change
- `upstreamContainment` — the consuming-leg attribution
- `harvestedByKind` — the census, stamped only when a non-cidr kind appears

Incident-fixture-pinned in `scripts/test-derivation-containment.ts`. Design rationale (mechanical
net = code deliverable, earned by a live failure): `PIPELINE-DOMAIN-FIT-CATALOG.md` item 6.

⚠️ **Every prose guard in this domain has failed at least once; every mechanical one has held** —
minimality was checked in exactly ONE place (a requirements clause), a prose edit removed it, and
two successive Node C runs never performed it. Mechanise anything load-bearing; treat a prose-only
check as advisory. **But not as a law** — see §3's R12 false block.

---

## 2. The disposition taxonomy — `containmentDisposition` (mechanised 2026-08-03)

**Read the stamp, do not re-derive the prose.** The reason taxonomy is COMPUTED into
`derivationContainment.containmentDisposition` `{ disposition: blocking | benign | needs-node-c,
reason, inputs }` by `computeContainmentDisposition` (`derivation-containment.ts`), stamped
immediately before the fact is returned — violations are appended AFTER `upstreamContainment`, so
an earlier computation reads them as empty.

**Three states, not a boolean.** `needs-node-c` carries what a LEG cannot decide (an `unsupported`
kind is a program-tier judgement). Benign is an **ALLOWLIST**: an unrecognised reason falls through
to blocking, visibly. Absence fails closed and renders as a positive token
(`ABSENT ⇒ treat as blocking`).

If a reading of the prose contradicts the stamped disposition, that is a **DEFECT to report**, not a
judgement to exercise.

### The reason strings are NOT interchangeable (Run-14, corrected 2026-07-29)

- **`no-derived-values-block`** = NO derived block emitted. **No longer always blocking** (2026-08-16
  cross-port ①, harvest blocks now cross-domain):
  - consuming leg (`## Consumed Values` + upstream green) ⇒ benign, discharged
  - pool `> 0` ⇒ needs-node-c (audit-vs-refusal ambiguity — was blocking `refusal-or-drop`)
  - pool parsed-EMPTY ⇒ benign `harvested-pool-empty` (live-proven Run 20260816-0734)
  - pool absent ⇒ benign
- **`harvest-block-missing-or-unparseable`** = the derived block IS present but the leg's own harvest
  has no parseable CIDR set — the CONSUMING-leg state (terraform-iac re-emits the chained aggregate
  but harvests bucket/state). Non-blocking ONLY when `upstreamContainment.green` (pov-program
  v1.0.18). A *deriving* leg with a genuinely broken CIDR harvest stamps the same reason and stays
  blocked.

### `## Consumed Values` `kind` is a CLOSED set

`cidr` | `asn`, machine-matched. A coined kind stamps a false `consumed-value-mismatch` and parks a
correct program (Tasman Run 1); the violation record now carries the kind. Adding a kind to the
engine without extending the protocols' closed-set sentences makes the protocol contradict the
engine — see the toolkit's Step 2d.

### needs-node-c: the delegated-decision path (2026-08-04)

Two arms produce it — `unsupported-not-mechanically-covered` and
`non-cidr-only-harvest-cannot-decide`.

⚠️ **It is NOT on `RESULT_JSON_SUMMARY_KEYS`, and must not be added.** It reaches consumers by
riding **nested inside** the fact (`derivation-containment-enrichment.ts`), and the whitelist hoists
`derivationContainment` verbatim. Promoting it to a top-level sibling would **silently strip it** —
a strict whitelist drops unlisted keys with no error — and the tier would simply never be told a
decision was delegated. Pinned by **E3b** in `scripts/test-execution-artifacts-parity.ts` (both
directions mutation-verified).

**VT-14 item 3 is OPEN by decision, not neglect** (public repo, `verification/tests/`): should
`needs-node-c` fail CLOSED when the tier cannot name the subject? Verified 2026-08-04 that the
bare-unnameable state is **not reachable** — both arms carry a locatable subject to the card.
Revisit on either trigger: a **new** `needs-node-c` arm or unsupported kind, or the disposition
moving to a top-level key.

---

## 3. Dialect-lint — net #2 (2026-08-23; wired + live-proven 2026-08-25)

`lib/agents/harness/dialect-lint.ts`. Earned identically to derivation-containment — a prose
contract failing on a SECOND axis: IGP-T1 R1 shipped two IOS-isms on an Arista target past an
APPROVING reviewer (refused at the operator's config-session apply), then R3 re-emitted the banned
token past a contract that explicitly named it.

Pure function, no I/O: extracts banned tokens from the interface contract (deep search,
shape-tolerant) and scans **fenced code blocks ONLY** — prose is exempt BY DESIGN, because
contracts/requirements legitimately NAME banned tokens when stating rules (the R6 clean winner does,
and is fixture-pinned to return zero). Returns a FACT
(`checked`/`reason`/`tokensConsidered`/`violations`), never a verdict; absence is a NAMED reason,
never a silent pass.

**Phase 2 SHIPPED** (`e5744699`): enrichment `dialect-lint-enrichment.ts`; call site beside the
derivation-containment enrichment in `execution-core.ts` (PRE-tx, PIPELINE + SYNTHESIZE,
non-throwing, BOTH catch arms stamp a named fact); `dialectLint` added to
`RESULT_JSON_SUMMARY_KEYS` as a FIRST-CLASS fact — the E3b lesson forbids unlisted SIBLINGS of a
whitelisted key, not new whitelisted keys; a future sub-field nests INSIDE `dialectLint`.

**Two halves, failing independently:**

- **ABSENCE** — banned tokens must not appear (earned R1/R3).
- **PRESENCE** — every required line of the contract's canonical stanza must appear (earned R7,
  2026-08-24): a banned-token-CLEAN package omitted one canonical line; the config entered a config
  session with no error, committed, and displayed as configured while IS-IS stayed DISABLED. The leg
  reviewer approved it 90/100, because an absence-only check runs in the opposite direction.

**Live proof (IGP-T1 R11 P1, 2026-08-25)** — first real run, first catch. It caught a package its
own reviewer approved at 86/100 with zero blocking: PRESENCE found `address-family ipv4 unicast` and
`isis network point-to-point` absent. Impact PROVEN on-device, not asserted — the stanza as authored
yields `% IS-IS (ISIS-1) is disabled because: IS-IS address family configuration is not present`.
`blockKinds {candidate-config:20, rollback:14, expected-output:13, command:8}` confirmed
classification working on real data.

⚠️ **The wiring found a defect that would have made it INERT**: `extractBannedTokens` matched
`/banned/i` only, while the live Program Architect emits `platformDialect.forbiddenTokens` — zero
tokens on every real contract, so it would have stamped `no-banned-token-list` forever. A named
reason (never a silent pass) but gating nothing while appearing wired. Predicate now
`/banned|forbidden/i`, mutation-verified. **Generalisable: a net's key predicate must be pinned
against a LIVE artifact shape, not only hand-authored fixtures.**

Replay: `npm run replay:dialect-lint -- <legTaskId>` (read-only). Operator-side runner:
`npm run check:package -- --package <f> --contract <f> [--stanza <k>]`. Suites: `test:dialect-lint`
+ `test:dialect-lint-enrichment`, both in `test:all-validation`.

### What R12 proved about the net itself (2026-08-26)

- **dialect-lint produced a FALSE BLOCK** — 8 "missing" lines on a *removal* leg whose package
  correctly omits the stanza. It has no notion of leg INTENT. The **prose reviewer got it right
  where the mechanical check got it wrong** — the reverse of this domain's usual pattern, so **do
  not treat "mechanical beats prose" as a law.** Also `net <NET>` degrades to prefix `net`, matching
  OSPF `network …` (false PRESENCE).
- **The PRESENCE half had been unreliable across rounds BY CONSTRUCTION**: it split the stanza on
  newlines while the Architect's output shape is non-deterministic (R11 newline, R12 slash). Caught
  pre-gate; VT-20's "first live catch" happened to land on a newline round and needs qualifying.

### EF-DL1 — the lifetime false-positive audit (2026-09-27)

Measured: every dialect-lint violation ever stamped was a false positive — **3 of 3, across 30
archived packages whose contract carries a banned-token list** (231 stamped; the other 201 unchecked by a NAMED reason — 70 `no-banned-token-list`, 64 `program-tier`, 47 `no-contract`, 20 `no-author-child`).
The R1/R3 true positives predate the Phase 2 wiring and exist only as fixtures. Replaying HEAD over
the 30 separates the three:

- **2 × 2026-08-27 (`passive-interface`, R15 P4 + R16 P4 OSPF-removal legs) were ALREADY FIXED** the
  same day by the `harvested-state` kind and the heading-ancestry walk; the stamps simply predate
  those commits. HEAD returns 0 on both. They are **not** the R12 removal-intent class — they are
  classification misses on harvested/rollback blocks, fixture-pinned since 08-27.
- **1 × 2026-09-26 (`allow all;`, observability ingress leg) was a NEW class**: a one-line block
  `docker exec obs-ingress nginx -T 2>/dev/null | grep -c 'allow all;'` whose expected output is `0`.
  The ABSENCE half was ALREADY scoped to `candidate-config` (so "scope it like PRESENCE" was not
  available — it had been done since `5fd447da`); the block landed there because it opens with an
  exec WRAPPER, not an `OPERATOR_VERB`. **Fixed at OCCURRENCE level, not by widening the classifier:**
  a token inside a QUOTED argument of a grep-family command (bounded by the first unquoted `|`/`;`/`&`)
  is a search pattern, recorded in `searchPatternExempt` (present only when non-empty); any other
  occurrence on the line still flags. Rejected: re-kinding exec-wrapped blocks as `command` — it moves
  PRESENCE's denominator and every stamped `blockKinds`, on a classifier this file already records as
  having erred in both directions. Polarity (`-c … → 0` vs presence checks) is deliberately not read.
  **Replay: 1 → 0 violations; 1 changed verdict of 30; block kinds and PRESENCE byte-identical on all 30.**

Known residual, not widened here: a block led by `sed` is kind `command` and never scanned — including
`sed -i`, which WRITES. No corpus instance; recorded so it is not rediscovered as new.

⚠️ **Found while fixing it, MEASURED and NOT shipped — the false-NEGATIVE direction.** The 3-line prose
window in `fencedBlockLines` does not stop at a heading, so it reaches ABOVE a block's own section
heading into the previous section. On the EF-DL1 package, `## 2. Full Desired-State Config File`
inherits "Phase 0 **Harvest**er" from section 1's table, so the package's REAL config is
`harvested-state` — scanned by neither half (production stamped PRESENCE 0 of 2 on a package that
carries both lines). Bounding the window at the first heading, replayed over the 100 archived packages
with a contract: **block kinds move in 66**, often wholesale (`candidate-config 3 → 42`), **0 violations
change**, PRESENCE flips on 2 (the EF-DL1 package reads a correct 2 of 2). A classifier change of that
reach needs its own panel and its own fixtures — the ABSENCE half has been blind to a large share of
harvested-labelled config, which is the direction this net exists to prevent.
**Filed as EF-DL2** (register, owner execution-facts; BOTH commits shipped 2026-09-28 — commit 1 / F1 as classifier 2, commit 2 / option (ac) as classifier 3, both below). Assessment and panel brief:
`cline_docs/reviews/ef-dl2-dialect-lint-classification-2026-09-27/ASSESSMENT.md` and `PANEL.md`. Anchors
as of 2026-09-27: `classifyBlock` at `dialect-lint.ts:242`, `fencedBlockLines` at `:322`. "0 violations change"
means no banned token has been hiding in mis-kinded config in the archive. It does NOT mean re-kinding is safe:
the 66-package move changes PRESENCE denominators and every stamped `blockKinds`.

### EF-DL2 commit 1 — F1, the fence-aware ancestry, and the `classifier` field (2026-09-28)

The panel found a SECOND defect in the same function, independent of the window: the heading-ancestry walk
tested every earlier line against the heading pattern **including lines inside earlier fences**, so a `#`
comment in HCL/YAML/bash/nginx read as a level-1 heading. It did two things at once — its words reached
`classifyBlock` (terraform `# NEW: … per security baseline` inside candidate HCL kinded every Part B
validation block `harvested-state`), and, being level 1, it STOPPED the walk and hid the real section
heading (`# Find the commit hash` inside a bash fence left the next block under `### 3. Rollback Plan`
reading `restoreIntent: false`). F1 toggles on each fence line walking up — the same pairing the forward
loop uses, so the two scans cannot disagree — and skips everything inside. No vocabulary, threshold or
precedence moved. Shipped on STRUCTURE (Phase D decision 2), not on the census: its gold-labelled effect is
1 right / 5 wrong-kind (both exempt) / 2 wrong scan decisions, nearly all from one title leak.

**`dialectLint.classifier`** (Phase D decision 4) — nested integer, `DIALECT_LINT_CLASSIFIER` in the module:
bumped by EVERY commit that changes which kind a line receives (F1 → 2; option (ac) → 3). Present exactly
when the classifier ran; absent on `no-contract` (nothing classified — which also keeps those stamps, and the
equivalence gate's only dialectLint specimen, byte-identical across the cut) and on every pre-cut stamp
(implicitly 1). Pinned: E3b-5 (survives the whitelist nested). **Split a `blockKinds` series on this field.**
`rollbackContainment` got NO version: its `blocksScanned`/`excluded` bytes move, but nothing reads them
programmatically (grep of lib/ and app/), and its dispositions do not move.

**Archive replay (the lane-1 harness, prod read-only):** dialectLint — `blockKinds` moves on **3 of 97**
contract packages, **0 violations, 0 PRESENCE**; net #3 — **87 `restoreIntent` blocks in 22 of 220** Author
packages, **22 stamped `blocksScanned`/`excluded` moves** (21 terraform via `lane-not-supported`, 1
observability `all-restore-lines-found` 19/19 either way), **0 dispositions**. Latent correctness for net #3:
live only if the terraform lane ruling changes or an EOS/obs Author puts `#` lines in fences.

**Named residuals (fixtures, re-measured at the health-run):**
- **The TITLE LEAK.** Two terraform Authors title their package "… HCL Rollback Author". The old walk
  stopped at an in-fence comment before reaching the title; the fence-aware walk reaches it, so every block
  in the package reads rollback (19 blocks in 2 packages, `restoreIntent` decided by the title ALONE).
  F028, a shipped rego policy, becomes a new false SKIP. No fact-level effect today (no tokens, no stanza,
  terraform lane). **Not sharpened for 2 packages** — a document-title exclusion is new judgement.
- **F035** — a `## Consumed Values` marker JSON loses a leaked `# Revert:` ancestor and becomes
  candidate-config: the pre-existing EF-DL3 false-SCAN floor, not a new class.

**The equivalence gate cannot pin F1 yet** — every specimen is `no-contract`, which never runs the
classifier (F-7). Its `classifier` arm is declared unexercised and self-checking (E3: the note must agree
with the stamps in both directions) until a post-deploy contract-bearing leg is archived. Until then F1 is
pinned by the F1-* fixtures in `test-dialect-lint.ts` and F1-RC1..3 in `test-rollback-containment.ts`.

### EF-DL2 commit 2 — option (ac), `classifier: 3` (2026-09-28)

Two changes in `fencedBlockLines`, nothing else: **(a)** the 3-line prose window stops AT the first heading, the
heading line INCLUDED; **(c)** `harvested-state` is decided only from `labelProse` (the nearest line, when ≤
`MAX_LABEL_CHARS`) or the heading ancestry — `classifyBlock` gained an `ownProse` argument that only the harvest
test reads. Rollback/expected-output keep the (now bounded) window; no vocabulary, threshold or precedence moved.

- **Why (a) alone was not enough** (panel F-2, pinned by D076): 6 of the 32 false SKIPs were a long sentence
  INSIDE the block's own section naming the harvest — protocol-mandated dialect notes, gap-naming, the (e1)
  source line. Bounding the window cannot reach them; the existing 120-char label rule can.
- **The heading is INCLUDED on purpose** (panel F-9): when the nearest line is the heading, `ctx[0]` must not
  move, or `label` moves (59 archived blocks under the `acx` control) and net #3 scopes on `label`. Replay: 0
  `label` and 0 `restoreIntent` moves archive-wide.
- **This reverses the file's old "UNCHANGED INPUT" note** (audit A5): AC5 passes in letter only. The note was
  REPLACED in the code, not left stale, and Steve approved (ac) knowing it (Phase D decision 1).
- **Archive replay, commit 1 → commit 2:** `blockKinds` 88 of 97 contract packages (harvested-state −973 lines,
  candidate-config +761); **0 violations**; PRESENCE **exactly 2 corrections** (R12 deploy 0/10 → 10/10, EF-DL1
  0/2 → 2/2) plus 4 packages whose per-line `occurrences` rise with `linesPresent` unchanged; **net #3: 0
  scope / 0 disposition moves** on 220 Author packages. The shipped module is byte-identical to the panel's
  `f1ac` variant on 362/362 texts, so the panel's gold scores ARE this commit's.
- **The cost, approved knowingly:** false SCAN 5 → 109 census blocks (operator commands, marker/allocation
  JSON; 0 expected-output, 0 violations on the archive). A contract banning a token those blocks can carry
  turns this into LOUD false violations — EF-DL3 owns the floor.
- **Post-fix baselines for the health-run replay:** false SKIP **2 / 21 lines** (F028 title leak — F1's; D098 —
  ROLLBACK_PROSE in a long own-section sentence, a NAMED pre-fix residual), false SCAN **109 / 269**. How to
  re-run: the discovery's "Classifier cut … classifier: 3" block.
- **The (d) trigger lives AT THE FIELD** (`HARVESTED_STATE_PROSE`'s doc comment, Lane 2's form): re-open
  Author-side fence-role declaration only on a gold false SKIP in a NEW (classifier ≥ 3) package or a second
  position-dependence incident — label-line form in `VALIDATION_SHAPE_CLAUSE`, never the info-string form.
- **Pins that held the defective reading were REWRITTEN, not deleted:** the EF-DL1 block's "classification
  unchanged from the production stamp" (the stamp WAS the defect) and F1's cmrlm3hp expected-output list (L73,
  `terraform validate`, was expected-output only because the window crossed `#### B.1`). Mutation-proven with
  compiling mutations: revert (a), revert (c), exclude the heading, classifier 2, drop the rollback rule
  (D042), label-cap expected (D052), label-cap rollback (D098) — each turns a named assertion red.

### The delivery-vs-disobedience correction (2026-08-26) — a standing audit rule

The first reading of R11 was that the exemplar was present, complete and BINDING with an explicit
transcribe instruction and the author dropped two lines anyway — four prose guards bypassed by one
omission. **That reading was wrong.** Measured: the contract was binding on the LEG but never
delivered to the leg's CHILDREN — the author got a harness-written paraphrase missing **7 of the
exemplar's 10 lines**, the reviewer's brief missed 9 of 10, and the hole was universal (**7 of 7
archived legs lossy, 0 of N children ever holding it**). Fixed by contract inheritance (`806501a2`)
plus an orchestrator no-restate rule (v3.13.0).

**Standing rule earned here: before concluding a model ignored a rule, verify the rule was IN ITS
PROMPT.** "Binding" is a property of a document; "present" is a property of a prompt, and they drift
apart silently. An absent guard produces evidence indistinguishable from a disobeyed one — and
argues for exactly the wrong fix (write the prose harder) while the real defect is delivery.

What survives unchanged: the reviewer DID hold the complete rule and still approved at 86/100, so do
not resurrect the retired claim that an exemplar "converts generation into transcription, which
holds"; and the exemplar's durable value is as the SPECIFICATION the lint decomposes into required
lines, not as an instruction that binds.

---

## 4. `markerPresence` and `contractPropagation` — nets #0.5

- `markerPresence` (H-4, 2026-09-10) — `lib/agents/harness/marker-presence.ts`, pure and
  synchronous, stamped directly in `execution-core.ts` from `finalResponse`. Reports which
  machine-parsed blocks the platform found (harvested / derived / consumed). A **deliberate
  top-level addition** to `RESULT_JSON_SUMMARY_KEYS`, never an unlisted sibling. Rendered on the
  lean card. Suites: `test:marker-presence`, `test:marker-contract-claims`.
- `contractPropagation` — `lib/agents/harness/contract-propagation-enrichment.ts`, consuming
  dialect-lint's `canonicalStanzaNeedles` so "what counts as a required line" has ONE definition.
  Replay: `npm run replay:contract-propagation -- <legTaskId>`. Whitelisted; **not** rendered on the
  lean card today.

---

## 5. `rollbackContainment` — net #3, ✅ BUILT AND LIVE

> **Status corrected 2026-09-14.** This section's heading read *"EARNED-AND-SCHEDULED, not built"*
> until today. It shipped: `lib/agents/harness/rollback-containment.ts` +
> `rollback-containment-enrichment.ts`, registered in the shared net registry
> (`lib/agents/harness/net-registry.ts`), **live-accepted at R3b-3 on 2026-09-11 — the same day this
> library was written**, which is how the two diverged: the section was drafted before the build
> landed and was never revisited.
>
> Item 5 below (the shared net registry, built in the same arc) also landed — six hand-wired stamp
> sites became one registry with two invocation points, guarded by an equivalence gate measured
> against observed production output.
>
> **Why this correction is worth more than a one-line edit.** This library is the authoritative
> inventory of what is mechanised. A reader consulting it would conclude one of three live nets does
> not exist — and might propose building it. That is not hypothetical: on 2026-09-13 a coordinator
> was one step from re-proposing `prefix-not-minimal`, which had shipped six weeks earlier, for
> exactly this reason. An inventory that says "not built" about a built thing is worse than no
> inventory.
>
> The design record below is preserved verbatim — it is the ruling the build followed, and items 4
> and 6 in particular are standing constraints rather than history.

Trigger fired 2026-09-10 (second and third provenance-shaped refusals, same day). Full record:
`cline_docs/follow-ups/r19-p4-reviewer-false-positive-2026-08-31.md` — read the **pre-assembled
panel brief** before designing anything.

Its shape, as already ruled in that brief:

1. **Layer framing** — the rollback-verbatim rule is a Layer-2 evidence-anchoring contract WITHOUT
   its Layer-3 mechanical leaf. Same justification pattern as derivation-containment (a token-level
   class the model cannot be trusted with — here quotation fidelity in BOTH directions; R19 proved a
   model can neither perform nor judge it).
2. **Reuse, don't rebuild** — dialect-lint's block classifier already extracts and classifies
   `rollback` fenced blocks and separates `command`/`expected-output` (exactly the false-positive
   class the corpus measurement hit). A second rollback extractor = two-extractor drift.
3. **Fact shape** — follow the three-state disposition. restore-lines-found/total is the FACT;
   scoped-harvest context-line misses classify benign; genuine unfound config lines are
   needs-node-c-shaped. Never a verdict, never auto-blocking (the corpus says the base rate of true
   fabrication is 0/56).
4. **The earn-it tension the panel MUST rule** — the toolkit's Step 0 is written for
   defect-catchers; this leaf's proven value is **EXONERATION** (it would have refuted a false
   refusal). Does exoneration-value count as Path 1, or does the rule need a named third path?
5. **Rule of three** — this is net #3, so the shared net registry (`{name, enrich(ctx)}`
   registration, ONE loop at the execution-core call site so a registered net cannot be inert,
   shared replay runner, toolkit generalised to adding-a-mechanical-net) is built in the same arc.
   **H-4 markerPresence work is running in another session and is also net-#3-shaped: whichever
   build lands first extracts the registry; the other consumes it. Coordinate before either starts.**
6. **Layer-5 constraint earned here** — the roadmap Quality-Gate reactor ("re-run with diagnostic
   feedback") does NOT avoid this class and can AMPLIFY it: feeding a false reviewer diagnostic into
   an automated re-run invites the author to strip the "suspicious" (correct, verbatim) lines,
   converting a correct package into a genuinely non-verbatim one. **Diagnostic feedback wired into
   any automated re-run must be EVIDENCE-GROUNDED (a stamped mechanical fact), never a raw reviewer
   narrative.**

Fixtures: R19 P4 `cmtfew6iv0039yx7usxs80ox7` (expect 0 missing) · R3a-3
`cmtvdq59h0021yxu8xxz0bdxk`'s stage (expect the disputed line found-in-harvest) · R3b-2
`cmtvg2nye0065yxlp3ayw4jsz` (expect rollback ≡ harvest file). Acceptance has a live customer:
R3b-3 clearing on the stamped fact IS the validation round.

**Note the layer ordering already decided**: the protocol-layer fix ships FIRST (observability
1.0.2 — witnessed excerpts travel verbatim with provenance labels), and R3a-4 measures whether the
prose layer alone clears the common case. That calibration datum is an input to the panel, not a
substitute for it.

---

## 6. The provenance tripwire — NOT ours

On any reviewer verdict claiming a package's quoted evidence is reconstructed / paraphrased /
fabricated, the response guidance (run the string test FIRST, read the r19 follow-up) is **response
guidance and stays with `pipeline-harness-specialist`** as first responder for refusals. What lives
here is the *build* it triggers (§5) and the corpus practice that overturned it.

---

## RWF Wave B (2026-09-26): a net reads the execution the Reviewer was chained

Every result.json read a net makes goes through `readAuthoritativeResultField(client, taskId, field)`
(`lib/agents/harness/authoritative-result-read.ts`). That helper selects with `CHAIN_SELECTION_OPTIONS`, the same
constant the context chainer passes. Before Wave B, the four reads each took "the newest result.json whose CONTENT
carries this taskId": derivation harvest/Author/fallback, dialect-lint Author, rollback leaf-persist harvest, and
the rollback leg-synthesize hoist. The chainer skips superseded and R8-empty runs, so once leg retry makes re-runs
routine, the Reviewer and the gate would silently read different packages.

- **field is a closed union** (`finalResponse` | `rollbackContainment`), with one literal query per member.
- **The jsonb projection is load-bearing.** The hoisted stamp's key order IS the jsonb rendering, and the
  equivalence gate compares bytes. Never `JSON.parse(content)[field]`.
- **A plain module, not `ctx`**, so the replay runners can still call enrichments directly.
- **`executionId` is returned but stamped nowhere.** Stamping it is a byte change with its own commit (C.2).
- **Proof is fixture-only.** 1,203 of 1,203 archived children agree, so the equivalence gate declares the skip
  arms unexercised. The proof is `scripts/test-authoritative-result-read.ts` F1–F6. Stubs:
  `scripts/fixtures/authoritative-read-stub.ts` throws on the old content-taskId query.
- **Coverage lock** (`test-execution-selection-coverage.ts`): per-call artifact fingerprints with no file-level
  escape, `.js` scanned, and a positive control.
- **Side effect:** the old reads cast `content::jsonb` in WHERE across the whole artifact table, so ONE malformed
  row would have broken every net read. A lone-surrogate `pipeline-index.json` exists in prod since 2026-09-25.
  It did not break the nets, which read `result.json` only, but it broke `replay-nets.ts`'s own copy of the read.
  That copy is now routed through the selector too.
- **X11 closed that row's class at the source (`7d81b2b9`, 2026-09-27).** The writer was not a net. It was
  `sanitizeForResponse` cutting a task DESCRIPTION at 197 UTF-16 units through an emoji, echoed by `task.list` into
  an agent's tool result. The terminal persist now serialises the JSON artifact (`result.json` AND
  `pipeline-index.json`, one code path keyed on `jsonArtifactName`) and `error.json` through `stringifyWellFormed`
  (`lib/utils/surrogate-safe.js`, CommonJS). A lone surrogate becomes U+FFFD and the repair count is logged as a
  warn. On well-formed input the output is byte-identical to `JSON.stringify`, and key order is kept, so
  `orderResultJsonForPersist` survives it. **For this domain:** a stamped fact can no longer carry a lone surrogate
  into an artifact. The one historical row (`cmugva9aw006gyxa722697ijv`) stays as immutable history, so any query
  that casts the WHOLE table `::jsonb` must still pre-filter it (`scripts/report-mechanism-inventory.sh` section 0
  filters and COUNTS such rows). Nets are unaffected because they cast only the selected row. Suite:
  `test:surrogate-safe`, in the battery.

## RWF Wave C (2026-09-26): supersession + verdictFreshness, and persist-time key order

- **`supersession`** is now on `RESULT_JSON_SUMMARY_KEYS` (the pick stripped it). It is NOT a net: `computeSelfSupersession`
  writes it. Three shapes: `supersededById` present = the retry LOST; `skipped: changed-input | input-unknown` = no
  comparison ran (the retry stays authoritative); `{checked:false, reason:'keep-best-error'}` = the comparison threw.
- **`verdictFreshness`** is a leg-synthesize net (`verdict-freshness-enrichment.ts`): were the reviewer's judged predecessor
  executions still authoritative when the leg was stamped. Three-state `match`; unknown is `checked:false,
  no-chained-record`, never clean. `renderPrompt: null`; NO consumer in Stage 1. Equivalence gate: `legs: 'none'`, and
  E1a now compares only keys whose window covers the leg plus everything production stamped.
- **Key order**: `orderResultJsonForPersist` at persist moves the bulky payloads to the tail, so net stamps no longer
  land after `finalResponse`. Artifacts persisted before 2026-09-26 still have them at the tail.

**Depth added 2026-09-27 (verified at source):**

- **`supersession` skip rules (C2, `b45340e9`, `execution-selection.ts` ~:247-302).** A retry whose chained
  predecessors DIFFER from its target's gets no keep-best comparison, for EVERY role: `skipped: 'changed-input'`,
  latest wins. An UNKNOWN relation (a not-chained or absent record on either side) skips only for the REVIEWER set
  (`skipped: 'input-unknown'`). Other roles keep Arms 1-3, so a same-input Author retry keeps its
  catastrophic-degradation protection. Why: an old APPROVED-for-v1 Reviewer beating a truncated re-review of v2
  leaves an approval standing over a different package, which fails open. On a skip, `supersededById` is null.
  Named residual: a harness edit to a child's description or contract between runs is invisible to an
  execution-id key.
- **Card render** (`lean-card-facts.js`, `grep -c "supersession"` gives 5): `superseded by <id> (<reasons>)` ·
  `comparison skipped (<why>) — this run is authoritative` · `NOT compared (<reason>)`.
- **Two freshness facts from ONE function.** `computeVerdictFreshness` (`chained-predecessors.ts:91`, which wraps
  `compareChainedInputs`) serves both. They answer different questions:
  - `verdictFresh: yes|no|unknown` is computed at READ time on a reviewer's `agent.results` card
    (`agent-results-handler.ts`). It asks "is the verdict fresh NOW". A later Author re-run flips it retroactively,
    so it is a decision aid for the harness and never a record.
  - `verdictFreshness` is the leg-synthesize STAMP. It asks "was the verdict fresh when the leg was stamped", and it
    is immutable.
  - The C1 Reviewer rule (`orchestrator-reexecution.ts`, REVIEWER_SAME_INPUT_REEXECUTION) refuses a Reviewer re-run
    only on `compareChainedInputs → 'same'`. That is CONSUMPTION, and it belongs to the harness. Unknown is never
    "same".
- **`verdictFreshness` reason set** (grep the enrichment): `compared` · `no-reviewer` · `no-reviewer-verdict` ·
  `no-chained-record` · `program-tier` · `no-child-stage`, plus the registry's `enrichment-error`. The module header
  lists five of these; `no-child-stage` is the sixth. The reviewer scan is a SEARCH, bounded by its own
  `REVIEWER_SCAN_CAP = 20`, `orderBy createdAt asc`.
- **The card renders the stamp only when it says something**: `different (<taskIds>)`, or `NOT checked (<reason>)`
  for any unchecked reason EXCEPT `no-reviewer` and `program-tier`. A same-match renders nothing. That is safe only
  while nothing consumes the fact. If it ever gates, silence on `same` must become a positive token in the same
  commit.
- **Registry: 7 entries under 6 names** (`rollbackContainment` is registered at two points). The entry order is
  byte-contract, because the equivalence gate compares serialized bytes.
- **Live: 1 stamp** (inventory 2026-09-27, 🟡 by age). The first control run after Wave C (Rev 14, 2026-09-27) read
  `verdictFreshness` = same. Re-measure at the next health-run (MI-4). See the §7 gap: the quarterly script counts
  its presence but not its `match`.

## RWF Stage 2 (2026-09-27): the reviewer tag-grammar fact was NOT built

Stage 2 would have soaked a parsed-but-unconsumed reviewer class-tag grammar, a new fact on this side of the seam.
**It was not built.** Steve decided to STOP on the numbers (`cline_docs/reviews/rwf-stage2-2026-09-27/RESULTS.md`):
strict clause-(f)-only retry reach was **5%** of infra NR verdicts (2/38), and **0 of 16** non-releasable programs
were sunk by write-up legs alone (the synthesis had predicted ≈34%). A retry lever with no program-level benefit
leaves the tag grammar with nothing to feed. **Re-open only on NEW evidence** (register RWF): strict reach ≥ 10% of
infra NR verdicts, OR ≥ 1 program non-releasable solely through write-up legs, on a fresh window. Do not rebuild it
as a "cheap fact": with no lever to feed, a fact with no reader is storage (the A1/F7 class).

## 7. The mechanism inventory (MI-13, executed 2026-09-27): what it said about this domain

Source: `cline_docs/reviews/mechanism-inventory-2026-09-16/INVENTORY.md` §1. Quarterly re-run:
`scripts/report-mechanism-inventory.sh` (read-only against prod, CLAUDE.md health-run item). Platform-wide totals
were 38 alive, 14 dormant (trigger recomputed and absent), 1 partially blind, 5 unmeasurable. **None of the
partially blind or unmeasurable entries is a net of ours.**

| Fact | Class | What it showed |
|---|---|---|
| `derivationContainment` | 🟢 | disposition benign 148 · blocking 68 · needs-node-c 41 · none 122. **Value violations: 5 lifetime, last 08-19.** `blocking` still fires through hard-gap (68, last 09-16). This means the derivations have been right, not that the net is blind |
| `dialectLint` | 🟢 | 231 stamped / 201 in 30d. Violations 3 lifetime, all false positives (EF-DL1). The false-NEGATIVE direction is EF-DL2 |
| `contractPropagation` | 🟢 | checked=true 25 |
| `rollbackContainment` | 🟢 | benign 259 · needs-node-c 36 · blocking 6 |
| `markerPresence` | 🟢 | derivedValues true 55 · false 345 |
| `reviewerVerdict` ↳ `evidenceGrading` | 🟢 | 53 stamped; graded true 52 · false 1 |
| `supersession` | 🟡 | **1 stamp lifetime (07-04).** The trigger was recomputed: 7 stamped retries lifetime, 0 in 30d. Stamping is complete: 6 of 6 agent-loop child re-executions in 60 days were stamped |
| `verdictFreshness` | 🟡 | shipped 09-26, 1 stamp. Dormant by age. That is exactly where a mechanism turns out to be inert |

⚠️ **Gap in the quarterly script (recorded, not fixed here, because it is code):** section 1 counts the top-level
PRESENCE of every key, so it counts `verdictFreshness` and `supersession`. Section 1b ("do the nets ever say
anything but their default?") covers derivation, rollback, dialect, contractPropagation, reviewerVerdict and
markerPresence. It does NOT cover `verdictFreshness.match`, the `supersession` shape, or `evidenceGrading.graded`.
The re-measure MI-4 schedules for `verdictFreshness` therefore needs an ad-hoc query until 1b gains a row. A fact
whose presence is counted but whose VALUE is never read is the exact dormant-by-age blindness the inventory exists
to catch.
