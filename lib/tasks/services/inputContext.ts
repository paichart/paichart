import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Atomically shallow-merge `patch` into a task's `inputContext` jsonb, returning the merged value.
 *
 * Uses Postgres `||` (right-wins top-level merge) in a single `UPDATE` so the merge is evaluated
 * INSIDE SQL referencing the column — a concurrent writer blocks on the row lock, re-reads the
 * committed value on release, and merges onto it. No app-side read-modify-write window → no lost
 * update, no explicit lock/transaction needed. (TS4, 2026-06-08; replaces the prior findUnique →
 * JS-spread → update in context-chainer.applyChainedContext, which lost concurrent foreign writes.)
 *
 * `||` is a SHALLOW (top-level) merge — identical direction to the prior `{...existing, ...patch}`
 * spread (patch wins). Do NOT use for deep merges. `COALESCE(...,'{}')` handles a null column.
 * `"updated_at" = now()` is required because a raw UPDATE bypasses Prisma's `@updatedAt`.
 *
 * `RETURNING` yields the authoritative committed value, so a caller needing the in-memory copy
 * (the SSE chainer / A2) uses it WITHOUT a second DB read. `$queryRaw` deserializes jsonb to a JS
 * object, so the result needs no `JSON.parse`.
 *
 * Lost-update prevention menu + why a plain `$transaction` is NOT enough: see
 * `.claude/knowledge/patterns/transaction-atomicity-pattern.md` and bug-class BC19.
 */
export async function mergeTaskInputContext(
  taskId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const rows = await prisma.$queryRaw<Array<{ inputContext: Record<string, unknown> }>>(Prisma.sql`
    UPDATE "tasks"
       SET "inputContext" = COALESCE("inputContext", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
           "updated_at" = now()
     WHERE id = ${taskId}
     RETURNING "inputContext"`);
  return rows[0]?.inputContext ?? null;
}

/**
 * INHERIT the owning leg's `interfaceContract` into a child that lacks one — write-if-absent.
 *
 * WHY (measured 2026-08-26): a PIPELINE "leg" carries the binding contract, but its ACTION children
 * are created by the leg's harness — itself an LLM — which PARAPHRASES the contract into each
 * child's `description`. 7 of 7 archived legs lost most of the canonical stanza; 0 of N children
 * ever held the structured contract. The protocol's transcribe/verify obligations are CONDITIONAL
 * ("where the contract carries a canonical stanza template…"), so with no contract in context the
 * predicate is false, NO obligation is owed, and nothing is logged as skipped. Two live rounds
 * shipped configs missing a line that left the routing protocol INACTIVE.
 *
 * This is the structured channel CC7 always intended: the contract "rides a STRUCTURED inputContext
 * channel, never prose" (task-create-handler). The leg tier was the one hop that never got it.
 *
 * SHAPE — three steps, deliberately not one fused statement:
 *   1. SELECT the qualified parent (ordered, LIMIT 1) — also distinguishes "no parent" from
 *      "parent without contract", which a fused UPDATE...FROM cannot.
 *   2. Sanitize in JS — `deepStripDangerousKeys` + 64KB cap, FAIL-CLOSED (copy nothing on failure).
 *      Required because "already validated at create" is FALSE: agent.configure/agent.execute accept
 *      inputContext with a SHALLOW strip and no cap.
 *   3. Atomic conditional UPDATE with the sanitized value as a jsonb PARAMETER.
 *
 * The only atomicity that matters — first-writer-wins on the CHILD — lives in step 3's in-statement
 * guard (re-evaluated post-lock-wait via EvalPlanQual), so a concurrent prepare is a 0-row no-op.
 * The parent read is snapshot-tolerant BY DESIGN: contracts are frozen-cone-immutable, and a drift
 * warn covers the residue. NO R9 here — sanitising a binding constant would corrupt the exact value
 * every child must transcribe verbatim.
 *
 * SCOPE: NON-PIPELINE children only. It must NEVER backstop the F16 loud-fail for PIPELINE legs —
 * that guard is deliberate program semantics (a missing leg contract means broken wiring, and the
 * platform holds no deterministic source for it).
 */
