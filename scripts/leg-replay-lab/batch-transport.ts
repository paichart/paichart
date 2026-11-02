/**
 * Leg replay lab — LAB-BATCH-TRANSPORT (owner-decided 2026-10-19, register LAB-COST-REDUCTION (5); lab-cost-reduction ANSWER §3a).
 * LAB-ONLY. No production code changes: the SHIPPING provider (`anthropic-sdk-provider.ts`) still builds every request body and
 * parses every response. This module patches, inside the lab process only, the two SDK methods that provider sends through
 * (`messages.stream` and `beta.messages.stream`), so a call made inside a BATCH SCOPE goes to the Message Batches API (50% off
 * all tokens) and the provider receives the same `Message` shape `finalMessage()` returns.
 *
 * What the batched request body differs by — named, and nothing else (proved at $0 by `batch-proof`, pinned by LK13):
 *   1. `betas` + `fallbacks` DROPPED. The provider sends them for models with `serverSideFallback` (Opus 5.5 today); the Batches API
 *      rejects `fallbacks`. Effect: a policy refusal is NOT re-served by the fallback model — visible as `stop_reason: refusal`
 *      (0 of 2,483 lab calls 2026-10-15…19 refused). Sonnet 5 requests carry neither, so they differ only by (2).
 *   2. `cache_control.ttl = '1h'` on the system block and the top-level auto-cache breakpoint (`ttl` option; null = unchanged). A
 *      batched turn can land > 5 min after the previous one; without it cache reads become writes. `cache_control` is not
 *      model-visible. Price: 1h writes are 2× input (5 min: 1.25×), × 0.5 batch.
 *
 * Named divergences (recorded in the run manifest, never silent):
 *   - Wall clock. A batched turn takes minutes, so `deadlineAt`-driven decisions (truncation-retry budget, held edit-correction
 *     time, the requirements 2b time) would see less time than production. The lab extends the loop deadline in batch scope (the
 *     decisions read time as ample — production's common case, measured Opus Author median 152–213 s of 1,080 s) and REFUSES
 *     requirements_author nodes, whose 2b time decision is load-bearing.
 *   - Served tier. Same model, batch tier. No documented behaviour difference; none provable at $0 (owner ruling owed with the crib).
 *
 * Modes: `batch` (paid, inside a scope; outside a scope the original method runs — Harvesters stay standard) and `capture` ($0: every
 * call is recorded with its production body and its batch params, answered by a canned reply, and NOTHING reaches the network).
 */
import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';

type Body = Record<string, any>;
export interface BatchParams { params: Body; dropped: string[]; ttlPaths: string[] }

/** The batch request params for one production request body. Pure; the one function both the transport and the proof use. */
export function toBatchParams(body: Body, opts: { ttl: '1h' | null }): BatchParams {
  const params: Body = JSON.parse(JSON.stringify(body));
  const dropped: string[] = [];
  for (const k of ['betas', 'fallbacks', 'stream']) if (k in params) { delete params[k]; dropped.push(k); }
  const ttlPaths: string[] = [];
  if (opts.ttl) {
    if (params.cache_control) { params.cache_control = { ...params.cache_control, ttl: opts.ttl }; ttlPaths.push('cache_control.ttl'); }
    if (Array.isArray(params.system)) params.system.forEach((b: Body, i: number) => { if (b?.cache_control) { b.cache_control = { ...b.cache_control, ttl: opts.ttl }; ttlPaths.push(`system[${i}].cache_control.ttl`); } });
  }
  return { params, dropped, ttlPaths };
}

/** Every JSON path where `a` and `b` differ (added, removed or changed leaves). */
export function bodyDiff(a: unknown, b: unknown, at = ''): string[] {
  if (a === b) return [];
  const obj = (x: unknown) => x !== null && typeof x === 'object';
  if (!obj(a) || !obj(b) || Array.isArray(a) !== Array.isArray(b)) return [at || '(root)'];
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  const out: string[] = [];
  for (const k of keys) {
    const p = Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k;
    if (!(k in (a as object)) || !(k in (b as object))) out.push(p);
    else out.push(...bodyDiff((a as any)[k], (b as any)[k], p));
  }
  return out;
}

/** The differences a batched body may carry: `betas`/`fallbacks` only where production sent them, and the TTL leaves. */
export function allowedBatchDiff(body: Body, ttl: '1h' | null): (p: string) => boolean {
  const ttlLeaf = (p: string) => !!ttl && /^(?:cache_control|system\[\d+\]\.cache_control)\.ttl$/.test(p);
  return (p) => ((p === 'betas' || p === 'fallbacks') && p in body) || ttlLeaf(p);
}

// ───────────────────────────── pricing (lab meter) ─────────────────────────────

/** Batch price = 0.5 × standard; a 1h cache write is 2× input (the standard meter prices writes at 1.25×). */
export const BATCH_DISCOUNT = 0.5;
export function batchCostUsd(standardUsd: number | null, cacheWriteStandardUsd: number, ttl: '1h' | null): number | null {
  if (standardUsd == null) return null;
  const ttlExtra = ttl === '1h' ? cacheWriteStandardUsd * (2 / 1.25 - 1) : 0;
  return (standardUsd + ttlExtra) * BATCH_DISCOUNT;
}
let activeTtl: '1h' | null = null;
/** The TTL the installed transport writes (for the lab meter). */
export function batchTtl(): '1h' | null { return activeTtl; }
/** A batched turn takes minutes: the lab loop deadline is extended by this in batch scope (named divergence above). */
export const BATCH_DEADLINE_EXTENSION_MS = 24 * 3600_000;

