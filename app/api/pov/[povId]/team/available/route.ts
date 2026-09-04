import { NextRequest, NextResponse } from 'next/server';
import { getAvailableTeamMembersHandler } from '@/lib/pov/handlers/team';
import { withPOVAccess } from '@/lib/auth/validate-pov-access';
import { povLogger } from '@/lib/logger';

/**
 * GET /api/pov/[povId]/team/available
 * Get available users for team member selection
 */
export const GET = withPOVAccess(async (req, { params, user, pov }) => {
  try {
    // ✅ POV already loaded and validated by middleware
    // Pass user and pov context to handler
    const members = await getAvailableTeamMembersHandler(req, params.povId, user, pov);
    return NextResponse.json(members);
  } catch (error) {
    povLogger.error({ err: error }, 'available team members error');
    return NextResponse.json(
      { error: 'Failed to fetch available team members' },
      { status: 500 }
    );
  }
});
