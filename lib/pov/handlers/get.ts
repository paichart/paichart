import { NextRequest } from "next/server"
import { ApiError } from "@/lib/errors"
import { povService } from "@/lib/pov/services/pov"
import { getAuthUser } from "@/lib/auth"
import { UserRole } from "@/lib/types/auth"
import { TeamMember } from "@prisma/client"
import { validatePOVAccess } from "@/lib/auth/validate-pov-access"
import { povLogger } from "@/lib/logger"

export async function getPoVHandler(
  request: NextRequest,
  { params, user, pov }: { params: { povId: string }, user?: any, pov?: any }
) {
  // ✅ If user and pov provided by withPOVAccess, auth already done
  if (user && pov) {
    povLogger.debug({ povId: params.povId }, 'using pre-validated context');
    return pov;
  }

  // ✅ Fallback: manual auth (for backward compatibility)
  const authUser = await getAuthUser(request);
  if (!authUser) {
    throw new ApiError("UNAUTHORIZED", "No user found");
  }

  const { povId } = params;
  povLogger.debug({ povId, userId: authUser.userId, role: authUser.role }, 'fetching POV');

  const fetchedPov = await povService.get(povId);
  if (!fetchedPov) {
    povLogger.warn({ povId }, 'POV not found');
    throw new ApiError("NOT_FOUND", "PoV not found");
  }

  povLogger.debug({ povId, ownerId: fetchedPov.ownerId, hasTeam: !!fetchedPov.team, teamMembersCount: (fetchedPov.team as any)?.members?.length ?? 0 }, 'POV found');

  // ✅ Use validatePOVAccess for consistent auth logic
  validatePOVAccess(authUser, fetchedPov, {
    throwOnDeny: true,
    logContext: 'POV Get'
  });

  // Return the POV data directly instead of a Response object
  return fetchedPov;
}

export async function getPoVListHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      throw new ApiError("UNAUTHORIZED", "No user found");
    }

    povLogger.debug({ userId: user.userId, role: user.role }, 'fetching POV list');

    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    const povs = await povService.list(user.userId, isAdmin);

    povLogger.debug({ userId: user.userId, count: povs.length }, 'POV list retrieved');

    // Return the data directly
    return { data: povs };
  } catch (error) {
    povLogger.error({ err: error }, 'POV list handler failed');
    throw error;
  }
}

export async function getPhaseHandler(
  request: NextRequest,
  { params }: { params: { povId: string; phaseId: string } }
) {
  const user = await getAuthUser(request);
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "No user found");
  }

  const { phaseId } = params;
  povLogger.debug({ phaseId, userId: user.userId, role: user.role }, 'fetching phase');

  const phase = await povService.getPhase(phaseId);
  if (!phase) {
    povLogger.warn({ phaseId }, 'phase not found');
    throw new ApiError("NOT_FOUND", "Phase not found");
  }

  povLogger.debug({ phaseId, povId: phase.pov.id }, 'phase found');

  // Validate POV access using shared utility
  validatePOVAccess(user, phase.pov, {
    throwOnDeny: true,
    logContext: 'Phase Get'
  });

  // Return the phase data directly
  return phase;
}

export async function getPoVPhasesHandler(
  request: NextRequest,
  { params }: { params: { povId: string } }
) {
  const user = await getAuthUser(request);
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "No user found");
  }

  const { povId } = params;
  povLogger.debug({ povId, userId: user.userId, role: user.role }, 'fetching POV phases');

  const pov = await povService.get(povId);
  if (!pov) {
    povLogger.warn({ povId }, 'POV not found for phases request');
    throw new ApiError("NOT_FOUND", "PoV not found");
  }

  // Validate POV access using shared utility
  validatePOVAccess(user, pov, {
    throwOnDeny: true,
    logContext: 'POV Phases'
  });

  const phases = await povService.getPhases(povId);
  povLogger.debug({ povId, count: phases.length }, 'POV phases retrieved');

  // Return the phases data directly
  return phases;
}
