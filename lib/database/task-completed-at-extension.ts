import { Prisma } from '@prisma/client';

/**
 * Reads the status being written, supporting both `status: 'X'` and `status: { set: 'X' }`.
 * Returns undefined when the update doesn't touch status.
 */
function readStatus(data: any): string | undefined {
  if (!data || typeof data !== 'object' || !('status' in data)) return undefined;
  const s = (data as any).status;
  if (s && typeof s === 'object' && 'set' in s) return s.set;
  return s;
}

/**
 * Derives Task.completedAt from a status write. Pure + guarded (never throws):
 *  - status set to COMPLETED      → completedAt = now (unless the caller set it explicitly)
 *  - status set to anything else  → completedAt = null (reopened / moved out of completed)
 *  - status not in the payload     → completedAt untouched
 * Exported for unit testing the transition logic.
 */
export function applyCompletedAt(data: any, now: Date = new Date()): void {
  if (!data || typeof data !== 'object') return;
  const status = readStatus(data);
  if (status === undefined) return;          // status not being changed
  if (data.completedAt !== undefined) return; // caller set it explicitly — respect it
  data.completedAt = status === 'COMPLETED' ? now : null;
}

/**
 * Prisma query extension — the SINGLE chokepoint that keeps Task.completedAt consistent across the
 * 15+ scattered task-write sites (handlers, services, agent paths) without per-site wiring. Applies
 * to both paichart-web and paichart-mcp since both use lib/prisma.ts.
 */
export function taskCompletedAtExtension() {
  return Prisma.defineExtension({
    name: 'task-completed-at',
    query: {
      task: {
        create({ args, query }) { applyCompletedAt(args.data); return query(args); },
        update({ args, query }) { applyCompletedAt(args.data); return query(args); },
        updateMany({ args, query }) { applyCompletedAt(args.data); return query(args); },
        upsert({ args, query }) { applyCompletedAt(args.create); applyCompletedAt(args.update); return query(args); },
      },
    },
  });
}
