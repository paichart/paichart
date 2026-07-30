# VT-13 — the derivationContainment conjunct BLOCKS, and the block is attributable to that conjunct

**Status**: ⏳ **PRE-REGISTERED, NOT YET RUN.** Observables below were fixed and committed BEFORE
execution. Results section is deliberately empty. | Re-verify trigger: a change to
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

*Not yet run. To be completed at execution time, against the observables above — not retrofitted.*

## Conclusion

*Pending. The claim is currently **UNVERIFIED**; the blocking direction of the derivation conjunct has
no live evidence and has had none since the conjunct shipped on 2026-07-18.*

## Enforcement

**Protocol version**: `pov-program` v1.0.20.

**What already exists in CI** (these guard the *mechanism*; this VT guards the *behaviour*):

- `scripts/test-derivation-containment.ts` — 25 tests over the three violation classes, incl. the
  RUN-15 `prefix-not-minimal` shape and its false-positive guard.
- `scripts/test-program-containment-taxonomy.ts` — 15 string-pinned assertions over the Step-5
  taxonomy, all mutation-failable.
- `scripts/replay-containment.ts` — replays the shipping enrichment against any completed leg;
  confirmed that Run 15's P1 now yields `prefix-not-minimal` and would have blocked.

**Known residual, with trigger**: replay proves a violating stamp is *produced*; only this VT proves the
gate *acts* on it. Trigger to act: the first run in which any leg stamps a violation — that run must be
graded against this document, whether or not it was launched for this purpose.
