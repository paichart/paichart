/**
 * VALUE-LEG containment — the `derivationContainment` fact for a VALUE leg (value-chain build B4, 2026-10-02).
 *
 * A value leg (network-derivation-protocol) is Harvester → Derivation Architect → Derived Value Reviewer, with NO
 * author child by design. The existing leg-synthesize enrichment (`derivation-containment-enrichment.ts`) keys on an
 * author child and would stamp `no-author-child` → needs-node-c on every value leg, AFTER the Reviewer has run. This
 * module computes the fact at the ARCHITECT's leaf-persist instead, so the chainer carries it into the Reviewer's §6,
 * and the leg's SYNTHESIZE HOISTS it (never recomputes) — the rollbackContainment two-point shape.
 *
 * WHAT IS DELIBERATELY UNCHANGED (D-8 isolation; plan B4.8): the pure `derivation-containment.ts` and its public
 * mirror, the existing enrichment, the chainer, terminal persist, the reactor and keep-best. Every new reason here
 * (`value-leg-…`) is UNKNOWN to `computeContainmentDisposition`, so it falls through VISIBLY to
 * `blocking / unrecognised-reason:<reason>` (audit A3) — named in the taxonomy and the mirror only when one first
 * fires live (EF R2 trigger).
 *
 * WHO IS A VALUE LEG: a leg whose STAMPED protocol is in `VALUE_LEG_PROTOCOLS` (closed set; NULL ⇒ false). Read from
 * the OWNING LEG's row, never the child's template binding (B0: no code compares the two; the reused harvester runs
 * network-provisioning text inside a value leg and the leg is still a value leg).
 *
 * Design: cline_docs/reviews/producer-leg-2026-10-02/ (SYNTHESIS §4 platform 1-4, §9 A2/A3/A4; BUILD-PLAN.md B4).
 * NON-THROWING is the caller's contract (the net registry's per-net catch), as for every enrichment.
 */

import type { Prisma } from '@prisma/client';
import { readAuthoritativeResultField } from './authoritative-result-read';
import { resolveOwningLeg, resolveTaskProtocol, canonicalProtocolName } from './program-protocol';
import {
  parseFencedJsonBlock,
  checkDerivationContainment,
  harvestCounts,
  computeContainmentDisposition,
  HARVESTED_ALLOCATIONS_MARKER,
  DERIVED_VALUES_MARKER,
  type HarvestedAllocation,
  type DerivedValue,
} from './derivation-containment';

/**
 * The CLOSED set of value-leg protocols, in stamped (canonical, long) form. Pinned like PROGRAM_PROTOCOL_NAMES
 * (test-value-leg-containment). Adding one is a design decision, not a registration.
 */
// ⚠️ FORWARD COUPLING (B6 fold S23): adding a member here means a second value-leg domain — re-read pov-program's
// Node C value-leg paragraph and SYNTHESIZE value-leg block (seed-protocol-prompts.ts VALUE_LEG_NODE_C_PARAGRAPH and
// VALUE_LEG_SYNTHESIZE_BLOCK, folded in from value-chain-program at promotion E, 2026-10-05); both assume every value
// leg has a harvest and a containment stamp.
export const VALUE_LEG_PROTOCOLS: readonly string[] = ['network-derivation-protocol'];

/** The value leg's Phase 1 role — the ONLY role the leaf-persist net runs on (exact match; a regex would stamp
 *  every existing Architect and change every downstream prompt). */
export const VALUE_LEG_ARCHITECT_ROLE = 'derivation_architect';

/** Bound on the stage-children scan — the same constant and reasoning as the sibling enrichments. */
const STAGE_CHILD_SCAN_CAP = 50;

export type ValueLegPrisma = Pick<Prisma.TransactionClient, 'task' | 'agentExecution' | 'agentArtifact' | '$queryRaw'>;

/** Is this (stamped or title-resolved) protocol a value-leg protocol? NULL ⇒ false. */
export function isValueLegProtocol(protocol: string | null | undefined): boolean {
  return typeof protocol === 'string' && protocol.length > 0
    && VALUE_LEG_PROTOCOLS.includes(canonicalProtocolName(protocol));
}

/** Is this PIPELINE task a value leg? Reads only the task's own stamp (title fallback for unstamped rows). */
export function isValueLegTask(task: { title?: string | null; metadata?: unknown }): boolean {
  return isValueLegProtocol(resolveTaskProtocol(task).protocol);
}

