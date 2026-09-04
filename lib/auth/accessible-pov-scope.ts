import { prisma } from '@/lib/prisma';
import { TokenPayload, UserRole } from '@/lib/types/auth';

/**
 * POV IDs a user may see in cross-POV ("All Projects" / no-povId) analytics — or `null` for
 * admins, meaning global/all-POV access.
 *
 * SECURITY: closes the no-povId cross-tenant leak on the GUI `/api/analytics` tasks domain
 * and the task-context analytics block (sec-ops 2026-06-23, SEC-C1/C2). A non-admin with zero
 * accessible POVs returns `[]` → callers apply `where.povId = { in: [] }` → zero rows
 * (fail-closed), never all-tenant aggregates.
 *
 * Mirrors the proven MCP scoping in
 * lib/mcp/tasks/action/handlers/analytics/analytics-generate-handler.ts:150-187. (That handler
 * still has its own inline copy; dedup onto this helper is a Tier-3-unification follow-up.)
 */
export async function getAccessiblePovIds(user: TokenPayload): Promise<string[] | null> {
  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  if (isAdmin) return null; // global

  const rows = await prisma.pOV.findMany({
    where: {
      OR: [
        { ownerId: user.userId },
        { team: { members: { some: { userId: user.userId } } } },
        ...(user.role === 'DEMO_USER' ? [{ metadata: { path: ['isDemo'], equals: true } }] : []),
      ],
    },
    select: { id: true },
  });
  return rows.map(r => r.id);
}
