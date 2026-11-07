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
 * ⚠️ PRODUCTION REPLAY BEFORE PUSH (2026-10-02, Protocol 15 phase 6): changing an EXISTING entry here, or an enrichment
 * it calls, ⇒ run `scripts/replay-nets-byte-identity.sh` (base worktree = the commit before your change) and push only
 * on its ✅ — zero changed lines over every production leg in the window AND their children, every added line accounted
 * for. The equivalence gate below covers ~9 archived specimen legs; the replay covers the whole population (2,196 tasks
 * on 2026-10-02). They are complementary, not substitutes.
 *
 * The one intended behavioural change in this file is SURFACING: `dialectLint` and
 * `contractPropagation` gain a card render they never had. That is invisible to the equivalence
 * gate by construction — the gate compares STAMPED facts, and a render reads one.
 */
import { computeMarkerPresence, renderMarkerPresence, HARNESS_LEAF_ROLE_RE } from './marker-presence';
import { computeDerivationContainmentFact } from './derivation-containment-enrichment';
import {
  computeValueLegContainmentFact,
  hoistValueLegContainment,
  isValueLegTask,
  VALUE_LEG_ARCHITECT_ROLE,
} from './value-leg-containment-enrichment';
import { computeDialectLintFact } from './dialect-lint-enrichment';
import { computeContractPropagationFact } from './contract-propagation-enrichment';
import { computeVerdictFreshnessFact } from './verdict-freshness-enrichment';
import { computeReviewerWarningsFact } from './reviewer-warnings-enrichment';
import {
  computeRollbackContainmentFact,
  hoistRollbackContainment,
} from './rollback-containment-enrichment';
import { AUTHOR_LEAF_ROLE_RE } from './rollback-containment';
import { computeQuoteFidelity } from './quote-fidelity';
import { computeAuthorQuoteFidelityFact } from './quote-fidelity-enrichment';
import { computeApplyBlockPlaceholderFact } from './apply-block-placeholder';
import { FORM_CHECK_ELIGIBLE_ROLE } from './package-form-check';
import { computeValidationToolCallsFact } from './validation-tool-calls-enrichment';
import { renderValidationToolCallsForPrompt, VALIDATION_TOOL_CALLS_SCOPE } from './validation-tool-calls';
import { NOT_STAMPED } from './net-registry';
import { computeDeviceSourceReadsFact, computeGitDeviceComparisonHarvesterFact, transcribeGitDeviceComparisonFact } from './device-source-facts-enrichment';
import { renderGitDeviceComparisonForPrompt } from './git-device-comparison';
import { computeLiveEvidenceHarvesterFact, transcribeLiveEvidenceFact, hoistLiveEvidenceFact } from './live-evidence-enrichment';
import { renderLiveEvidenceForPrompt } from './live-evidence';
import { resolveOwningLegProtocol, isHeldCapableLeg } from './held-bytes/variant';
import { selectLegEditApplication, hoistedEditApplication, reviewedEditDiffFromContext, HELD_EDIT_REVIEWER_ROLE } from './held-bytes-nets';
import { readChainedRecord } from './chained-record';

/** quoteFidelity's Harvester point. Matches every harvest role (infra_state_harvester, artifact_harvester). */
export const HARVEST_LEAF_ROLE_RE = /harvest/i;

/**
 * EF-M2 (2026-09-26, GS-R5 panel / execution-facts): roles that author a SPECIFICATION, not a change package.
 * `requirements_author` matches both leaf regexes (/author/), so every requirements generation was stamped
 * `markerPresence ✗✗✗` + `rollbackContainment` — facts about change-package blocks that role never emits — and the
 * ✗✗✗ line was rendered to the Requirements Reviewer as a "platform fact" (9/9 generations; 3/10 reviewers spent a
 * paragraph dismissing it, i.e. the population was being taught to discount platform facts). Excluded from both
 * change-package nets. Anchored on the role-name PREFIX so a future specification role inherits the exclusion.
 */