const isHarvestChild = (c: { title: string; agentRole: string | null }) =>
  (c.agentRole ?? '').toLowerCase().includes('harvest') || c.title.toLowerCase().startsWith('harvest');
const isAuthorChild = (c: { title: string; agentRole: string | null }) =>
  (c.agentRole ?? '').toLowerCase().includes('author') || c.title.toLowerCase().startsWith('author');
const isArchitectChild = (c: { title: string; agentRole: string | null }) =>
  c.agentRole === VALUE_LEG_ARCHITECT_ROLE || c.title.toLowerCase().startsWith('derive');

/** The two value-leg-only fields, in the order every value-leg fact carries them. */
function valueLegShape(protocol: string | null, harvestExecutionId: string | null, derivedExecutionId: string | null) {
  return {
    legShape: { shape: 'value', protocol, harvestExecutionId, derivedExecutionId },
    // Audit A2: the crossing-value equality check has no code-readable input in Stage A. Stamp the absence
    // EXPLICITLY — never a silent [] (which would read as "checked, nothing orphaned").
    orphanCheck: { checked: false, reason: 'not-applicable-value-leg' },
  };
}

/**
 * `derived-value-held` (VALUE-FREE-ADDRESS-BLIND, lab L-VLG F-2; owner decision G10-c 2026-11-07) — a FACT, not a verdict.
 *
 * THE BLIND SPOT. The shared checker's only harvest-side class is covered-not-member: a harvested allocation inside a
 * derived range that is NOT a declared member. A free address lists ITSELF as its member (`{"value": "10.99.0.3/32",
 * "members": ["10.99.0.3/32"]}`), so a harvested 10.99.0.3/32 is exempted as "a member" and the leg reads benign
 * checked-clean while deriving an address a device already holds.
 *
 * THE RULE. For a cidr derived value that lists ITSELF among its members (the self-member shape — an aggregate's members
 * are the harvested allocations it covers, never the aggregate), every harvested cidr allocation inside its range
 * (equal to it, or contained in it) that the member exemption let through is a violation. A harvested allocation inside
 * it that is NOT a member is already covered-not-member — never stamped twice. Named WHAT, no adjective: the derived
 * value, the harvested allocation, and the harvest entry's device / interface / source when the entry carries them.
 *
 * NOT PROVENANCE (2026-09-20 ruling): this asks only whether the derived range overlaps a harvested allocation of the
 * same kind — containment — never where the value came from. Value legs only (the change leg is measured, not built:
 * see the build record). The disposition is the shared one: any violation ⇒ `blocking (violations)`.
 */
export interface DerivedValueHeldViolation {
  reason: 'derived-value-held';
  derived: string;
  harvested: string;
  harvestedDevice?: string;
  harvestedInterface?: string;
  harvestedSource?: string;
}

export function derivedValueHeldViolations(
  harvested: HarvestedAllocation[],
  derived: DerivedValue[],
): DerivedValueHeldViolation[] {
  const out: DerivedValueHeldViolation[] = [];
  for (const d of derived) {
    if ((d.kind ?? 'cidr') !== 'cidr' || typeof d.value !== 'string') continue;
    const dRange = cidrRange(d.value);
    if (!dRange) continue;
    const members = Array.isArray(d.members) ? d.members.filter((m): m is string => typeof m === 'string') : [];
    if (!members.some((m) => sameCidrRange(m, d.value as string))) continue;   // not the self-member shape
    for (const h of harvested) {
      if ((h.kind ?? 'cidr') !== 'cidr' || typeof h.cidr !== 'string' || !h.cidr) continue;
      const hRange = cidrRange(h.cidr);
      if (!hRange || hRange.lo < dRange.lo || hRange.hi > dRange.hi) continue;
      if (!members.some((m) => sameCidrRange(m, h.cidr as string))) continue;   // covered-not-member already names it
      out.push({
        reason: 'derived-value-held',
        derived: d.value,
        harvested: h.cidr,
        ...(typeof h.device === 'string' && h.device ? { harvestedDevice: h.device } : {}),
        ...(typeof h.interface === 'string' && h.interface ? { harvestedInterface: h.interface } : {}),
        ...(typeof h.source === 'string' && h.source ? { harvestedSource: h.source } : {}),
      });
    }
  }
  return out;
}

// A VERBATIM copy of derivation-containment.ts's private cidrRange: that module is publicly mirrored
// (@paichart/containment-checks), so exporting from it is a two-repo edit. Pinned by test:value-leg-containment
// (the two function texts must be identical) so the copy cannot fork.
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

