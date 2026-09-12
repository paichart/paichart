/**
 * THE REGISTRY'S CONTENTS (stage 2b, 2026-09-12) — the six entries that were six hand-wired blocks
 * in `execution-core.ts` until today.
 *
 * READ `net-registry.ts` FIRST: it states what the registry deliberately does NOT do (lanes,
 * domains, arm ordering, the whitelist), and every one of those exclusions is load-bearing here.
 *
 * ── THE MIGRATION'S ACCEPTANCE IS BYTE EQUIVALENCE ──────────────────────────────────────────────
 * `scripts/test-net-registry-equivalence.ts` replays these entries against ARCHIVED legs and
 * asserts each stamped fact is `JSON.stringify`-identical to what PRODUCTION ACTUALLY STAMPED on
 * that leg — not to a frozen copy of the old code, which would only compare one set of assumptions
 * against a second copy of itself. Two consequences you must respect when editing this file:
 *
 *   • **Key ORDER is part of the contract.** `contractApplicability` is assigned LAST on both facts
 *     that carry it, exactly as the call site did, because `JSON.stringify` is order-sensitive.
 *   • **The tier and error literals are transcribed VERBATIM** from the blocks they replace. If one
 *     looks redundant or improvable, that is a separate, deliberate, gated change — not a tidy-up
 *     smuggled in under a migration.
 *
 * The one intended behavioural change in this file is SURFACING: `dialectLint` and
 * `contractPropagation` gain a card render they never had. That is invisible to the equivalence
 * gate by construction — the gate compares STAMPED facts, and a render reads one.
 */
import { computeMarkerPresence, renderMarkerPresence, HARNESS_LEAF_ROLE_RE } from './marker-presence';
import { computeDerivationContainmentFact } from './derivation-containment-enrichment';
import { computeDialectLintFact } from './dialect-lint-enrichment';
import { computeContractPropagationFact } from './contract-propagation-enrichment';
import {
  computeRollbackContainmentFact,
  hoistRollbackContainment,
} from './rollback-containment-enrichment';
import { AUTHOR_LEAF_ROLE_RE } from './rollback-containment';
import { renderRollbackContainmentForPrompt } from './render-rollback-containment';
import type { Fact, MechanicalNet, NetContext } from './net-registry';
import type { PrismaClient } from '@prisma/client';

const isLegSynthesize = (ctx: NetContext) =>
  ctx.task.type === 'PIPELINE' && ctx.harnessMode === 'SYNTHESIZE';

