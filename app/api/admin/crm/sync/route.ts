import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { trackActivity } from "@/lib/auth/audit";
import { adminCRMLimiter } from "@/lib/middleware/rate-limit";
import { CRMSyncSchema } from "@/lib/validation/crm-validation";
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin permissions
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return Response.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const history = await prisma.cRMSyncHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 records
      include: {
        pov: {
          select: {
            title: true
          }
        }
      }
    });

    return Response.json(history);
  } catch (error) {
    logger.error({ err: error }, 'CRM Sync history fetch error');
    return Response.json({ error: 'Failed to fetch CRM sync history' }, { status: 500 });
  }
}

// ✅ NEW: POST /api/admin/crm/sync - Trigger CRM sync (Week 2 P0 Fix)
export async function POST(request: NextRequest) {
  try {
    // ✅ Rate limiting (P2.3): 10 CRM operations per hour
    const rateLimitResponse = adminCRMLimiter(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin permissions
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return Response.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

  // ✅ ENHANCEMENT: Check for concurrent syncs (Week 2 P1)
  const runningSyncs = await prisma.cRMSyncHistory.count({
    where: { status: 'RUNNING' }
  });

  if (runningSyncs > 0) {
    throw new ApiError("BAD_REQUEST", "CRM sync already in progress. Please wait for current sync to complete.");
  }

  // ✅ SECURITY: Validate with Zod schema (syncType enum, povId CUID format)
  const body = await request.json();
  const validation = CRMSyncSchema.safeParse(body);
  if (!validation.success) {
    return Response.json(
      { error: validation.error.errors.map(e => e.message).join(', ') },
      { status: 400 }
    );
  }
  const { syncType, povId } = validation.data;

  // Validate povId exists in DB if provided
  if (povId) {
    const pov = await prisma.pOV.findUnique({ where: { id: povId } });
    if (!pov) {
      throw new ApiError("NOT_FOUND", "POV not found");
    }
  }

  // ✅ Use existing schema (details JSON for extra metadata)
  const syncJob = await prisma.cRMSyncHistory.create({
    data: {
      povId: povId || 'global-sync', // Required field
      status: 'RUNNING',
      details: {
        syncType,
        startedAt: new Date().toISOString(),
        initiatedBy: user.userId,
        initiatedByEmail: user.email
      }
    }
  });

  // ✅ Audit logging
  await trackActivity(
    user.userId,
    'CRM',
    'TRIGGER_SYNC',
    {
      syncType,
      povId: povId || 'all',
      jobId: syncJob.id,
      success: true
    }
  );

  logger.info({ syncType, povId: povId || 'all', jobId: syncJob.id }, 'AUDIT: CRM sync triggered');

  // BC33 FIX: Fire-and-forget with robust status recovery
  triggerCRMSync(syncJob.id, syncType, povId).catch(async (error) => {
    logger.error({ err: error, jobId: syncJob.id }, 'CRM Sync job failed');
    // Retry status update up to 2 times to prevent permanently stuck RUNNING jobs
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await prisma.cRMSyncHistory.update({
          where: { id: syncJob.id },
          data: {
            status: 'FAILED',
            details: {
              ...(syncJob.details as any),
              completedAt: new Date().toISOString(),
              error: String(error)
            }
          }
        });
        return; // Status update succeeded
      } catch (err: unknown) {
        logger.error({ err, jobId: syncJob.id, attempt }, 'CRM Sync job status update failed');
      }
    }
  });

    return Response.json({
      success: true,
      jobId: syncJob.id,
      status: 'RUNNING',
      message: 'CRM sync initiated successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'CRM Sync error');
    return Response.json({ error: 'Failed to initiate CRM sync' }, { status: 500 });
  }
}

// Helper function to trigger actual sync
async function triggerCRMSync(jobId: string, syncType: string, povId?: string) {
  try {
    const { crmService } = await import('@/lib/pov/services/crm');

    if (povId) {
      // Sync specific POV
      await crmService.syncPoV(povId);
    } else {
      // Sync all POVs (can be slow!)
      const povs = await prisma.pOV.findMany({ select: { id: true } });
      for (const pov of povs) {
        await crmService.syncPoV(pov.id);
      }
    }

    // BC19 (2026-06-08): atomic status + jsonb merge. Was findUnique → spread → update in a
    // plain $transaction — lost-update racy on `details` (a plain tx does NOT prevent it). The
    // `||` merges over the existing jsonb in-SQL, preserving keys, in one statement.
    // (Supersedes the BC33 partial-transaction fix.) See transaction-atomicity-pattern.md / BC19.
    await prisma.$executeRaw`
      UPDATE "CRMSyncHistory"
         SET status = 'COMPLETED',
             details = COALESCE(details, '{}'::jsonb) || ${JSON.stringify({ completedAt: new Date().toISOString() })}::jsonb
       WHERE id = ${jobId}`;
  } catch (error) {
    throw error; // Caught by caller's .catch() which handles status → FAILED
  }
}

