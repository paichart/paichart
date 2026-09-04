# Adding a Containment `kind` — Toolkit

**Purpose**: Add a new `kind` to the derivation-containment engine (`cidr`, `asn`, …) without
repeating the eight things the first extension got wrong
**Type**: Execution toolkit (not an analysis protocol)
**Proven**: 2026-08-02 — `asn`, the first extension. Built, deployed, proven live in Run 20
**Genesis**: distilled from `cline_docs/reviews/asn-kind-2026-08-02/IMPLEMENTATION-PLAN-v2.md`
(4 specialists, 32 findings) and the defects that plan itself missed

> **The single most useful thing here**: v2 made three "no change required" predictions and **all
> three were wrong**. Predictions are the informative part of a plan precisely because they are
> falsifiable. Step 3 forces you to write them down and prove each.

---

## When to use this vs a full specialist review

| Use this toolkit | Escalate to a panel |
|---|---|
| the kind's arithmetic is simple membership | the kind introduces a *judgement* (see Step 1c) |
| no new client-facing signal an AI acts on | a new blocking reason a gate consumes |
| a comparable kind already exists | this is the first kind of a new *shape* (unary, ordered, ranged) |

`asn` needed a panel — it added two violation reasons and a near-verdict. A pure-membership kind
(`vlan`, `route-target`, `bgp-community`) does not; one reviewer on the schema is proportionate.

---

## STEP 0 — Earn it. Do not skip. *(≈10 min)*

`PIPELINE-DOMAIN-FIT-CATALOG.md`'s mechanical-net rule: **a leaf is earned by a live failure, OR by a
property that is load-bearing, prose-only, and of a class already measured as non-binding.** All
three for the second path, or it is speculation.

- [ ] **Path 1** — has this failed live? Cite the run.
- [ ] **Path 2**, all three:
  - [ ] **Load-bearing** — name the harm a wrong value causes.
  - [ ] **Prose-only** — quote the *only* existing guard, and say which agent is asked to perform it.
  - [ ] **Measured non-binding** — cite a run where a prose check *of that class* was skipped. Not
        "could be": observed.

⚠️ **"It proves the framework is generic" is NOT an earning justification.** It is a benefit. The
rule would reject it standing alone, and §6 of the portability follow-up is worded in a way that
invites exactly that mistake.

## STEP 0b — Sweep the standing rules this work sits against *(≈10 min)*

The `asn` build violated a documented rule and **neither the author nor four specialists noticed**
for two days. Rules live away from the code they govern.

```bash
grep -rIn "never pre-built\|standing rule\|do NOT speculatively\|MUST NOT" \
  .claude/knowledge/pipelines/ .claude/knowledge/protocols/ | grep -iE "leaf|kind|checker|derivation"
```

- [ ] Read every hit. If your work contradicts one, **surface it and get a decision** — amend the
      rule or record an exception. Never absorb it silently.

## STEP 1 — Design decisions, before any code *(≈30 min)*

- [ ] **1a. Which classes does this kind even HAVE?** Do not assume it mirrors `cidr`. `vlan` has no
      minimality analogue, and proving the framework tolerates an *omitted* class is a real result.
- [ ] **1b. Is the relation the same direction?** ⚠️ It inverted between the first two kinds:

      cidr:  harvested ⊆ derived  ⇒ VIOLATION   (harvest = must not be swallowed)
      asn:   derived  ∈ harvested ⇒ REQUIRED    (harvest = the allowlist)

      The dangerous **harvester** error inverts with it — under-listing for `cidr`, **over**-listing
      for `asn`. State the direction in the code comment AND the protocol; it changes the harvester's
      incentive.
- [ ] **1b-ii. If the kind changes what a shared field's ABSENCE means, enumerate BOTH directions.**
      ⚠️ Earned the hard way: `ef2bf07d` made `harvestedCount` CIDR-only to stop an ASN-harvesting leg
      reading as a refusal — a false *park*. Correct. But it never asked what the NEW absence costs, and
      it opened a false *release*: an ASN-only harvest that genuinely refuses now stamps nothing, reads
      ABSENT, and clears. One commit, one direction examined, a day before anyone noticed
      (`cline_docs/follow-ups/asn-only-refusal-releases-2026-08-03.md`). Ask both: *what does a spurious
      PRESENT cost, and what does a new ABSENT cost?*

