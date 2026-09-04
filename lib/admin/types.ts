import { UserRole, UserStatus, ApiResponse } from "@/lib/types/auth";

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  users: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  }[];
}

export interface CreateRoleRequest {
  name: string;
  permissions: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  permissions?: string[];
}

// RoleResponse matches Role since we want consistent date handling
export type RoleResponse = Role;

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLogin: string | null;
  createdAt: string;
  verificationToken?: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  customRoleId?: string;
  customRole?: {
    id: string;
    name: string;
  };
  preferredSalesTheatre?: string | null;
  preferredCountryId?: string | null;
  preferredRegionId?: string | null;
}

export interface AdminUserResponse extends ApiResponse<{
  users: AdminUser[];
}> {}

export interface Activity {
  id: string;
  userId: string;
  type: string;
  action: string;
  metadata?: Record<string, any>;
  createdAt: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
}

export interface ActivityListData {
  activities: Activity[];
  pagination: {
    total: number;
    current: number;
    pages: number;
    limit: number;
    pageSize: number;
    hasMore: boolean;
  };
  filters: {
    types: string[];
    actions: string[];
  };
}

export interface ActivityFilters {
  type?: string;
  action?: string;
  userId?: string;
  povId?: string;  // Filter activities by POV (for team membership audit)
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

// ActivityResponse matches ActivityListData since that's what the service returns
export type ActivityResponse = ActivityListData;

export interface ActivityCreateResponse {
  activity: Activity;
}

export interface SystemSettings {
  id: string;
  notifications: boolean;
  twoFactor: boolean;
  darkMode: boolean;
  updatedAt: string;
}

export const ALLOWED_SETTINGS = [
  'notifications',
  'twoFactor',
  'darkMode',
] as const;

export type SettingKey = typeof ALLOWED_SETTINGS[number];

export interface UpdateSettingRequest {
  id: SettingKey;
  value: boolean;
}
