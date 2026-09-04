import { NextRequest } from "next/server";
import { z } from 'zod';
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { prisma } from "@/lib/prisma";
import { trackActivity } from "@/lib/auth/audit";
import { parsePaginationParams, paginationResponse } from '@/lib/utils/pagination';
import { logger } from '@/lib/logger';

// ✅ Zod validation for CRM mapping (Week 2 Enhancement)
const CreateCRMFieldMappingSchema = z.object({
  crmField: z.string().min(1, 'CRM field required').max(100),
  localField: z.string().min(1, 'Local field required').max(100),
  transformer: z.string().max(50).optional(),
  isRequired: z.boolean().optional().default(false)
});

const UpdateCRMFieldMappingSchema = z.object({
  id: z.string().cuid('Invalid mapping ID'),
  crmField: z.string().min(1).max(100),
  localField: z.string().min(1).max(100),
  transformer: z.string().max(50).optional(),
  isRequired: z.boolean().optional()
});

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

    const { searchParams } = new URL(request.url);
    const { limit, offset } = parsePaginationParams(searchParams, { limit: 100 });

    const [mappings, totalCount] = await Promise.all([
      prisma.cRMFieldMapping.findMany({
        orderBy: { crmField: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.cRMFieldMapping.count()
    ]);

    return Response.json(paginationResponse(mappings, totalCount, limit, offset));
  } catch (error) {
    logger.error({ err: error }, 'CRM Mapping GET error');
    return Response.json({ error: 'Failed to fetch CRM mappings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin permissions
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return Response.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

  const data = await request.json();

  // ✅ Zod validation with safeParse (P1 fix - proper error handling)
  const result = CreateCRMFieldMappingSchema.safeParse(data);

  if (!result.success) {
    return Response.json({
      error: 'Validation failed',
      details: result.error.errors
    }, { status: 400 });
  }

  const validated = result.data;

  // Check for duplicate CRM field
  const existing = await prisma.cRMFieldMapping.findUnique({
    where: { crmField: validated.crmField }
  });

  if (existing) {
    return Response.json({ code: 'BAD_REQUEST', message: 'A mapping for this CRM field already exists' }, { status: 400 });
  }

  const mapping = await prisma.cRMFieldMapping.create({
    data: {
      crmField: validated.crmField,
      localField: validated.localField,
      transformer: validated.transformer || null,
      isRequired: validated.isRequired,
    }
  });

  await trackActivity(
    user.userId,
    'CRM',
    'CREATE_MAPPING',
    {
      crmField: validated.crmField,
      localField: validated.localField,
      mappingId: mapping.id,
      success: true
    }
  );

    logger.info({ crmField: validated.crmField, localField: validated.localField, mappingId: mapping.id }, 'AUDIT: CRM mapping created');

    return Response.json(mapping);
  } catch (error) {
    logger.error({ err: error }, 'CRM Mapping POST error');
    return Response.json({ error: 'Failed to create CRM mapping' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin permissions
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return Response.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

  const data = await request.json();

  // ✅ Zod validation with safeParse (P1 fix - proper error handling)
  const result = UpdateCRMFieldMappingSchema.safeParse(data);

  if (!result.success) {
    return Response.json({
      error: 'Validation failed',
      details: result.error.errors
    }, { status: 400 });
  }

  const validated = result.data;

  // Check for duplicate CRM field (excluding current record)
  const existing = await prisma.cRMFieldMapping.findFirst({
    where: {
      crmField: validated.crmField,
      id: { not: validated.id }
    }
  });

  if (existing) {
    return Response.json({ code: 'BAD_REQUEST', message: 'A mapping for this CRM field already exists' }, { status: 400 });
  }

  const mapping = await prisma.cRMFieldMapping.update({
    where: { id: validated.id },
    data: {
      crmField: validated.crmField,
      localField: validated.localField,
      transformer: validated.transformer || null,
      isRequired: validated.isRequired ?? false,
    }
  });

  // ✅ Audit logging
  await trackActivity(
    user.userId,
    'CRM',
    'UPDATE_MAPPING',
    {
      mappingId: validated.id,
      crmField: validated.crmField,
      localField: validated.localField,
      success: true
    }
  );

    logger.info({ mappingId: validated.id, crmField: validated.crmField, localField: validated.localField }, 'AUDIT: CRM mapping updated');

    return Response.json(mapping);
  } catch (error) {
    logger.error({ err: error }, 'CRM Mapping PUT error');
    return Response.json({ error: 'Failed to update CRM mapping' }, { status: 500 });
  }
}
