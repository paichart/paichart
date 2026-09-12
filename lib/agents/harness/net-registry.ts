/**
 * THE SHARED MECHANICAL-NET REGISTRY (stage 2b, 2026-09-12).
 *
 * WHY IT EXISTS. Five facts were wired BY HAND at six sites in `execution-core.ts`, and a
 * hand-wired site can be FORGOTTEN — which is the one failure this domain cannot detect, because a
 * net that was never called stamps nothing, and an absent fact is indistinguishable from a fact
 * that ran and found nothing. The registry's single guarantee is the inverse of that:
 *
 *   ▶ A REGISTERED NET CAN BE INERT ONLY BY RETURNING AN INERT FACT, NEVER BY BEING FORGOTTEN.
 *
 * Everything else here — `ctx`, `appliesTo`, the uniform catch — exists to make that guarantee
 * cheap enough that nobody is tempted to hand-wire the next one.
 *
 * ── THE THREE THINGS THIS REGISTRY DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * 1. **It does not decide LANES or DOMAINS.** `appliesTo` answers exactly one question: does this
 *    net run at THIS invocation point on THIS task. There are already THREE lane/applicability
 *    decisions at three layers — the enrichment's own lane arm (`lane-not-supported`), the
 *    chainer's §6 lane filter, and each net's tier arm — and `render-pipeline-context.ts` documents
 *    the debugging confusion they already cause. A FOURTH, here, would be the one that looks
 *    authoritative. If a net should decline on a lane, it declines INSIDE `enrich` by returning a
 *    named fact, where the reason is visible in the artifact.
 *
 * 2. **It does not inspect, order, or validate a net's ARMS.** Arm precedence is load-bearing and
 *    net-specific: hoisting `no-child-stage` above the lane arm would flip a stage-less package
 *    from benign to BLOCKING, and no uniform rule can know that. `errorFact()` is the CATCH arm —
 *    what is stamped when `enrich` THROWS — and composes with in-`enrich` arms on a disjoint axis.
 *    There is deliberately NO registry-level "every reason is in an allowlist" test: that is the
 *    mechanism that would quietly break lane-first ordering.
 *
 * 3. **It does not own the whitelist.** A net's `name` IS its `resultJson` key, and that key must
 *    be on `RESULT_JSON_SUMMARY_KEYS` or the strict pick drops it silently (E3b). Registering a net
 *    is not the same act as whitelisting its key; the parity suite is what pairs them.
 */
import type { PrismaClient } from '@prisma/client';

/**
 * WHICH PERSIST a net runs at. This is a REGISTRY KEY, not a hint: a net may register at more than
 * one point with different `enrich` implementations, and `rollbackContainment` does exactly that on
 * day one (computed at the Author leaf's persist so the chainer can carry it into the Reviewer's
 * §6 BEFORE the review; hoisted, never recomputed, at the leg's SYNTHESIZE so the Reviewer and the
 * gate can never see different numbers for one package). Two invocation points of ONE loop.
 */
export type StampPoint = 'leaf-persist' | 'leg-synthesize';

/** A fact is any JSON object. The SHAPE is each net's business; the registry only stamps it. */
export type Fact = Record<string, unknown>;

/**
 * Everything the six sites already read, resolved ONCE per persist, plus the derivations more than
 * one net needs.
 *
 * `contractApplicability` is the worked example of the general rule, and the rule is worth stating
 * because it will be asked again: **a derived value consumed by ≥2 nets belongs on `ctx`; a derived
 * value with its own whitelisted key is a NET; a value nested on exactly one fact stays private to
 * that net.** Contract applicability has no `resultJson` key of its own — it rides NESTED inside
 * `dialectLint` and `contractPropagation` — so modelling it as a net would force inventing a
 * top-level key, and a top-level sibling of a whitelisted fact is stripped by
 * `pickResultJsonSummary` and reads ABSENT at the gate. That is the E3b trap, reached by way of an
 * abstraction.
 */
export interface NetContext {
  prisma: PrismaClient;
  task: { id: string; type: string | null | undefined; metadata: unknown; inputContext: unknown };
  agentRole: string | null;
  harnessMode: string | null;
  /** The leaf/leg output. NULLABLE by the core's own type — nets handle absence, never the caller. */
  finalResponse: string | null | undefined;
  /** `task.metadata.pipelineStageId` — the leg's child stage, or null. */
  stageId: string | null;
  /** `isProgramHarnessTask` resolved once. Each net's TIER ARM lives inside its own enrichment. */
  programTier: boolean;
  /**
   * The leg's child tasks, memoized. ⚠️ SEARCH-shaped: bounded `take: STAGE_CHILD_SCAN_CAP` with
   * `orderBy createdAt asc`, which is safe ONLY because every consumer today FINDS one child by
   * role and protocol phase order puts harvest/author children first. The moment a consumer
   * AGGREGATES over this (counts, compares, sorts) the shared cap stops truncating an answer and
   * starts producing a DIFFERENT one — allowlist that read in `validate-pagination.ts` instead of
   * reusing this. See pagination-safety-cap-pattern (registry #40).
   */
  children(): Promise<Array<{ id: string; title: string; agentRole: string | null }>>;
  /** Contract applicability, memoized; `null` at program tier and when the tier is unresolvable. */
  contractApplicability(): Promise<Record<string, unknown> | null>;
}

