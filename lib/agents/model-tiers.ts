/**
 * model-tiers.ts — the SINGLE SOURCE OF TRUTH for which model each agent template runs on.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Before 2026-08-09 the model was a bare literal repeated **15 times across 9
 * seed scripts** with nothing shared between them. The hazard was never model
 * diversity — that is deliberate policy. It was **silent partial application**:
 * a migration that edited one script succeeded, reported success, and left the
 * fleet half-moved, with nothing to detect it. The deploy deliberately never
 * re-seeds `agent_templates` (scripts/deploy/blue-green-deploy.sh:243-246) so GUI edits
 * survive — which also means nothing reconciles these rows automatically.
 *
 * A half-migrated fleet is exactly the mixed state that makes a hardcoded
 * prompt-cache floor constant wrong on one side. See
 * cline_docs/reviews/cache-breakpoint-split-2026-08-09/ item 9.
 *
 * ── HOW TO USE ─────────────────────────────────────────────────────────────
 * Seed scripts import a TIER, never a literal:
 *     import { AGENT_MODELS } from '../lib/agents/model-tiers';
 *     modelParameters: { ...base, model: AGENT_MODELS.infra }
 *
 * ⚠️ **DO NOT collapse these to one value.** The per-tier split is intentional:
 * orchestration and writing-quality work runs on a stronger model than the
 * mechanical infra domains. Flattening it is a capability regression, not a
 * simplification. Changing ONE tier is the supported operation.
 *
 * ⚠️ **Adding a model here is not enough to migrate.** A model change only
 * reaches production when a seed script is RE-RUN by hand. Pre-flight with
 * `npm run report:template-freshness` first: the seed full-row-spreads over
 * promptTemplate/capabilities/constraints/metadata, so an UNVERIFIABLE row
 * (possible GUI edit) loses that edit.
 *
 * ⚠️ **The prompt-cache floor is model-dependent and NOT monotonic**
 * (claude-api skill, shared/prompt-caching.md). Opus 5 / Fable 5 = 512 tokens;
 * Haiku 4.5 = 4096 — the *newest* models have the *lowest* minimum. Changing a
 * tier changes the cache floor for every template on it. Re-run
 * `scripts/measure-preamble-tokens.ts` after any tier change.
 */

/**
 * Model per agent tier. Values are Anthropic model IDs as accepted by the SDK.
 *
 * Do NOT state prod per-model row counts here — they drift with GUI edits and
 * hand reseeds and a stale count misled a live analysis on 2026-08-20. Measure
 * instead: SELECT metadata->'modelParameters'->>'model', count(*) FROM
 * agent_templates GROUP BY 1;
 *
 *   orchestrator — meta-agents that decompose and synthesize, not do the work:
 *                  Pipeline Harness, Program Architect, MCP Workflow Orchestrator
 *   synthesis    — cognition/writing-quality work where output prose IS the
 *                  deliverable: the four artifact-synthesis roles, Research Analyst
 *   infra        — device- and state-reaching domain specialists: kubernetes-gitops,
 *                  network-provisioning, terraform-iac (4 templates each).
 *                  haiku → sonnet 2026-08-20 (Steve's ruling, maxtokens-sonnet-flip
 *                  review): Haiku designers mis-derived CIDR aggregates in 2 of 2
 *                  demo runs; the first Sonnet designer derived correctly. Coupled
 *                  constraint: Sonnet infra output (2.3-2.9x Haiku's) straddles an
 *                  8000 maxTokens pin — never flip this tier's model onto rows still
 *                  pinned at 8000 (the reseed writes model+maxTokens atomically).
 *   generic      — legacy/general templates and the MCP service-integration set
 */
export const AGENT_MODELS = {
  orchestrator: 'claude-sonnet-5',
  synthesis: 'claude-sonnet-5',
  infra: 'claude-sonnet-5',
  generic: 'claude-haiku-4-5',
} as const;

export type AgentTier = keyof typeof AGENT_MODELS;
export type AgentModelId = (typeof AGENT_MODELS)[AgentTier];
