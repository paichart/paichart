/**
 * Derivation-containment validator — the MECHANICAL check that a derived value (e.g. a covering
 * CIDR aggregate) does not swallow any harvested pre-existing allocation beyond its declared
 * members.
 *
 * WHY (2026-07-17, runs 2-4 of the evidence-flow verification): a derived `/30` covering a seeded
 * allocation passed THREE LLM reviewer tiers (88/92/94) because the harvest enumeration died at
 * the leg-report boundary (runs 2/3); after the prompt-level evidence contract fixed that, run 4
 * surfaced the successor mode — an Author FABRICATED evidence entries and its reviewer faithfully
 * escalated against the invention. This validator is immune to both: it anchors to the HARVEST
 * child's own `## Harvested Allocations` block (ground truth), never the package's copy.
 *
 * Protocol 10: the output is a FACT (`derivationContainment` in pipeline-index.json) — "checked
 * these harvested allocations against these declared derivations; violations: [...]" — consumers
 * (Node C, the program gate, humans) decide. Absence/parse failure ⇒ `checked: false` + reason,
 * NEVER a block (the reviewer tier already blocks on missing evidence; the mechanical tier reports
 * — pipeline-harness-specialist ruling, GO-WITH-CHANGES@85, 2026-07-17).
 *
 * Violation semantics (specialist correction 2b): a legitimate aggregate covers its own members by
 * definition, so the check is `harvested H ⊆ derived.value AND H ∉ derived.members` — exactly the
 * seeded-`.3` shape runs 2/3 shipped. Without the members subtraction every valid aggregate would
 * false-positive.
 *
 * Generic-by-construction (specialist ruling 3): entries carry `kind`; only `"cidr"` is implemented
 * today (network-provisioning is the sole emitting protocol). Other kinds are reported in the
 * top-level `unsupported[]` array (the fact stays `checked: true` with the CIDR entries still
 * checked) rather than guessed at — consumers must treat a non-empty `unsupported[]` as
 * not-mechanically-covered, never as clean.
 *
 * PURE — no prisma/logger; text in, fact out. Parser discipline mirrors parse-verdict.ts
 * (token-locked headers, case-insensitive, last-match-wins, null-on-miss).
 */

export const HARVESTED_ALLOCATIONS_MARKER = '## Harvested Allocations';
export const DERIVED_VALUES_MARKER = '## Derived Values';
/**
 * Emitted by a CONSUMING leg's Author: the value(s) it took from §6 chained context and applied in
 * its package. Pairs with the upstream's `derivedValues` so "did the value cross the DAG edge
 * intact" becomes a comparison of two facts instead of a reviewer reading two reports.
 */
export const CONSUMED_VALUES_MARKER = '## Consumed Values';

/**
 * ⚠️ THE CONTAINMENT RELATION INVERTS BETWEEN KINDS (pipeline-harness review, 2026-08-02).
 * This block is an OBSERVATION LEDGER ("device X has this, per this command"), not a free-pool
 * inventory — the free pool is the complement and is never written down. Two kinds use it in
 * OPPOSITE directions:
 *
 *   cidr: harvested ⊆ derived  ⇒ VIOLATION   harvest = the thing that must not be swallowed
 *   asn:  derived  ∈ harvested ⇒ REQUIRED    harvest = the ALLOWLIST
 *
 * So the DANGEROUS HARVESTER ERROR inverts too: under-listing for cidr (a missed allocation is a
 * missed collision), OVER-listing for asn (a spurious entry silently authorizes a value). Stated
 * here because it changes the harvester's incentive, and nothing else in the code says it.
 *
 * CONSEQUENCE, and the bound on the whole anti-injection claim: containment moves the injection
 * target from the design to the HARVEST. The property holds exactly as far as "no attacker-supplied
 * value reached this block", and the harvester is an agent reading untrusted device output.
 * `source` is the mitigation — the protocol contract makes it mandatory for asn entries.
 */
export interface HarvestedAllocation {
  kind?: string;
  cidr?: string;
  /** asn entries. number or string; asdot must be QUOTED (see parseAsn). AS 0 is legal input. */
  asn?: number | string;
  device?: string;
  interface?: string;
  source?: string;
}

export interface DerivedValue {
  kind?: string;
  /** May arrive as a NUMBER for asn (JSON-natural). Canonicalized to asplain string downstream. */
  value?: string | number;
  members?: string[];
  /**
   * asn only. Which device this ASN is for — ASN containment is DEVICE-SCOPED (sec-ops F6): a
   * fabric-wide membership test lets one compromised device's ASN authorize another's.
   * ⚠️ v1 LIMIT: when absent, matching falls back to fabric-wide and the violation records
   * `deviceScoped: false` so the weaker check is visible rather than silent. The protocol contract
   * makes this mandatory for asn derivations — until then this is defence-by-accident.
   */
  device?: string;
}

/** RFC-fixed ASN classes. `public` is COMPUTED but never blocking — see asnPolicyClass. */
export type AsnPolicyClass =
  | 'reserved'       // RFC 7607 (AS 0), RFC 7300 (65535, 4294967295)
  | 'as-trans'       // RFC 6793 (23456)
  | 'documentation'  // RFC 5398
  | 'private-2byte'  // RFC 6996
  | 'private-4byte'  // RFC 6996
  | 'public';        // everything else — a FACT, deliberately not a violation

