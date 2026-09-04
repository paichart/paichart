'use client';

import React, { useState, useMemo } from "react";
import { UserTable } from "./UserTable";
import { UserFilter } from "./UserFilter";
import { BulkActions } from "./BulkActions";
import { UserRole } from "@/lib/types/auth";
import type { AdminUser, UserManagementProps, UserFilters } from "./types";

const UserManagement = ({
  users,
  onEdit,
  onDelete,
  onBulkDelete,
  onBulkDeactivate,
  onBulkActivate,
  roles,
  jobTitles
}: UserManagementProps): JSX.Element => {
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);
  const [filters, setFilters] = useState<UserFilters>({
    role: 'all',
    status: 'all',
    jobTitle: 'all',
    search: '',
  });

  const filteredUsers = useMemo(() => {
    return users.filter((user: AdminUser) => {
      const matchesRole = filters.role === 'all' || user.role === filters.role;
      const matchesStatus = filters.status === 'all' || user.status === filters.status;
      const matchesJobTitle = filters.jobTitle === 'all' || user.customRoleId === filters.jobTitle;
      const matchesSearch = !filters.search ||
        user.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.email.toLowerCase().includes(filters.search.toLowerCase()) ||
        user.customRole?.name.toLowerCase().includes(filters.search.toLowerCase());

      return matchesRole && matchesStatus && matchesJobTitle && matchesSearch;
    });
  }, [users, filters]);

  const handleFilterChange = (newFilters: UserFilters) => {
    setFilters(newFilters);
    // Clear selection when filters change
    setSelectedUsers([]);
  };

  const handleSelectionChange = (selectedUsers: AdminUser[]) => {
    setSelectedUsers(selectedUsers);
  };

  const handleBulkDelete = () => {
    onBulkDelete?.(selectedUsers);
    setSelectedUsers([]);
  };

  const handleBulkDeactivate = () => {
    onBulkDeactivate?.(selectedUsers);
    setSelectedUsers([]);
  };

  const handleBulkActivate = () => {
    onBulkActivate?.(selectedUsers);
    setSelectedUsers([]);
  };

  return (
    <div className="space-y-4">
      <UserFilter
        roles={roles}
        jobTitles={jobTitles}
        onFilterChange={handleFilterChange}
      />

      <BulkActions
        selectedCount={selectedUsers.length}
        onBulkDelete={onBulkDelete ? handleBulkDelete : undefined}
        onBulkDeactivate={onBulkDeactivate ? handleBulkDeactivate : undefined}
        onBulkActivate={onBulkActivate ? handleBulkActivate : undefined}
      />

      <UserTable
        users={filteredUsers}
        onEdit={onEdit}
        onDelete={onDelete}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}

export type { UserManagementProps };
export { UserManagement };
export default UserManagement;
