import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { z } from 'zod';  // P1 Fix: Query parameter validation (Issue #9)
import { logger } from '@/lib/logger';

// P1 Fix: Query parameter validation schema (Issue #9 - Security)
const ExportQuerySchema = z.object({
  ids: z.string().regex(/^[a-zA-Z0-9_-]+(,[a-zA-Z0-9_-]+)*$/, {
    message: 'Invalid template IDs format. Use comma-separated alphanumeric IDs.'
  }).optional(),
  all: z.enum(['true', 'false']).optional()
});

export async function GET(request: NextRequest) {
  try {
    // SECURITY FIX: Add authentication to prevent unauthorized template export
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized access to template export' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const ids = url.searchParams.get('ids');
    const all = url.searchParams.get('all');

    // P1 Fix: Validate query parameters with safeParse (proper error handling)
    const queryResult = ExportQuerySchema.safeParse({
      ids: ids || undefined,
      all: all || undefined
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: queryResult.error.errors
        },
        { status: 400 }
      );
    }

    // Read from validated query result — 2026-05-14 bug-class cleanup.
    // Stylistic alignment with the rest of the codebase post-stage-routes
    // fix; ExportQuerySchema is a format gate (no transforms), so the
    // earlier raw-searchParam reads were functionally equivalent.
    const validated = queryResult.data;
    const allFlag = validated.all === 'true';

    let templates;

    if (validated.ids) {
      // Export specific templates by IDs
      const templateIds = validated.ids.split(',');
      templates = await prisma.phaseTemplate.findMany({
        where: {
          id: {
            in: templateIds
          }
        }
      });
    } else if (allFlag) {
      // Export all templates
      templates = await prisma.phaseTemplate.findMany({ take: 500 }); // BC62 FIX: Bound query
    } else {
      // Default: export published templates
      templates = await prisma.phaseTemplate.findMany({
        where: {
          // Assuming there's a status field, otherwise remove this condition
          // status: 'published'
        }
      });
    }
    
    // Format the templates for export
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      templates: templates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        type: template.type,
        isDefault: template.isDefault,
        workflow: template.workflow
      }))
    };
    
    return NextResponse.json(exportData);
  } catch (error) {
    logger.error({ err: error, endpoint: 'GET /api/phase-templates/export' }, 'Failed to export phase templates');
    return NextResponse.json(
      { error: 'Failed to export phase templates' },
      { status: 500 }
    );
  }
}
