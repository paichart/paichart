import { Prisma } from '@prisma/client';
import { TeamMemberFromPrisma, TeamMemberResponse } from '../types/team';

// Prisma Select Types
export const teamMemberSelect = {
  id: true,
  name: true,
  email: true,
} as const satisfies Prisma.UserSelect;

// Type for Prisma query result using the select
export type TeamMemberQueryResult = Prisma.UserGetPayload<{
  select: typeof teamMemberSelect;
}>;

// Mappers
export function mapTeamMemberFromPrisma(user: TeamMemberFromPrisma): TeamMemberResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
