import { User } from './auth';

export enum TeamRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export interface Team {
  id: string;
  name: string;
  members: Array<{
    user: User;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  teamId: string;
  user: User;
}

export interface TeamResponse {
  data: Team;
  error?: {
    message: string;
    code: string;
  };
}
