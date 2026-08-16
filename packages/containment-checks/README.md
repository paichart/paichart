# @paichart/containment-checks

**Mechanical checks for LLM-derived infrastructure values.**

Your agent harvested live state and *derived* a value from it — a covering CIDR aggregate, a private
ASN. Did the derivation actually respect the ground truth? Check it **in code, against the harvest —
never against the package's restated copy of it.**

This library is extracted verbatim from [pAIchart](https://github.com/paichart/paichart)'s
production Tier-1 check (the arithmetic tier of its
[three-tier review model](../../verification/ARCHITECTURE.md)), where it exists because of a
specific, published failure: a derived `/30` that silently swallowed a pre-existing allocation
**passed three successive LLM reviewer tiers at rising confidence (88/92/94)** — the evidence needed
to catch it had been dropped upstream, and no reviewer noticed it was reasoning from claims. A later
adversarial round produced the successor failure mode: an author **fabricating** plausible evidence
that a reviewer faithfully consumed. The mechanical check is immune to both, because it anchors to
the harvest artifact itself. The full record, including the failed rounds:
[verification pack](../../verification/).

## The contract

- **Pure functions.** Text and structured data in, a fact out. No I/O, no framework, no
  dependencies — the module has zero imports.
- **Facts, not verdicts.** The output says *"checked these harvested values against these declared
  derivations; violations: […]"*. What to do about it is the consumer's decision. Absence or a
  parse failure yields `checked: false` with a reason — **never a fabricated pass, never a
  fabricated block**.
- **The honest miss is first-class.** Checks dispatch on a declared `kind`. A kind the engine does
  not implement is reported in `unsupported[]` — a value that was **not mechanically covered** must
  be treated as exactly that by the consumer, never counted as clean. (In pAIchart, an unsupported
  kind is escalated to a human-fed reviewer; VT-14 in the verification pack shows that path
  blocking a release over two green legs.)

## Implemented kinds

| `kind` | Relation checked | The dangerous harvester error |
|---|---|---|
| `cidr` | a harvested allocation **⊆** the derived aggregate and **∉** its declared members ⇒ violation (`covered-not-member`); plus minimality (`prefix-not-minimal`: the aggregate is wider than its members require) | **under-listing** — a missed allocation is a missed collision |
| `asn` | the derived AS number **∈** the harvested allowlist ⇒ required; plus private-range policy classification | **over-listing** — a spurious entry silently authorizes a value |

Note the relation **inverts** between kinds — for `cidr` the harvest is the thing that must not be
swallowed; for `asn` the harvest is the allowlist. The source doc-comment explains why, and why that
inversion changes what an attacker would target. Adding a kind (`vlan`, `port-range`,
`iam-policy`, …) means implementing its relation and its violation taxonomy — PRs welcome, see below.

## Usage

```ts
import {
  parseFencedJsonBlock,
  checkDerivationContainment,
  HARVESTED_ALLOCATIONS_MARKER,
  DERIVED_VALUES_MARKER,
} from '@paichart/containment-checks';

// 1. Parse the structured blocks out of the two artifacts (token-locked markers,
//    fenced JSON, null on miss — a prose mention never matches):
const harvested = parseFencedJsonBlock(harvestReport, HARVESTED_ALLOCATIONS_MARKER);
const derived   = parseFencedJsonBlock(designReport,  DERIVED_VALUES_MARKER);

// 2. Run the check — against the HARVEST artifact, never the package's copy:
const fact = checkDerivationContainment(harvested ?? [], derived ?? []);
// => { checked: true, violations: [...], unsupported: [...], counts: {...} }
//    or { checked: false, reason: '...' } — never a guess.

// 3. Consume the fact. Gate on it, render it, escalate it — that part is yours.
```

Also exported: consumed-value cross-checks for multi-leg DAGs (`checkConsumedValues`,
`isUpstreamContainmentGreen` — did the value cross the pipeline edge *intact*?), usage checks
(`checkDerivedValueUsage` — is the derived value actually *used* in the package, outside its own
declaration block?), and the CIDR/ASN primitives (`minimalCoveringPrefixLength`, `parseAsn`,
`asnPolicyClass`, `harvestCounts`).

## The disposition classifier

`computeContainmentDisposition(fact)` turns the raw fact into a three-state classification —
`blocking | benign | needs-node-c` — with its reason and the exact inputs it keyed on recorded in
the output, so a consumer can audit the call rather than trust it. This does not contradict
"what to do is the consumer's decision": the disposition is itself a deterministic fact (the same
inputs always classify the same way), and the third state is the point — **`needs-node-c` means
"a leg cannot honestly decide this; escalate to a judgement tier"**, which is a refusal to guess,
not a verdict. Design choices worth knowing before you consume it:

- **Fail-closed by construction**: violations dominate everything; an unrecognized reason is
  blocking; the consuming-leg discharge requires an *explicit* green upstream — absence never
  discharges.
- **Ambiguity escalates instead of asserting** (v0.2.0): a harvested pool with nothing derived is
  ambiguous between an audit-shaped objective and a real refusal — earlier versions asserted
  "refusal ⇒ blocking", which false-blocked legitimate non-deriving runs once the evidence blocks
  became a cross-domain contract. Now it classifies `needs-node-c`.
- **Empty is not absent** (v0.2.1): a pool that *parsed with zero entries* ("looked, nothing in
  scope") classifies benign with its own reason (`harvested-pool-empty`), distinct from
  no-block-parsed (`nothing-to-derive`) — so "the contract was followed" and "the contract was
  ignored" stay distinguishable even when both end green. The live round that proved this path,
  including the counterfactual false-block it retired:
  [VT-15](../../verification/tests/VT-15-cross-domain-evidence-contract.md).

## Test suite

```bash
npm install
npm test
```

The suite ships the **incident fixtures**: the RUN-3 shape (the exact defect three LLM tiers
approved) must yield its violation; the RUN-4 shape (fabricated package-side evidence) must yield
none — anchoring to the harvest is the property under test. Plus parser discipline, minimality,
ASN policy classes, consumed-value mismatch taxonomies, and the disposition classifier's fail-closed
pins (the rewritten refusal specimen, the consuming-leg discharge and both its fail-closed variants,
clause-1 dominance, the empty-vs-absent pool distinction). The runner self-checks that every
declared test executed.

## Scope and maintenance

This is a working artifact extracted from a production system, not a framework. The source of truth
is pAIchart's tree, mirrored here byte-identically and drift-checked; the roadmap is driven by what
the platform's verification rounds surface. Issues are welcome; PRs implementing new `kind`s are
gladly reviewed — a new kind should arrive with its relation stated, its violation taxonomy, and
incident-style fixtures.

One thing this library deliberately does **not** do: decide. It computes the fact. If you build a
release gate on it, keep the gate deterministic and keep confidence numbers out of it — the
[published calibration failure](../../verification/) that motivated that rule is worth reading
before you disagree.