export interface ContainmentViolation {
  /** The harvested allocation swallowed by the derivation (covered-not-member). */
  harvested?: string;
  /** The declared member that falls OUTSIDE its own aggregate (member-not-covered). */
  member?: string;
  /** The derived value involved. */
  derived: string;
  /** The minimal prefix length that would have covered the declared members (prefix-not-minimal). */
  minimalPrefixLength?: number;
  /** misaligned-prefix only: the canonical (host-bits-masked) form of a malformed derived CIDR —
   *  the span every containment entry for that value was computed against. Stamped ONLY on
   *  misaligned entries (size discipline: aligned artifacts stay byte-identical). */
  canonical?: string;
  /** What the consuming leg declared it applied, when that matches nothing upstream derived. */
  consumed?: string;
  /** Which kind produced this violation. Present on non-cidr kinds; absent means cidr (legacy). */
  kind?: string;
  /** asn-reserved-range only: which RFC-fixed class the value fell in. */
  policyClass?: AsnPolicyClass;
  /** asn-not-member only: the device the derivation named, when it named one. */
  device?: string;
  /** asn-not-member only: false when the derivation named no device, so the check was fabric-wide. */
  deviceScoped?: boolean;
  /**
   * covered-not-member: a harvested allocation inside the aggregate but not declared a member
   *   (the run-2/3 widening shape).
   * member-not-covered: a declared member OUTSIDE the aggregate — an arithmetic error in the
   *   derivation itself (run-5 shape, 2026-07-17: design claimed 10.99.0.0/31 for members
   *   .1/.2; a /31 covers only .0-.1 — the leg reviewer caught it by recomputation; this class
   *   makes the catch mechanical and pre-review).
   * prefix-not-minimal: the aggregate COVERS its members correctly and swallows no harvested
   *   allocation, but is LOOSER than the minimal prefix covering those members — so it authorizes
   *   addresses no member uses (run-15 shape, 2026-07-29: 10.99.0.8/30 declared for members
   *   .8/.9, an aligned adjacent pair whose minimal cover is /31; the shipped S3 policy therefore
   *   authorized 4 addresses for 2 exporters). This is an authorization WIDENING that the other
   *   two classes cannot see: containment held, membership held, nothing foreign was covered.
   *   It passed the Author, the leg reviewer, this checker, Node C and the program gate.
   * consumed-value-mismatch: a CONSUMING leg applied a value that does not match ANY value its
   *   upstream actually derived — recomputation, transcription error, or a stale value from an
   *   earlier run. This is check 1 of the program acceptance criteria ("the policy value exactly
   *   equals the aggregate the network leg derived — the chained value, not a guess, not a
   *   recomputation"), which until 2026-07-31 rested entirely on a reviewer reading upstream prose.
   *   NOTE THE LIMIT: this compares what the leg SAYS it consumed against what upstream derived. It
   *   does not prove what went into the authored artifact — a leg could declare X and write Y. That
   *   residue is Node C's, and it is the same trust model `## Derived Values` has always had.
   * asn-not-member: a derived AS number that appears NOWHERE in the harvested set — i.e. it did not
   *   come from the devices. This is the anti-injection property: it asks about PROVENANCE, not
   *   plausibility, so it is unaffected by how persuasive the injected text was. Device-scoped when
   *   the derivation names a device (see DerivedValue.device).
   * asn-reserved-range: the value is in a range fixed by RFC that must never reach a device —
   *   reserved (0 / 65535 / 4294967295), AS_TRANS (23456), or documentation. This is set membership
   *   over constants, i.e. a FACT.
   *   ⚠️ DELIBERATELY NOT INCLUDED: "public therefore not yours". That is a VERDICT resting on an
   *   ownership claim we do not hold, and it would false-block every customer who peers with anyone —
   *   silently, for a whole class, inside an array whose documented meaning is "MECHANICAL DEFECTS
   *   FOUND" and which the program gate blocks on unconditionally. The class IS computed and stamped
   *   descriptively on derivedValues so the verdict can be EARNED from outcomes later (Protocol 10:
   *   ship the fact → it generates the data → earn the verdict). Panel 2026-08-02, arch F1 + sec-ops F5.
   */
  reason:
    | 'covered-not-member'
    | 'member-not-covered'
    | 'prefix-not-minimal'
    | 'consumed-value-mismatch'
    | 'asn-not-member'
    | 'asn-reserved-range'
    /**
     * derived-value-orphaned: the package DECLARES this value and then uses it nowhere —
     * no config block applies it, no validation step checks it, no rollback mentions it.
     * Contained-irrelevant: a legal value the change does not act on. Measured separation is
     * stark — legitimate derived values occur 8-19 times across a package, injected ones
     * exactly once (their own declaration). Mechanises the reasoning Node C did by hand on
     * Run 24. It is an authoring slip far more often than an attack, so the FACT is
     * "declared and unused", never "malicious".
     */
    | 'derived-value-orphaned'
    /** misaligned-prefix: a derived CIDR whose address carries non-zero host bits under its own
     *  declared length (10.99.0.4/29 — a valid /29 starts on an 8-boundary). MALFORMED: deployed
     *  semantics mask host bits, so two readers can honestly compute two different spans from the
     *  literal (run-1 2026-08-17: checker canonical .0-.7 vs Node C literal .4-.11 — disjoint
     *  collision narratives in one record). The entry names the canonical form (`canonical`) so
     *  every containment fact for the value reads against ONE declared span. Derived values only. */
    | 'misaligned-prefix';
}

export interface DerivationContainmentFact {
  checked: boolean;
  /** Present when checked=false — why the check could not run. */
  reason?: string;
  /** Ids/labels of the sources actually read (forensics; set by the enrichment caller). */
  harvestSource?: string;
  derivedSource?: string;
  harvestedCount?: number;
  /**
   * Per-kind harvest census. `harvestedCount` above is CIDR-ONLY and is the A7 deriving test; this
   * carries the kinds it deliberately excludes, so the taxonomy can key on the kind the missing
   * derivation would have been rather than on a kind-blind total (ph F1, 2026-08-02).
   */
  harvestedByKind?: Record<string, number>;
  derivedCount?: number;
  /**
   * The derived VALUES themselves, transcribed from the parsed `## Derived Values` block (2026-07-31).
   *
   * WHY: `derivedCount` told a consumer that a derivation happened, never WHAT it was — so the
   * authoritative value never crossed the DAG edge as a fact. Node C's check 1 ("the terraform policy's
   * value exactly equals the aggregate the network leg derived — the chained value, not a guess, not a
   * recomputation") was therefore the only correctness check in the chain resting entirely on a
   * reviewer reading the upstream leg's PROSE. Minimality (check 2b) went unperformed on two
   * consecutive runs by two different mechanisms, so "a reviewer will do it" is not an assumption this
   * codebase can carry.
   *
   * CC3 carries the whole containment object on the chaining edge, so putting the value here makes it
   * travel to every downstream consumer for free — no new plumbing.
   *
   * KEPT SMALL DELIBERATELY (kind+value only, no members/provenance): this object nests inside
   * `derivationContainment`, which sits at the TAIL of result.json and is ordered early in
   * RESULT_JSON_SUMMARY_KEYS precisely to survive head-slice truncation. A field that exists to be
   * readable must not be the thing that pushes the fact past the cut.
   */
  derivedValues?: Array<{ kind: string; value: string }>;
  violations?: ContainmentViolation[];
  /** Entries skipped because their kind has no checker yet. */
  unsupported?: Array<{ kind: string; value?: string }>;
}

/** One `report.md` predecessor's stamped containment, transcribed for attribution. */
export interface UpstreamContainmentLeg {
  taskId: string;
  checked: boolean;
  violations: number;
}

/** A value a CONSUMING leg declares it took from chained context and applied. */
export interface ConsumedValue {
  kind?: string;
  value?: string;
}

