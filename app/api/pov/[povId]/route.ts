import { NextRequest, NextResponse } from "next/server"
import { getPoVHandler, getPoVListHandler } from "@/lib/pov/handlers/get"
import { deletePoVHandler } from "@/lib/pov/handlers/delete"
import { updatePoVHandler } from "@/lib/pov/handlers/put"
import { handleApiError } from "@/lib/api-handler"
import { withPOVAccess } from "@/lib/auth/validate-pov-access"
import { povLogger } from "@/lib/logger"
import { povListCache } from "@/app/api/pov/pov-cache"

interface RouteParams {
  params: {
    povId: string
  }
}

// Invalidate the cached POV list for everyone who could see this POV — the
// actor, the owner, and all team members — else a delete/edit lingers in their
// list until the 60s povListCache TTL (stale until refresh × N).
function invalidatePovListCache(
  actorId: string,
  pov: { ownerId: string; team?: { members?: any[] } | null }
) {
  const affected = new Set<string>([actorId, pov.ownerId])
  pov.team?.members?.forEach((m: any) => {
    const uid = m?.userId ?? m?.user?.id
    if (uid) affected.add(uid)
  })
  affected.forEach(uid => { if (uid) povListCache.invalidatePattern(`pov:list:${uid}`) })
}

export const GET = withPOVAccess(async (req, { params, user, pov }): Promise<NextResponse> => {
  try {
    // ✅ POV already validated by middleware
    // Don't pass user/pov to handler - let it do full load with phases/stages/tasks
    // Handler shortcut: if (user && pov) return pov; ← Would return lightweight version
    // We want full load: povService.get(povId) ← Includes phases/stages/tasks
    const completePov = await getPoVHandler(req, { params });

    // Use NextResponse.json to create a proper JSON response
    return NextResponse.json(completePov, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });
  } catch (error) {
    povLogger.error({ err: error }, 'POV GET error')
    const errorResponse = handleApiError(error)
    return errorResponse as unknown as NextResponse
  }
});

export const PUT = withPOVAccess(async (req, { params, user, pov }) => {
  try {
    // Pass user and pov context to handler
    const result = await updatePoVHandler(req, { params, user, pov })
    invalidatePovListCache(user.userId, pov)
    // Handler returns Response, wrap in NextResponse for type safety
    return result as unknown as NextResponse
  } catch (error) {
    povLogger.error({ err: error }, 'POV PUT error')
    const errorResponse = handleApiError(error)
    return errorResponse as unknown as NextResponse
  }
});

export const DELETE = withPOVAccess(async (req, { params, user, pov }) => {
  try {
    // Pass context to handler
    await deletePoVHandler(req, { params, user, pov })
    invalidatePovListCache(user.userId, pov)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    povLogger.error({ err: error }, 'POV DELETE error')
    const errorResponse = handleApiError(error)
    return errorResponse as unknown as NextResponse
  }
});
