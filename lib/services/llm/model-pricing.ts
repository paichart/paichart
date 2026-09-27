/**
 * Time-versioned LLM pricing — the single source for DERIVING cost from persisted token facts.
 * (token-usage-persistence Phase 1)
 *
 * Protocol 10 (fact-vs-verdict): we persist token FACTS on `agent_executions` and compute cost HERE,
 * at read time. Cost is never stored — prices change (a scheduled Sonnet 5 rise was announced, then cancelled), so a
 * stored cost silently goes stale. Pricing is keyed `(canonical model, date)` and applied **as-of the
 * execution's `startTime`**, so historical rows keep the price that was in effect when they ran.
 *
 * Rates are USD per MILLION tokens (input / output). Cache tokens are priced as multiples of the
 * input rate: cache READ ≈ 0.1× (Anthropic bills cache hits at ~10%); cache CREATION at the 5-minute
 * write rate 1.25×. NOTE: Anthropic's cache_creation can be 5m (1.25×) or 1h (2×); we fold both into
 * one `cacheCreationTokens` column and price at the 5m rate — a documented under-count only if 1h
 * cache adoption grows (Phase-2 split). An unknown/unpriceable model returns `costUsd: null` (never a
 * fabricated 0), so the caller can show "unpriced" rather than a wrong number.
 *
 * String-matching model→price lives ONLY here (the canonical pricing resolver, analogous to the
 * capability map) — do not scatter model-price conditionals elsewhere.
 */

/** Bump when the table below changes, so a reader can tell which price set produced a cost. */
export const PRICING_VERSION = '2026-09-26';

const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_5M_MULT = 1.25;

export interface TokenCounts {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheCreationTokens?: number | null;
}

/** One price window for a model. `from`/`to` are inclusive ISO dates (YYYY-MM-DD); omit `to` for open-ended. */
interface PriceWindow {
  from: string;
  to?: string;
  input: number;   // $/MTok
  output: number;  // $/MTok
  /** Explicit cache-READ rate ($/MTok) when the model does not follow the 0.1× rule. Opus 5.5 lists
   *  $0.20 against a $4 input (0.05×); pricing it at 0.1× would double-count every cache read, and cache
   *  reads are the largest token bucket on a PIPELINE run. Omit to use CACHE_READ_MULT. */
  cacheRead?: number;
}

/** Canonical price sets. Sonnet 5 carries its intro→standard split (priced as-of execution date). */
const PRICING: Record<string, PriceWindow[]> = {
  // Fable 5.1 / Mythos 5.1 cache reads are 0.025× ($0.25/M), not 0.1× — live pricing page, 2026-09-26.
  'fable-5-1':   [{ from: '2000-01-01', input: 10, output: 50, cacheRead: 0.25 }],
  fable:         [{ from: '2000-01-01', input: 10, output: 50 }],
  // Opus 5.5 (2026-09-26, claude-api skill): $4 / $20, cache reads $0.20. Keyed ahead of `opus`, which
  // would otherwise price it at Opus 5's $5 / $25. Cache WRITE is not separately listed; priced at the
  // standard 1.25× 5-minute rate like every other model here.
  'opus-5-5':    [{ from: '2000-01-01', input: 4, output: 20, cacheRead: 0.2 }],
  opus:          [{ from: '2000-01-01', input: 5, output: 25 }],
  // Sonnet 5: $2 / $10 is the STANDARD price. It launched as "introductory through 2026-08-31" with a
  // scheduled rise to $3 / $15 on 2026-09-01; Anthropic cancelled the rise ("will not occur" — live pricing
  // page, verified 2026-09-26). This table priced every run from 09-01 to 09-26 at $3/$15 — 50% too high.
  // Cost is derived at read time, so this correction restates that history automatically.
  'sonnet-5':    [{ from: '2000-01-01', input: 2, output: 10 }],
  'sonnet-legacy': [{ from: '2000-01-01', input: 3, output: 15 }],   // sonnet 4.6 / 4.5
  haiku:         [{ from: '2000-01-01', input: 1, output: 5 }],
};

/**
 * Map a served model id (incl. dated snapshots, fallback ids, de-picked models) to a canonical
 * pricing key. Ordered most-specific first; `sonnet-5` MUST precede the `sonnet` legacy match.
 * Returns null for anything we don't price (→ null cost, not a guess).
 */
export function resolvePricingKey(model: string | null | undefined): keyof typeof PRICING | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (/(fable|mythos)-5-1\b/.test(m)) return 'fable-5-1';   // before the family match — own cache-read rate
  if (m.includes('fable') || m.includes('mythos')) return 'fable';
  if (m.includes('opus-5-5')) return 'opus-5-5';   // before `opus` — the substring would match
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet-5')) return 'sonnet-5';
  if (m.includes('sonnet')) return 'sonnet-legacy';
  if (m.includes('haiku')) return 'haiku';
  return null;
}

function windowFor(windows: PriceWindow[], asOfIso: string): PriceWindow | null {
  for (const w of windows) {
    if (asOfIso >= w.from && (!w.to || asOfIso <= w.to)) return w;
  }
  return null;
}

export interface CostResult {
  costUsd: number | null;
  priced: boolean;
  pricingVersion: string;
}

/**
 * Derive USD cost for one execution's token counts, priced as-of `asOf` (the execution's startTime).
 * Unknown model or no price window → { costUsd: null, priced: false }.
 */
export function costForExecution(tokens: TokenCounts, model: string | null | undefined, asOf: Date): CostResult {
  const key = resolvePricingKey(model);
  if (!key) return { costUsd: null, priced: false, pricingVersion: PRICING_VERSION };
  const win = windowFor(PRICING[key], asOf.toISOString().slice(0, 10));
  if (!win) return { costUsd: null, priced: false, pricingVersion: PRICING_VERSION };

  const input = tokens.inputTokens || 0;
  const output = tokens.outputTokens || 0;
  const cacheRead = tokens.cacheReadTokens || 0;
  const cacheCreation = tokens.cacheCreationTokens || 0;

  const costUsd =
    (input / 1e6) * win.input +
    (output / 1e6) * win.output +
    (cacheRead / 1e6) * (win.cacheRead ?? win.input * CACHE_READ_MULT) +
    (cacheCreation / 1e6) * win.input * CACHE_WRITE_5M_MULT;

  return { costUsd, priced: true, pricingVersion: PRICING_VERSION };
}
