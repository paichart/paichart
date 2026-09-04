/**
 * Time-versioned LLM pricing — the single source for DERIVING cost from persisted token facts.
 * (token-usage-persistence Phase 1)
 *
 * Protocol 10 (fact-vs-verdict): we persist token FACTS on `agent_executions` and compute cost HERE,
 * at read time. Cost is never stored — prices change (Sonnet 5's intro rate expires 2026-08-31), so a
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
export const PRICING_VERSION = '2026-07-02';

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
}

/** Canonical price sets. Sonnet 5 carries its intro→standard split (priced as-of execution date). */
const PRICING: Record<string, PriceWindow[]> = {
  fable:         [{ from: '2000-01-01', input: 10, output: 50 }],
  opus:          [{ from: '2000-01-01', input: 5, output: 25 }],
  'sonnet-5':    [
    { from: '2000-01-01', to: '2026-08-31', input: 2, output: 10 },  // introductory
    { from: '2026-09-01', input: 3, output: 15 },                    // standard
  ],
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
  if (m.includes('fable') || m.includes('mythos')) return 'fable';
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
    (cacheRead / 1e6) * win.input * CACHE_READ_MULT +
    (cacheCreation / 1e6) * win.input * CACHE_WRITE_5M_MULT;

  return { costUsd, priced: true, pricingVersion: PRICING_VERSION };
}
