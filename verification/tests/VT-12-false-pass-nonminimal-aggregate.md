# VT-12 — A program self-certified `programReleasable: true` while shipping an authorization widening; five tiers passed it and the spec edit that was meant to help caused it

**Status**: DEFECT ROUND — the round FAILED and the failure is the finding. Fix VERIFIED on the real
artifact 2026-07-30 (replay, not a re-run). | Re-verify trigger: the next sequenced program run; a
`checkDerivationContainment` change; any edit to `requirements.md`'s numbered Node C checks.
**Run record**: `cms5koexu0003yxmbn5jywv52` &middot; 2026-07-29. Viewable in the platform by any account with access to the verification environment.
*(Back-filled 2026-08-05, identified from this document&rsquo;s own attribution of the false pass to **Run 15, 2026-07-29**, which the task title carries. Rounds before VT-13 predate the practice of citing the task id in the document itself.)*

**Layer**: program
**Round type**: functional (intended) → forensic audit (actual)

## Objective

The round intended to verify: *a correct sequenced network→terraform program self-certifies
(`programReleasable: true`) via the consuming-leg containment attribution, rather than parking as
Run 14 did.*

The run returned `programReleasable: true`. **That result was wrong on every path that matters**, and
this document records the falsification rather than the claim. Specifically ruled out by what follows:
that a green `programReleasable` implies a correct change package; that five independent tiers
constitute defence in depth when they share a blind spot; and that adding a clarifying clause to a
requirements document is a safe, additive act.

## Method

1. Rig rebuilt with a re-randomized exporter scatter (ceos1 `.3/.5/.29`, ceos2 `.19/.22/.30`) so the
   derived aggregate is genuinely runtime, per the T6 design rationale.
2. Program task created pinned to requirements commit `90c922f` (the T6.1 revision, which had added a
   consuming-leg containment-attribution clause).
3. Executed normally: Architect → plan gate → network gate → P1 (network-provisioning) → cloud gate →
   P2 (terraform-iac) → producer + Node C → PROGRAM SYNTHESIZE. Three human gates released in order.
   **No fault injected.** The defects below are what the system produced unaided.
4. Post-run: the derived values were read directly from the leg's artifact before writing this
   document. That read is what falsified the round — no tier reported anything wrong.

## Config

- Requirements: `program-artifacts/meridian-t6-sequenced/requirements.md` @ `90c922f` (iteration T6.1)
- Topology: `program-artifacts/meridian-t6-sequenced/topology.json` @ `90c922f`
- Protocol: `pov-program` v1.0.18; legs `network-provisioning`, `terraform-iac`
- Rig: 2-switch Arista cEOS (`ceos-lab`), LocalStack + read-only Terraform (`tf-lab`)

## Expected observables

A passing round produces ALL of:

- P1 (deriving leg): `derivationContainment { checked: true, violations: [] }`, and a derived aggregate
  whose prefix length **equals the minimal cover of its declared members** (Node C check 2b).
- P2 (consuming leg): `derivationContainment { checked: false }` carrying
  `upstreamContainment.green: true`.
- Node C: terminal `## VERDICT: APPROVED`, `Blocking issues: none`, with checks 1, 2, **2b**, 3 and 4
  each performed against retrieved values.
- Program: `programReleasable: true`, `qualityGate.outcome: approved`.
- The S3 policy's `aws:SourceIp` equals the derived aggregate verbatim and authorizes **exactly** the
  exporter addresses and nothing else.

## Results

**Run 15, 2026-07-29. `programReleasable: true`, `qualityGate.outcome: approved`, Node C
APPROVED / 0 blocking, confidence 88. Every gate green. Four defects.**

### D1 — a non-minimal aggregate shipped (authorization widening)

P1's derived block, verbatim:

```json
{ "kind": "cidr", "value": "10.99.0.8/30", "members": ["10.99.0.8/32", "10.99.0.9/32"] }
```