/**
 * Compare what a CONSUMING leg says it applied against what its upstream actually derived.
 *
 * This is program acceptance check 1 — "the policy value exactly equals the aggregate the network leg
 * derived (the chained value, not a guess, not a recomputation)" — made mechanical. Until 2026-07-31
 * it was the ONLY correctness check in the sequenced chain resting entirely on a reviewer reading the
 * upstream leg's prose, and check 2b went unperformed on two consecutive runs by two different
 * mechanisms.
 *
 * Semantics: EVERY consumed value must match SOME upstream derived value. Not the reverse — an
 * upstream may derive several values and a consumer legitimately apply only one.
 *
 * CIDR comparison is by RANGE, not string, so `10.99.0.64/31` and an equivalent spelling agree while
 * `10.99.0.64/30` (a widening) does not. Non-cidr kinds fall back to exact string equality; a kind
 * mismatch is a mismatch, because "the same value under a different kind" is not the same value.
 *
 * Empty consumed list ⇒ no violations. Absence is NOT evidence of a mismatch: a leg that declares
 * nothing may simply not consume, and manufacturing a violation from silence would fire on every
 * non-consuming leg. What absence costs is coverage, and that is recorded as a fact by the caller.
 *
 * PURE.
 */
export function checkConsumedValues(
  consumed: ConsumedValue[],
  upstreamDerived: Array<{ kind: string; value: string }>
): ContainmentViolation[] {
  const violations: ContainmentViolation[] = [];
  if (!Array.isArray(consumed) || consumed.length === 0) return violations;
  if (!Array.isArray(upstreamDerived) || upstreamDerived.length === 0) return violations;

  for (const c of consumed) {
    if (typeof c?.value !== 'string' || c.value.length === 0) continue;
    const cKind = c.kind ?? 'cidr';
    const matched = upstreamDerived.some(d => {
      if ((d.kind ?? 'cidr') !== cKind) return false;
      return sameValue(cKind, c.value as string, d.value);
    });
    if (!matched) {
      violations.push({
        reason: 'consumed-value-mismatch',
        consumed: c.value,
        // Non-cidr kinds are stamped (type contract: absent means cidr). Load-bearing for the
        // coined-kind case (Tasman, 2026-08-11): the consumed VALUE matched upstream byte-for-byte
        // but its kind ('exporter_aggregate_cidr') matched nothing, and without the kind on the
        // record the violation read as self-contradictory — the value visibly present in `derived`.
        ...(cKind !== 'cidr' ? { kind: cKind } : {}),
        // The upstream value(s) this SHOULD have matched — named so the finding is actionable
        // without a second retrieval.
        derived: upstreamDerived.map(d => d.value).join(', '),
      });
    }
  }
  return violations;
}

/**
 * The consuming-leg attribution predicate (2026-07-29, Run-14 false park).
 *
 * TRUE iff at least one `report.md` predecessor MACHINE-CHECKED a derivation cleanly AND no
 * predecessor carries a violation. Both halves are load-bearing:
 *  - the `some` half is what distinguishes a legitimate CONSUMER (downstream of a real derivation)
 *    from a DERIVING leg whose own CIDR harvest is genuinely broken — both stamp the same reason
 *    (`harvest-block-missing-or-unparseable`), and only the former has a clean deriving upstream;
 *  - the `every` half is ALL-predecessors, deliberately NOT "at least one": with two upstreams, a
 *    clean sibling must never mask one carrying a violation.
 *
 * Empty input ⇒ false (fail closed): no upstream evidence is not evidence of a clean upstream.
 *
 * PURE. Protocol 10: the caller stamps this alongside the transcribed legs, so a consumer can
 * always re-derive it from the same facts rather than trusting the boolean.
 */
export function isUpstreamContainmentGreen(legs: UpstreamContainmentLeg[]): boolean {
  if (!Array.isArray(legs) || legs.length === 0) return false;
  return legs.some(l => l.checked && l.violations === 0) && legs.every(l => l.violations === 0);
}

/**
 * Extract the LAST fenced ```json block that appears after the given `## Header` marker
 * (case-insensitive header match; last-match-wins mirrors parse-verdict/parse-confidence — a
 * corrected re-statement supersedes an earlier one). Returns null when the header or a parseable
 * fenced JSON array is absent — callers translate null into `checked:false`, never a fabricated
 * empty list.
 */
export function parseFencedJsonBlock<T>(text: string | null | undefined, marker: string): T[] | null {
  if (!text) return null;
  // Heading-tolerant marker match (run-6 finding, 2026-07-18): agents render the mandated
  // heading with cosmetic variance — `**Derived Values** (quoted verbatim…)` instead of
  // `## Derived Values` — and the token-locked match left the validator BLIND to a block that
  // contained the exact member-not-covered error it exists to catch. Accept the marker phrase
  // at the start of a line, preceded only by heading/emphasis furniture (#, *, _, >, spaces);
  // a mid-sentence prose mention ("the derived values are…") still does NOT match.
  const phrase = marker.replace(/^#+\s*/, ''); // marker constants carry the '## ' form
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(`^[#>\\s*_]*${esc}`, 'gim');
  let lastIdx = -1;
  for (let m = headingRe.exec(text); m !== null; m = headingRe.exec(text)) {
    lastIdx = m.index;
  }
  if (lastIdx === -1) return null;
  const after = text.slice(lastIdx);
  // First fenced block after the header: ```json ... ``` (json tag optional; tolerate ```JSON)
  const fence = after.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1]);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      /* fall through to the fence-inversion arm */
    }
  }
  // Fence-inversion fallback (FW-A3.4 live incident, 2026-08-22): the agent opened the ```json
  // fence ONE LINE BEFORE the heading, swallowing the marker INSIDE the fence — so the first
  // ``` after the marker is the CLOSING delimiter and the primary path sees no block (or parses
  // the wrong span). Third live shape of the same format-variance class (R1 absent, R3 heading
  // nested, R4 fence inverted) — corpus-earned per the mechanical-net second-path rule. Detect
  // it structurally: an ODD count of fence delimiters before the marker means the marker sits
  // inside an open fence; the JSON is then the span from the end of the marker's line to that
  // fence's closing ```.
  const fenceOpensBefore = (text.slice(0, lastIdx).match(/^\s*```/gm) || []).length;
  if (fenceOpensBefore % 2 === 1) {
    const markerLineEnd = after.indexOf('\n');
    if (markerLineEnd !== -1) {
      const inFence = after.slice(markerLineEnd + 1);
      const close = inFence.match(/^([\s\S]*?)\n\s*```/);
      if (close) {
        try {
          const parsed = JSON.parse(close[1]);
          if (Array.isArray(parsed)) return parsed as T[];
        } catch {
          /* fall through to null */
        }
      }
    }
  }
  return null;
}

/**
 * Parse an AS number to its canonical numeric form. Null on anything unparseable — NEVER 0, because
 * 0 is a legal (and reserved) ASN and conflating them would hide the one value the range check most
 * needs to see (RFC 7607).
 *
 * ⚠️ NO BITWISE OPERATORS ANYWHERE IN THE ASN PATH. 4-byte ASNs exceed 31 bits, so the `>>> 0` /
 * `<<` idioms used by cidrRange() a few lines below are WRONG here: `65535 << 16` is -65536 and
 * `4294967295 | 0` is -1. They are safe for IPv4 and unsafe for this. (4294967295 is well under
 * MAX_SAFE_INTEGER, so plain arithmetic is correct and BigInt is unnecessary.)
 *
 * ⚠️ UNQUOTED ASDOT IS LOSSY, NOT MERELY AMBIGUOUS. `JSON.parse('{"asn":1.10}')` yields 1.1, so
 * asdot 1.10 (=65546) and 1.1 (=65537) become the SAME JSON value and the low half is unrecoverable
 * after parse. A non-integer number is therefore REJECTED rather than coerced. Quoted asdot
 * ("1.10") is accepted and converted; the protocol contract mandates asplain regardless.
 */