// ───────────────────────────── scope ─────────────────────────────

const scope = new AsyncLocalStorage<boolean>();
/** Run `fn` with every model call inside it batched (when the transport is installed in `batch` mode). */
export function inBatchScope<T>(on: boolean, fn: () => Promise<T>): Promise<T> { return scope.run(on, fn); }
export function isBatchScope(): boolean { return scope.getStore() === true; }

// ───────────────────────────── transport ─────────────────────────────

export interface CaptureRecord { n: number; model: string; beta: boolean; bodySha256: string; paramsSha256: string; dropped: string[]; ttlPaths: string[]; diff: string[]; unexpected: string[]; body: Body; params: Body }
export interface TransportOptions {
  mode: 'batch' | 'capture';
  ttl: '1h' | null;
  /** batch: submit once no request has arrived for this long (ms), or at maxRequests. */
  windowMs?: number; maxRequests?: number; pollMs?: number;
  /** capture: called once per request; `answer` makes the canned reply (default: one end_turn text block). */
  onCapture?: (r: CaptureRecord) => void; answer?: (body: Body) => Body;
  log?: (m: string) => void;
}
export interface Installed { uninstall: () => void; stats: () => { batches: number; requests: number; captured: number } }

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function installBatchTransport(o: TransportOptions): Installed {
  const std = require('@anthropic-ai/sdk/resources/messages/messages').Messages.prototype;
  const beta = require('@anthropic-ai/sdk/resources/beta/messages/messages').Messages.prototype;
  const orig = { std: std.stream, beta: beta.stream, stdCreate: std.create, betaCreate: beta.create };
  let batches = 0; let requests = 0; let captured = 0;
  const log = o.log ?? (() => {});

  // ── batch collector: one Message Batch per window; results keyed by custom_id, never by position ──
  type Pending = { id: string; params: Body; resolve: (m: Body) => void; reject: (e: Error) => void };
  let queue: Pending[] = []; let timer: NodeJS.Timeout | null = null; let client: any = null;
  const flush = async () => {
    timer = null; const items = queue; queue = []; if (!items.length) return;
    batches++; requests += items.length;
    try {
      const b = await client.messages.batches.create({ requests: items.map((p) => ({ custom_id: p.id, params: p.params })) });
      log(`   📦 batch ${b.id}: ${items.length} request(s) submitted`);
      let st = b;
      while (st.processing_status !== 'ended') { await new Promise((r) => setTimeout(r, o.pollMs ?? 15_000)); st = await client.messages.batches.retrieve(b.id); }
      const byId = new Map<string, any>();
      for await (const r of await client.messages.batches.results(b.id)) byId.set(r.custom_id, r.result);
      for (const p of items) {
        const r = byId.get(p.id);
        if (r?.type === 'succeeded') p.resolve(r.message);
        else p.reject(new Error(`batch ${b.id} request ${p.id}: ${r ? r.type : 'no result'}${r?.error ? ` — ${JSON.stringify(r.error).slice(0, 300)}` : ''}`));
      }
    } catch (e) { for (const p of items) p.reject(e as Error); }
  };
  const enqueue = (self: any, params: Body) => new Promise<Body>((resolve, reject) => {
    client = client ?? self._client;
    queue.push({ id: `lab-${Date.now().toString(36)}-${(requests + queue.length).toString(36)}`, params, resolve, reject });
    if (timer) clearTimeout(timer);
    if (queue.length >= (o.maxRequests ?? 500)) void flush(); else timer = setTimeout(() => void flush(), o.windowMs ?? 5_000);
  });

  const patched = (which: 'std' | 'beta') => function (this: any, body: Body, opts?: unknown) {
    if (o.mode === 'batch' && !isBatchScope()) return (which === 'std' ? orig.std : orig.beta).call(this, body, opts);
    const bp = toBatchParams(body, { ttl: o.ttl });
    if (o.mode === 'capture') {
      const diff = bodyDiff(body, bp.params); const ok = allowedBatchDiff(body, o.ttl);
      o.onCapture?.({ n: ++captured, model: String(body.model), beta: which === 'beta', bodySha256: sha(body), paramsSha256: sha(bp.params), dropped: bp.dropped, ttlPaths: bp.ttlPaths, diff, unexpected: diff.filter((p) => !ok(p)), body, params: bp.params });
      const msg = o.answer ? o.answer(body) : { id: `msg_lab_capture_${captured}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: 'LAB BATCH CAPTURE (no model was called)' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
      return { finalMessage: async () => msg };
    }
    return { finalMessage: () => enqueue(this, bp.params) };
  };
  const refuse = function () { throw new Error('LAB-BATCH-TRANSPORT capture mode: messages.create reached — capture must never touch the network'); };
  std.stream = patched('std'); beta.stream = patched('beta'); activeTtl = o.ttl;
  if (o.mode === 'capture') { std.create = refuse; beta.create = refuse; }
  return {
    uninstall: () => { activeTtl = null; std.stream = orig.std; beta.stream = orig.beta; std.create = orig.stdCreate; beta.create = orig.betaCreate; },
    stats: () => ({ batches, requests, captured }),
  };
}
