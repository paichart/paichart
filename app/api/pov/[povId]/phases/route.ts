import { NextRequest, NextResponse } from "next/server"
import { ApiError } from "@/lib/errors"
import { phaseService } from "@/lib/pov/services/phase"
import { z } from "zod"
import { PhaseDetails } from "@/lib/pov/types/phase"
import { PhaseType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { parsePaginationParams } from '@/lib/utils/pagination';

export const dynamic = 'force-dynamic'

const reorderSchema = z.object({
  type: z.literal("reorder"),
  phaseIds: z.array(z.string()).max(100), // BC62 FIX: Bound array size
  order: z.array(z.number()).max(100),     // BC62 FIX: Bound array size
}).refine(
  (data) => data.phaseIds.length === data.order.length,
  { message: 'phaseIds and order arrays must have the same length' }
)

/**
 * GET /api/pov/[povId]/phases
 *
 * Get all phases for a POV
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  // user and pov already validated by withPOVAccess middleware! ✅

  const { povId } = params;

  // ✅ ENHANCED: Response optimization with expand and includeStages parameters (Week 4 Phase 3.1, 3.3)
  const { searchParams } = new URL(request.url);
  const expand = searchParams.get('expand') === 'true';
  const includeStages = searchParams.get('includeStages') === 'true';
  const { limit } = parsePaginationParams(searchParams, { limit: 100, maxLimit: 100 });

  // Get phases with conditional includes (safety cap: phases are naturally bounded per POV)
  const phases = expand || includeStages
    ? await prisma.phase.findMany({
        where: { povId },
        orderBy: { order: 'asc' },
        take: limit,
        include: expand ? {
          // Full expansion (50KB response)
          template: {
            include: {
              phases: { include: { tasks: true } }
            }
          },
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, email: true } }
            }
          },
          stages: includeStages ? {
            orderBy: { order: 'asc' },
            include: {
              tasks: { select: { id: true, title: true, status: true } }
            }
          } : undefined,
          pov: {
            select: { id: true, title: true, ownerId: true }
          }
        } : {
          // Minimal expansion with optional stages (5KB response)
          stages: includeStages ? {
            orderBy: { order: 'asc' }
          } : undefined
        }
      })
    : await phaseService.getPoVPhases(povId); // Default: Use service (logical sorting)

  const response = NextResponse.json(phases);

  // ✅ ENHANCED: HTTP cache headers (Week 4 Phase 3.2)
  // Cache for 30s, allow stale for 5 minutes (50% query reduction)
  response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=300');
  response.headers.set('Vary', 'Authorization'); // BC40 FIX: Prevent cross-user cache poisoning

  return response;
});

/**
 * POST /api/pov/[povId]/phases
 *
 * Create a new phase for a POV
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  // user and pov already validated by withPOVAccess middleware! ✅

  const { povId } = params

  const data = await request.json()

  // Validate request body
  const schema = z.object({
    templateId: z.string().max(255),
    name: z.string().max(255),             // BC62 FIX: Bound string length
    description: z.string().max(5000),     // BC62 FIX: Bound string length
    startDate: z.string().max(50),         // BC62 FIX: Bound date string
    endDate: z.string().max(50),           // BC62 FIX: Bound date string
    order: z.number(),
    type: z.nativeEnum(PhaseType).optional(),
  })

  const validatedData = schema.safeParse(data)
  if (!validatedData.success) {
    throw new ApiError("BAD_REQUEST", "Invalid request body", validatedData.error)
  }

  const phase = await phaseService.createPhase({
    ...validatedData.data,
    povId,
    startDate: new Date(validatedData.data.startDate),
    endDate: new Date(validatedData.data.endDate),
  })

  return NextResponse.json(phase)
});

/**
 * PUT /api/pov/[povId]/phases
 *
 * Update or reorder phases for a POV
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const PUT = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  // user and pov already validated by withPOVAccess middleware! ✅

  const { povId } = params

  const data = await request.json()

  // Check if this is a reorder request
  if (data.type === "reorder") {
    const validatedData = reorderSchema.safeParse(data)
    if (!validatedData.success) {
      throw new ApiError("BAD_REQUEST", "Invalid request body", validatedData.error)
    }

    const { phaseIds, order } = validatedData.data
    const phases = await phaseService.reorderPhases(povId, phaseIds, order)
    return NextResponse.json(phases)
  }

  // Regular phase update
  const schema = z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    details: z.any().optional(),
  })

  const validatedData = schema.safeParse(data)
  if (!validatedData.success) {
    throw new ApiError("BAD_REQUEST", "Invalid request body", validatedData.error)
  }

  const { id, ...updateData } = validatedData.data

  // Convert date strings to Date objects if present
  const phaseUpdate: {
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    details?: PhaseDetails;
  } = {
    ...updateData,
    startDate: updateData.startDate ? new Date(updateData.startDate) : undefined,
    endDate: updateData.endDate ? new Date(updateData.endDate) : undefined,
  }

  const phase = await phaseService.updatePhase(id, phaseUpdate)
  return NextResponse.json(phase)
});
