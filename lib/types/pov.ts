import { Task } from './task';
import { Phase } from './phase';
import { POVStatus, Priority, PhaseType, UserRole, UserStatus, SalesTheatre } from '@prisma/client';

// Re-export Prisma types
export { POVStatus, Priority, PhaseType, UserRole, UserStatus, SalesTheatre };

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  password: string | null;
  lastLogin: Date | null;
  resetTokenHash: string | null;
  resetTokenExpiry: Date | null;
  verificationToken: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  // OAuth 2.0 fields for enterprise authentication
  oauthProvider: string | null;
  oauthProviderId: string | null;
  avatarUrl: string | null;
  organizationDomain: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customRoleId: string | null;
  preferredSalesTheatre: SalesTheatre | null;
  preferredCountryId: string | null;
  preferredRegionId: string | null;
}

export interface Team {
  id: string;
  name: string;
}

export interface PoVMetadata {
  customer: string;
  teamSize: string;
  successCriteria: string;
  technicalRequirements: string;
}

export interface PoV {
  id: string;
  title: string;
  description: string;
  status: POVStatus;
  priority: Priority;
  startDate: Date;
  endDate: Date;
  forecastDate?: Date | null;
  objective?: string;
  dealId?: string;
  opportunityName?: string;
  revenue?: number;
  customerName?: string;
  customerContact?: string;
  partnerName?: string;
  partnerContact?: string;
  competitors?: string[];
  solution?: string;
  lastCrmSync?: Date;
  crmSyncStatus?: string;
  documents?: any;
  featureRequests?: any;
  supportTickets?: any;
  blockers?: any;
  tags?: string[];
  estimatedBudget?: number;
  budgetDocument?: string;
  resources?: any;
  salesTheatre?: string;
  countryId?: string;
  regionId?: string;
  ownerId: string;
  teamId?: string;
  templateId?: string;
  formData?: any;
  metadata?: PoVMetadata;
  createdAt: Date;
  updatedAt: Date;
  owner?: User;
  team?: Team;
  country?: any;
  region?: any;
  phases?: Phase[];
  syncHistory?: any[];
  milestones?: any[];
  launch?: any;
  workflows?: any[];
}