export function parseAsn(value: unknown): number | null {
  if (typeof value === 'number') {
    // Reject the lossy unquoted-asdot case, plus NaN/Infinity.
    if (!Number.isInteger(value)) return null;
    return value >= 0 && value <= 4294967295 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length === 0) return null;
  // asdot: <high>.<low>, each 0-65535 → high * 65536 + low
  const dot = s.match(/^(\d{1,5})\.(\d{1,5})$/);
  if (dot) {
    const hi = Number(dot[1]);
    const lo = Number(dot[2]);
    if (hi > 65535 || lo > 65535) return null;
    return hi * 65536 + lo;
  }
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 4294967295 ? n : null;
}

/** Canonical wire form for an ASN: asplain, as a string (matches derivedValues' string contract). */
export function asnToCanonical(value: unknown): string | null {
  const n = parseAsn(value);
  return n === null ? null : String(n);
}

/**
 * Classify an ASN against the ranges fixed by RFC. Null when unparseable — "unknown" must never be
 * mistaken for "fine" (same discipline as minimalCoveringPrefixLength returning null on empty).
 *
 * Anything outside the named ranges is `public`, which covers every gap by construction — there is
 * no unallocated hole to enumerate and get wrong.
 */
export function asnPolicyClass(value: unknown): AsnPolicyClass | null {
  const n = parseAsn(value);
  if (n === null) return null;
  if (n === 0 || n === 65535 || n === 4294967295) return 'reserved';     // RFC 7607 / RFC 7300
  if (n === 23456) return 'as-trans';                                    // RFC 6793
  if ((n >= 64496 && n <= 64511) || (n >= 65536 && n <= 65551)) return 'documentation'; // RFC 5398
  if (n >= 64512 && n <= 65534) return 'private-2byte';                  // RFC 6996
  if (n >= 4200000000 && n <= 4294967294) return 'private-4byte';        // RFC 6996
  return 'public';
}

/** The RFC classes that must never reach a device. `public`/private are NOT here — see the union. */
const ASN_BLOCKING_CLASSES: ReadonlySet<AsnPolicyClass> = new Set<AsnPolicyClass>([
  'reserved',
  'as-trans',
  'documentation',
]);

/** Parse an IPv4 CIDR (or bare address = /32) into a numeric range. Null on malformed input. */
function cidrRange(cidr: string): { lo: number; hi: number } | null {
  const m = String(cidr).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/);
  if (!m) return null;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  if (octets.some(o => o > 255)) return null;
  const len = m[5] === undefined ? 32 : Number(m[5]);
  if (len > 32) return null;
  // >>> 0 keeps unsigned arithmetic
  const addr = (((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0);
  const mask = len === 0 ? 0 : ((0xffffffff << (32 - len)) >>> 0);
  const lo = (addr & mask) >>> 0;
  const hi = (lo | (~mask >>> 0)) >>> 0;
  return { lo, hi };
}

/**
 * misaligned-prefix helper (run-1 2026-08-17 class — review misaligned-prefix-class-2026-08-19):
 * a derived CIDR whose literal address carries non-zero host bits under its own declared length
 * (`10.99.0.4/29` — a /29 must start on an 8-boundary). Returns the CANONICAL dotted-quad form
 * (host bits masked — the value's meaning on the wire: BGP/route installation mask host bits),
 * or null when aligned / bare-address / unparseable. Bare addresses are /32 and cannot misalign.
 */
function misalignedCanonical(value: string, range: { lo: number; hi: number }): string | null {
  const m = String(value).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) return null;
  const addr = (((Number(m[1]) << 24) | (Number(m[2]) << 16) | (Number(m[3]) << 8) | Number(m[4])) >>> 0);
  if (addr === range.lo) return null;
  const lo = range.lo;
  return `${(lo >>> 24) & 255}.${(lo >>> 16) & 255}.${(lo >>> 8) & 255}.${lo & 255}/${m[5]}`;
}

/** True when range A is entirely inside range B. */
function within(a: { lo: number; hi: number }, b: { lo: number; hi: number }): boolean {
  return a.lo >= b.lo && a.hi <= b.hi;
}

/**
 * The MINIMAL prefix length that covers every declared member — i.e. the number of leading bits all
 * member ranges share, floored by the widest member's own prefix (a /24 member can never be covered
 * by anything tighter than /24).
 *
 * Returns null when no member parses, so the caller cannot mistake "unknown" for "minimal".
 *
 * WHY (run 15, 2026-07-29): an aggregate can cover its members, swallow no harvested allocation, and
 * still be LOOSER than necessary — `10.99.0.8/30` for members `.8/.9`, whose minimal cover is `/31`.
 * The extra addresses are authorized for nothing. Neither covered-not-member nor member-not-covered
 * can see this: both are satisfied. It shipped past five tiers.
 *
 * Computed on RANGES, not strings, so `.8` and `.8/32` behave identically — and by common-prefix
 * arithmetic rather than adjacency, because adjacency is the trap (`.1`/`.2` are adjacent but straddle
 * a /31 boundary, so their minimal cover is /30 — see the RUN-5 fixture).
 */
export function minimalCoveringPrefixLength(members: string[]): number | null {
  const ranges = members.map(cidrRange).filter((r): r is { lo: number; hi: number } => r !== null);
  if (ranges.length === 0) return null;
  const lo = ranges.reduce((a, r) => Math.min(a, r.lo), ranges[0].lo) >>> 0;
  const hi = ranges.reduce((a, r) => Math.max(a, r.hi), ranges[0].hi) >>> 0;
  // Leading bits shared by the lowest and highest address in the span. Everything between them
  // shares those bits too, so this is exactly the minimal covering prefix.
  const diff = (lo ^ hi) >>> 0;
  if (diff === 0) return 32;
  return Math.clz32(diff);
}

/**
 * Per-kind equality for the consumed-vs-derived comparison.
 *
 * WHY NOT `===` (types-system review, 2026-08-02): bare string equality was wrong in BOTH
 * directions for asn. It fails OPEN when two spellings of the same ASN should have matched and
 * didn't get compared numerically, and it fails CLOSED on `65001 !== "65001"` — a spurious
 * `consumed-value-mismatch`, which the program gate blocks on unconditionally. A false hard block on
 * the ordinary cross-notation case is the worse of the two.
 *
 * asn values are already canonicalized to asplain at the derivedValues transcription site, so this
 * normalizes the CONSUMED side to match. Unknown kinds keep exact string equality — deliberately
 * conservative: "the same value under a different kind" is not the same value.
 */
