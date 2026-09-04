/**
 * Contract-propagation enrichment — a lint of the HARNESS'S OWN DECOMPOSITION.
 *
 * WHY THIS EXISTS (measured, 2026-08-26): a PIPELINE "leg" carries the binding
 * `inputContext.interfaceContract`, but its ACTION children are created by the leg's harness —
 * itself an LLM — which PARAPHRASES that contract into each child's `description`. Across every
 * archived leg carrying a contract, **7 of 7 lost most of the canonical stanza**, and **0 of N
 * ACTION children have ever held the structured contract**. Two live rounds then shipped configs
 * missing a line that left the routing protocol INACTIVE while entering, committing and displaying
 * cleanly.
 *
 * The obligations that should have caught it are CONDITIONAL — "where the contract carries a
 * canonical stanza template, TRANSCRIBE it" / "...verify every non-placeholder line appears". With
 * no contract in context the predicate is false, so NO OBLIGATION IS OWED and no check is skipped.
 * That is why it left no trace: a correctly-written conditional guard, silently unsatisfiable.
 *
 * This module makes that state VISIBLE at the layer it occurs. It is an instrument, not a fix.
 *
 * CONTRACT (mirrors dialect-lint-enrichment):
 * - NEVER THROWS for a missing input. Every miss is a NAMED `checked:false` reason. Absence must
 *   never render as a clean pass — the failure this whole campaign kept re-learning.
 * - Emits a FACT, not a verdict (Protocol 10). It reports what each child received; it does not
 *   decide any leg's outcome.
 * - Extracted from day one so it is observable via `scripts/replay-contract-propagation.ts` without
 *   a 30-50 minute program run. Derivation-containment shipped three defects for want of that.
 *
 * ⚠️ EXPECTED SHAPE AFTER THE FIX LANDS — read before calling a non-zero reading a regression:
 * once contract inheritance ships AND the leg protocol stops paraphrasing the stanza into briefs,
 * `canonicalLinesAbsentFromBrief` reads ALL-ABSENT **by design** (the brief no longer restates the
 * stanza; the structured channel carries it). The live signal is then `hasInterfaceContract: false`.
 */
import type { PrismaClient } from '@prisma/client';
import { canonicalStanzaNeedles } from './dialect-lint';

export interface ContractPropagationChildFact {
  taskId: string;
  /** Task.agentRole — there is no `role` field on Task. */
  role: string | null;
  /** Did the structured contract actually reach this child? */
  hasInterfaceContract: boolean;
  /** Canonical stanza lines the child's BRIEF (description) never mentions. */
  canonicalLinesAbsentFromBrief: string[];
  /**
   * A never-executed child legitimately lacks an inherited contract (inheritance is prepare-time),
   * so it must NOT read as a regression.
   */
  executed: boolean;
}

export interface ContractPropagationFact {
  checked: boolean;
  reason?: 'no-child-stage' | 'no-contract-on-leg' | 'no-children' | 'no-canonical-stanza' | 'enrichment-error';
  /** How many canonical lines were derivable from the leg's contract. */
  canonicalLinesConsidered: number;
  children: ContractPropagationChildFact[];
  scope: string;
}

const SCOPE_NOTE =
  'Brief fidelity is matched as SUBSTRING over the child description (a brief is prose; a canonical ' +
  'line appears mid-sentence, not as its own line). The derivation of which lines count is shared ' +
  'with dialect-lint via canonicalStanzaNeedles.';

/**
 * Upper bound on ACTION children scanned per leg stage. A real leg decomposes into a
 * handful; this is a sanity ceiling, not a page size. Exceeding it is STAMPED
 * (`childrenTruncatedAtCap`), never silent.
 */
const CHILD_SCAN_CAP = 50;

export async function computeContractPropagationFact(
  prisma: PrismaClient,
  { stageId, interfaceContract }: { stageId?: unknown; interfaceContract?: unknown }
): Promise<Record<string, unknown>> {
  const miss = (reason: ContractPropagationFact['reason']): Record<string, unknown> => ({
    checked: false, reason, canonicalLinesConsidered: 0, children: [], scope: SCOPE_NOTE,
  });

  if (typeof stageId !== 'string' || !stageId) return miss('no-child-stage');
  if (!interfaceContract || typeof interfaceContract !== 'object') return miss('no-contract-on-leg');

  const derived = canonicalStanzaNeedles(interfaceContract);
  if (derived.needles.length === 0) return miss('no-canonical-stanza');

  // Bounded read. A leg stage holds a handful of ACTION children, but an unbounded
  // findMany is unbounded in principle. Fetch CAP+1 so the cap biting is DETECTABLE:
  // a lint that silently sees only part of the decomposition would report a clean
  // subset as if it were the whole, which is the exact failure this fact exists to catch.
  const rows = await prisma.task.findMany({
    where: { stageId, type: 'ACTION' },
    select: { id: true, description: true, agentRole: true, inputContext: true,
              _count: { select: { executions: true } } },
    orderBy: { createdAt: 'asc' },
    take: CHILD_SCAN_CAP + 1,
  });
  const truncated = rows.length > CHILD_SCAN_CAP;
  const children = truncated ? rows.slice(0, CHILD_SCAN_CAP) : rows;
  if (children.length === 0) return miss('no-children');

  const facts: ContractPropagationChildFact[] = children.map((c) => {
    const brief = (c.description ?? '').toLowerCase();
    return {
      taskId: c.id,
      role: c.agentRole ?? null,
      hasInterfaceContract: !!(c.inputContext as Record<string, unknown> | null)?.interfaceContract,
      canonicalLinesAbsentFromBrief: derived.needles
        .filter((n) => !brief.includes(n.needle.toLowerCase()))
        .map((n) => `${n.line}  [from ${n.stanzaKey}]`),
      executed: (c._count?.executions ?? 0) > 0,
    };
  });

  return {
    checked: true,
    canonicalLinesConsidered: derived.needles.length,
    children: facts,
    ...(truncated ? { childrenTruncatedAtCap: CHILD_SCAN_CAP } : {}),
    scope: SCOPE_NOTE,
  };
}