export const MECHANICAL_NETS: readonly MechanicalNet[] = [
  // ── H-4 (2026-09-10): which machine-parsed blocks the platform found in a harness LEAF's output.
  // Stamped on the leaf so the chainer carries it to the NEXT leaf's §6, where the Reviewer reads
  // it — a card-only fact never reaches a sibling's prompt (R12).
  {
    name: 'markerPresence',
    point: 'leaf-persist',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && HARNESS_LEAF_ROLE_RE.test(ctx.agentRole ?? ''),
    enrich: async (ctx) => computeMarkerPresence(ctx.finalResponse) as unknown as Fact,
    // Pure and synchronous over a string, so this arm is unreachable in practice — which is exactly
    // why it must still exist and be pinned. An unreachable arm that is WRONG is discovered by the
    // first thing that makes it reachable.
    errorFact: () => ({ checked: false, reason: 'enrichment-error' }),
    renderCard: 'lean-card-facts',
    renderPrompt: (fact) => {
      const line = renderMarkerPresence(fact as Record<string, unknown>);
      return line ? [`- **Machine-parsed blocks (platform fact)**: ${line}`] : null;
    },
  },

  // ── Net #3 (2026-09-11), COMPUTE half. The first net stamped on a LEAF rather than at the leg's
  // SYNTHESIZE, and the placement IS the design: a SYNTHESIZE stamp lands after this leg's Reviewer
  // has already run, which is the blindness the net exists to end.
  {
    name: 'rollbackContainment',
    point: 'leaf-persist',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && AUTHOR_LEAF_ROLE_RE.test(ctx.agentRole ?? ''),
    enrich: (ctx) => computeRollbackContainmentFact(ctx.prisma, {
      taskId: ctx.task.id,
      deliverable: ctx.finalResponse,
    }),
    errorFact: () => ({
      checked: false, reason: 'enrichment-error',
      rollbackDisposition: {
        disposition: 'blocking', reason: 'hard-gap',
        inputs: { reason: 'enrichment-error', missingCount: 0, restoreLinesTotal: 0 },
      },
    }),
    renderCard: 'lean-card-facts',
    renderPrompt: (fact) => renderRollbackContainmentForPrompt(fact),
  },

  // ── Net #1 (2026-07-17): the subnetting arithmetic an LLM cannot be trusted with.
  {
    name: 'derivationContainment',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    enrich: (ctx) => computeDerivationContainmentFact(ctx.prisma, {
      stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
      chainedFrom: (ctx.task.inputContext as { chainedFrom?: unknown } | null)?.chainedFrom,
      programTier: ctx.programTier,
    }),
    errorFact: () => ({
      checked: false, reason: 'enrichment-error',
      containmentDisposition: {
        disposition: 'blocking', reason: 'hard-gap',
        inputs: { reason: 'enrichment-error', violationCount: 0, unsupportedCount: 0 },
      },
    }),
    renderCard: 'lean-card-facts',
    // Structurally impossible, and this is the cleanest example of why the reason is required
    // rather than the slot merely optional: the fact is stamped at the leg's SYNTHESIZE, AFTER the
    // Reviewer has run, so there is no §6 left to render it into. Not an omission — a consequence
    // of where it is stamped, and the thing `rollbackContainment` moved its stamp to escape.
    renderPrompt: null,
    renderNullReason:
      'prompt: stamped at leg SYNTHESIZE, after the Reviewer has run — no §6 exists to render into',
  },

  // ── Net #2 (2026-08-25): banned platform tokens + the PRESENCE half (a required canonical line
  // omitted entirely — config that enters, commits and displays while the protocol stays OFF).
  {
    name: 'dialectLint',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    enrich: async (ctx) => {
      const lint = await computeDialectLintFact(ctx.prisma as PrismaClient, {
        stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        interfaceContract: (ctx.task.inputContext as { interfaceContract?: unknown } | null)?.interfaceContract,
        programTier: ctx.programTier,
      });
      // LAST, exactly as the call site assigned it — JSON.stringify is order-sensitive and the
      // equivalence gate compares serialized bytes.
      const ca = await ctx.contractApplicability();
      if (ca) (lint as Record<string, unknown>).contractApplicability = ca;
      return lint;
    },
    errorFact: () => ({
      checked: false, reason: 'enrichment-error', tokensConsidered: [], violations: [],
    }),
    // NEW 2026-09-12 — this fact was stamped and whitelisted since 2026-08-25 and rendered NOWHERE.
    // Render WHAT, not how many (F7): a bare count tells a reasoner something is wrong and denies
    // it the subject, which is how Node C came to "verify" the nearest thing and report nothing
    // anomalous.
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason:
      'prompt: stamped at leg SYNTHESIZE, after the Reviewer has run — no §6 exists to render into',
  },

  // ── Net #4 (2026-08-26): the first net that lints the HARNESS'S OWN DECOMPOSITION rather than an
  // agent's output — did each child actually receive the contract its obligations are conditional on?
  {
    name: 'contractPropagation',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    enrich: async (ctx) => {
      const propagation = await computeContractPropagationFact(ctx.prisma as PrismaClient, {
        stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        interfaceContract: (ctx.task.inputContext as { interfaceContract?: unknown } | null)?.interfaceContract,
        programTier: ctx.programTier,
      }) as unknown as Record<string, unknown>;
      const ca = await ctx.contractApplicability();
      if (ca) propagation.contractApplicability = ca;
      return propagation;
    },
    errorFact: () => ({
      checked: false, reason: 'enrichment-error', canonicalLinesConsidered: 0, children: [],
    }),
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason:
      'prompt: stamped at leg SYNTHESIZE, after the Reviewer has run — no §6 exists to render into',
  },

  // ── Net #3, HOIST half. Reads the Author child's stamp; never recomputes. Two consumers must
  // agree on ONE set of numbers — the Reviewer (which saw it in §6 a leaf earlier) and the gate
  // (which reads this leg's card). A recomputation could diverge; a hoist is identical by
  // construction.
  {
    name: 'rollbackContainment',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    enrich: (ctx) => hoistRollbackContainment(ctx.prisma, {
      stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
      programTier: ctx.programTier,
    }),
    errorFact: () => ({
      checked: false, reason: 'enrichment-error',
      rollbackDisposition: {
        disposition: 'blocking', reason: 'hard-gap',
        inputs: { reason: 'enrichment-error', missingCount: 0, restoreLinesTotal: 0 },
      },
    }),
    renderCard: 'lean-card-facts',
    // The leg's own SYNTHESIZE has no §6 to render into; the Author-persist entry above is the one
    // that reaches the Reviewer, which is the entire reason this net registers at two points.
    renderPrompt: null,
    renderNullReason:
      'prompt: the Author-persist entry carries this fact into §6; a leg-SYNTHESIZE render would ' +
      'arrive after the review it exists to inform',
  },
];