- [ ] **1c. Protocol 10 — is any proposed class a VERDICT?** "In an RFC-fixed set" is a fact. "…and
      therefore not yours" is a verdict resting on a claim you do not hold. **Ship facts; compute the
      verdict-shaped value and stamp it descriptively so it can be earned later.**
- [ ] **1d. What is the value's natural JSON type?** If it can arrive as a **number**, every
      `typeof x === 'string'` guard in the module is a fail-open. This is not hypothetical — see
      Step 2a.
- [ ] **1e. Does the value have more than one textual form?** (asdot vs asplain.) If so, canonicalise
      **at the transcription site**, so downstream comparison is plain equality.

## STEP 2 — Build, by layer

### 2a. Pure checker · `lib/agents/harness/derivation-containment.ts`

- [ ] Add the `kind` arm **before** the `unsupported` fallback. Leave the existing arms byte-identical.
- [ ] Add the reason(s) to the `ContainmentViolation.reason` union; add `kind` to the violation.
- [ ] Extend `HarvestedAllocation` **additively** (`asn?`, `vlan?`). Do **not** generalise to `value?`
      — the field names are the protocol contract and a live artifact corpus depends on them.
- [ ] Keep `kind?: string` **un-narrowed**, or the `unsupported[]` fail-loud path becomes
      unrepresentable.
- [ ] **Audit every emptiness test for falsy-but-legal values.** AS 0 is a reserved ASN *and* falsy;
      copying the `!h.cidr` idiom skips the one value the checker most needs.
- [ ] **No bitwise operators** unless the value provably fits 31 bits. `65535 << 16` is −65536.
- [ ] **Fix the transcription filter** if 1d applies. `derivedValues` filtering on
      `typeof === 'string'` silently dropped numeric ASNs — not even into `unsupported[]`.
- [ ] Per-kind `sameValue()` for `checkConsumedValues`. Bare `===` fails **open** on a missed match
      and **closed** on `65001 !== "65001"` — a spurious hard program block.
