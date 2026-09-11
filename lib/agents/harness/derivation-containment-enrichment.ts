/**
 * Derivation-containment ENRICHMENT — the DB-reading half of the containment fact.
 *
 * The pure arithmetic lives in `derivation-containment.ts`; this module is the impure half that
 * resolves a leg's harvest/author children and its chained predecessors' stamps, then hands back
 * the fact that `execution-core` stamps onto `resultJson.derivationContainment`.
 *
 * WHY IT WAS EXTRACTED (2026-07-30). It was inline in execution-core, which made it reachable ONLY
 * by executing a full program run — rig rebuild, ~30-50 min, human gates. So it was "verified" by
 * reading source instead, and three separate defects shipped that way, each a different link of the
 * stamp -> render -> gate chain:
 *   1. the taxonomy keyed on a reason string the consuming leg never stamps (design docs carried a
 *      reason code nobody had read off a live artifact);
 *   2. the new field was never rendered on the lean card the program gate is told to read;
 *   3. this module's upstream lookup matched `result.json`, but a PIPELINE predecessor writes
 *      `pipeline-index.json` — a silent empty result, indistinguishable from "no upstream".
 * All three were runtime facts that static review passed. Extraction exists so
 * `scripts/replay-containment.ts` can run THIS code against a real completed leg in seconds and
 * print what it would actually stamp. Replaying a copy would reproduce the original mistake, so the
 * harness must import this function — not reimplement it.
 *
 * NON-THROWING is the CALLER's contract, not this module's: execution-core wraps the call in the
 * try/catch that degrades to `{checked:false, reason:'enrichment-error'}`. Behaviour here is
 * byte-identical to the inline version it replaced.
 */

import type { Prisma } from '@prisma/client';
import {
  parseFencedJsonBlock,
  checkDerivationContainment,
  checkConsumedValues,
  harvestCounts,
  isUpstreamContainmentGreen,
  HARVESTED_ALLOCATIONS_MARKER,
  DERIVED_VALUES_MARKER,
  CONSUMED_VALUES_MARKER,
  type HarvestedAllocation,
  type DerivedValue,
  type ConsumedValue,
  type UpstreamContainmentLeg,
  computeContainmentDisposition,
  checkDerivedValueUsage,
} from './derivation-containment';

/**
 * The narrow Prisma surface this module needs, matching the codebase idiom at
 * complete-task-terminally.ts:60 (`Pick<Prisma.TransactionClient, …>`).
 *
 * Three reasons for this exact shape:
 *  - `Pick`, not a hand-written interface: stays structurally exact against the real client (a
 *    hand-rolled `findMany` signature does not satisfy Prisma's, which is a compile error at the
 *    call site, not here).
 *  - `Prisma.TransactionClient`, not `PrismaClient`: accepts BOTH a full client and a tx client, so
 *    this enrichment can move inside a transaction later without a signature change.
 *  - `import type`: erased at compile time, so importing this module pulls in NO Prisma runtime and
 *    never reaches lib/prisma.ts — a test (or the replay harness) can import it without
 *    DATABASE_URL being set.
 */
export type ContainmentPrisma = Pick<Prisma.TransactionClient, 'task' | '$queryRaw'>;

/**
 * Bound on the stage-children scan. PRE-EXISTING gap, found 2026-09-11: `validate:pagination` runs
 * as a 90% CI DEPLOY GATE at the margin (90.2%), and this bare read plus two new ones in
 * rollback-containment took deploy 34550802714 to 89.6% — so an unbounded query in this domain does
 * not merely miss a target, it blocks a deploy that has nothing to do with it.
 *
 * SAFE BY ORDERING, not by luck: a leg stage holds a handful of specialists, and the harvest and
 * author children are the EARLIEST-created (protocol phase order — the `orderBy` below), so the cap
 * cannot drop the two children this function actually resolves. The `for (const c of children)`
 * fallback below is bounded by the same cap, which is the intended reading: a derived block sitting
 * past the 50th child of one stage is not a shape we have, and would be a stage-decomposition
 * problem before it was a parsing one.
 *
 * Mirrors `CHILD_SCAN_CAP` (contract-propagation) and `STAGE_CHILD_SCAN_CAP` (rollback-containment).
 * FOUR enrichments now carry the same constant for the same query — a candidate for the shared net
 * registry to own (stage 2b), NOT a reason to add a fourth import edge between enrichments today.
 */
