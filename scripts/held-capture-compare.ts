/**
 * held-capture-compare.ts — the PURE comparison behind `replay-held-capture.sh --compare` (HELD-CAPTURE-COMPARE-ELIGIBILITY,
 * held-network step 3 P2, 2026-10-25). Split out of the runner so every branch is pinned by planted controls without a database
 * (scripts/test-held-capture-compare.ts).
 *
 * What a replay CAN and CANNOT reconstruct (the reason this module exists):
 *   - (toolCallIndex, selector, outcome) and the blob hash: reconstructable from the stored leaf (compared since Stage A).
 *   - `declaredBy` + `declarationSha256`: reconstructable — the stored (serviceId, sha) pairs + the immutable snapshots rebuild the
 *     table the live capture used. COMPARED (was not).
 *   - `eligibility`: NOT persisted at call time (the fact is non-enumerable on the tool-call record), so the replay runs
 *     `live: false` and predicts nothing. What IS decidable: an OWNERLESS row (platform) can only be `platform` — predicted and
 *     COMPARED; an OWNED row is `own | granted | install` (granted ⇔ grantPovId) — CHECKED for membership and labelled
 *     "not reconstructable (not persisted)". A NULL eligibility is a pre-IF-3 row (never a backlog) — reported, never a ❌.
 *   - A live outcome the replay cannot see: (1) a call to a row owned by someone other than the execution's user, where the live
 *     capture held NOTHING (foreign, or a grant/install decision the replay cannot reconstruct) — `unverifiable (eligibility)`, not
 *     a false ❌; (2) a live `echo-secret-residual` refusal (R10-V8-RESIDUALS (a)) where the replay predicts held — its keyed values
 *     are not persisted, so the replay cannot recompute the echo — `unverifiable (echo)`. Each is COUNTED and named, never silent.
 */

export interface PredictedRow {
  i: number;
  s: string;
  /** 'held' or a refusal name. */
  outcome: string;
  hash?: string | null;
  serviceId: string | null;
  declaredBy: string | null;
  declarationSha256: string | null;
}

export interface StoredRow extends PredictedRow {
  eligibility: string | null;
  grantPovId: string | null;
}

export interface CompareContext {
  /** The registry row's owner NOW: a string (owned), null (ownerless — a platform row), undefined (row not found). */
  rowOwner: (serviceId: string | null) => string | null | undefined;
  /** The execution's launching user (context.triggeredBy.id, else the task assignee), or null when unknown. */
  executionUserId: string | null;
}

export interface CompareResult {
  ok: boolean;
  missing: string[];
  extra: string[];
  storeErrorExcused: number;
  hashMismatches: string[];
  declarationMismatches: string[];
  eligibilityMismatches: string[];
  unverifiable: string[];
  /** Rows whose eligibility is a membership check only (owned rows) or absent (pre-IF-3). Context, never a ❌. */
  eligibilityNotes: string[];
}

const OWNED_ELIGIBILITY = new Set(['own', 'granted', 'install']);
const key = (r: { i: number; s: string }) => `${r.i}\t${r.s}`;
const line = (r: { i: number; s: string; outcome: string }) => `${r.i}\t${r.s}\t${r.outcome}`;

