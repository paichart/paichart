import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { ensureObject } from '@/lib/utils/ensure-object';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { povLogger } from '@/lib/logger';

// 2026-05-14 P1: route was writing data.phaseTemplateIds verbatim to
// pov.metadata.phaseTemplates jsonb with no element shape, no length cap.
// DoS via large array + non-CUID values reaching downstream readers.
const AssignPhaseTemplatesSchema = z.object({
  phaseTemplateIds: z.array(z.string().cuid('Invalid phase template ID'))
    .min(1, 'At least one phase template ID required')
    .max(50, 'Maximum 50 phase templates allowed'),
});

/**
 * GET /api/pov/[povId]/phase-templates
 *
 * Get phase templates for a POV
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const GET = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    const povId = params.povId;

    // Check if the POV has phase templates in its metadata
    let phaseTemplateIds: string[] = [];

    if (pov.metadata) {
      const metadata = ensureObject(pov.metadata, {}, 'POV metadata') as Record<string, any>;

      if (metadata.phaseTemplates && Array.isArray(metadata.phaseTemplates)) {
        phaseTemplateIds = metadata.phaseTemplates;
      }
    }
    
    // If we found phase template IDs, fetch the templates
    if (phaseTemplateIds.length > 0) {
      const phaseTemplates = await prisma.phaseTemplate.findMany({
        where: {
          id: { in: phaseTemplateIds }
        }
      });
      
      return NextResponse.json(phaseTemplates);
    }
    
    // If no phase templates found, return an empty array
    return NextResponse.json([]);

  } catch (error) {
    povLogger.error({ err: error }, 'phase templates GET error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to get phase templates for POV' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pov/[povId]/phase-templates
 *
 * Update phase templates for a POV
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  try {
    // user and pov already validated by withPOVAccess middleware! ✅

    const povId = params.povId;
    
    // 2026-05-14 P1 wire-up: schema enforces DoS cap (max 50) +
    // per-element CUID validation. Previously ad-hoc Array.isArray check.
    const body = await request.json();
    const validation = AssignPhaseTemplatesSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Update the POV metadata with the phase template IDs
    const metadata = ensureObject(pov.metadata, {}, 'POV metadata') as Record<string, any>;

    metadata.phaseTemplates = data.phaseTemplateIds;
    
    // Save the updated metadata
    await prisma.pOV.update({
      where: { id: povId },
      data: { metadata }
    });
    
    // Create phases from templates
    if (data.phaseTemplateIds.length > 0) {
      povLogger.info({ phaseTemplateIds: data.phaseTemplateIds }, 'creating phases from templates');
      
      try {
        // Import the ensurePhasesFromTemplates function
        const { ensurePhasesFromTemplates } = await import('@/lib/pov/handlers/put');
        
        // Create phases from templates
        await ensurePhasesFromTemplates(povId, data.phaseTemplateIds);
        
        povLogger.info('successfully created phases from templates');
      } catch (error) {
        povLogger.error({ err: error }, 'error creating phases from templates');
        // Don't throw the error, just log it
      }
    }
    
    // Return the updated phase template IDs
    return NextResponse.json({ phaseTemplateIds: data.phaseTemplateIds });

  } catch (error) {
    povLogger.error({ err: error }, 'phase templates POST error');

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.safeDetails },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update phase templates for POV' },
      { status: 500 }
    );
  }
});