export const SPECIFICATION_ROLE_RE = /^requirements_/i;
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
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && HARNESS_LEAF_ROLE_RE.test(ctx.agentRole ?? '')
      && !SPECIFICATION_ROLE_RE.test(ctx.agentRole ?? ''),
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
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && AUTHOR_LEAF_ROLE_RE.test(ctx.agentRole ?? '')
      && !SPECIFICATION_ROLE_RE.test(ctx.agentRole ?? ''),
    enrich: (ctx) => computeRollbackContainmentFact(ctx.prisma, {
      taskId: ctx.task.id,
      deliverable: ctx.finalResponse,
      // Stage B V-8a: read only on a held-variant leg (the enrichment's own lane lookup decides). The BASE-held handles come on
      // ctx from prepareHeldPackage — never from the digest's `rollback`, which the overflow fallback drops (EF-P2-3).
      heldRollbackHandles: Array.isArray(ctx.held?.baseHeldHandles) ? ctx.held!.baseHeldHandles : null,
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

  // ── Net #1, VALUE-LEG leaf half (value-chain build B4, 2026-10-02). A value leg has no author child, so the
  // fact is computed on the Derivation Architect's OWN persist — the chainer then carries its disposition into the
  // Reviewer's §6 before the review — and hoisted (never recomputed) at the leg's SYNTHESIZE by the entry below.
  // appliesTo is an EXACT role match on purpose: a regex would stamp every existing Architect (261 in the corpus)
  // and change every downstream prompt. Whether the owning leg really is a value leg is decided INSIDE enrich and
  // stamped as a named reason when it is not — the registry rule (net-registry.ts: no lane/domain test here).
  {
    name: 'derivationContainment',
    point: 'leaf-persist',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && ctx.agentRole === VALUE_LEG_ARCHITECT_ROLE,
    enrich: (ctx) => computeValueLegContainmentFact(ctx.prisma, {
      taskId: ctx.task.id,
      finalResponse: ctx.finalResponse,
      executionId: ctx.executionId ?? null,
    }),
    errorFact: () => ({
      checked: false, reason: 'enrichment-error',
      containmentDisposition: {
        disposition: 'blocking', reason: 'hard-gap',
        inputs: { reason: 'enrichment-error', violationCount: 0, unsupportedCount: 0 },
      },
    }),
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason:
      'prompt: rendered in the Reviewer\'s §6 by render-pipeline-context.ts (the derivation-containment disposition ' +
      'line, read off the chained entry) — a second renderer here would be the two-extractor class',
  },

  // ── Net #1 (2026-07-17): the subnetting arithmetic an LLM cannot be trusted with.
  {
    name: 'derivationContainment',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    // value-chain B4: a VALUE leg hoists its Derivation Architect's leaf stamp (+ the hoist-time tripwires);
    // every other leg is byte-unchanged — isValueLegTask is false on every existing stamp (pinned).
    enrich: (ctx) => (!ctx.programTier && isValueLegTask({ metadata: ctx.task.metadata })
      ? hoistValueLegContainment(ctx.prisma, {
        stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        chainedFrom: (ctx.task.inputContext as { chainedFrom?: unknown } | null)?.chainedFrom,
      })
      : computeDerivationContainmentFact(ctx.prisma, {
        stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
        chainedFrom: (ctx.task.inputContext as { chainedFrom?: unknown } | null)?.chainedFrom,
        programTier: ctx.programTier,
      })),
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
        // Stage B V-8b (A12): the leg itself is the task here (leg-synthesize).
        ...(isHeldCapableLeg(ctx.task) ? { heldVariant: true } : {}),
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
      // value-chain B4 / audit A4: a value leg has no package to roll back — named BENIGN, not a false hard-gap.
      valueLeg: !ctx.programTier && isValueLegTask({ metadata: ctx.task.metadata }),
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
  // ── RWF C.3 (2026-09-26): did the leg's reviewer judge the predecessor executions that were then authoritative?
  // A FACT OF RECORD with no consumer in Stage 1 (execution-facts review §4). The harness's own re-run decision
  // is served by the read-time `verdictFresh` on the reviewer's agent.results card, computed by the SAME function
  // (computeVerdictFreshness), because a leg-synthesize stamp lands after the loop that would act on it.
  {
    name: 'verdictFreshness',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    enrich: (ctx) => computeVerdictFreshnessFact(ctx.prisma, {
      stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
      programTier: ctx.programTier,
    }),
    errorFact: () => ({ checked: false, reason: 'enrichment-error', match: null }),
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason:
      'prompt: stamped at leg SYNTHESIZE, after the Reviewer has run — no §6 exists to render into',
  },

  // ── reviewerWarnings (WARNINGS-INVISIBLE, 2026-10-08; cline_docs/reviews/warnings-invisible-2026-10-08/).
  // HOISTS each reviewer's stamped `reviewerVerdict.warnings` onto the leg (leg arm) or every child leg's stamped
  // fact + Node C's own onto a program root (program arm). The terminal persist renders the leg / program report.md
  // section FROM THIS STAMP ONLY (no reviewer read inside the transaction), so card and report cannot disagree.
  // Gates nothing. A NEW entry — the other entries' stamps are untouched (net-registry-equivalence).
  {
    name: 'reviewerWarnings',
    point: 'leg-synthesize',
    appliesTo: isLegSynthesize,
    enrich: (ctx) => computeReviewerWarningsFact(ctx.prisma as any, {
      stageId: (ctx.task.metadata as Record<string, unknown> | null)?.pipelineStageId,
      programTier: ctx.programTier,
      protocol: (ctx.task.metadata as Record<string, unknown> | null)?.protocol,
    }),
    errorFact: () => ({ checked: false, reason: 'enrichment-error', count: 0, ids: [] }),
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason:
      'prompt: stamped at leg SYNTHESIZE, after the Reviewer has run; it reaches later readers through the platform-rendered report.md section instead',
  },

  // ── quoteFidelity (VERBATIM-QUOTE-OMISSION, 2026-10-13; cline_docs/reviews/verbatim-quote-omission-2026-10-13/). Does
  // a quote reproduce the span of the raw tool result it pairs with? ONE entry at leaf-persist, two roles: the Harvester
  // (pure — its own toolCalls are in hand) and the Author (its reproduction blocks against the leg Harvester's raw; one
  // DB read). APPENDED, so every existing entry's stamp and key order is untouched (proven by the production replay).
  // Escalate-only, consumed by nothing, rendered nowhere — all three by owner decision (A1, B3, B1/B2).
  {
    name: 'quoteFidelity',
    point: 'leaf-persist',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && !SPECIFICATION_ROLE_RE.test(ctx.agentRole ?? '')
      && (HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '') || AUTHOR_LEAF_ROLE_RE.test(ctx.agentRole ?? '')),
    enrich: async (ctx) => (HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '')
      ? computeQuoteFidelity({ point: 'harvest', deliverable: ctx.finalResponse, toolCalls: ctx.toolCalls ?? [] })
      : computeAuthorQuoteFidelityFact(ctx.prisma, {
        taskId: ctx.task.id, deliverable: ctx.finalResponse, ownToolCalls: ctx.toolCalls ?? [],
      })),
    errorFact: () => ({
      checked: false, reason: 'enrichment-error',
      quoteFidelityDisposition: {
        disposition: 'blocking', reason: 'hard-gap',
        inputs: { reason: 'enrichment-error', pairable: 0, escalating: 0 },
      },
    }),
    renderCard: null,
    renderPrompt: null,
    renderNullReason:
      'owner decisions B1/B2 (2026-10-13): stamped and whitelisted, rendered NOWHERE until the Group C Protocol 16 lab '
      + 'measures the render together with the Harvester clause. A render here before that lab would contaminate its '
      + 'baseline. The later render selects findings whose source.lane is file-artifact (A2).',
  },

  // ── applyBlockPlaceholder (PLACEHOLDER-APPLIES-AS-LITERAL interim guard, 2026-10-13; owner decision (a);
  // cline_docs/reviews/platform-held-bytes-2026-10-13/PLACEHOLDER-GUARD-BUILD.md). Does the package, as PERSISTED (R10
  // applied), carry a secret placeholder inside a desired-state or rollback block? Pure, no DB read. EXACT role match
  // (`config_change_author` — never /author/i, which also matches `requirements_author`). APPENDED, so every existing
  // entry's stamp and key order is untouched. Warning-only: no disposition, no gate, no consumer, NOT whitelisted (off the
  // card and the summary; still in the raw result.json a verbose agent.results returns, persisted in the tail). Its one render is the platform-warnings section of the LEG report.md, appended in
  // execution-terminal-persist from this stamp on the deliverable source.
  {
    name: 'applyBlockPlaceholder',
    point: 'leaf-persist',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && ctx.agentRole === FORM_CHECK_ELIGIBLE_ROLE,
    enrich: async (ctx) => computeApplyBlockPlaceholderFact(ctx.finalResponse),
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error', count: 0 }),
    renderCard: null,
    renderPrompt: null,
    renderNullReason:
      'owner decision (a) 2026-10-13: a warning for the OPERATOR, with no agent-facing instruction text — no card segment, '
      + 'no §6 line. It renders only in the leg report.md "Platform warnings (non-blocking)" section '
      + '(lib/services/report-warnings-section.ts), on hit legs; that report.md is chained onward, so on a hit leg the '
      + 'consuming legs, Node C and the program producer read the section.',
    summaryExcludedReason:
      'owner decision (a) 2026-10-13: kept off the lean card and the agent.results summary. NOT invisible: it is in the raw '
      + 'result.json a verbose agent.results returns, persisted after toolCalls (RESULT_JSON_OPERATOR_TAIL_KEYS) so it sits '
      + 'past the 8 KB tool-result head in practice.',
  },
  // ── PLATFORM-HELD-BYTES Stage B V-5f (2026-10-15): the held-variant facts. All CONDITIONAL (`not-variant-leg`): on a
  // non-variant task the enrichment returns NOT_STAMPED — a population answer, never a fact — so every existing result.json
  // is byte-identical. A leg resolution that THREW is not a population answer: it stamps the errorFact (fail-closed).
  // They TRANSCRIBE: the Author/Harvester stamps were built pre-tx by the core (one object with the persist overlay — AE
  // S2); the Reviewer's comes from its prepared snapshot; the hoist reads the selected Author's stamp.
  {
    name: 'editApplication',
    point: 'leaf-persist',
    conditionalStampReason: 'not-variant-leg',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && ctx.agentRole === FORM_CHECK_ELIGIBLE_ROLE,
    enrich: async (ctx) => {
      const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
      if (leg.kind === 'could-not-check') throw new Error(`owning-leg resolution: ${leg.reason}`);
      if (!leg.heldCapable) return NOT_STAMPED;
      return ctx.held?.editApplication ?? { version: 1, state: 'could-not-check', reason: 'step-not-run' };
    },
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error', state: 'could-not-check' }),
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason: 'the Reviewer reads the application through the V-6 `editDiff` entry (a SERVER-SIDE recompute of the diff), never this stamp',
  },
  {
    name: 'heldBytes',
    point: 'leaf-persist',
    conditionalStampReason: 'not-variant-leg',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? ''),
    enrich: async (ctx) => {
      const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
      if (leg.kind === 'could-not-check') throw new Error(`owning-leg resolution: ${leg.reason}`);
      if (!leg.heldCapable) return NOT_STAMPED;
      return ctx.held?.heldBytes ?? { held: 0, refused: {}, reason: 'no-capture' };
    },
    errorFact: () => ({ checked: false, reason: 'enrichment-error' }),
    renderCard: null,
    renderPrompt: null,
    renderNullReason: 'card: an operator digest of what was held — the Author is shown the files themselves (§6 held block), so a count on the card adds nothing an agent acts on; prompt: the held block IS the §6 render',
  },
  {
    name: 'reviewedEditDiff',
    point: 'leaf-persist',
    conditionalStampReason: 'not-variant-leg',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && ctx.agentRole === HELD_EDIT_REVIEWER_ROLE,
    enrich: async (ctx) => {
      const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
      if (leg.kind === 'could-not-check') throw new Error(`owning-leg resolution: ${leg.reason}`);
      if (!leg.heldCapable) return NOT_STAMPED;
      // BC-P2-3: only an Author entry THIS run's chokepoint chained counts as reviewed — read the server-written record.
      const exec = ctx.executionId
        ? await (ctx.prisma as never as { agentExecution: { findUnique: (a: unknown) => Promise<{ context: unknown; config: unknown } | null> } })
          .agentExecution.findUnique({ where: { id: ctx.executionId }, select: { context: true, config: true } })
        : null;
      return reviewedEditDiffFromContext(ctx.task.inputContext, exec ? readChainedRecord(exec).record : null);
    },
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error', state: 'could-not-check' }),
    renderCard: null,
    renderPrompt: null,
    renderNullReason: 'a CARRIER input (V-9: the leg cannot be approved unless its Reviewer saw the selected Author\'s rendered diff); the Reviewer saw the diff itself in §6, so neither surface needs the stamp',
  },
  {
    name: 'editApplication',
    point: 'leg-synthesize',
    conditionalStampReason: 'not-variant-leg',
    appliesTo: (ctx) => ctx.task.type === 'PIPELINE' && ctx.harnessMode === 'SYNTHESIZE' && !ctx.programTier,
    enrich: async (ctx) => {
      const leg = ctx.owningLeg ? await ctx.owningLeg() : await resolveOwningLegProtocol(ctx.prisma as never, ctx.task as never);
      if (!leg.heldCapable) return NOT_STAMPED;
      return hoistedEditApplication(await selectLegEditApplication(ctx.prisma as never, ctx.stageId));
    },
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error', state: 'no-author-stamp' }),
    renderCard: 'lean-card-facts',
    renderPrompt: null,
    renderNullReason: 'the hoist is the GATE\'s copy (the carrier and SYNTHESIZE read it); the Reviewer read the diff in §6',
  },
  // ── validationToolCalls (NETWORK-VALIDATION-RELEASE-RATE §4; owner go 2026-10-23, design amended at build start; built after the
  // WI-B10 push). Does each hub tool call written in a network Author package's VALIDATION steps match what the tool accepts —
  // against the resolved service ROW's schema, else the Harvester's registration, else the leg's own SUCCESSFUL harvest calls of that
  // tool (a weaker, labelled observation)? APPENDED, so every existing entry's stamp and key order is untouched. CONDITIONAL: off a
  // network-provisioning leg the enrichment returns NOT_STAMPED (a population answer), so every other domain's result.json is
  // byte-identical. A FACT for the leg Reviewer (§6, via the chainer), NOT a gate: no qualityGate / programReleasable input
  // (pipeline-harness owns consumption). NOT whitelisted (operator tail), so the lean card — read by SYNTHESIZE and the program gate —
  // never carries it, and the result.json head offset is unchanged.
  {
    name: 'validationToolCalls',
    point: 'leaf-persist',
    conditionalStampReason: 'not-network-leg',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && ctx.agentRole === FORM_CHECK_ELIGIBLE_ROLE,
    enrich: async (ctx) => computeValidationToolCallsFact(ctx.prisma as never, { taskId: ctx.task.id, deliverable: ctx.finalResponse }),
    errorFact: () => ({ version: 1, scope: VALIDATION_TOOL_CALLS_SCOPE, checked: false, reason: 'enrichment-error', findings: [] }),
    renderCard: null,
    renderPrompt: (fact) => renderValidationToolCallsForPrompt(fact),
    renderNullReason:
      'owner/consumer decision 2026-10-23 (network-held-1): a fact for the leg REVIEWER only — rendered in §6, never on the lean card, '
      + 'which feeds leg SYNTHESIZE and the program gate (no gate input by design).',
    summaryExcludedReason:
      'kept off the lean card and the agent.results summary (no gate consumer); persisted in the operator tail after toolCalls '
      + '(RESULT_JSON_OPERATOR_TAIL_KEYS) so the 8 KB head and the finalResponse offset do not move. NOT invisible: the chainer reads '
      + 'the full result.json and carries it to the Reviewer, and a verbose agent.results returns it.',
  },
  // ── held-network step 3 batch 2b (STEP3-INVENTORY P3 / P5; owner S3-A / S3-C, 2026-10-25). Two Harvester facts on a Device-sources
  // leg (network-provisioning), APPENDED so every existing entry's stamp and key order is untouched. CONDITIONAL: off such a leg the
  // enrichment returns NOT_STAMPED, so every other domain's result.json is byte-identical. Neither is whitelisted (operator tail):
  // the lean card — read by SYNTHESIZE and the program gate — never carries them, and the 8 KB head offset does not move. FACTS,
  // NOT gates: no qualityGate / programReleasable input (pipeline-harness owns consumption; owner: warn-by-default).
  {
    name: 'deviceSourceReads',
    point: 'leaf-persist',
    conditionalStampReason: 'not-device-source-leg',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '') && !SPECIFICATION_ROLE_RE.test(ctx.agentRole ?? ''),
    enrich: async (ctx) => computeDeviceSourceReadsFact(ctx),
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error' }),
    renderCard: null,
    renderPrompt: null,
    renderNullReason:
      'F-NW1 platform half (owner S3-A, 2026-10-25): an OPERATOR fact — read by MI-13 and the live window (did the Harvester read each '
      + 'declared source?). The Harvester\'s own output already names each source it read; an agent render is earned from outcomes, '
      + 'never shipped ahead of them.',
    summaryExcludedReason:
      'an operator fact with no gate consumer; persisted in the operator tail (RESULT_JSON_OPERATOR_TAIL_KEYS) so the 8 KB head and '
      + 'the finalResponse offset do not move. A verbose agent.results returns it.',
  },
  {
    name: 'gitDeviceComparison',
    point: 'leaf-persist',
    conditionalStampReason: 'not-device-source-leg',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && !SPECIFICATION_ROLE_RE.test(ctx.agentRole ?? '')
      && (HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '') || ctx.agentRole === FORM_CHECK_ELIGIBLE_ROLE),
    // Harvester: computed from its own tool calls. Author: the Harvester's stamp TRANSCRIBED (never recomputed), so the chainer
    // carries one comparison to both readers — the Architect (Harvester entry) and the leg Reviewer (Author entry).
    enrich: async (ctx) => (HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '')
      ? computeGitDeviceComparisonHarvesterFact(ctx) : transcribeGitDeviceComparisonFact(ctx)),
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error' }),
    renderCard: null,
    renderPrompt: (fact) => renderGitDeviceComparisonForPrompt(fact),
    renderNullReason:
      'owner S3-C (2026-10-25): a warning fact for the network Architect and leg Reviewer only — rendered in §6 (the chainer carries it '
      + 'to those two roles), never on the lean card, which feeds leg SYNTHESIZE and the program gate (gates nothing by design).',
    summaryExcludedReason:
      'kept off the lean card and the agent.results summary (no gate consumer); persisted in the operator tail so the 8 KB head and '
      + 'the finalResponse offset do not move. NOT invisible: the chainer reads the full result.json and carries it to the Architect '
      + 'and the Reviewer, and a verbose agent.results returns it.',
  },
  // ── Config-sources network push 1a (DESIGN v2 §1.4; execution-facts S1/S3/S4, 2026-11-04): `liveEvidence` — for each declared
  // device, was its live configuration read, read from a Git file only, or does no read apply? APPENDED (key order is the
  // equivalence contract). CONDITIONAL and VERSION-KEYED: NOT_STAMPED unless the persisting execution's own stamped protocol version
  // is a released Config-sources version (network-provisioning ≥ 1.26.0) on a Device-sources leg — every stored leg, every value leg
  // and every other domain replays byte-identical. A FACT, never a gate: no qualityGate / programReleasable input and never a
  // containmentDisposition reason (EF-N2). Harvester: computed through the ctx memo's read record. Author: the Harvester stamp
  // TRANSCRIBED so it reaches the leg Reviewer. Leg: the authoritative Harvester's stamp HOISTED through the one child selector.
  {
    name: 'liveEvidence',
    point: 'leaf-persist',
    conditionalStampReason: 'not-config-sources-version',
    appliesTo: (ctx) => ctx.task.type !== 'PIPELINE' && !SPECIFICATION_ROLE_RE.test(ctx.agentRole ?? '')
      && (HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '') || ctx.agentRole === FORM_CHECK_ELIGIBLE_ROLE),
    enrich: async (ctx) => (HARVEST_LEAF_ROLE_RE.test(ctx.agentRole ?? '')
      ? computeLiveEvidenceHarvesterFact(ctx) : transcribeLiveEvidenceFact(ctx)),
    errorFact: () => ({ version: 1, checked: false, reason: 'enrichment-error' }),
    renderCard: null,
    renderPrompt: (fact) => renderLiveEvidenceForPrompt(fact),
    renderNullReason:
      'owner G4-b DEFER (2026-11-04, SYNTHESIS C1): no lean-card segment — the card is leg SYNTHESIZE\'s and Node C\'s input, and a '
      + 'token there changes what Node C reads with no lab and no golden program case. The consumer requirement is met by the §6 '
      + 'render to LIVE_EVIDENCE_READERS (Architect, Author, leg Reviewer). The card segment ships with the Node C batch.',
    summaryExcludedReason:
      'owner decision 6 (2026-11-04): off the agent.results summary until the Node C batch — leg SYNTHESIZE and Node C read that '
      + 'summary and Node C cannot be lab-replayed; the fact stays in result.json (operator tail) and reaches the leg readers via §6.',
  },
  {
    name: 'liveEvidence',
    point: 'leg-synthesize',
    conditionalStampReason: 'not-config-sources-version',
    appliesTo: (ctx) => ctx.task.type === 'PIPELINE' && ctx.harnessMode === 'SYNTHESIZE' && !ctx.programTier,
    enrich: async (ctx) => hoistLiveEvidenceFact(ctx),
    errorFact: () => ({ version: 1, point: 'leg', checked: false, reason: 'enrichment-error' }),
    renderCard: null,
    renderPrompt: null,
    renderNullReason:
      'owner G4-b DEFER (2026-11-04): the hoist is the leg\'s copy for the record and the later Node C batch — no card segment '
      + 'until then; §6 is rendered from the leaf stamps (the chainer carries leaf entries only, never a pipeline predecessor\'s hoist).',
    summaryExcludedReason:
      'owner decision 6 (2026-11-04): off the agent.results summary until the Node C batch — leg SYNTHESIZE and Node C read that '
      + 'summary and Node C cannot be lab-replayed; the fact stays in result.json (operator tail) and reaches the leg readers via §6.',
  },
];
