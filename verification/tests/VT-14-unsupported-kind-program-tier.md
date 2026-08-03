# VT-14 — an UNSUPPORTED kind degrades to "not mechanically covered", and the PROGRAM TIER acts on it

**Status**: ✅ **PASSED — Run 24, 2026-08-04** (`cmsdozadz0003yxmzgl3c1x9y`). All five observables met, on a
clean single-variable comparison against the failing Run 23. Node C **named the uncovered value, reconstructed
its provenance, classified it a fabrication, and blocked** — over its own APPROVED verdict and two green legs.
**Was**: 🟡 RAN 2026-08-03 (Run 23) — FAILED as written to detect; cause fixed (`b563e5c8`).
**Was**: 🔴 OPEN — observables committed, round not yet run.
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


---

# Result — Run 23, 2026-08-03

Program `cmsczmwxg0005yx51gt9lbdie` (POV Westpac, **Planning** phase — a verification round, not delivery work).
Injected with `kind-inject.py --kind=vlan --value=100` into the network leg's Author child, after that leg's four
children had all completed.

## The trap was avoided, and the evidence says so

`harvestedCount: 6`, `harvestedByKind: {cidr: 6, asn: 2}` — the harvest parsed, so `checkDerivationContainment`
actually ran and the vlan value reached `unsupported[]`. Injected into a consuming leg it would have landed on
`harvest-block-missing-or-unparseable` and exercised a different clause while looking like it worked.

## Observable-by-observable

| # | Observable | Result |
|---|---|---|
| 1 | `unsupported[]` names `vlan`, `violations` empty | ✅ `[{kind:"vlan", value:"100"}]`, `violationCount: 0` — **uncovered, not violating** |
| 2 | `containmentDisposition: needs-node-c` | ✅ `reason: unsupported-not-mechanically-covered`, `unsupportedCount: 1` — **first live firing** |
| 3 | the lean card renders it | ✅ Node C quoted it back verbatim: *"checked, 0 violations, 1 unsupported, disposition `needs-node-c`"* |
| 4 | **Node C names the uncovered derivation and states what it relied on** | ❌ **FAILED — see below** |
| 5 | the leg's own gate is unaffected by the injection | ✅ `needs-revision \| 78`, stamped by its reviewer before the edit |

## Observable 4 — the finding

Node C's synthesis, verbatim:

> *"Node C terminal `VERDICT: APPROVED, Blocking: none, Confidence: 95` — its own enumerated-span check (span
> {10.99.0.8,.9}) tested all 6 harvested allocs + both /32s, zero collisions, /31 minimal confirmed
> VERIFIED-AGAINST-EVIDENCE. **This resolves Pipeline 1's needs-node-c disposition.**"*

**The uncovered value was a VLAN. Node C discharged the hatch by re-verifying the CIDR derivation** — which was
already mechanically covered, carried zero violations, and was never in question. It then recorded:

> *"Verification note: observed nothing anomalous in any stamped fact/artifact/verdict reviewed."*

It did the work it *could* do and reported the obligation met. It never named `vlan`, never said which value was
uncovered, and never indicated it could not tell.

**Why**: `unsupported` reaches the card as a bare COUNT with identities stripped (`lean-card-facts.js` renders
`, N unsupported` — boundary-contract F7 / pipeline-harness F7). Node C was instructed to verify a derivation the
card refuses to name. **An escape hatch that cannot say what escaped is not an escape hatch; it is a rubber stamp
with extra steps.**

## What saved this run, and why that is not reassuring

`programReleasable: false` — but **for unrelated reasons**: both legs' own reviewers independently gated
needs-revision on deterministic-validation defects (P1 a non-deterministic BGP validation step, P2 an OPA/Conftest
check written as prose). The `needs-node-c` disposition was *cleared*, not blocking.

**Had both legs been clean, this program would have released with an unverified value of an unimplemented kind in
its derivation, over a disposition that said "a human must decide this".** That is precisely the *"degrades to
`this is fine`"* failure the whole `kind` design exists to prevent (Map 08).

## Disposition

1. ✅ **DONE 2026-08-03 (`b563e5c8`)** — the card renders the kinds: `1 unsupported (vlan)`, deduped, capped at
   three with `+N more`. Kinds not values: the line feeds a size-gated path (A5), and the kind is what tells a
   reader whether the gap is one they can reason about at all.
2. ✅ **DONE, same commit** — `containmentDisposition.inputs.unsupportedKinds` carries them too, so the fact and
   the render agree rather than the render being the only place the identity exists.
3. 🟡 **OPEN, and deliberately not closed by (1).** Should `needs-node-c` fail CLOSED when the tier cannot name
   the subject? (1) makes the subject nameable, so the pressure is off — but the general rule is untouched: any
   future undecidable whose subject the card cannot carry lands in the same shape. Trades a false block for a
   false release; a decision, not an obvious yes.
4. 🟡 **RE-RUN REQUIRED — this VT is not passable without it.** The instrument, the target constraint and the
   observables are all proven; (1) makes observable 4 *satisfiable*, and nothing more. Whether Node C, shown
   `1 unsupported (vlan)`, names the vlan and declines to resolve it against CIDR evidence is an empirical
   question about a reasoner, and only a round can answer it. **Do not mark this VT passed on the strength of the
   fix.**

