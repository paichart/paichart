'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { UserRole, ResourceType, ResourceAction } from '@/lib/types/auth';
import PermissionManagement from '@/components/admin/PermissionManagement/PermissionManagement';

type RolePermissions = Record<ResourceType, Record<ResourceAction, boolean>>;
type PermissionsMap = Record<UserRole, RolePermissions>;

interface DbPermission {
  role: UserRole;
  resourceType: ResourceType;
  action: ResourceAction;
  enabled: boolean;
}

interface ApiResponse {
  data: {
    permissions: DbPermission[];
  };
}

// Initialize empty permission map
const createEmptyPermissionMap = () => {
  const permissionMap: PermissionsMap = Object.values(UserRole).reduce((acc, role) => {
    acc[role] = Object.values(ResourceType).reduce((resourceAcc, resourceType) => {
      resourceAcc[resourceType] = Object.values(ResourceAction).reduce((actionAcc, action) => {
        actionAcc[action] = false;
        return actionAcc;
      }, {} as Record<ResourceAction, boolean>);
      return resourceAcc;
    }, {} as Record<ResourceType, Record<ResourceAction, boolean>>);
    return acc;
  }, {} as PermissionsMap);

  // Set all permissions to true for SUPER_ADMIN
  Object.values(ResourceType).forEach((resourceType) => {
    Object.values(ResourceAction).forEach((action) => {
      permissionMap[UserRole.SUPER_ADMIN][resourceType][action] = true;
    });
  });

  return permissionMap;
};

export default function PermissionsPage() {
  const [currentUserRole, setCurrentUserRole] = React.useState<UserRole>(UserRole.USER);
  const [selectedRole, setSelectedRole] = React.useState<UserRole>(UserRole.USER);
  const [permissions, setPermissions] = React.useState(createEmptyPermissionMap());
  const [loading, setLoading] = React.useState(true);

  // Load current user and permissions from database
  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/permissions');
      if (!response.ok) {
        throw new Error('Failed to load permissions');
      }
      const { data } = await response.json() as ApiResponse & { data: { currentUserRole: UserRole } };
      setCurrentUserRole(data.currentUserRole);
      
      // Create new permission map
      const newPermissions = createEmptyPermissionMap();
      
      // Update with database permissions
      data.permissions?.forEach((p: DbPermission) => {
        if (p.role in newPermissions && p.resourceType in newPermissions[p.role]) {
          newPermissions[p.role][p.resourceType][p.action] = p.enabled;
        }
      });

      setPermissions(newPermissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
      console.error('Failed to load permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data on mount and when returning to page
  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const [error, setError] = React.useState<string | null>(null);

  const handlePermissionChange = async (
    role: UserRole,
    resource: ResourceType,
    action: ResourceAction,
    value: boolean
  ) => {
    try {
      setError(null);
      const response = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          resource,
          action,
          value,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update permission');
      }

      // Update local state after successful API call
      setPermissions((prev: PermissionsMap) => ({
        ...prev,
        [role]: {
          ...prev[role],
          [resource]: {
            ...prev[role][resource],
            [action]: value,
          },
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission');
      console.error('Failed to update permission:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">User Permissions</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div>Loading permissions...</div>
      ) : (
        <Card>
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">System Roles</h2>
            <p className="text-sm text-muted-foreground">
              Configure permissions for each system role. Super Admin permissions cannot be modified.
            </p>
          </div>

          <Tabs value={selectedRole} onValueChange={(value) => setSelectedRole(value as UserRole)}>
            <TabsList>
              {Object.values(UserRole).map((role) => (
                <TabsTrigger
                  key={role}
                  value={role}
                  disabled={role === UserRole.SUPER_ADMIN}
                >
                  {role.replace('_', ' ')}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mt-4">
            <PermissionManagement
              role={selectedRole}
              currentUserRole={currentUserRole}
              rolePermissions={permissions[selectedRole]}
              onPermissionChange={handlePermissionChange}
            />
          </div>
        </div>
        </Card>
      )}
    </div>
  );
}
