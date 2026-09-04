import type { User, UserRole, UserStatus } from '@/lib/types/auth';
import type { TeamRole as DomainTeamRole } from '@/lib/types/team';
import type { 
  UserRole as PrismaUserRole, 
  UserStatus as PrismaUserStatus,
  TeamRole as PrismaTeamRole
} from '@prisma/client';
import type { Team } from '@/lib/types/team';
import type { Prisma } from '@prisma/client';

import { User as PrismaUserType } from '@prisma/client';

type PrismaUser = PrismaUserType & {
  customRole?: {
    id: string;
    name: string;
  };
};

type PrismaTeam = Prisma.TeamGetPayload<{
  include: {
    members: {
      include: {
        user: true;
      };
    };
  };
}>;

// User enum mapping functions
function mapPrismaUserRole(role: PrismaUserRole): UserRole {
  return role as unknown as UserRole; // Safe cast since enums match
}

function mapPrismaUserStatus(status: PrismaUserStatus): UserStatus {
  return status as unknown as UserStatus; // Safe cast since enums match
}

export function mapPrismaUser(user: PrismaUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: mapPrismaUserRole(user.role),
    status: mapPrismaUserStatus(user.status),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
    customRoleId: user.customRoleId,
    verificationToken: user.verificationToken,
    isVerified: user.isVerified,
    verifiedAt: user.verifiedAt
  };
}

// Team enum mapping functions
function mapPrismaTeamRole(role: PrismaTeamRole): DomainTeamRole {
  return role as unknown as DomainTeamRole; // Safe cast since enums match
}

export function mapPrismaTeam(team: PrismaTeam): Team {
  return {
    id: team.id,
    name: team.name,
    members: team.members.map(member => ({
      user: mapPrismaUser(member.user),
      role: mapPrismaTeamRole(member.role),
    })),
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  };
}
