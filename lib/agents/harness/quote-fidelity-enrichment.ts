/**
 * quoteFidelity ENRICHMENT — the DB-reading half of the Author point (VERBATIM-QUOTE-OMISSION, owner A3, 2026-10-13).
 *
 * The Harvester point is PURE: its own `toolCalls` and `finalResponse` are both in hand at its persist, so the registry
 * entry calls `computeQuoteFidelity` directly. The Author point compares the Author's REPRODUCTION blocks (rollback,
 * baseline evidence, expected output labelled identical to the baseline) with the raw results the leg's Harvester
 * received, so it reads ONE thing: that sibling's authoritative `toolCalls` — the same execution the chainer handed on
 * (authoritative-result-read.ts), and the same harvest predicate as rollback-containment-enrichment (one notion of "the
 * harvest child" in this domain).
 *
 * Order, and why: the pure scope runs FIRST. A package with no in-scope block (desired state only, or nothing fenced)
 * needs no harvest and is stamped without a read — reporting `no-harvest-child` for it would blame the wrong layer
 * (derivation-containment's finding (f), the existence-first rule).
 *
 * NON-THROWING is the CALLER's contract (the registry loop stamps `errorFact()` on a throw).
 */
import type { Prisma } from '@prisma/client';
import { computeQuoteFidelity, quoteFidelityMiss, authorHasInScopeBlocks } from './quote-fidelity';
import { readAuthoritativeResultField } from './authoritative-result-read';

export type QuoteFidelityPrisma = Pick<Prisma.TransactionClient, 'task' | 'agentExecution' | 'agentArtifact' | '$queryRaw'>;

/** Mirrors rollback-containment-enrichment: harvest/author children are the earliest-created, so the cap cannot drop them. */
const STAGE_CHILD_SCAN_CAP = 50;

export async function computeAuthorQuoteFidelityFact(
  prisma: QuoteFidelityPrisma,
  { taskId, deliverable, ownToolCalls }: { taskId: string; deliverable: string | null | undefined; ownToolCalls: unknown },
): Promise<Record<string, unknown>> {
  if (!authorHasInScopeBlocks(deliverable)) {
    return computeQuoteFidelity({ point: 'author', deliverable, toolCalls: ownToolCalls });
  }
  const self = await prisma.task.findUnique({ where: { id: taskId }, select: { stageId: true } });
  if (!self?.stageId) return quoteFidelityMiss('no-child-stage', deliverable);
  const siblings = await prisma.task.findMany({
    where: { stageId: self.stageId },
    select: { id: true, title: true, agentRole: true },
    orderBy: { createdAt: 'asc' },
    take: STAGE_CHILD_SCAN_CAP,
  });
  const harvestChild = siblings.find((c) =>
    (c.agentRole ?? '').toLowerCase().includes('harvest') || c.title.toLowerCase().startsWith('harvest'));
  if (!harvestChild) return quoteFidelityMiss('no-harvest-child', deliverable);

  const raw = (await readAuthoritativeResultField(prisma, harvestChild.id, 'toolCalls')).value;
  let harvestToolCalls: unknown = [];
  if (raw) {
    try { harvestToolCalls = JSON.parse(raw); } catch { harvestToolCalls = []; }
  }
  return computeQuoteFidelity({
    point: 'author', deliverable, toolCalls: ownToolCalls, harvestToolCalls, harvestSource: harvestChild.id,
  });
}