export interface MechanicalNet {
  /** The `resultJson` key this net stamps. MUST be on `RESULT_JSON_SUMMARY_KEYS`. */
  name: string;
  /** Which persist this entry runs at. `(name, point)` is the registry's unique key. */
  point: StampPoint;
  /** Does this net run on THIS task at THIS point? Invocation only — never a lane or domain test. */
  appliesTo(ctx: NetContext): boolean;
  /** Read the world, return the fact. Never throws by design; the loop owns the catch anyway. */
  enrich(ctx: NetContext): Promise<Fact>;
  /**
   * The CATCH arm — what is stamped when `enrich` throws. PURE and zero-argument on purpose: an
   * error fact that took `ctx` would invite re-running arm logic on the one path where something
   * has already gone wrong. Contract, pinned by `test:net-registry`: `checked:false` +
   * `reason:'enrichment-error'` + a named BLOCKING disposition where the net has a disposition at
   * all. That is the G3 lesson mechanised — the single arm that means "things went wrong" must
   * never render clean.
   */
  errorFact(): Fact;
  /**
   * TWO render slots, not one, because the lean card and the §6 prompt are DIFFERENT AUDIENCES
   * with different coverage: `derivationContainment` renders on the card and nowhere in §6.
   * A single field would let a net satisfy render-required on the card while staying invisible to
   * the Reviewer — the same defect one surface over, which is precisely the state the
   * render-required convention exists to prevent.
   *
   * Both are REQUIRED FIELDS. A net that deliberately surfaces nowhere registers `null` WITH a
   * recorded reason, so "not rendered" is an explicit, greppable, reviewable value instead of an
   * absence nobody notices — the A1/F7 class.
   */
  /**
   * WHERE the card render lives, not the renderer itself. `lean-card-facts.js` is CommonJS loaded
   * by the MCP server in bare Node, which cannot `require` a TypeScript module — so a function here
   * would either be unreachable from the card or force a SECOND renderer for the same fact, which
   * is the two-extractor class wearing a reuse label. A declaration crosses the boundary cleanly
   * and is still enforceable: `test:net-registry` asserts that the named file actually references
   * this net, so a net cannot claim a render it does not have.
   */
  renderCard: 'lean-card-facts' | null;
  /** The §6 prompt render. A real function: `render-pipeline-context.ts` is TypeScript. */
  renderPrompt: ((fact: Fact) => string[] | null) | null;
  /** Required when either render slot is `null`. Free text; its presence is what is enforced. */
  renderNullReason?: string;
}

/**
 * Stamp every applicable net for one invocation point.
 *
 * The per-net catch is what makes the guarantee true: a net that throws still stamps — its
 * `errorFact()` — so the only way to produce NOTHING is to be absent from the registry, and the
 * registry is one array that a reviewer can read in full.
 */
export async function runNetsAtPoint(
  point: StampPoint,
  ctx: NetContext,
  nets: readonly MechanicalNet[],
  stamp: (name: string, fact: Fact) => void,
  onError: (name: string, err: unknown) => void
): Promise<void> {
  for (const net of nets) {
    if (net.point !== point) continue;
    if (!net.appliesTo(ctx)) continue;
    try {
      stamp(net.name, await net.enrich(ctx));
    } catch (err) {
      stamp(net.name, net.errorFact());
      onError(net.name, err);
    }
  }
}

/**
 * Load-time structural check. A duplicate `(name, point)` is a THROW, not a warning: two entries
 * stamping one key at one point is last-writer-wins, and it would be invisible — the artifact would
 * simply carry the second net's answer under the first net's name. Same reasoning for a missing
 * render decision: the convention is only worth having if it cannot be satisfied by omission.
 */
export function assertRegistryWellFormed(nets: readonly MechanicalNet[]): void {
  const seen = new Set<string>();
  for (const net of nets) {
    const key = `${net.name}@${net.point}`;
    if (seen.has(key)) {
      throw new Error(`net-registry: duplicate entry ${key} — one key, one point, one net`);
    }
    seen.add(key);
    if ((net.renderCard === null || net.renderPrompt === null) && !net.renderNullReason) {
      throw new Error(
        `net-registry: ${key} declares a null render slot without renderNullReason — ` +
        'render-required means an explicit reason, not an omission'
      );
    }
  }
}