export async function inheritInterfaceContractIfAbsent(
  taskId: string,
  deps: {
    sanitize: (o: Record<string, unknown>) => Record<string, unknown>;
    maxBytes: number;
    onRefused: (reason: string, detail: Record<string, unknown>) => void;
    onInherited: (detail: Record<string, unknown>) => void;
    /** Parent's live contract differs from the child's frozen copy — fact only, never a mutation. */
    onDrift?: (detail: Record<string, unknown>) => void;
  }
): Promise<Record<string, unknown> | null> {
  // ── 1. the qualified parent ────────────────────────────────────────────────────────────────
  // `jsonb_typeof(...) = 'object'` on BOTH sides: `?` is TRUE for a key holding JSON null, and
  // copying a null would wedge the child forever — SQL would see the key present while the JS
  // truthiness check the F16 guard uses reads false, so F16 throws every run with no retry.
  // `p.metadata->>'protocol' IS NOT NULL` is the qualifier — NOT programHarnessProtocolFilter(),
  // whose name-set is pov-program only while the parent here is a LEG (measured on prod: every
  // contract-bearing parent is stamped network-provisioning / terraform-iac). Using that filter
  // would match ZERO parents forever while tests and EXPLAIN read green.
  const parents = await prisma.$queryRaw<Array<{ id: string; contract: Record<string, unknown> }>>(Prisma.sql`
    SELECT p.id, p."inputContext"->'interfaceContract' AS contract
      FROM "tasks" p, "tasks" c
     WHERE c.id = ${taskId}
       AND c.type <> 'PIPELINE'
       AND NOT (COALESCE(c."inputContext", '{}'::jsonb) ? 'interfaceContract'
                AND jsonb_typeof(c."inputContext"->'interfaceContract') = 'object')
       AND p.type = 'PIPELINE'
       AND p.metadata->>'pipelineStageId' = c.stage_id
       AND jsonb_typeof(p."inputContext"->'interfaceContract') = 'object'
       AND p.metadata->>'protocol' IS NOT NULL
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 1`);
  const parent = parents[0];
  if (!parent) return null;

  // ── 1b. PARENT DRIFT (2.3.3) ───────────────────────────────────────────────────────────────
  // Write-if-absent FREEZES the first copy — deliberately: refreshing would let a retried child
  // design against contract v2 while its already-completed siblings composed against v1, the
  // silent-composition-break class F12/F16 exist to prevent. But a frozen copy that no longer
  // matches its parent is a FACT worth surfacing, and it doubles as PROVENANCE VERIFICATION: the
  // `interfaceContractInheritedFrom` stamp is an ordinary inputContext key, writable through the
  // same user channels as the contract itself, therefore FORGEABLE. A consumer must treat it as a
  // hint to check, never as a platform fact — this is the check.
  // Fact now, verdict earned later (Protocol 10): no behaviour changes on drift.
  const existing = await prisma.$queryRaw<Array<{ frozen: Record<string, unknown> | null; from: string | null }>>(Prisma.sql`
    SELECT "inputContext"->'interfaceContract' AS frozen,
           "inputContext"->>'interfaceContractInheritedFrom' AS from
      FROM "tasks" WHERE id = ${taskId}`);
  const frozen = existing[0]?.frozen;
  if (frozen && JSON.stringify(frozen) !== JSON.stringify(parent.contract)) {
    deps.onDrift?.({
      taskId,
      parentTaskId: parent.id,
      claimedInheritedFrom: existing[0]?.from ?? null,
      // A stamp naming a parent that is NOT the qualified parent is the forgery signature.
      provenanceMatchesQualifiedParent: existing[0]?.from === parent.id,
    });
  }

  // ── 2. sanitize, fail-closed ───────────────────────────────────────────────────────────────
  let safe: Record<string, unknown>;
  try {
    safe = deps.sanitize(parent.contract);
  } catch (err) {
    deps.onRefused('sanitize-threw', { taskId, parentTaskId: parent.id, err: String(err) });
    return null;
  }
  const bytes = Buffer.byteLength(JSON.stringify(safe), 'utf8');
  if (bytes > deps.maxBytes) {
    // FAIL-CLOSED, never truncate: a truncated binding contract is worse than none.
    deps.onRefused('contract-too-large', { taskId, parentTaskId: parent.id, bytes, maxBytes: deps.maxBytes });
    return null;
  }

  // ── 3. atomic write-if-absent ──────────────────────────────────────────────────────────────
  // Provenance rides SIBLING top-level keys — never inside `interfaceContract` (the F12 flag arm
  // keys on that key's presence) and never inside `pipelineMetadata` (the chainer replaces that
  // key wholesale every execution). Treat the stamp as a HINT: these are ordinary inputContext
  // keys and therefore forgeable through the same user channels.
  const patch = {
    interfaceContract: safe,
    interfaceContractInheritedFrom: parent.id,
    interfaceContractInheritedAt: new Date().toISOString(),
  };
  const rows = await prisma.$queryRaw<Array<{ inputContext: Record<string, unknown> }>>(Prisma.sql`
    UPDATE "tasks"
       SET "inputContext" = COALESCE("inputContext", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
           "updated_at" = now()
     WHERE id = ${taskId}
       AND NOT (COALESCE("inputContext", '{}'::jsonb) ? 'interfaceContract'
                AND jsonb_typeof("inputContext"->'interfaceContract') = 'object')
     RETURNING "inputContext"`);
  const merged = rows[0]?.inputContext ?? null;
  if (merged) deps.onInherited({ taskId, parentTaskId: parent.id, bytes });
  return merged;
}