- [ ] ⚠️ **Any NEW FIELD must be NESTED under `derivationContainment`, never a sibling of it.**
      `pickResultJsonSummary` is a strict whitelist: a sibling is silently stripped at the hoist, so the
      field sits in the artifact, is invisible to the card, and reads ABSENT at the gate — inert on
      arrival, while a source reader would call it shipped. (boundary-contract G1, 2026-08-03; the
      whitelist's own docstring names this the recurring trap.)
- [ ] **Update the `containmentDisposition` arm** (`computeContainmentDisposition`). Your kind's
      violations flow into it automatically via `violations`, but ask: can this kind produce a state the
      leg tier **cannot decide** — one needing a program-tier judgement? If so it belongs in
      `needs-node-c`, not forced to `blocking`. And benign is an **allowlist**: a new `checked:false`
      reason that is not added there falls through to blocking, which is the safe default and probably
      what you want.

### 2b. Enrichment · `derivation-containment-enrichment.ts`

- [ ] **PREDICT: zero edits for the dispatch.** Prove it (Step 3).
- [ ] Note the **harvest precondition**: the checker is unreachable without a parseable harvest block.
      Fine for *relational* properties, a real limit for *unary* ones. If your kind has a unary
      property, decide and **document at the branch** — an accepted constraint nothing pins is
      indistinguishable from an oversight.

### 2c. Taxonomy · `scripts/seed-protocol-prompts.ts` — **assume it DOES need changing**

- [ ] `harvestedCount` is **CIDR-only** and the A7 rule keys BLOCKING on its presence. Any kind
      sharing `## Harvested Allocations` must keep it that way and extend `harvestedByKind`.
- [ ] Amend the PRESENT/ABSENT paragraph to key on **the kind the missing derivation would have been**.
- [ ] Version bump + changelog entry stating *why*, not just *what*.

### 2d. Protocol contract

- [ ] Harvest block gains the kind's entry shape; `kind` and `source` **required**.
- [ ] Derived block gains the kind; state which of `members`/`device` apply.
- [ ] 🔴 **Extend the CLOSED-set sentences — all three sites, or the protocols FORBID your kind.**
      Since 2026-08-11 the protocols state `kind` as a closed machine-matched set (`cidr` | `asn`)
      at THREE block definitions: network-provisioning §Phase 0 (`## Harvested Allocations`) and
      §Phase 1 (`## Derived Values`), and terraform-iac + kubernetes-gitops §Phase 2
      (`## Consumed Values` — one shared sentence, seeded twice). Added after the Tasman coined-kind
      incident: an Author's `exporter_aggregate_cidr` (value correct, byte-for-byte) stamped a false
      `consumed-value-mismatch` and parked a correct program, because `checkConsumedValues` compares
      within kind only. If you add a kind to the engine and not to these sentences, agents are
      instructed that emitting it is coining — the protocol contradicts the engine. Find the sites:

      ```bash
      grep -c "machine-matched literal from the CLOSED set" scripts/seed-protocol-prompts.ts   # expect 4
      ```

      (A bare `"CLOSED set"` grep returns 7 — the version-changelog comments match too. Proven at
      write time, 2026-08-11.) Your edit makes each of the 4 list your kind.
- [ ] 🔴 **STATE THE REQUIREMENT, NEVER THE MEASURE.** No pass conditions, no reason strings, no
      range tables, no expected values. Publishing the measure is what caused Run 15: the leg met the
      published bar while violating the requirement.
- [ ] Decide explicitly whether the **Reviewer** phase changes. Default **no** — a fourth prose check
      is worse than none in a codebase that has measured prose checks as non-binding.

### 2e. Rendering · `lean-card-facts.js` — ⚠️ **REWRITTEN 2026-08-03. The old advice was wrong.**

The first version of this step said *"PREDICT: no change"*. That prediction failed twice in one day, and
both failures were live gate defects:

- **A1** — `violations` rendered only on the `checked:true` branch, while `consumed-value-mismatch` is
  stamped only on `checked:false`. Mutually exclusive ⇒ **structurally unrenderable**. `cd8ad793` had
  been inert since it shipped, and its commit body claimed *"no new gate wiring"*.
- **F7** — `unsupported` rendered as a bare COUNT with identities stripped. VT-14 Run 23: Node C, told
  to verify an uncovered derivation, could not see WHICH value was uncovered, verified the nearest
  thing instead, and reported *"observed nothing anomalous"*.

- [ ] **Render WHAT, not just HOW MANY.** A count tells a reasoner something is wrong and denies it the
      subject. If your kind can appear in a list the gate reads, render its identity — the kind at
      minimum. Cap and dedupe; this line feeds a size-gated path.
- [ ] **Check the BRANCH, not just the field.** For every field your kind touches, ask: *on which
      branches of this render is it emitted, and on which branches is it stamped?* If those sets differ,
      the field is invisible exactly where it is stamped.
- [ ] **Write a COUPLING test, not just a fixture.** Assert the enrichment's write site and the card's
      read site stay paired — `W4` in `test-lean-card-facts.ts` is the model. Neither file was wrong in
      isolation for A1; the PAIRING was, and nothing tested it.
- [ ] **Absence needs a positive token.** Every segment on that line is conditional, so a missing field
      prints nothing and reads as clean. If your kind adds a fact the gate must not miss, render its
      absence explicitly (`… ABSENT ⇒ treat as blocking`).

### 2f. Tests

- [ ] Clean case · absent-from-harvest · each new class · **falsy-but-legal value** · unparseable →
      `unsupported[]` not silent pass · kind-less entry · cross-notation comparison.
- [ ] **Back-compat pin**: an existing-kind-only fixture must produce a **byte-identical** fact.
- [ ] **Mutation-verify every assertion.** Break the invariant; confirm *that* test fails.
      ⚠️ If a mutation produces **no output**, it did not compile — that proves nothing. Use a
      mutation that compiles.

### 2g. Docs — claim-staleness sweep

- [ ] `grep -rIl "<existing reason strings>"` across `.claude/` and `cline_docs/`. Distinguish
      **current-state claims** (fix) from **historical records** (leave).
- [ ] Prefer **pointing at the `reason` union** over re-enumerating classes. An enumeration in
      `PIPELINE-RUN-FORENSICS-GUIDE.md` had already gone stale by two classes before anyone looked.
- [ ] Update the paired specialist config **and** its discovery prompt.
- [ ] Re-run `bash scripts/audit-discovery-greps.sh` — **check the AUDITED COUNT, not just
      mismatches.** A backtick or semicolon in a comment silently removes a grep from the audit.

## STEP 3 — Prove the predictions *(the step v2 lacked)*

List every "no change required" claim and prove each **before** calling the build done:

| Prediction | How proved | Result |
|---|---|---|
| enrichment needs no edit | … | |
| lean card needs no edit | fixture | |
| taxonomy needs no edit | … | |

**A prediction that turns out wrong is the plan working**, not failing. v2 went 0-for-3 and each miss
was a real defect caught before it shipped.

## STEP 4 — Live validation, in two separable halves

- [ ] **Replay** (`scripts/replay-containment.ts`) — seconds, no rig. ⚠️ Cannot exercise a brand-new
      kind: no persisted artifact contains it yet. Use it to prove **no regression** on existing kinds.
- [ ] **Live run — the PASSING direction.** Does the harvester emit the kind? Does the value cross
      the edge? Does the check pass on legitimate values?
- [ ] **Live run — the BLOCKING direction.** ⚠️ **Separate, and usually harder.** It requires a
      failure the system will not produce on its own. See `scripts/verification/README.md`.
      Use `kind-inject.py --kind=<yours>` — it is generalised, not forked, precisely so the rounds
      cannot drift apart.
- [ ] ⚠️ **CHECK REACHABILITY BEFORE DESIGNING THE ROUND.** `checkDerivationContainment` — and therefore
      `unsupported[]` and every per-kind arm — is called **only when BOTH a harvest block and a derived
      block parse**. A leg with no parseable harvest routes to `harvest-block-missing-or-unparseable`
      and the consuming-leg exception instead, exercising a **different clause** while looking like it
      worked. VT-14 was proposed without this and would have tested nothing it claimed to (arch F6).
      **Target a leg whose harvest parses**, and prove it afterwards from `harvestedByKind` on the stamp.

**Do not conflate these.** `asn` was proven in the passing direction on its first run and remains
unproven in the blocking direction. A plan that says "live validation ✅" without the split is lying.

## STEP 5 — Done

- [ ] Every box ticked, or deferred **with a reason recorded in the plan**
- [ ] `tsc --noEmit` + affected suites green
- [ ] Traceability table: every review finding folded / deferred-with-reason / rejected-with-reason
- [ ] **Build log** recording deviations from the plan and *why*
- [ ] Register 06 updated if the build produced a new instance of a known pattern

---

## The eight things the first extension got wrong

Read once before starting. Every one was caught, but each cost time.

| # | What | Cost |
|---|---|---|
| 1 | Predicted "no enrichment change" — the taxonomy needed one | would have false-parked clean runs |
| 2 | Predicted "no taxonomy change" — `harvestedCount` was kind-blind | Run-14 false-park shape, via data shape |
| 3 | `typeof === 'string'` dropped numeric values silently | live fail-open |
| 4 | Bare `===` in the consumed comparison | fails open *and* closed |
| 5 | RFC range table written from memory | wrong; caught only by "verify at build time" |
| 6 | Guessed two grep counts (6, 3 → actual 11, 2) | third such miss in the project |
| 7 | Backtick/semicolon in a grep comment removed it from the audit | a check that stopped checking |
| 8 | Violated a standing rule nobody remembered | found by drift sweep, two days later |

**The pattern**: 1, 2, 5, 6 are all *asserting before checking*. 3, 4, 7 are all *a check that cannot
fail*. Both are Register 06 Pattern 1. This toolkit exists mainly to force the check that would have
caught each.

## What the SECOND day taught (2026-08-03) — mostly about the render step

The ASN kind shipped, then a five-specialist panel and two live rounds went looking. Four more, and
**three of them are in the one step this toolkit had marked "PREDICT: no change"**:

| # | What | How it was found |
|---|---|---|
| 9 | `violations` unrenderable on the `checked:false` branch — a whole violation class inert since it shipped, over a commit body that said *"no new gate wiring"* | a reviewer who **ran the function** on two inputs and compared bytes |
| 10 | `unsupported` rendered as a count with identities stripped — a reasoner told to verify what it could not name verified the nearest thing and reported nothing anomalous | a **live round** (VT-14); two reviewers had seen the field and both priced it LOW |
| 11 | A new field placed as a SIBLING of `derivationContainment` would be stripped by the summary whitelist — present in the artifact, absent at the gate | a boundary **trace**, asked for explicitly |
| 12 | `unsupported[]` is unreachable without a parseable harvest, so a round targeting the wrong leg tests a different clause | a reviewer checking **reachability** before the round ran |

**The lesson is narrower than "test more".** Every one of these lives at a *seam* — stamp→render,
render→gate, field→whitelist, injection→reachable code path. None is visible in the file you are
editing. The toolkit's per-layer steps push you to verify each layer; **9-12 say the layers are fine and
the JOINS are where the defects are.**

Concretely, for the next kind: after every layer change, ask *"what reads this, and on which branch?"*
— and answer it by running something, not by reading the file that writes it.