export function compareCapture(pred: readonly PredictedRow[], actual: readonly StoredRow[], ctx: CompareContext): CompareResult {
  const res: CompareResult = { ok: true, missing: [], extra: [], storeErrorExcused: 0, hashMismatches: [], declarationMismatches: [],
    eligibilityMismatches: [], unverifiable: [], eligibilityNotes: [] };
  const usedActual = new Set<number>();
  const matched: Array<{ p: PredictedRow; a: StoredRow }> = [];
  const unmatchedPred: PredictedRow[] = [];
  for (const p of pred) {
    const ai = actual.findIndex((a, idx) => !usedActual.has(idx) && a.i === p.i && a.s === p.s && a.outcome === p.outcome);
    if (ai >= 0) { usedActual.add(ai); matched.push({ p, a: actual[ai] }); } else unmatchedPred.push(p);
  }
  const unmatchedActual = actual.filter((_, idx) => !usedActual.has(idx));

  // Excuse (2): a live echo-secret-residual where the replay predicts held, at the same (call, selector).
  const echoKeys = new Set(unmatchedActual.filter((a) => a.outcome === 'echo-secret-residual').map(key));
  for (const p of [...unmatchedPred]) {
    if (p.outcome === 'held' && echoKeys.has(key(p))) {
      res.unverifiable.push(`${line(p)}  unverifiable (echo — the keyed values are not persisted; live refused echo-secret-residual)`);
      unmatchedPred.splice(unmatchedPred.indexOf(p), 1);
      const ai = unmatchedActual.findIndex((a) => a.outcome === 'echo-secret-residual' && key(a) === key(p));
      unmatchedActual.splice(ai, 1);
    }
  }
  // Excuse (1): predicted held, NOTHING stored for that (call, selector), on a row owned by someone other than the execution's user.
  const storedKeys = new Set(actual.map(key));
  for (const p of [...unmatchedPred]) {
    if (p.outcome !== 'held' || storedKeys.has(key(p))) continue;
    const owner = ctx.rowOwner(p.serviceId);
    if (typeof owner === 'string' && owner !== ctx.executionUserId) {
      res.unverifiable.push(`${line(p)}  unverifiable (eligibility — the row's owner is not the execution's user; call-time eligibility is not persisted)`);
      unmatchedPred.splice(unmatchedPred.indexOf(p), 1);
    }
  }

  res.missing = unmatchedPred.map(line);
  for (const a of unmatchedActual) {
    if (a.outcome === 'store-error') res.storeErrorExcused++;
    else res.extra.push(line(a));
  }

  for (const { p, a } of matched) {
    if (p.outcome === 'held' && p.hash != null && a.hash != null && p.hash !== a.hash) res.hashMismatches.push(line(a));
    if ((p.declaredBy ?? null) !== (a.declaredBy ?? null) || (p.declarationSha256 ?? null) !== (a.declarationSha256 ?? null)) {
      res.declarationMismatches.push(`${line(a)}  declaredBy ${a.declaredBy ?? 'null'} / sha ${short(a.declarationSha256)} stored vs ${p.declaredBy ?? 'null'} / sha ${short(p.declarationSha256)} predicted`);
    }
    const owner = ctx.rowOwner(a.serviceId);
    const e = a.eligibility;
    const grantOk = (e === 'granted') === (a.grantPovId != null);
    if (e === null) {
      if (a.grantPovId != null) res.eligibilityMismatches.push(`${line(a)}  grantPovId without an eligibility`);
      else res.eligibilityNotes.push(`${line(a)}  eligibility not stored (pre-IF-3 row)`);
    } else if (owner === null) {
      if (e !== 'platform' || a.grantPovId != null) res.eligibilityMismatches.push(`${line(a)}  ownerless row: predicted platform, stored ${e}${a.grantPovId != null ? ' + grantPovId' : ''}`);
    } else if (typeof owner === 'string') {
      if (!OWNED_ELIGIBILITY.has(e) || !grantOk) res.eligibilityMismatches.push(`${line(a)}  owned row: stored ${e}${a.grantPovId != null ? ' + grantPovId' : ''} (must be own|granted|install, granted ⇔ grantPovId)`);
      else res.eligibilityNotes.push(`${line(a)}  eligibility ${e}: not reconstructable (not persisted) — membership checked`);
    } else {
      res.eligibilityNotes.push(`${line(a)}  eligibility ${e}: row not found now — not checked`);
    }
  }
  res.ok = res.missing.length === 0 && res.extra.length === 0 && res.hashMismatches.length === 0
    && res.declarationMismatches.length === 0 && res.eligibilityMismatches.length === 0;
  return res;
}

function short(s: string | null): string { return s ? s.slice(0, 8) : 'null'; }
