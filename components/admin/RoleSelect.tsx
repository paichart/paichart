'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { UserRole } from '@/lib/types/auth';

interface RoleSelectProps {
  value: UserRole;
  onChange: (role: UserRole) => void;
  currentUserRole?: UserRole;
  error?: string;
  mode: 'create' | 'edit';
  initialRole?: UserRole;
}

const roleHierarchy: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 3,
  [UserRole.ADMIN]: 2,
  [UserRole.USER]: 1,
  [UserRole.DEMO_USER]: 0,
};

const AVAILABLE_ROLES = [
  { value: UserRole.DEMO_USER, label: 'Demo User (Trial)' },
  { value: UserRole.USER, label: 'Standard User' },
  { value: UserRole.ADMIN, label: 'System Admin' },
  { value: UserRole.SUPER_ADMIN, label: 'Super Admin' },
];

export default function RoleSelect({
  value,
  onChange,
  currentUserRole,
  error,
  mode,
  initialRole,
}: RoleSelectProps): JSX.Element {
  const [localError, setLocalError] = React.useState<string | undefined>(error);

  const handleChange = (newRole: string) => {
    if (!currentUserRole) {
      setLocalError('Current user role not found');
      return;
    }

    const currentUserRoleLevel = roleHierarchy[currentUserRole];
    const newRoleLevel = roleHierarchy[newRole as UserRole];

    // Validate role change
    if (newRoleLevel > currentUserRoleLevel) {
      setLocalError('Cannot assign a role higher than your own');
      return;
    }

    if (mode === 'edit' && initialRole) {
      const initialRoleLevel = roleHierarchy[initialRole];
      if (initialRoleLevel > currentUserRoleLevel) {
        setLocalError('Cannot modify a user with a higher role');
        return;
      }
    }

    setLocalError(undefined);
    onChange(newRole as UserRole);
  };

  // Update local error when prop changes
  React.useEffect(() => {
    setLocalError(error);
  }, [error]);

  // Filter available roles based on current user's role
  const availableRoles = AVAILABLE_ROLES.filter(role => {
    if (!currentUserRole) return false;
    const currentUserLevel = roleHierarchy[currentUserRole];
    const roleLevel = roleHierarchy[role.value];
    return roleLevel <= currentUserLevel;
  });

  return (
    <FormItem>
      <FormLabel>System Role</FormLabel>
      <Select value={value} onValueChange={handleChange}>
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {availableRoles.map(role => (
            <SelectItem key={role.value} value={role.value}>
              {role.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {localError && <FormMessage>{localError}</FormMessage>}
    </FormItem>
  );
}