const STAGE_CHILD_SCAN_CAP = 50;

export interface ChainedFromEntry {
  taskId?: unknown;
  source?: unknown;
}

export interface ComputeContainmentInput {
  /** `task.metadata.pipelineStageId` — the leg's child stage. */
  stageId: unknown;
  /** `task.inputContext.chainedFrom` — the leg's chained predecessors. */
  chainedFrom: unknown;
  /**
   * H-3 (2026-09-09): true when the task is a PROGRAM harness (`isProgramHarnessTask`, resolved ONCE by
   * the caller). A program's child stage holds Architect + gates + PIPELINE legs + producer + Node C —
   * no harvest child BY CONSTRUCTION — so the leg check is structurally inapplicable, not "never ran".
   * Without this the parent stamped `no-harvest-child → blocking (hard-gap)` on every program
   * SYNTHESIZE (3 of 3 on devext), a verdict the enrichment never earned. Decided HERE, inside the
   * replayable module, so `scripts/replay-containment.ts` can print it against a real parent.
   */
  programTier?: boolean;
}

/**
 * Resolve the containment fact for a PIPELINE leg's SYNTHESIZE.
 * Pure-ish: reads the DB, returns the fact; stamps nothing, logs nothing, never throws by design
 * (the caller owns the catch).
 */