function sameCidrRange(a: string, b: string): boolean {
  const ra = cidrRange(a);
  const rb = cidrRange(b);
  return !!ra && !!rb && ra.lo === rb.lo && ra.hi === rb.hi;
}

/** Disposition computed LAST, on the assembled fact (the G4 ordering rule). */
function finish(fact: Record<string, unknown>): Record<string, unknown> {
  fact.containmentDisposition = computeContainmentDisposition(fact);
  return fact;
}

export interface ValueLegLeafInput {
  /** The Derivation Architect child's task id. */
  taskId: string;
  /** Its output — the text being persisted now (the execution is not yet SUCCESS, so it is NOT re-read). */
  finalResponse: string | null | undefined;
  /** The execution being persisted, when the caller has it. Recorded, never selected on. */
  executionId?: string | null;
}

/**
 * LEAF-PERSIST: compute the value leg's containment fact on the Derivation Architect's own output.
 */
export async function computeValueLegContainmentFact(
  prisma: ValueLegPrisma,
  { taskId, finalResponse, executionId }: ValueLegLeafInput,
): Promise<Record<string, unknown>> {
  const self = await prisma.task.findUnique({ where: { id: taskId }, select: { stageId: true } });
  const stageId = self?.stageId ?? null;
  if (!stageId) return finish({ checked: false, reason: 'value-leg-owning-leg-none' });

  // The child lives in the leg's child stage; the leg is the PIPELINE task that OWNS that stage.
  const owner = await resolveOwningLeg(prisma as unknown as Parameters<typeof resolveOwningLeg>[0], stageId);
  if (owner.kind === 'none') return finish({ checked: false, reason: 'value-leg-owning-leg-none' });
  if (owner.kind === 'ambiguous') {
    return finish({ checked: false, reason: 'value-leg-owning-leg-ambiguous', candidates: owner.candidates });
  }
  const leg = await prisma.task.findUnique({ where: { id: owner.legTaskId }, select: { title: true, metadata: true } });
  const protocol = leg ? resolveTaskProtocol(leg).protocol : null;
  if (!isValueLegProtocol(protocol)) {
    // A derivation_architect outside a value leg: named, blocking (unrecognised), never a silent pass.
    return finish({ checked: false, reason: 'value-leg-owning-leg-not-value', legTaskId: owner.legTaskId, protocol });
  }

  const children = await prisma.task.findMany({
    where: { stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
    take: STAGE_CHILD_SCAN_CAP,
  });
  const harvestChild = children.find(isHarvestChild);
  if (!harvestChild) {
    return finish({ checked: false, reason: 'no-harvest-child', derivedSource: taskId,
      ...valueLegShape(protocol, null, executionId ?? null) });
  }
  const harvestRead = await readAuthoritativeResultField(prisma, harvestChild.id, 'finalResponse');
  const harvested = parseFencedJsonBlock<HarvestedAllocation>(harvestRead.value, HARVESTED_ALLOCATIONS_MARKER);
  const derived = parseFencedJsonBlock<DerivedValue>(finalResponse ?? null, DERIVED_VALUES_MARKER);
  const shape = valueLegShape(protocol, harvestRead.executionId, executionId ?? null);

  // B6 fold S2b (EF F2): an EMPTY block (`[]`) parses as an array, and over zero entries the checker returns
  // checked:true / 0 violations ⇒ benign checked-clean — a value leg that published nothing would read clean. Empty is
  // treated exactly like absent.
  if (!derived || derived.length === 0) {
    // A value leg's whole deliverable IS the derived block, so its absence is not the ambiguous
    // pool-with-no-derivation case the shared taxonomy escalates — it is a value leg with no value. Own reason,
    // falls through to blocking (audit A3).
    return finish({ checked: false, reason: 'value-leg-no-derived-block', harvestSource: harvestChild.id,
      derivedSource: taskId, ...(harvested ? harvestCounts(harvested) : {}), ...shape });
  }
  if (!harvested) {
    return finish({ checked: false, reason: 'harvest-block-missing-or-unparseable', harvestSource: harvestChild.id,
      derivedSource: taskId, ...shape });
  }
  const contained = checkDerivationContainment(harvested, derived);
  // VALUE-FREE-ADDRESS-BLIND (owner G10-c, 2026-11-07): appended AFTER the shared checker, so every stamp without a
  // collision is byte-identical by construction (no new field on a clean fact) — inert-by-construction, not version-keyed.
  const held = derivedValueHeldViolations(harvested, derived);
  if (held.length) contained.violations = [...(contained.violations ?? []), ...(held as unknown as NonNullable<typeof contained.violations>)];
  return finish({ ...contained, harvestSource: harvestChild.id, derivedSource: taskId, ...shape });
}

export interface ValueLegHoistInput {
  /** `task.metadata.pipelineStageId` — the leg's child stage. */
  stageId: unknown;
  /** `task.inputContext.chainedFrom` — the leg's own chained predecessors. */
  chainedFrom: unknown;
}

/**
 * LEG-SYNTHESIZE: hoist the Architect's stamp from its AUTHORITATIVE execution (the one the Reviewer was chained) and
 * apply the four hoist-time tripwires. Every tripwire is `checked:false` with NO `unsupported` (else the disposition
 * would read needs-node-c or checked-clean) and KEEPS the Architect's `derivedValues`, so a consumer still sees what
 * was derived while the leg reads blocking.
 */
export async function hoistValueLegContainment(
  prisma: ValueLegPrisma,
  { stageId, chainedFrom }: ValueLegHoistInput,
): Promise<Record<string, unknown>> {
  if (typeof stageId !== 'string' || !stageId) return finish({ checked: false, reason: 'no-child-stage' });
  const children = await prisma.task.findMany({
    where: { stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
    take: STAGE_CHILD_SCAN_CAP,
  });

  const architect = children.find(isArchitectChild);
  const raw = architect
    ? (await readAuthoritativeResultField(prisma, architect.id, 'derivationContainment')).value
    : null;
  let stamp: Record<string, unknown> | null = null;
  if (raw) {
    try { stamp = JSON.parse(raw) as Record<string, unknown>; } catch { stamp = null; }
  }

  const trip = (reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> => {
    const fact: Record<string, unknown> = { checked: false, reason, ...extra };
    if (stamp && Array.isArray(stamp.derivedValues)) fact.derivedValues = stamp.derivedValues;
    if (stamp?.harvestSource !== undefined) fact.harvestSource = stamp.harvestSource;
    if (stamp?.derivedSource !== undefined) fact.derivedSource = stamp.derivedSource;
    if (stamp?.legShape !== undefined) fact.legShape = stamp.legShape;
    fact.orphanCheck = { checked: false, reason: 'not-applicable-value-leg' };
    if (architect) fact.source = architect.id;
    return finish(fact);
  };

  // 1. An author child in a value leg — visible ONLY here (the Architect's leaf cannot know the leg's later shape).
  const author = children.find(isAuthorChild);
  if (author) return trip('value-leg-has-author-child', { authorChild: author.id });
  // 2. No Architect, or no readable stamp on its authoritative execution.
  if (!architect || !stamp) return trip('value-leg-no-architect-stamp');
  // 3. Stage A scope: value legs are PRODUCERS. A pipeline upstream means a value leg is consuming — not designed.
  const entries = Array.isArray(chainedFrom) ? (chainedFrom as Array<{ source?: unknown }>) : [];
  if (entries.some((e) => e?.source === 'report.md' || e?.source === 'pipeline-index.json')) {
    return trip('value-leg-has-pipeline-upstream');
  }
  // 4. The Architect was stamped against a harvest execution that is no longer the authoritative one (a harvest
  //    re-run after the derivation): the stamp describes a harvest nobody downstream reads.
  // B6 fold S22 (EF F10): a leaf stamp WITHOUT legShape is a leaf-side refusal (owning-leg-none/ambiguous/not-value)
  // and already carries its own blocking reason — hoist it as-is rather than re-label it a harvest mismatch.
  if (stamp.legShape === undefined) return { ...stamp, source: architect.id };
  const harvestChild = children.find(isHarvestChild);
  const stampedHarvest = (stamp.legShape as { harvestExecutionId?: unknown } | undefined)?.harvestExecutionId ?? null;
  if (harvestChild) {
    const current = (await readAuthoritativeResultField(prisma, harvestChild.id, 'finalResponse')).executionId;
    if (current !== stampedHarvest) {
      return trip('value-leg-harvest-execution-mismatch', { stampedHarvestExecutionId: stampedHarvest,
        currentHarvestExecutionId: current });
    }
  }
  // Clean hoist: the Architect's stamp, byte-for-byte as projected, plus where it came from.
  return { ...stamp, source: architect.id };
}
