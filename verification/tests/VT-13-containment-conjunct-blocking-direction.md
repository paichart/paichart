# VT-13 — the derivationContainment conjunct BLOCKS, and the block is attributable to that conjunct

**Status**: 🟡 **STILL OPEN after Run 16 (2026-07-31).** The round executed against the observables
below, which were fixed and committed BEFORE execution (`bf52160`). It landed on **Branch B** — no
violation occurred — so the blocking direction remains unverified. Run 16 must NOT be recorded as this
VT passing; it did, however, produce three other first-time live proofs (see Results). | Re-verify trigger: a change to
`checkDerivationContainment`'s violation classes, or to the pov-program Step-5 formula.
**Layer**: program
**Round type**: functional (uninjected — see *Why nothing is injected*)

## Objective

Verify the **blocking direction** of the program gate's derivation conjunct:

> a child pipeline whose `derivationContainment` lists a violation forces `programReleasable: false`,
> **via that conjunct** — not via `qualityGate.outcome`, not via a reviewer verdict, not via coverage.

Requested 2026-07-18 (architectural-review A7, note 2: *"add a VT that exercises the new program-tier
`derivationContainment` conjunct before trusting it"*). **Never written.** Every program run to date has
exercised only the PASSING direction, so the conjunct we most rely on to stop a bad release is the one
with no live evidence.

Explicitly ruled out by a pass:

- that a violation is *reported* but does not change the verdict;
- that the program blocks for an unrelated reason and the conjunct is credited afterwards
  (**attribution is the point**, not the boolean);
- that a violating leg is nonetheless stamped `qualityGate.outcome: approved` at its own tier and the
  program follows the leg rather than the mechanical fact.

## Why nothing is injected

The obvious method — plant a violating derived block — would test the plumbing while proving nothing
about whether the system *produces* violations that matter. It also risks the VT-12 failure: an
artifact that announces the expected outcome contaminates every tier that reads it.

Instead this round runs the **ordinary T6 sequenced objective, unmodified**, and relies on a fact
established by prior runs: the network Author has twice produced a **non-minimal** aggregate unprompted
(Run 15: `10.99.0.8/30` for members `.8/.9`; Run 4: `.4/30` for `.4/.5`). Since `prefix-not-minimal`
became a mechanical violation class (2026-07-30), that ordinary behaviour now populates `violations`.

⚠️ **`requirements.md` MUST NOT be edited to make either outcome more likely.** It runs against T6.2 as
committed. Stating an expected value or a machine pass-condition in the spec is what produced Run 15's
false pass (VT-12 D2/D3), and this round doubles as the first live test of T6.2's anti-contamination
rules.

**Consequence, accepted deliberately: this round may not reach its objective.** If the Author derives a
clean minimal aggregate, no violation exists and the blocking direction stays unverified — but the run
then exercises the *other* untested path (the consuming-leg exception firing with
`upstreamContainment.green: true`, which has also never happened). Both outcomes are informative; only
one closes this VT. **A clean run must NOT be recorded as VT-13 passing.**

## Method

1. Rebuild both rigs; **re-randomize the T6 exporter scatter** (`randomize-t6-seed.py --write`, then
   `containerlab deploy` — startup-configs apply only at deploy) so the derived aggregate is genuinely
   runtime.
2. Verify the live protocol reports **v1.0.20** and that its clause strings are present in
   `agent_prompt_library` — a green deploy proves the seed ran, not what it wrote.
3. Create a fresh `(protocol: pov-program)` PIPELINE task pinned to the current `requirements.md` +
   `topology.json` commit. No wording added about containment, minimality, or expected stamps.
4. Release the three human gates in order (plan → network → cloud), waiting for the full roster before
   releasing any.
5. Read the facts from structured sources only: each leg's `pipeline-index.json`
   (`derivationContainment`), the program root's `metadata` (`qualityGate`, `programReleasable`), and
   Node C's terminal `## VERDICT:` block.

## Config

- Requirements + topology: `program-artifacts/meridian-t6-sequenced/` (T6.2, pinned commit)
- Protocol: `pov-program` **v1.0.20**; legs `network-provisioning`, `terraform-iac`
- Rigs: 2-switch Arista cEOS (`ceos-lab`), LocalStack + read-only Terraform (`tf-lab`)
- Platform: `prefix-not-minimal` violation class live; `harvestedCount` and `upstreamContainment`
  stamped and rendered on the lean card

## Expected observables

**Branch A — a violation occurs (this VT's objective).** ALL of:

1. The deriving leg's `pipeline-index.json` carries `derivationContainment.checked: true` with
   `violations[]` non-empty, each entry naming its `reason` (`prefix-not-minimal` with
   `minimalPrefixLength`, or `covered-not-member`, or `member-not-covered`).
2. The lean card for that leg renders `derivationContainment: checked, N violation(s)` — the gate's
   actual read path.
3. Program root: `metadata.programReleasable: false`.
4. **Attribution**: the program's synthesis comment names the derivation conjunct as the limiting
   factor and identifies the offending leg + violation. A `false` produced only by a red
   `qualityGate.outcome` or a rejected Node C verdict does **not** satisfy this VT — the conjunct must
   be visibly load-bearing.
5. The violation is **not** waved through by a leg-level approval: even if the leg's own reviewer
   stamped `approved`, the program still blocks (the "leg approval is ADVISORY for derivation-class
   claims" rule).

**Branch B — no violation occurs.** Record honestly and mark this VT still open. Additionally capture,
since it has never been observed:

6. Whether the consuming leg's stamp carries `upstreamContainment.green: true` — the first live firing
   of the consuming-leg exception, if it happens.
7. Whether the derived aggregate is minimal (it should be — that is what "no violation" means here).

**Both branches.** The run must not contain evidence that any tier was told what to expect: no tier
should cite an expected reason code, stamp shape, or verdict from `requirements.md` as though it were
an observation (VT-12 D3). A recital is a finding regardless of the branch.

## Results

**Run 16, 2026-07-31** (program `cms86wtlb0007yxacoca6xlwv`, stage `VT-13: containment conjunct
blocking direction (Run 16)`, pinned to `bf52160`). Zero interventions beyond the three human gate
releases. **Branch B: no violation occurred.**

### The derivation was correct, and mechanically confirmed so

P1 derived `10.99.0.64/31` for members `.64`/`.65`. Those differ only in the final bit, so `/31` is
**exactly** the minimal cover — no looser, no unused addresses authorized. Stamp:

```json
{ "checked": true, "violations": [], "harvestedCount": 6, "derivedCount": 1 }
```

`prefix-not-minimal` was **armed** (shipped 2026-07-30) and returned clean, so this is a verified pass
rather than an unchecked one. Independently confirmed: no harvested allocation falls in `.64–.65`
(taken this build: ceos1 `.9/.27/.30`, ceos2 `.2/.8/.18`), and P2's policy authorizes
`aws:SourceIp = 10.99.0.64/31` — byte-identical to P1's value, no widening.

Program verdict: `programReleasable: true`, `qualityGate.outcome: approved`, Node C APPROVED / 0
blocking, confidence 90/92.

### Observable-by-observable

| Observable | Result |
|---|---|
| **A1–A5** (violation blocks, attributably) | ❌ **not exercised** — no violation occurred |
| **B6** — `upstreamContainment.green: true` | ✅ **FIRST LIVE FIRING** |
| **B7** — aggregate minimal | ✅ `/31`, mechanically confirmed |
| **Both branches** — no tier recites expected values as observed | ✅ **PASSED** |

### Three things proven live for the first time

1. **CC3 works end to end.** P2's stamp carried
   `upstreamContainment: { green: true, legs: [{ taskId: <P1>, checked: true, violations: 0 }] }`.
   This is the exact field whose absence made the whole consuming-leg fix inert on Run 15 — the
   chainer carried P1's stamp on the edge, the enrichment transcribed it, `green` computed correctly,
   and `legs` names the right predecessor.
2. **A7's `harvestedCount` rule decided a real run.** P2 stamped `no-derived-values-block` with
   **no** `harvestedCount` (it harvested Terraform state, so no CIDR block parsed) ⇒ nothing to derive
   ⇒ benign **by fact, not judgement**. That branch was pure LLM judgement until 2026-07-31.
3. **T6.2's anti-contamination rules held.** Node C quoted the lean card's REAL rendered values —
   `derivationContainment: NOT checked (no-derived-values-block)` and
   `upstreamContainment: green (1 leg)` — and named the ACTUAL stamped reason. It never mentioned
   `harvest-block-missing-or-unparseable`, the reason the spec's example describes. On Run 15 the same
   tier asserted `green:true` for a field absent from the artifact. It read the artifact this time.

### The consuming-leg exception STILL has not been the deciding branch

`upstreamContainment.green` was `true` and correct, but it was **not what made this leg benign** —
`harvestedCount` being absent was. The exception keyed on `green` lives on the
`harvest-block-missing-or-unparseable` clause, and P2 landed on the other reason string again.

**The reason string has now varied three runs running** for the same leg type: Run 14
`harvest-block-missing-or-unparseable` (Author emitted a `## Derived Values` block), Runs 15 and 16
`no-derived-values-block` (it did not). Anything keyed on that string alone is keyed on a coin flip.

### DEFECT FOUND — Node C did not perform the minimality check (again)

Grepped over Node C's full response: no `smallest`, no `minimal covering`, no `prefix length`, no
`2b`, **no numbered requirements at all**. It structured its review as its own sections 1–9 and simply
did not adopt the spec's numbering.

This is a **different failure from Run 15** — that one renumbered a new clause *into* slot 2b; this
one never used the scheme — with the **same outcome: no tier verified minimality**. T6.2's
"a numbered check may not be renumbered, merged or substituted" and v1.0.19's equivalent Node C rule
**did not take effect**: both forbid *displacing* a numbered check, and neither compels *adopting* the
numbering in the first place.

Minimality was nonetheless correct on this run, and correct *for a reason that does not depend on
Node C*: `prefix-not-minimal` is mechanical. **That is the finding.** The prose guard failed twice in
two runs; the arithmetic guard held. It also implies the remaining prose-only Node C checks (1, 2, 3,
4) are equally optional in practice — they happen to have been performed here, in Node C's own
numbering, but nothing enforces that they are.

## Conclusion

**The claim remains UNVERIFIED.** The blocking direction of the derivation conjunct has still never
fired on a live run, and has had no evidence since the conjunct shipped 2026-07-18. Run 16 is recorded
here as an honest Branch-B result, **not** as a pass.

What Run 16 DOES establish, live and uninjected: CC3's edge-carry and the `upstreamContainment` stamp
work end to end; A7's `harvestedCount` fact decides the no-derivation branch without judgement; and the
T6.2 anti-contamination rules changed Node C's behaviour in exactly the way they were written to.

What it also establishes, unwelcomely: **a numbered check in a requirements document is not binding on
a reviewer.** Minimality has now gone unverified by Node C on two consecutive runs, by two different
mechanisms. Only mechanisation held.

## Enforcement

**Protocol version**: `pov-program` v1.0.20.

**What already exists in CI** (these guard the *mechanism*; this VT guards the *behaviour*):

- `scripts/test-derivation-containment.ts` — 25 tests over the three violation classes, incl. the
  RUN-15 `prefix-not-minimal` shape and its false-positive guard.
- `scripts/test-program-containment-taxonomy.ts` — 15 string-pinned assertions over the Step-5
  taxonomy, all mutation-failable.
- `scripts/replay-containment.ts` — replays the shipping enrichment against any completed leg;
  confirmed that Run 15's P1 now yields `prefix-not-minimal` and would have blocked.

**Known residuals, each with its trigger**

- **The blocking direction is still unproven.** Replay proves a violating stamp is *produced*; only
  this VT proves the gate *acts* on it. Trigger: the first run in which any leg stamps a violation —
  that run must be graded against this document, whether or not it was launched for this purpose.
- **The consuming-leg exception has never been the deciding branch.** `upstreamContainment.green` has
  now fired correctly (Run 16) but the clause that consumes it did not apply, because the reason
  string landed elsewhere for the third run running. Trigger: the first run whose consuming leg stamps
  `harvest-block-missing-or-unparseable` **with** `green: true`.
- **A numbered requirements check is not binding on a reviewer** (Run 16 defect, above). The
  prohibition on displacing a check does not compel adopting the numbering. Trigger: any run where a
  prose-only Node C check materially decides an outcome — until then, treat every prose-only check as
  advisory and mechanise anything load-bearing.
