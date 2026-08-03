# VT-14 — an UNSUPPORTED kind degrades to "not mechanically covered", and the PROGRAM TIER acts on it

**Status**: 🔴 **OPEN — observables committed, round not yet run.** Written 2026-08-03, before execution.
| Re-verify trigger: any change to `checkDerivationContainment`'s kind dispatch, to the `unsupported[]`
producers, or to the `containmentDisposition` arm that maps `unsupported` to `needs-node-c`.
**Layer**: program
**Round type**: injected (a value of an unimplemented kind — see *Why this one must be injected*)

## Objective

`unsupported[]` is the spine of the `kind` design: **a kind nobody implemented degrades to *"we did not
check this"*, never to *"this is fine"*.** Map 08 states it in those words.

The **checker's** half is already proven — `scripts/test-derivation-containment.ts` carries
`test('unsupported kind reported, not guessed')` plus 11 more assertions. **Do not re-test that.**

What has never been observed is the **program tier** acting on it. The taxonomy says a non-empty
`unsupported` means the derivation was NOT mechanically covered, and since 2026-08-03 the stamped
`containmentDisposition` renders it as `needs-node-c` — *"it could not be decided mechanically and YOU
must decide, stating which fact you relied on."* **No run has ever produced a non-empty `unsupported`
for Node C to act on**, so that instruction has never been exercised. It is the only clause in the
22-clause taxonomy of which that is true (`cline_docs/reviews/pov-program-taxonomy-2026-08-03/`).

Explicitly ruled out by a pass:
- that `unsupported` is *reported* but the program releases anyway as if clean;
- that Node C treats `needs-node-c` as a synonym for benign, or as a synonym for blocking, rather than
  as an instruction to decide **and say what it relied on**;
- that the count reaches the gate while the *identities* do not, leaving Node C unable to name what it
  is being asked to verify (see **Known limitation** — this one is expected to FAIL and the failure is
  the finding).

## Why this one must be injected

The blocking direction of `unsupported` cannot be reached by waiting: it requires a derived value of a
kind the checker has no rule for, and every kind our legs emit (`cidr`, `asn`) *is* implemented. The
system cannot produce this state while working correctly.

So it is manufactured, under the standing rule (`copov15 scripts/verification/README.md`):

> **Inject the mistake, never the verdict.**

One entry of an unimplemented kind (`vlan`) is added to the leg's own `## Derived Values` block after
its reviewer has approved. Everything downstream is the shipping system: the parse, the dispatch, the
`unsupported[]` fallback, the disposition, the card, Node C.

## ⚠️ THE TRAP THIS ROUND MUST AVOID

**`unsupported[]` is only reachable when BOTH a harvest block and a derived block parse**
(`derivation-containment-enrichment.ts` — `checkDerivationContainment` is called only in that branch).
A leg that emits an unsupported kind with **no parseable harvest** lands on
`harvest-block-missing-or-unparseable` instead and routes into the **consuming-leg exception** — a
different clause entirely.

**So the injected round MUST target a leg whose harvest parses** (the cEOS network leg, which harvests
CIDRs). Inject into a consuming leg and the round exercises the wrong clause while looking like it
worked, and would be recorded as testing something it never touched.

*Found by `architectural-review-specialist` F6 during the 2026-08-03 taxonomy panel — after the round
had been proposed, and before it was run. It would have invalidated the round silently.*

## Expected observables

**Branch A — the injection lands (this VT's objective).** ALL of:

1. The leg's `pipeline-index.json` carries `derivationContainment.unsupported[]` non-empty, naming
   `kind: "vlan"`, with `violations: []` — the value is *uncovered*, not *violating*. Both matter: a
   violation would exercise BRANCH A of the taxonomy instead and prove nothing about this one.
2. `containmentDisposition.disposition === 'needs-node-c'` with
   `reason: 'unsupported-not-mechanically-covered'`, and `inputs.unsupportedCount >= 1`.
3. The lean card renders `containmentDisposition: needs-node-c (unsupported-not-mechanically-covered)`
   — the gate's actual read path.
4. **Node C does not silently release.** Its synthesis names the uncovered derivation and states what
   it relied on. `programReleasable: true` with no mention of the uncovered value is a FAIL of this VT
   regardless of what else is green — that is the "degrades to *this is fine*" failure the whole `kind`
   design exists to prevent.
5. The leg's own `qualityGate.outcome` is unaffected by the injection (the reviewer approved the good
   package before the edit) — so whatever the program does, it is attributable to the mechanical fact.

**Branch B — the injector does not fire.** Record honestly, VT stays open, round is CLEAN and must
never be recorded as testing this. (Runs 20 and 21 are on record that way.)

## Known limitation — expected to surface, and it is a finding not a defect of the round

`unsupported` reaches the card as a **count with its identities stripped** (`lean-card-facts.js` renders
`, N unsupported`; boundary-contract F7 / pipeline-harness F7, 2026-08-03). Observable 4 asks Node C to
say what it relied on — and the card cannot tell it *which* kind or value was uncovered. Node C would
have to fetch the artifact to answer properly.

**Prediction, recorded before the run**: Node C either (a) fetches and names it, or (b) reasons from the
count alone. If (b), that is the F7 gap made live, and the round's most valuable output.

## Method

1. Rigs up; verify by PROBE not banner (BGP Established with PfxRcd non-zero, both tunnels answering
   with the correct `serverInfo.name`).
2. Confirm the deployed protocol is **v1.0.28 or later** — earlier versions have no
   `containmentDisposition` and observables 2/3 do not exist.
3. Create the program task with a `PRE-FLIGHT CLEARANCE:` block. **Do not state the expected outcome,
   the kind, or a pass condition in the description** — VT-12 D2/D3 is the incident where a spec-stated
   expectation propagated through five tiers.
4. Arm `scripts/verification/kind-inject.py --kind vlan` against the program root **before launch**,
   scoped to that task id, targeting the **network** leg (the one whose harvest parses).
5. Release the plan gate on a settled roster, then the network gate. The injector fires after the leg's
   reviewer approves.
6. Release the IaC gate so every child reaches terminal — Node C cannot synthesize otherwise and
   observables 4/5 do not exist without it.
7. Record the outcome against the observables above, before interpreting it.

## Honesty rules

- The round is **labelled injected**, here and in the run's task description.
- If the injector does not fire, this is a **CLEAN round**, never a pass.
- Injection manufactures the **failure**, never the **pass**.
