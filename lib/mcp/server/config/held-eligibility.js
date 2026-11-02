/**
 * WI-B10 (2026-10-23, design §10 A-1) — the SERVER-ONLY held-eligibility fact of a `services` call.
 *
 * Why its own channel: the gateway-meta channel (lib/services/mcp/gateway-meta.ts) is built for failures, its fields are
 * persisted to the result.json `toolCallGatewayMeta` tail, and a successful call's `_meta` carries none of them. Putting
 * eligibility there would either move every obs/k8s/terraform result.json or leak another tenant's facts. This fact is
 * NEVER delivered (not in the result, not in `_meta`) and NEVER persisted (the held refs/refusals persist the outcome).
 *
 *   1. The service-call handler, which holds the resolved row AND the caller's user, decides eligibility at CALL time
 *      (sec-ops B-1: a declaration — registrant OR name-keyed default — applies only to a row the caller owns, or a
 *      platform row) and records it against the per-call `toolContext` object mcpService created (recordForContext).
 *   2. mcpService reads it back after the call (takeForContext) and attaches it to the result object it returns
 *      (attachToResult) — a WeakMap, so the result's own bytes are unchanged.
 *   3. The tool loop copies it onto the tool-call record as a NON-ENUMERABLE property (setOnRecord); capture reads it
 *      (fromRecord). JSON.stringify(record) — SSE cards, toolCalls persistence — never carries it.
 *
 * Fact: { serviceId, eligibility: 'own' | 'platform' | 'foreign', heldFilesSha256: string | null }.
 * Process-wide maps (globalThis): paichart-web loads modules twice (ts-node + webpack) — the gateway-meta AE-CR1 idiom.
 * Plain CommonJS, no requires. Never throws.
 */
'use strict';

const { gitPinForRow } = require('./git-file-source-pin');

const g = globalThis;
const byContext = (g.__paichartHeldEligibilityCtx = g.__paichartHeldEligibilityCtx || new WeakMap());
const byResult = (g.__paichartHeldEligibilityRes = g.__paichartHeldEligibilityRes || new WeakMap());
const RECORD_KEY = 'heldEligibility';
const ELIGIBILITY = ['own', 'granted', 'install', 'platform', 'foreign'];
/** INTERNAL-FIT IF-3: the eligibilities under which a REGISTRANT declaration holds (and a default-named row holds). 'platform'
 *  holds the platform defaults only; 'foreign' holds nothing. ONE list, read by the extractor's single helper. */
const HOLDS = Object.freeze(['own', 'granted', 'install']);
const POV_ID = /^c[a-z0-9]{20,30}$/;
/** INTERNAL-FIT IF-3 (self-host): every accessible owned row counts for eligibility ('install', never 'own'). Read HERE only;
 *  the hosted deploy never sets it (pinned in test-security-invariants). Eligibility only — never access. */
const installWide = () => process.env.HELD_ELIGIBILITY_INSTALL_WIDE === 'true';
const SHA = /^[0-9a-f]{64}$/;

/**
 * own | granted | install | platform | foreign for a resolved row and the calling user. A row with no ownerId is a platform
 * row. `opts.grantPovId` = the POV held-grant.js granted for THIS call (hosted, IF-3); otherwise a self-host install-wide
 * setting makes another owner's row 'install'.
 */
function eligibilityOf(row, userId, opts) {
  const cfg = row && row.configuration && typeof row.configuration === 'object' ? row.configuration : null;
  const ownerId = cfg && typeof cfg.ownerId === 'string' && cfg.ownerId ? cfg.ownerId : null;
  if (!ownerId) return 'platform';
  if (typeof userId === 'string' && userId && ownerId === userId) return 'own';
  if (opts && typeof opts.grantPovId === 'string' && POV_ID.test(opts.grantPovId)) return 'granted';
  if (installWide()) return 'install';
  return 'foreign';
}

function validFact(f) {
  return !!f && typeof f === 'object' && typeof f.serviceId === 'string' && f.serviceId.length > 0 && f.serviceId.length <= 128
    && ELIGIBILITY.includes(f.eligibility) && (f.heldFilesSha256 === null || (typeof f.heldFilesSha256 === 'string' && SHA.test(f.heldFilesSha256)))
    && (f.gitSource === undefined || typeof f.gitSource === 'boolean')
    // IF-3: grantPovId is present exactly when the eligibility is 'granted' (the ONE granting POV — never the row's list)
    && (f.eligibility === 'granted' ? typeof f.grantPovId === 'string' && POV_ID.test(f.grantPovId) : f.grantPovId === undefined || f.grantPovId === null);
}

/** Build the fact for a resolved row + caller. */
function factFor(row, userId, opts) {
  const eligibility = eligibilityOf(row, userId, opts);
  return {
    serviceId: row && typeof row.id === 'string' ? row.id : '',
    eligibility,
    ...(eligibility === 'granted' ? { grantPovId: opts.grantPovId } : {}),
    heldFilesSha256: row && typeof row.heldFilesSha256 === 'string' && SHA.test(row.heldFilesSha256) ? row.heldFilesSha256 : null,
    // a Git file source (platform or declared pin): the persist elision of blob ids applies (git-status-elision.ts)
    gitSource: !!gitPinForRow(row),
  };
}

function recordForContext(context, fact) {
  if (context && typeof context === 'object' && validFact(fact)) byContext.set(context, Object.freeze({ ...fact }));
}
function takeForContext(context) {
  if (!context || typeof context !== 'object') return null;
  const f = byContext.get(context) || null;
  byContext.delete(context);
  return f;
}
function attachToResult(result, fact) {
  if (result && typeof result === 'object' && validFact(fact)) byResult.set(result, fact);
}
function ofResult(result) {
  return result && typeof result === 'object' ? byResult.get(result) || null : null;
}
function setOnRecord(record, fact) {
  if (!record || typeof record !== 'object' || !validFact(fact)) return;
  Object.defineProperty(record, RECORD_KEY, { value: fact, enumerable: false, writable: false, configurable: true });
}
function fromRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const d = Object.getOwnPropertyDescriptor(record, RECORD_KEY);
  return d && !d.enumerable && validFact(d.value) ? d.value : null;
}

module.exports = { HOLDS, ELIGIBILITY, eligibilityOf, factFor, recordForContext, takeForContext, attachToResult, ofResult, setOnRecord, fromRecord, validFact };