`.8`/`.9` are an aligned adjacent pair; their minimal cover is `10.99.0.8/31`. The shipped `/30` spans
`.8–.11`, so the bucket policy authorizes **4 addresses for 2 exporters** — `.10` and `.11` authorized
for nothing. The requirements name this case explicitly: *"A looser prefix (e.g. `/30` for an adjacent
pair) is a REJECT even though it covers no existing allocation."*

**It passed five tiers.** The Author produced it; the leg reviewer approved at 92; the mechanical
containment checker returned `checked:true, violations:[]` — **correctly**, because minimality was not
in its rule set and the other two violation classes are blind to this shape by construction
(containment held, membership held, nothing foreign was covered); Node C approved with 0 blocking; the
program gate self-certified.

### D2 — the check that would have caught D1 was displaced by the T6.1 clause

Requirements check **2b** IS the minimality recomputation. Node C's output reads:

> `## Requirement 2b: P2 derivationContainment + upstreamContainment State`

It renumbered the newly-added T6.1 clause into slot 2b and never performed the minimality
recomputation. (It did run checks 2 and 3 — covers-both-members, no-overlap.) **A prose insertion
evicted the sole guard against a defect class, and nothing structural objected.**

### D3 — Node C asserted a fact that did not exist

> *"upstreamContainment.green:true — this is the EXPECTED satisfied state per requirements T6.1"*

`upstreamContainment` was **absent from the artifact entirely**: the stamp's upstream lookup matched
`name = 'result.json'`, but a PIPELINE predecessor writes `pipeline-index.json`, so it silently
resolved nothing. Node C recited the requirements' expected state as an observation. Verification
theatre — the same class as the earlier round where a reviewer wrote correct binary expansions,
concluded "/31 ✓", and stamped VERIFIED-AGAINST-EVIDENCE.

### D4 — the verdict contradicted the deployed protocol

P2 stamped `no-derived-values-block`, which lands on the fail-safe clause: *"on a leg that plainly
derives (e.g. it packages an aggregate) … block unless Node C demonstrably caught and verified the
derivation."* The terraform leg **does** package an aggregate, and Node C demonstrably did not (D2).
The deployed text said BLOCK; the gate returned `true`.

### Root cause — the spec edit intended to help is what caused D1–D3

T6.1 added to Pipeline 1's objective: *"synthesis is expected to stamp
`{ checked: true, violations: [] }`"*. That is a machine-measurable success criterion **weaker than the
minimality requirement two bullets above it**, and a non-minimal `/30` satisfies it completely. The leg
hit the published measure and missed the real constraint; the same edit displaced the tier that would
have caught the difference (D2) and supplied the text Node C then recited (D3).

**We published the measure into the objective, and the measure became the target.**

### Also observed: the reason string is non-deterministic

The same consuming leg stamped `harvest-block-missing-or-unparseable` on Run 14 (its Author emitted a
`## Derived Values` block) and `no-derived-values-block` on Run 15 (it did not). Same protocol, same
objective, different run. Any gate logic keyed on that string alone is keyed on a coin flip.

### What was done

Minimality is now **mechanical**, not prose. `prefix-not-minimal` is a third violation class in
`checkDerivationContainment`, computed by common-prefix arithmetic (not adjacency — `.8`/`.9` need
`/31`, but `.1`/`.2` straddle a boundary and genuinely need `/30`).

**Verified by replay against Run 15's real artifact — no rig, seconds.** P1 flips from
`{checked:true, violations:[]}` to:

```json
{ "derived": "10.99.0.8/30", "minimalPrefixLength": 31, "reason": "prefix-not-minimal" }
```

and the gate's card reads `derivationContainment: checked, 1 violation(s)`, which the taxonomy blocks
unconditionally. **Run 15 would have been blocked.**

This was proved by replaying the shipping code against the persisted artifact rather than by re-running
the program — deliberately, since a re-run whose spec tells the tiers what to expect is how the round
failed in the first place.