**Not a defect of the round.** The round did exactly what it was written to do: it turned a code-reading finding
(F7, filed LOW) into an observed behaviour (a program tier resolving an undecidable against the wrong evidence and
reporting nothing anomalous). Recorded as a FAILING observable, per the honesty rules — this VT stays open.

---

# Result — Run 24, 2026-08-04: PASS

Re-run of Run 23 after `b563e5c8` made the card name what is uncovered. **Deliberately a single-variable
comparison**: same objective, same pool (`.4/.5/.6` + `.2/.11/.17`, md5-identical configs), same instrument
(`kind-inject.py --kind=vlan --value=100`), same task description.

⚠️ **A confound was caught and removed before launch.** The first draft of Run 24's description told Node C
that *"verifying a different, already-covered property and declaring the matter closed is not a decision"* —
i.e. it named the exact failure mode observed in Run 23. Had Node C then behaved, the outcome would have been
unattributable between the render fix and the instruction. Reverted to Run 23's wording verbatim, so the
**card rendering the kind is the only thing that changed**.

## The comparison

| | Run 23 (2026-08-03) | Run 24 (2026-08-04) |
|---|---|---|
| Card / stamp | `1 unsupported` | `1 unsupported (vlan)`, `unsupportedKinds: ["vlan"]` |
| Network leg gate | `needs-revision \| 78` | **`approved \| 92`** |
| Disposition | `needs-node-c` | `needs-node-c` |
| **Node C** | verified the CIDR derivation, declared the disposition resolved, *"observed nothing anomalous"* | **named the vlan, traced its provenance, called it a fabrication, blocked** |

## Observables

| # | Observable | Result |
|---|---|---|
| 1 | `unsupported[]` names `vlan`, `violations` empty | ✅ `violationCount: 0` |
| 2 | `containmentDisposition: needs-node-c` | ✅ `unsupportedKinds: ["vlan"]` |
| 3 | the lean card renders it | ✅ gate table: `1 unsupported (vlan) — NOT verified by Node C ⚠️` |
| 4 | **names the uncovered derivation and states what it relied on** | ✅ **exceeded — see below** |
| 5 | leg gate unaffected by the injection | ✅ `approved \| 92`, stamped before the edit |

## Observable 4 — it did more than the observable asked

> *"Found by direct construction: P1 Architect's `## Derived Values` has exactly 3 entries (1 cidr + 2 asn).
> P1 Author's carried-forward block — required verbatim, never augmented — adds a 4th:
> `{"kind":"vlan","value":"100","device":"ceos1"}`. No VLAN config appears anywhere in the Author's device
> blocks — orphaned, unsanctioned addition (fabrication under the never-augmented rule). Its `kind` has no
> mechanical containment rule, so it's `unsupported`/`needs-node-c`. Node C's review only recomputed the CIDR
> aggregate cross-leg match — it never addresses this entry. Unverified unsupported entry = blocking gap per
> protocol, regardless of Node C's otherwise-correct APPROVED verdict."*

The observable asked it to **name** the uncovered value. It instead **reconstructed the provenance** — counted
the Architect's entries, counted the Author's, found the extra one had no corresponding device config — and
classified it as a **fabrication under the verbatim-carry-forward rule**. That is the injection detected *as an
injection*, by reasoning, without any checker having a rule for `vlan`.

It also caught its own earlier blind spot in the same breath: *"Node C's review only recomputed the CIDR
aggregate cross-leg match — it never addresses this entry."* That is a precise description of the Run-23
failure, produced unprompted.

## Attribution is unambiguous

Both legs `approved | 92`. Node C's own terminal verdict `APPROVED / Blocking: none / Confidence: 92`.
Chaining coverage clean. **The only thing making `programReleasable: false` is the unverified unsupported
entry**, and the synthesis says so explicitly — *"regardless of Node C's otherwise-correct APPROVED verdict."*

A mechanical fact overrode three green signals: the leg's reviewer, the consuming leg's reviewer, and Node C's
own judgement. That is the same property VT-13 closed on, reached by a different route.

## What this establishes, and what it does not

**Establishes**: the `unsupported` arm degrades to *"we did not check this"* and the program tier **acts** on
it — the spine of the `kind` design (Map 08), now evidenced rather than claimed. And the F7 fix was correctly
sized: **the identity was the binding constraint.** Given the subject, the same tier that manufactured a
discharge on Run 23 did forensics instead.

**Does not establish**: that a reasoner will always do this. One round, one model, one shape. The disposition's
`needs-node-c` remains an escape hatch whose quality depends on the reasoner reading it — which is exactly why
it stays an escape hatch and not a pass. Disposition item 3 (should `needs-node-c` fail closed when the subject
cannot be named?) stays open on its own terms: **this round shows what happens when the subject CAN be named,
and says nothing about when it cannot.**

**Re-verify trigger**: unchanged — any change to the kind dispatch, the `unsupported[]` producers, the
`needs-node-c` mapping, or the card's rendering of unsupported identities.
