import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { ReorderTasksSchema } from '@/lib/validation/task-validation';

/**
 * POST /api/pov/[povId]/phase/[phaseId]/task/reorder
 *
 * Reorder tasks
 *
 * SECURITY: withPOVAccess middleware (auth + POV validation)
 *           + Zod (ReorderTasksSchema) — 100-element DoS cap, per-id CUID
 */
export const POST = withPOVAccess(async (
  request: NextRequest,
  { params, user, pov }
) => {
  // user and pov already validated by withPOVAccess middleware! ✅

  const phaseId = params.phaseId;
  if (!phaseId) {
    return NextResponse.json(
      { error: 'Phase ID is required' },
      { status: 400 }
    );
  }

  // Get phase with PoV access check
  const phase = await prisma.phase.findUnique({
    where: {
      id: phaseId,
    },
    include: {
      pov: true,
    },
  });

  if (!phase) {
    return NextResponse.json(
      { error: 'Phase not found' },
      { status: 404 }
    );
  }

  // 2026-05-14 P1 wire-up: schema replaces inline check.
  // Old shape: ad-hoc Array.isArray + length > 500 (overshot DoS cap).
  // New shape: ReorderTasksSchema enforces min 1, max 100 (5× stricter)
  // and per-element CUID validation.
  const body = await request.json();
  const validation = ReorderTasksSchema.safeParse({ ...body, phaseId });
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

  // Update task orders using proper fractional ordering
  const tasks = await Promise.all(
    data.taskIds.map((taskId, index) =>
      prisma.task.update({
        where: {
          id: taskId,
          phaseId,
        },
        data: {
          order: (index + 1) * 1000, // Use proper order field with spacing for future insertions
          updatedAt: new Date(),
        },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
            },
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      })
    )
  );

  return NextResponse.json({ data: tasks });
});
