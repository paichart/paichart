import { NextRequest, NextResponse } from 'next/server';
import { createPhaseHandler } from '@/lib/pov/handlers/post';
import { createPhaseSchema } from '@/lib/validation/pov';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { povLogger } from '@/lib/logger';

interface RouteParams {
  params: {
    povId: string;
  };
}

/**
 * POST /api/pov/[povId]/phase
 * Create a new phase in a PoV
 *
 * SECURITY: Route-level validation (defense-in-depth)
 * Handler also validates (double-check pattern)
 */
export async function POST(req: NextRequest, params: RouteParams) {
  try {
    // Route-level validation (defense-in-depth)
    const user = await getAuthUser(req);
    const body = await req.json();

    const validation = createPhaseSchema.safeParse(body);
    if (!validation.success) {
      povLogger.warn({ userId: user?.userId, povId: params.params.povId, errors: validation.error.errors }, 'phase create validation failed');

      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.errors
      }, { status: 400 });
    }

    // Handler also validates (defense-in-depth is good!)
    const response = await createPhaseHandler(req, params);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    povLogger.error({ err: error }, 'phase create error');
    return NextResponse.json(
      { error: 'Failed to create phase' },
      { status: 500 }
    );
  }
}