export async function computeDerivationContainmentFact(
  prisma: ContainmentPrisma,
  { stageId, chainedFrom, programTier }: ComputeContainmentInput
): Promise<Record<string, unknown>> {
  // H-3: a program parent gets a self-describing, tier-inapplicable fact — never ABSENT (G2 renders
  // absence as a blocking token) and never the leg's hard-gap. Its containment obligation is discharged
  // by its CHILDREN's facts, which the program gate already reads.
  if (programTier === true) {
    return { checked: false, reason: 'program-tier', tier: 'program', applicable: false };
  }
  let fact: Record<string, unknown> = { checked: false, reason: 'no-child-stage' };
  // Parsed inside the stage block (that is where the author's text is in hand) and consumed by the
  // checked:false branch below — a CONSUMING leg declares what it took from §6 and applied.
  let consumed: ConsumedValue[] | null = null;

  if (typeof stageId === 'string' && stageId) {
    const children = await prisma.task.findMany({
      where: { stageId },
      select: { id: true, title: true, agentRole: true },
      orderBy: { createdAt: 'asc' },   // protocol phase order — Design precedes Review
      take: STAGE_CHILD_SCAN_CAP,
    });
    const harvestChild = children.find(c =>
      (c.agentRole ?? '').toLowerCase().includes('harvest') || c.title.toLowerCase().startsWith('harvest'));
    const authorChild = children.find(c =>
      (c.agentRole ?? '').toLowerCase().includes('author') || c.title.toLowerCase().startsWith('author'));
    if (!harvestChild || !authorChild) {
      fact = { checked: false, reason: !harvestChild ? 'no-harvest-child' : 'no-author-child' };
    } else {
      // The harvest/author children are ACTION tasks, so `result.json` is the RIGHT name here.
      // Do NOT generalize this predicate to predecessor lookups — a PIPELINE task writes
      // `pipeline-index.json` instead, and copying this shape to a PIPELINE site is exactly
      // defect 3 in the header (also CC2 in context-chainer, wave-2 E1 in agent-results-handler:
      // three sites, same class). Predecessor facts are now carried by the chainer instead.
      const finalOf = async (taskId: string): Promise<string | null> => {
        const rows = await prisma.$queryRaw<Array<{ fr: string | null }>>`
          SELECT (content::jsonb)->>'finalResponse' AS fr FROM agent_artifacts
          WHERE name = 'result.json' AND content LIKE '{%'
            AND (content::jsonb)->>'taskId' = ${taskId}
          ORDER BY "createdAt" DESC LIMIT 1`;
        return rows[0]?.fr ?? null;
      };
      const harvested = parseFencedJsonBlock<HarvestedAllocation>(await finalOf(harvestChild.id), HARVESTED_ALLOCATIONS_MARKER);
      const authorText = await finalOf(authorChild.id);
      // THE DERIVED BLOCK IS FOUND WHEREVER IT WAS WRITTEN, not only on the Author (Run 19,
      // 2026-08-02). The protocol instructs PHASE 1 (Design Architect) to emit `## Derived Values`;
      // this reader assumed PHASE 2 (Author). The fact therefore existed only when the Author
      // happened to RE-EMIT a block the protocol asked a different child to produce — contracted
      // nowhere, and run-to-run variance: Run 18's Author re-emitted (so prefix-not-minimal fired),
      // Run 19's referenced it in prose instead. Same protocol, same model, opposite outcome.
      //
      // The cost of the assumption was a FALSE REFUSAL. `no-derived-values-block` + harvestedCount
      // PRESENT is the taxonomy's "the leg refused or dropped its derivation ⇒ BLOCKING" signature,
      // so Run 19's P1 — which derived the exactly-minimal 10.99.0.6/31 and whose own reviewer
      // approved it at 92 — blocked the program. A parse miss and a real refusal were
      // indistinguishable at the gate, and the parse miss is the commoner one.
      //
      // Author FIRST: its package is what actually ships, so it is the strongest anchor when
      // present. Fall back to the other children in protocol order. `derivedSource` records where
      // the block was really found, so the attribution is never inferred — a consumer comparing it
      // to the author child id can see that the Author did not carry it.
      //
      // Absence from EVERY child keeps its original meaning: that IS the refusal signal
      // (VT-11's collision refusal, the run-2/3 dropped block).
      let derived = parseFencedJsonBlock<DerivedValue>(authorText, DERIVED_VALUES_MARKER);
      let derivedFromId = authorChild.id;
      if (!derived) {
        for (const c of children) {
          if (c.id === authorChild.id || c.id === harvestChild.id) continue;
          const alt = parseFencedJsonBlock<DerivedValue>(await finalOf(c.id), DERIVED_VALUES_MARKER);
          if (alt) { derived = alt; derivedFromId = c.id; break; }
        }
      }
      // Same text, no extra query: a consuming leg emits `## Consumed Values` instead of deriving.
      consumed = parseFencedJsonBlock<ConsumedValue>(authorText, CONSUMED_VALUES_MARKER);
      // Ordering is load-bearing (finding (f), run 10 2026-07-18): derivation-EXISTENCE first.
      // A leg that declares NO derivations is benign regardless of its harvest block — a
      // terraform/k8s harvester legitimately emits no '## Harvested Allocations' (that marker
      // is the network protocol's contract), and demanding the harvest anchor FIRST stamped
      // such legs with the blocking-classified 'harvest-block-missing-or-unparseable',
      // priming a false program block on otherwise-green runs.
      if (!derived) {
        // `harvestedCount` is the DERIVING TEST, made mechanical (A7, 2026-07-31). It was parsed two
        // lines above and previously DISCARDED here — the fact needed to classify this reason was
        // computed and thrown away, which is why the benign/blocking call fell to LLM judgement.
        //
        //   PRESENT (block parsed) ⇒ the leg harvested a pool and emitted NO derivation. Since
        //                            2026-08-16 (cross-port ①) this classifies NEEDS-NODE-C, not
        //                            blocking: with harvest blocks now a cross-domain contract, a
        //                            pool-with-no-derivation is ambiguous between an audit-shaped
        //                            objective (common tf intents) and a real refusal/dropped
        //                            enumeration (VT-11, runs 2/3) — escalate, don't decide. A
        //                            CONSUMING leg (`## Consumed Values` + upstream green) is
        //                            discharged benign by the disposition before this test.
        //   ABSENT  (no parse)     ⇒ the leg harvested no pool ⇒ nothing to derive ⇒ benign.
        //                              Run 15's terraform leg (bucket state, not addresses).
        //
        // Absent vs zero are DIFFERENT and both are kept: absent = the `## Harvested Allocations`
        // block did not parse; 0 = it parsed and the pool was empty (still a deriving leg — it
        // looked). Collapsing them would re-create the ambiguity this field exists to remove.
        fact = {
          checked: false,
          reason: 'no-derived-values-block',
          harvestSource: harvestChild.id,
          derivedSource: authorChild.id,
          // CIDR-ONLY by design — see harvestCounts(). A kind-blind total here would classify an
          // ASN-harvesting leg that derives nothing as a REFUSAL (ph F1): a false program block.
          ...(harvested ? harvestCounts(harvested) : {}),
        };
      } else if (!harvested) {
        // ⚠️ THE HARVEST PRECONDITION IS A DELIBERATE v1 DECISION, NOT AN OVERSIGHT (arch F2,
        // 2026-08-02 — surfaced by adding the SECOND kind).
        //
        // checkDerivationContainment is the only place a per-kind checker can live, and this branch
        // makes it unreachable without a parseable harvest block. That is correct for RELATIONAL
        // properties (cidr containment, asn membership) — they are meaningless with nothing to
        // relate to. It is a genuine constraint for UNARY ones: `asn-reserved-range` is a predicate
        // on the derived value ALONE and could in principle be checked here with no harvest at all.
        //
        // We do NOT check it here, on purpose. Running range checks with no harvest would stamp
        // `checked: true` on a fact whose containment half is hollow, and the taxonomy already names
        // hollow-green as the worse signal ("never accept a FABRICATED harvest block as the
        // remedy"). A `checked:false` with a reason is more honest than a partially-checked true.
        //
        // The engine assumed every property is a RELATION between harvested and derived, so it made
        // harvest a precondition for reaching any checker. ASN range policy is the first property
        // that isn't. Revisit if a kind arrives whose ONLY properties are unary.
        // Pinned by scripts/test-containment-enrichment-branches.ts so this stays intended.
        fact = { checked: false, reason: 'harvest-block-missing-or-unparseable', harvestSource: harvestChild.id, derivedSource: derivedFromId };
      } else {
        const contained = checkDerivationContainment(harvested, derived);
        // ORPHAN CHECK (2026-08-04). Containment proves a derived value came from the pool; it says
        // nothing about whether the package USES it. An injected entry is contained-irrelevant — a
        // legal value no config applies and no validation checks (Run 22 `asn` 65100, Run 24 `vlan`
        // 100, both appearing exactly ONCE in the document: their own declaration).
        // Joins the SAME violations array the gate already blocks on — no new taxonomy branch.
        // Scanned against the AUTHOR's text, which is the change package the human receives.
        // authorText is string|null. Null means we have no package to scan, and absence of the
        // package is NOT evidence the values are unused — the checker returns [] for empty input
        // (pinned by O6). Scanning the AUTHOR's text specifically: that is the package the human
        // receives at apply time, even when the derived block was read from another child.
        const orphaned = checkDerivedValueUsage(derived, authorText ?? '');
        fact = {
          ...contained,
          ...(orphaned.length
            ? { violations: [...(contained.violations ?? []), ...orphaned] }
            : {}),
          harvestSource: harvestChild.id,
          derivedSource: derivedFromId,
        };
      }
    }
  }

  // Consuming-leg containment attribution. A CONSUMING leg (e.g. terraform-iac) has no allocation
  // pool of its own to check a derivation against; containment for the value it consumes was
  // discharged UPSTREAM (machine-checked against the real pool) and is re-verified at the program
  // tier by Node C. We record the UPSTREAM FACT — never a verdict (Protocol 10): "these report.md
  // predecessors stamped this". The gate decides.
  //
  // `green` is a pure function of the transcribed legs, computed by the shared predicate so every
  // consumer agrees: a clean deriving predecessor exists AND no predecessor carries a violation
  // (ALL, deliberately not at-least-one — a clean sibling must not mask a dirty one).
  if (fact.checked === false) {
    const entries: ChainedFromEntry[] = Array.isArray(chainedFrom) ? (chainedFrom as ChainedFromEntry[]) : [];
    // `source: 'report.md'` marks a PIPELINE predecessor's REAL deliverable (context-chainer CC2);
    // a pipeline-index.json fallback means the deliverable never arrived, so it does not qualify.
    const upstream = entries.filter(c => c?.source === 'report.md' && typeof c?.taskId === 'string');
    if (upstream.length > 0) {
      const legs: UpstreamContainmentLeg[] = [];
      let lookupMisses = 0;
      for (const entry of upstream) {
        // The predecessor's stamp is carried BY THE CHAINER, which already resolved the correct
        // facts artifact for the predecessor's type (context-chainer:216 branches PIPELINE ->
        // pipeline-index.json). Re-resolving it here is what shipped defect 3; the field below is
        // the single source. A missing value is counted, never silently dropped — absence of the
        // field must not conflate "no upstream" with "upstream found but unreadable".
        const dc = (entry as { derivationContainment?: unknown }).derivationContainment as
          { checked?: unknown; violations?: unknown; derivedValues?: unknown;
            containmentDisposition?: { disposition?: unknown; reason?: unknown } | null;
            upstreamContainment?: { legs?: unknown } | null } | null | undefined;
        if (dc && typeof dc === 'object') {
          const derived = Array.isArray(dc.derivedValues)
            ? (dc.derivedValues as Array<{ kind?: unknown; value?: unknown }>)
              .filter(v => typeof v?.value === 'string')
              .map(v => ({ kind: typeof v.kind === 'string' ? v.kind : 'cidr', value: v.value as string }))
            : undefined;
          const disp = dc.containmentDisposition && typeof dc.containmentDisposition === 'object'
            ? dc.containmentDisposition : null;
          legs.push({
            taskId: entry.taskId as string,
            checked: dc.checked === true,
            violations: Array.isArray(dc.violations) ? dc.violations.length : 0,
            ...(derived && derived.length > 0 ? { derivedValues: derived } : {}),
            ...(disp && typeof disp.disposition === 'string'
              ? { disposition: disp.disposition as 'benign' | 'blocking' | 'needs-node-c',
                  ...(typeof disp.reason === 'string' ? { dispositionReason: disp.reason } : {}) }
              : {}),
          });
          // H-2 (2026-09-09): FLATTEN the predecessor's own transcribed legs into this leg's list,
          // tagged `via`. The predecessor already resolved THEM once (the same single-resolution
          // rule as the comment above — nothing is re-fetched here; CC3 carried the whole object).
          // A predecessor WITHOUT `upstreamContainment` contributes itself only and inherits
          // nothing — a pre-CC3 or unreadable stamp can never become green (invariant 2).
          // Dedup by taskId (diamond shapes): keep the first record, but violations take the MAX so
          // a dirty reading is never masked by a clean duplicate (fail-closed).
          const nested = Array.isArray(dc.upstreamContainment?.legs) ? dc.upstreamContainment!.legs as unknown[] : [];
          for (const n of nested) {
            const nl = n as { taskId?: unknown; checked?: unknown; violations?: unknown; derivedValues?: unknown;
              disposition?: unknown; dispositionReason?: unknown };
            if (!nl || typeof nl.taskId !== 'string') continue;
            const rec: UpstreamContainmentLeg = {
              taskId: nl.taskId,
              checked: nl.checked === true,
              violations: typeof nl.violations === 'number' ? nl.violations : 0,
              via: entry.taskId as string,
              ...(Array.isArray(nl.derivedValues) && nl.derivedValues.length > 0
                ? { derivedValues: nl.derivedValues as Array<{ kind: string; value: string }> } : {}),
              ...(typeof nl.disposition === 'string'
                ? { disposition: nl.disposition as 'benign' | 'blocking' | 'needs-node-c',
                    ...(typeof nl.dispositionReason === 'string' ? { dispositionReason: nl.dispositionReason } : {}) }
                : {}),
            };
            const dup = legs.find(l => l.taskId === rec.taskId);
            if (dup) { dup.violations = Math.max(dup.violations, rec.violations); continue; }
            legs.push(rec);
          }
        } else {
          lookupMisses++;
        }
      }
      // Emitted whenever report.md predecessors EXIST, even with zero readable legs — so an empty
      // result is diagnosable as a miss rather than looking like "this leg has no upstream".
      // Run 15 stamped nothing at all here and the inertness took a day to find.
      fact.upstreamContainment = {
        green: isUpstreamContainmentGreen(legs),
        legs,
        ...(lookupMisses > 0 ? { lookupMisses } : {}),
      };

      // CHECK 1, MECHANICAL (2026-07-31). "The policy value exactly equals the aggregate the network
      // leg derived — the chained value, not a guess, not a recomputation." Until now the only
      // correctness check in the sequenced chain resting entirely on a reviewer reading upstream
      // PROSE; check 2b went unperformed on two consecutive runs by two different mechanisms, so
      // that assumption is not one to keep.
      //
      // Both sides are facts: the upstream's own `derivedValues` rode the chaining edge (CC3 carries
      // the whole containment object), and the consuming Author declared `## Consumed Values`.
      // LIMIT, deliberate: this compares what the leg SAYS it applied against what upstream derived.
      // It does not prove what went into the authored artifact — a leg could declare X and write Y.
      // That residue stays Node C's, and it is the same trust model `## Derived Values` always had.
      // H-2: the deriving leg may sit any number of hops up. `legs[]` (direct + flattened `via`
      // entries) carries each deriving leg's transcribed `derivedValues`, so check 1 compares
      // against the TRUE origin at every hop — not against a relay. Direct entries are read from the
      // chained object as before; the union is de-duplicated by kind+value.
      const seen = new Set<string>();
      const upstreamDerived: Array<{ kind: string; value: string }> = [];
      const addDerived = (vals: unknown) => {
        if (!Array.isArray(vals)) return;
        for (const v of vals as Array<{ kind?: unknown; value?: unknown }>) {
          if (typeof v?.value !== 'string') continue;
          const kind = typeof v.kind === 'string' ? v.kind : 'cidr';
          const key = `${kind}:${v.value}`;
          if (seen.has(key)) continue;
          seen.add(key); upstreamDerived.push({ kind, value: v.value });
        }
      };
      for (const e of upstream) addDerived((e as { derivationContainment?: { derivedValues?: unknown } }).derivationContainment?.derivedValues);
      for (const l of legs) addDerived(l.derivedValues);
      if (Array.isArray(consumed) && consumed.length > 0) {
        // Stamped even when it matches, so a consumer can see WHAT was compared rather than
        // inferring it from the absence of a violation.
        fact.consumedValues = consumed
          .filter(c => typeof c?.value === 'string' && c.value.length > 0)
          .map(c => ({ kind: c.kind ?? 'cidr', value: c.value as string }));
        const mismatches = checkConsumedValues(consumed, upstreamDerived);
        if (mismatches.length > 0) {
          // Joins the SAME violations array the gate already blocks on unconditionally — no new
          // taxonomy branch, no new gate wiring. `violations` means "mechanical defects found".
          fact.violations = [...(Array.isArray(fact.violations) ? fact.violations : []), ...mismatches];
        }
      }
    }
  }

  // G4 — COMPUTED HERE, IMMEDIATELY BEFORE RETURN, AND NOWHERE ELSE. `consumed-value-mismatch`
  // violations are appended ~31 lines above, AFTER upstreamContainment is stamped. A disposition
  // computed any earlier reads `fact.violations` before those exist and stamps benign on exactly the
  // run this mechanisation is for. Ordering is load-bearing; do not hoist.
  // G1 — NESTED under the fact, never a sibling: `pickResultJsonSummary` is a strict whitelist and a
  // sibling would be stripped at the hoist, leaving it invisible to the card and ABSENT at the gate.
  fact.containmentDisposition = computeContainmentDisposition(fact);

  return fact;
}