## Conclusion

**The claim is NOT verified. The round is retained as a defect record.**

`programReleasable: true` on Run 15 must never be cited as evidence that the consuming-leg attribution
works, that the gate is sound, or that the change package was correct. The consuming-leg exception
**has still never fired**: Run 14 blocked (pre-change), and Run 15's `true` came from the gate's
judgement branch, against the protocol's own stated example, while `upstreamContainment` was absent.

What IS verified, live and on real data: the non-minimal aggregate is now caught mechanically
(replay above), and the defect requires no tier's judgement to detect.

Three findings generalize beyond this round:

1. **Five tiers are not defence in depth when they share a blind spot.** Minimality existed in exactly
   one place in the entire system — requirements check 2b — and one prose edit removed it. It was
   absent from the protocol (a single mention, as an example, in a different protocol's guidance),
   absent from Node C's standing obligations, and absent from the test corpus, which used a
   non-minimal aggregate as its canonical *valid* example in four fixtures. An earlier round's
   derivation was loose too, and nobody noticed.
2. **A requirements document is an input to the tiers, not just a description of intent.** Stating an
   expected value hands every tier an answer to recite; stating a machine pass-condition hands the
   producing leg a target weaker than its constraint. Publish acceptance *properties*.
3. **Scope-of-check was the day's dominant failure mode**, in code and in tests alike: a lookup matched
   the wrong artifact name; a version guard was pinned to a date and failed on the very next bump; a
   structural rewrite read the wrong object; a negative assertion matched the changelog entry
   documenting the thing it forbade. Every one was right in intent and wrong about where it looked.

## Enforcement

**Protocol / spec versions**

- `pov-program` **v1.0.19** — retires the self-contradicting `"plainly derives (e.g. it packages an
  aggregate)"` example at both sites (the deriving test is now *what the leg harvested*); requires
  Node C to distrust the requirements as well as the legs; forbids renumbering a numbered spec check.
- `requirements.md` **T6.2** — check numbers are fixed and a new clause may not take one; expected
  values are reference data, never evidence; Pipeline 1 no longer publishes the checker's pass
  condition; the enforcement-status overclaim is corrected.

**CI regression pins**

- `scripts/test-derivation-containment.ts` — 25 tests, incl. the RUN-15 shape (violation, minimal
  `/31`), the minimal aggregate for the same pair (clean), `/30` over `.8`+`.11` (clean — `/30` IS
  minimal for a straddling pair: the false positive this class must never produce), suppression on a
  broken premise, and null-on-empty arithmetic so "unknown" cannot be read as "minimal".
- `scripts/test-program-containment-taxonomy.ts` — 14 assertions over the protocol prose, all six
  mutations verified failable, incl. the reinstatement of the retired example in the protocol body.
- `scripts/replay-containment.ts` — runs the shipping enrichment against any real completed leg in
  seconds. **The specimens are the regression corpus**: Run 14 P2 and Run 15 P2 stamp *different*
  reason codes, so a single specimen is never sufficient evidence.

**Residual limitations, each with its trigger**

- **The consuming-leg exception has never fired.** Trigger to re-assess: the first run whose stamp
  carries `upstreamContainment.green: true`. Until then, release in this configuration is a documented
  human decision, not a machine verdict.
- **The blocking direction of the `derivationContainment` conjunct has no live validation.** No run has
  ever driven a child carrying a real containment violation and confirmed `programReleasable: false`
  *via that conjunct*. Requested 2026-07-18; still owed.
- **`no-derived-values-block` still resolves by judgement.** The mechanical discriminator exists and is
  currently discarded: the enrichment parses the harvest block and then ignores it in the no-derivation
  branch. Trigger: the next time this clause decides a run's outcome.
- **A displaced numbered check has no structural detection.** T6.2 and v1.0.19 forbid renumbering in
  prose; nothing verifies it. Trigger: any future edit to the numbered Node C checks.
