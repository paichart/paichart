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

## 5. `rollbackContainment` — net #3, EARNED-AND-SCHEDULED, not built

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