function sameValue(kind: string, a: string | undefined, b: string | number | undefined): boolean {
  if (kind === 'cidr') return sameRange(a as string, b as string);
  if (kind === 'asn') {
    const ca = asnToCanonical(a);
    const cb = asnToCanonical(b);
    return ca !== null && cb !== null && ca === cb;
  }
  return a === b;
}

/**
 * Split a parsed harvest block into the counts the taxonomy reads.
 *
 * WHY THIS EXISTS (pipeline-harness review F1, 2026-08-02). `harvestedCount` was `harvested.length`
 * — every entry of every kind — and the A7 taxonomy turns its PRESENCE into the DERIVING TEST:
 * "present ⇒ the leg harvested an address pool and emitted no derivation ⇒ it REFUSED ⇒ BLOCKING".
 * Once ASN entries share the block, a leg that harvests ASNs and derives nothing (a BGP audit, or
 * any leg whose objective is not address-shaped) would stamp `harvestedCount: 3` and be classified
 * a refusal — a FALSE `programReleasable: false` on a clean run. That is the Run-14 false-park
 * shape, re-created by a data-shape change rather than a reason-string one.
 *
 * So `harvestedCount` stays **CIDR-ONLY**, which is byte-identical for every artifact ever written
 * (no protocol has emitted a non-cidr harvest entry), and `harvestedByKind` carries the rest.
 *
 * ABSENT vs ZERO is preserved, and extended by exactly one case:
 *   - parsed, cidr entries present      → count  (unchanged)
 *   - parsed, block genuinely EMPTY     → 0      (unchanged — it looked, and found nothing)
 *   - parsed, ONLY non-cidr entries     → ABSENT (new — this leg harvested no address pool at all,
 *                                          so the address-derivation test does not apply to it)
 */
