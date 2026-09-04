import { NextRequest, NextResponse } from "next/server"
import { deleteMultiplePhasesHandler } from "@/lib/pov/handlers/delete"
import { withPOVAccess } from '@/lib/auth/validate-pov-access'
import { createErrorResponse } from '@/lib/api/error-handler'
import { povLogger } from '@/lib/logger'

/**
 * DELETE /api/pov/[povId]/phase/multiple
 * Delete multiple phases
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const DELETE = withPOVAccess(async (
  req: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    // Pass user context to handler
    const result = await deleteMultiplePhasesHandler(req, { params, user, pov })

    // Check if handler returned an error response
    if (result && result.status && result.status >= 400) {
      return result
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    povLogger.error({ err: error }, 'multiple phase delete error')
    return createErrorResponse('INTERNAL_ERROR', 'Failed to delete phases')
  }
});
