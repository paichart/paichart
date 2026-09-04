import { UserRole, UserStatus } from '@/lib/types/auth';

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
}

export interface UserTableProps {
  users: AdminUser[];
  onEdit?: (user: AdminUser) => void;
  onDelete?: (user: AdminUser) => void;
  onSelectionChange?: (selectedUsers: AdminUser[]) => void;
}

export interface UserFilters {
  role: UserRole | 'all';
  status: UserStatus | 'all';
  jobTitle: string | 'all';
  search: string;
}

export interface UserFilterProps {
  onFilterChange: (filters: UserFilters) => void;
  roles: UserRole[];
  jobTitles: Array<{ id: string; name: string; }>;
}

export interface BulkActionsProps {
  selectedCount: number;
  onBulkDelete?: () => void;
  onBulkDeactivate?: () => void;
  onBulkActivate?: () => void;
}

export interface UserManagementProps {
  users: AdminUser[];
  roles: UserRole[];
  jobTitles: Array<{ id: string; name: string; }>;
  onEdit?: (user: AdminUser) => void;
  onDelete?: (user: AdminUser) => void;
  onBulkDelete?: (users: AdminUser[]) => void;
  onBulkDeactivate?: (users: AdminUser[]) => void;
  onBulkActivate?: (users: AdminUser[]) => void;
}