export function harvestCounts(harvested: HarvestedAllocation[]): {
  harvestedCount?: number;
  harvestedByKind?: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  for (const h of harvested) {
    const k = h.kind ?? 'cidr';
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const cidr = byKind.cidr ?? 0;
  const onlyNonCidr = harvested.length > 0 && cidr === 0;
  // Stamp the census ONLY when a non-cidr kind is present. On a cidr-only run it would be pure
  // redundancy (harvestedByKind.cidr === harvestedCount) on an object that is deliberately kept
  // small to survive head-slice truncation — and it would break byte-identical back-compat for
  // every artifact written to date. The back-compat fixture caught this.
  const hasNonCidr = Object.keys(byKind).some(k => k !== 'cidr');
  return {
    ...(onlyNonCidr ? {} : { harvestedCount: cidr }),
    ...(hasNonCidr ? { harvestedByKind: byKind } : {}),
  };
}

/** Render a possibly-numeric value as text without inventing one for null/undefined. */
function asText(v: unknown): string | undefined {
  return v === null || v === undefined ? undefined : String(v);
}

/**
 * The `asn` arm. Two independent properties, deliberately kept separate:
 *
 *  1. asn-not-member  — PROVENANCE. The derived ASN must appear in the harvested set. This is the
 *     anti-injection property; it asks where the value came from, not whether it looks plausible.
 *     DEVICE-SCOPED when the derivation names a device (sec-ops F6) — a fabric-wide test would let
 *     one compromised device's ASN authorize another's.
 *  2. asn-reserved-range — an RFC-fixed class that must never reach a device. Set membership over
 *     constants, i.e. a fact. `public` is NOT blocking; see ContainmentViolation.reason.
 *
 * ⚠️ AS 0 IS FALSY AND IS RESERVED (RFC 7607). Every emptiness test here is an explicit
 * null/undefined check, never truthiness — copying the `!h.cidr` idiom used by the cidr arm would
 * silently skip the one value the range check most needs to see.
 */
function checkAsnDerivation(
  d: DerivedValue,
  harvested: HarvestedAllocation[],
  violations: ContainmentViolation[],
  unsupported: Array<{ kind: string; value?: string }>
): void {
  const canonical = asnToCanonical(d.value);
  if (canonical === null) {
    // Unparseable (incl. the lossy unquoted-asdot case) — reported, never silently passed.
    unsupported.push({ kind: 'asn', value: asText(d.value) });
    return;
  }

  const cls = asnPolicyClass(canonical);
  if (cls !== null && ASN_BLOCKING_CLASSES.has(cls)) {
    violations.push({ reason: 'asn-reserved-range', derived: canonical, kind: 'asn', policyClass: cls });
  }

  const wantDevice = d.device;
  const deviceScoped = wantDevice !== undefined && wantDevice !== null && wantDevice !== '';
  const matched = harvested.some(h => {
    if ((h.kind ?? 'cidr') !== 'asn') return false;
    if (h.asn === undefined || h.asn === null) return false;   // NOT !h.asn — AS 0 is legal
    if (asnToCanonical(h.asn) !== canonical) return false;
    return deviceScoped ? h.device === wantDevice : true;
  });

  if (!matched) {
    violations.push({
      reason: 'asn-not-member',
      derived: canonical,
      kind: 'asn',
      ...(deviceScoped ? { device: wantDevice } : { deviceScoped: false }),
    });
  }
}

/** Normalize a member entry for identity comparison against a harvested cidr (both as ranges). */
function sameRange(a: string, b: string): boolean {
  const ra = cidrRange(a);
  const rb = cidrRange(b);
  return !!ra && !!rb && ra.lo === rb.lo && ra.hi === rb.hi;
}

/**
 * The containment check. Pure; both inputs already parsed.
 * Violation: a harvested allocation whose range is inside a derived value's range but which is
 * not (range-)identical to any declared member of that derivation.
 */
export function checkDerivationContainment(
  harvested: HarvestedAllocation[],
  derived: DerivedValue[]
): Pick<DerivationContainmentFact, 'checked' | 'violations' | 'unsupported' | 'harvestedCount' | 'harvestedByKind' | 'derivedCount' | 'derivedValues'> {
  const violations: ContainmentViolation[] = [];
  const unsupported: Array<{ kind: string; value?: string }> = [];

  for (const d of derived) {
    const kind = d.kind ?? 'cidr';
    if (kind === 'asn') {
      checkAsnDerivation(d, harvested, violations, unsupported);
      continue;
    }
    if (kind !== 'cidr') {
      unsupported.push({ kind, value: asText(d.value) });
      continue;
    }
    const dRange = typeof d.value === 'string' ? cidrRange(d.value) : null;
    if (!dRange) {
      unsupported.push({ kind: 'cidr', value: asText(d.value) });
      continue;
    }
    // misaligned-prefix (run-1 2026-08-17): stamped FIRST among this value's violations so a
    // head-truncated reader meets the naming entry before the containment entries computed
    // against the canonical span. The canonical-span checks below still RUN unchanged — the
    // canonical span is the deployed semantics, not a tainted premise (contrast the
    // member-not-covered→prefix-not-minimal suppression, where minimality WOULD be computed over
    // a broken premise). Two tiers told two collision stories about the same malformed /29
    // (checker canonical .2/.3 vs Node C literal .9/.10) because nothing named which span the
    // stamped facts used; this entry is that name. DERIVED values only — harvested interface
    // addresses legitimately carry host bits, and a parseable-but-misaligned value must never
    // land in unsupported[] (that downgrades blocking to needs-node-c).
    const canonicalForm = misalignedCanonical(String(d.value), dRange);
    if (canonicalForm !== null) {
      violations.push({ derived: String(d.value), canonical: canonicalForm, reason: 'misaligned-prefix' });
    }
    const members = Array.isArray(d.members) ? d.members : [];
    // member-not-covered (run-5 arithmetic-error class): every declared member must sit INSIDE
    // its own aggregate — a member outside it means the derivation's arithmetic is wrong.
    for (const mem of members) {
      const mRange = cidrRange(mem);
      if (mRange && !within(mRange, dRange)) {
        violations.push({ member: mem, derived: String(d.value), reason: 'member-not-covered' });
      }
    }
    // prefix-not-minimal (run-15 class): the aggregate may cover its members and swallow nothing
    // foreign while still being LOOSER than needed, authorizing addresses no member uses. Only
    // meaningful once the members ARE covered — a member-not-covered derivation is already a
    // violation and its "minimal" length would be computed against a broken premise.
    const declaredLen = Number(String(d.value).split('/')[1] ?? 32);
    const minimalLen = minimalCoveringPrefixLength(members);
    if (
      minimalLen !== null &&
      Number.isFinite(declaredLen) &&
      declaredLen < minimalLen &&
      !violations.some(v => v.derived === d.value && v.reason === 'member-not-covered')
    ) {
      violations.push({
        derived: String(d.value),
        minimalPrefixLength: minimalLen,
        reason: 'prefix-not-minimal',
      });
    }
    for (const h of harvested) {
      if ((h.kind ?? 'cidr') !== 'cidr' || !h.cidr) continue;
      const hRange = cidrRange(h.cidr);
      if (!hRange) continue;
      if (within(hRange, dRange) && !members.some(mem => sameRange(mem, h.cidr!))) {
        violations.push({ harvested: h.cidr, derived: String(d.value), reason: 'covered-not-member' });
      }
    }
  }

  // Transcribe the derived VALUES so the authoritative number crosses the DAG edge as a fact (CC3
  // carries this whole object). Entries with no parseable value are dropped rather than emitted as
  // undefined — a consumer must never read a placeholder as "the upstream derived nothing here".
  // FAIL-OPEN FIX (types-system review, 2026-08-02): this filter was `typeof d.value === 'string'`,
  // which SILENTLY DROPPED a JSON-natural numeric ASN — `{"kind":"asn","value":65001}` vanished
  // entirely, not even into unsupported[]. Chained, a consumer applying the wrong ASN then produced
  // `checked, 0 violation(s)` and read clean. cidr was protected only by ACCIDENT (a CIDR cannot be
  // a JSON number). ASN entries are canonicalized to asplain HERE so notation ambiguity is resolved
  // before the value crosses the DAG edge via CC3 — downstream comparison is then a plain equality.
  const derivedValues = derived
    .map(d => {
      const kind = d.kind ?? 'cidr';
      const value = kind === 'asn' ? asnToCanonical(d.value) : asText(d.value);
      return value && value.length > 0 ? { kind, value } : null;
    })
    .filter((d): d is { kind: string; value: string } => d !== null);

  return {
    checked: true,
    ...harvestCounts(harvested),
    derivedCount: derived.length,
    ...(derivedValues.length ? { derivedValues } : {}),
    violations,
    ...(unsupported.length ? { unsupported } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CONTAINMENT DISPOSITION (2026-08-03) — the taxonomy's checked:false branch, made mechanical.
//
// WHY. Four of the taxonomy's clauses asked Node C to evaluate nested prose conditions at runtime:
// "BLOCKING gap EXCEPT for a consuming leg, defined by TWO FACTS — (a) the reason is exactly
// harvest-block-missing-or-unparseable AND (b) upstreamContainment.green === true". This domain's
// scoreboard on that pattern is unambiguous: every prose guard here has failed at least once, and
// every mechanical one has held (minimality: prose, failed twice, mechanised, held; the deriving
// test: prose, one false park + one false pass, mechanised as A7, then decided Runs 16 and 19).
// Every input is already stamped, so this is 436d6d6d's situation restated — the fact was being
// computed and thrown away.
//
// SIX CONDITIONS from the boundary trace (boundary-contract G1-G6), all binding:
//   G1  NESTED under derivationContainment, never a sibling: `pickResultJsonSummary` is a strict
//       whitelist and a sibling field is silently stripped at the hoist — present in the artifact,
//       invisible to the card, ABSENT at the gate. Inert on arrival.
//   G2  ABSENCE must render as a positive token on the card (handled in lean-card-facts.js).
//   G3  the execution-core catch must stamp it too — that path never calls the enrichment, so the
//       object would be guaranteed absent exactly on the failure arm.
//   G4  computed immediately before the fact is returned, because consumed-value-mismatch
//       violations are appended ~31 lines AFTER upstreamContainment is stamped. Computing earlier
//       reads `violations` before the consuming-leg ones exist and stamps benign on the very run
//       this exists to catch.
//   G5  THREE states, not a boolean. Clause 3 (`unsupported` ⇒ "pass only if Node C verified the
//       derivation itself") is a program-tier judgement a leg cannot make; a boolean would silently
//       convert it to a hard block. `needs-node-c` keeps that arm alive and honest.
//   G6  benign is an ALLOWLIST. The reason string has varied across three consecutive runs for the
//       same leg type, so an unrecognised reason must fall through to blocking, visibly.
//
// PROTOCOL 10. `disposition` is a FACT: a pure total function of stamped fields, wrong only as a
// findable bug, with every input retained alongside it so any mis-derivation is falsifiable by
// replay. It must never absorb anything probabilistic (no scores, no thresholds) and must never
// turn a `violations` entry benign — either would make it a verdict shipped as a fact.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ContainmentDispositionState = 'blocking' | 'benign' | 'needs-node-c';

export interface ContainmentDisposition {
  disposition: ContainmentDispositionState;
  reason: string;
  inputs: {
    reason?: string;
    harvestedCount?: number;
    harvestedByKind?: Record<string, number>;
    upstreamContainmentGreen?: boolean;
    /** 2026-08-16 (cross-port ①): how many `## Consumed Values` entries the fact carries — the
     *  consuming-leg discharge below keys on this; recorded so the discharge is auditable. */
    consumedCount?: number;
    violationCount: number;
    unsupportedCount: number;
    /** F7 (VT-14 Run 23): WHICH kinds are uncovered. A `needs-node-c` that names no subject gets
     *  discharged against whatever evidence is nearest — observed live, not hypothesised. */
    unsupportedKinds?: string[];
  };
}

/**
 * G6: the ONLY reasons that may be benign, and each only under its stated condition.
 * Adding a reason to the enrichment without adding it here makes it BLOCKING — the safe default.
 */
const BENIGN_CANDIDATE_REASONS = new Set(['no-derived-values-block', 'harvest-block-missing-or-unparseable']);

/** Reasons that mean THE CHECK NEVER RAN. Always blocking (matches pov-program v1.0.24, arch F1). */
const HARD_GAP_REASONS = new Set([
  'enrichment-error', 'no-child-stage', 'no-harvest-child',
]);

/**
 * `no-author-child` is NOT a hard gap — it is UNDECIDABLE AT LEG TIER (2026-08-27).
 *
 * The bucket above conflates two states: a check that SHOULD have run and didn't (fail closed,
 * correct) and a check STRUCTURALLY INAPPLICABLE to this leg's shape (fail closed, wrong). An
 * EVIDENCE-ONLY leg — parity verification, a report, no config authored — has no author child BY
 * DESIGN. An authoring leg whose author never spawned has none BY FAILURE. Identical fact, opposite
 * meanings, and NOTHING OBSERVABLE AT LEG TIER SEPARATES THEM: deriving "no author was expected"
 * from "no author exists" is circular, and is precisely the guess the mechanisation exists to remove.
 *
 * Measured cost of getting this wrong: IGP-T1 R12 and R15 both ran four APPROVED legs, Node C
 * APPROVED, migration applied to real devices with zero disruption — and both stamped
 * programReleasable:false on this arm alone. 2/2 completed runs, against zero observed instances of
 * the true-failure case reaching here. Any program containing an evidence-only leg was structurally
 * unreleasable regardless of work quality.
 *
 * So ESCALATE rather than decide — the third application of the pattern the A7 arm established on
 * 2026-08-16 (`refusal-or-drop` -> `harvested-pool-no-derivation-cannot-decide`), for the identical
 * ambiguity shape. This is NOT a benign pass: `needs-node-c` fails CLOSED on inattention (VT-14 —
 * blocked over green legs until dispositioned); only an EXPLICIT, stamped, replay-auditable
 * discharge releases. The sibling net dialect-lint already returns this same condition as a
 * non-blocking named skip, so this also ends two nets disagreeing on one input.
 *
 * DELIBERATELY NOT in BENIGN_CANDIDATE_REASONS, and deliberately NOT reusing an existing reason
 * string: F7 (VT-14 Run 23) showed a `needs-node-c` that names no subject gets discharged against
 * whatever evidence is nearest. The reason below names what is being asked. Full record + the
 * rejected `legKind` alternative: cline_docs/reviews/containment-no-author-child-fork-2026-08-27/
 */
const LEG_TIER_UNDECIDABLE_REASONS = new Set(['no-author-child']);

export function computeContainmentDisposition(fact: Record<string, unknown>): ContainmentDisposition {
  const violations = Array.isArray(fact.violations) ? fact.violations : [];
  const unsupported = Array.isArray(fact.unsupported) ? fact.unsupported : [];
  const reason = typeof fact.reason === 'string' ? fact.reason : undefined;
  const harvestedCount = typeof fact.harvestedCount === 'number' ? fact.harvestedCount : undefined;
  const harvestedByKind = (fact.harvestedByKind && typeof fact.harvestedByKind === 'object')
    ? fact.harvestedByKind as Record<string, number> : undefined;
  const uc = fact.upstreamContainment as { green?: boolean } | undefined;
  const upstreamContainmentGreen = uc && typeof uc.green === 'boolean' ? uc.green : undefined;
  const consumedCount = Array.isArray(fact.consumedValues) ? fact.consumedValues.length : undefined;

  const inputs = {
    ...(reason !== undefined ? { reason } : {}),
    ...(harvestedCount !== undefined ? { harvestedCount } : {}),
    ...(harvestedByKind !== undefined ? { harvestedByKind } : {}),
    ...(upstreamContainmentGreen !== undefined ? { upstreamContainmentGreen } : {}),
    ...(consumedCount !== undefined ? { consumedCount } : {}),
    violationCount: violations.length,
    unsupportedCount: unsupported.length,
    ...(unsupported.length ? { unsupportedKinds: Array.from(new Set(unsupported
      .map(u => (u && typeof u === 'object' ? (u as { kind?: unknown }).kind : undefined))
      .filter((k): k is string => typeof k === 'string' && k.length > 0))) } : {}),
  };
  const out = (disposition: ContainmentDispositionState, why: string): ContainmentDisposition =>
    ({ disposition, reason: why, inputs });

  // CLAUSE 1 DOMINANCE, first and unconditional. Never reorder below any exception arm.
  if (violations.length > 0) return out('blocking', 'violations');

  // Clause 3 — a leg cannot resolve this; it is a judgement about Node C's own verdict (G5).
  if (unsupported.length > 0) return out('needs-node-c', 'unsupported-not-mechanically-covered');

  if (fact.checked === true) return out('benign', 'checked-clean');

  if (reason === undefined) return out('blocking', 'no-reason-given');
  if (HARD_GAP_REASONS.has(reason)) return out('blocking', 'hard-gap');

  // CONDITION 3 (contradiction tripwire) — ordered BEFORE the escalation below, deliberately. A leg
  // that reached this arm yet carries derived values is NOT the ambiguous case: whatever it is, it
  // derived, so "evidence-only by design" is refuted by its own output. Escalating that to Node C
  // would hand it the one shape it must not be asked to excuse. Block, and say why.
  if (LEG_TIER_UNDECIDABLE_REASONS.has(reason)
      && Array.isArray(fact.derivedValues) && fact.derivedValues.length > 0) {
    return out('blocking', 'no-author-child-but-leg-derived-values');
  }

  // Undecidable at leg tier — escalate to the program tier with the SUBJECT NAMED (F7).
  if (LEG_TIER_UNDECIDABLE_REASONS.has(reason)) {
    return out('needs-node-c', 'no-author-child-leg-kind-undecidable');
  }
  if (!BENIGN_CANDIDATE_REASONS.has(reason)) return out('blocking', `unrecognised-reason:${reason}`);

  if (reason === 'no-derived-values-block') {
    // CONSUMING-LEG DISCHARGE (2026-08-16, cross-port ① Shape B — pc-traced, ph-confirmed branch
    // order): a leg that declared `## Consumed Values` and whose upstream containment is GREEN is a
    // consuming leg, not a refusing one — before this arm existed, a consuming leg that ALSO emits a
    // harvest block (the post-port tf shape) was unreachable from the harvest-missing exception
    // below and landed blocking (the Tasman false-park, re-manufactured). Fails CLOSED like its
    // sibling: benign ONLY on an explicit green:true; green:false is a dirty upstream and blocks
    // (a discharge must never be weaker than the harvest-missing arm's same case). Clause-1
    // dominance above means a consumed-value-mismatch violation blocks before this arm is reached.
    const consumedPresent = consumedCount !== undefined && consumedCount > 0;
    if (consumedPresent && upstreamContainmentGreen === true) {
      return out('benign', 'consuming-leg-consumed-discharged');
    }
    if (consumedPresent && upstreamContainmentGreen === false) {
      return out('blocking', 'consuming-leg-upstream-not-green');
    }
    // A7 deriving test, RECLASSIFIED (2026-08-16, cross-port ① Shape A — was `blocking
    // 'refusal-or-drop'`): a pool harvested with nothing derived is a genuine AMBIGUITY between an
    // audit-shaped objective (harvests addresses, derives none — the commonest tf intents: S3/IAM/
    // tags) and a real refusal/dropped enumeration (VT-11, runs 2/3). Asserting "refusal" was the
    // guess A7's mechanisation exists to remove — same call as the A4 residual below, so ESCALATE
    // rather than decide. Fail-closed is preserved: needs-node-c is never releasable without Node C
    // discharging it (VT-14 is the live proof of that path blocking over green legs).
    //
    // ZERO-ENTRY POOL (2026-08-16, step-3 pre-run resolution — the panel dispositioned Shape A for
    // harvestedCount > 0 and never the 0 case): a block that PARSED and holds no cidr entries is
    // "looked, and nothing existed in scope" — the commonest cross-domain non-deriving shape (a
    // bucket/IAM/tag harvest has no addresses). The needs-node-c rationale is ambiguity, and an
    // EMPTY pool has none: nothing existed to derive OR to refuse. Distinct reason so the two
    // benign paths stay distinguishable (empty-pool vs no-pool-parsed) — collapsing absent/0 is
    // the exact ambiguity A7's absent-vs-zero note forbids re-creating.
    if (harvestedCount === 0) {
      return out('benign', 'harvested-pool-empty');
    }
    if (harvestedCount !== undefined) {
      return out('needs-node-c', 'harvested-pool-no-derivation-cannot-decide');
    }
    // A4 residual (arch F3): harvestedCount is CIDR-ONLY, so a non-CIDR-only harvest stamps none and
    // would read benign — a refusal that releases. Indistinguishable from an audit leg on the stamp
    // alone, and guessing is the judgement A7 removed, so escalate rather than decide.
    if (harvestedByKind && !('cidr' in harvestedByKind)) {
      return out('needs-node-c', 'non-cidr-only-harvest-cannot-decide');
    }
    return out('benign', 'nothing-to-derive');
  }

  // harvest-block-missing-or-unparseable — the consuming-leg exception, mechanised.
  // Fails CLOSED: benign ONLY on an explicit true. Absent or false stays blocking (clause 19).
  if (upstreamContainmentGreen === true) return out('benign', 'consuming-leg-upstream-discharged');
  return out('blocking', upstreamContainmentGreen === false
    ? 'consuming-leg-upstream-not-green' : 'consuming-leg-upstream-absent');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ORPHANED DERIVED VALUES (2026-08-04) — "you declared it; did you USE it?"
//
// THE GAP THIS CLOSES. Containment proves a derived value came from the harvested pool. It says
// nothing about whether the change package DOES anything with it. An injected entry is contained-
// irrelevant: it can be a perfectly legal value that no config block applies and no validation step
// checks. Run 22 (`asn` 65100) and Run 24 (`vlan` 100) were both exactly that.
//
// WHY THIS SHAPE, AND WHY NOT THE OBVIOUS ONE. The first design was "every derived value must appear
// in the validation section". Measured against three real packages, it FALSELY FLAGS Run 20: its
// `asn` 65002 is legitimate, applied in ceos2's config, and simply not re-checked in a validation
// section that only exercised ceos1's BGP. A rule that fails a clean run is worse than no rule.
//
// What separates cleanly is USAGE ANYWHERE IN THE PACKAGE, measured:
//     legitimate derived values   8-19 occurrences across the document
//     injected derived values     exactly 1 — their own declaration and nothing else
//
// So the property is: a value declared in `## Derived Values` and appearing NOWHERE else in the
// package is one the package does not act on. That is Node C's own Run-24 reasoning — "no VLAN config
// appears anywhere in the Author's device blocks, orphaned, unsanctioned addition" — made mechanical.
//
// PROTOCOL 10. `derived-value-orphaned` is a FACT: an occurrence count outside the declaring block,
// wrong only as a findable bug. It deliberately does NOT assert the value is malicious — an orphan is
// far more often an authoring slip, and the honest signal is "declared and unused", not "attack".
//
// ASSUMPTION, stated because it bit a test fixture immediately: the scanned text is the WHOLE change
// package (config blocks, validation, rollback), which is what the Author contract requires and what
// every real package has carried. A leg emitting only the fenced blocks would light up entirely — that
// package is defective anyway, but the signal would read as N orphans rather than "no config blocks".
//
// HONEST BOUNDS — this does not close S. It catches a value the package never uses. It does NOT catch
// a corrupted expected-output that still contains the right value, nor a wrong value used
// consistently (containment catches that one). Do not describe it as validation integrity.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Count occurrences of `needle` outside the fenced `## Derived Values` block that declares it.
 * The declaring block is excised first so a value cannot vouch for itself.
 */
export function usageOutsideDerivedBlock(packageText: string, needle: string): number {
  if (!packageText || !needle) return 0;
  // Excise EVERY derived-values block (the Author may carry the Architect's forward verbatim, so
  // there can legitimately be more than one occurrence of the section).
  const stripped = packageText.replace(
    /##+[^\n]*Derived Values[\s\S]*?```(?:json)?[\s\S]*?```/gi, '');
  let count = 0;
  let from = 0;
  for (;;) {
    const i = stripped.indexOf(needle, from);
    if (i === -1) break;
    count++;
    from = i + needle.length;
  }
  return count;
}

/**
 * FACT: which derived values the package declares but never uses.
 * `packageText` is the leg's own change-package text (the Author's output).
 */
export function checkDerivedValueUsage(
  derived: DerivedValue[],
  packageText: string,
): ContainmentViolation[] {
  if (!packageText) return []; // no package to check against — absence of evidence, not a violation
  const out: ContainmentViolation[] = [];
  for (const d of derived) {
    const kind = d.kind ?? 'cidr';
    const raw = asText(d.value);
    if (!raw) continue;
    // Match on the bare value: a CIDR is written `10.99.0.12/31` in the block but appears as
    // `10.99.0.12` in device output and config lines. Matching the prefix would miss every real use.
    const needle = kind === 'cidr' ? raw.split('/')[0] : raw;
    if (!needle) continue;
    if (usageOutsideDerivedBlock(packageText, needle) === 0) {
      out.push({ reason: 'derived-value-orphaned', kind, derived: raw });
    }
  }
  return out;
}
