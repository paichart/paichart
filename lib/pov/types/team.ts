import { User } from '@prisma/client';

// Response Types
export interface TeamMemberResponse {
  id: string;
  name: string;
  email: string;
}

export interface AvailableTeamMembersResponse {
  data: TeamMemberResponse[];
}

// Service Types
export interface TeamMemberSelection {
  povId: string;
  ownerId: string;
  teamId?: string;
}

// Mapper Types
export type TeamMemberFromPrisma = Pick<User, 'id' | 'name' | 'email'>;
