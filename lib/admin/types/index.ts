import { UserRole, UserStatus, ApiResponse } from '@/lib/types/auth';

export const ALLOWED_SETTINGS = [
  'notifications',
  'twoFactor',
  'darkMode',
] as const;

export interface ActivityResponse {
  data: ActivityListData;
}

export interface ActivityCreateResponse {
  data: {
    activity: Activity;
  };
}

export interface ActivityFilters {
  userId?: string;
  type?: string;
  action?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  page?: number;
  limit?: number;
}

export interface ActivityListData {
  activities: Activity[];
  pagination: {
    total: number;
    pages: number;
    current: number;
    limit: number;
    pageSize: number;
    hasMore: boolean;
  };
  filters: {
    types: string[];
    actions: string[];
  };
}

export interface AdminUserListData {
  users: AdminUser[];
}

export interface AdminUserResponse extends ApiResponse<AdminUserListData> {}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLogin: Date | null;
  createdAt: string;
  customRoleId?: string;
  customRole?: {
    id: string;
    name: string;
  };
  // OAuth 2.0 fields (Plan 9)
  oauthProvider?: string | null;
  oauthProviderId?: string | null;
  avatarUrl?: string | null;
  organizationDomain?: string | null;
  lastLoginAt?: Date | null;
}

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

export interface SettingsResponse {
  data: {
    settings: SystemSettings;
  };
}

export interface ApiSettingsResponse extends ApiResponse<SettingsResponse> {}

export interface UpdateSettingRequest {
  id: typeof ALLOWED_SETTINGS[number];
  value: boolean;
}

export interface SystemSettings {
  id: string;
  notifications: boolean;
  twoFactor: boolean;
  darkMode: boolean;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  }>;
}

export interface RoleResponse {
  data: {
    roles: Role[];
  };
}

export interface CreateRoleRequest {
  name: string;
  permissions: string[];
}

export interface UpdateRoleRequest {
  name: string;
  permissions?: string[];
}
