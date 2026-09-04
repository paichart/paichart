import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Checkbox } from '@/components/ui/Checkbox';
import { ResourceType, ResourceAction, UserRole } from '@/lib/types/auth';

// The ONLY (resource, action) grants the RolePermission table actually enforces
// — role-level capability gates. Access to existing POVs/phases/tasks
// (view/edit/delete) is governed per-resource by ownership/team membership
// (validatePOVAccess), NOT by this grid, so those are intentionally not shown.
// Keep in sync with scripts/setup-permissions.ts (the seeded enforced set).
const ENFORCED_GRANTS: Partial<Record<ResourceType, ResourceAction[]>> = {
  [ResourceType.MCP_SERVICE]: [ResourceAction.CREATE, ResourceAction.VIEW],
  [ResourceType.PoV]: [ResourceAction.CREATE],
};

const ENFORCED_RESOURCES = Object.keys(ENFORCED_GRANTS) as ResourceType[];
// Column set = union of enforced actions across the shown resources.
const ENFORCED_ACTIONS = Array.from(
  new Set(ENFORCED_RESOURCES.flatMap((r) => ENFORCED_GRANTS[r]!))
);

interface PermissionManagementProps {
  role: UserRole;
  currentUserRole: UserRole;
  rolePermissions: Record<ResourceType, Record<ResourceAction, boolean>>;
  onPermissionChange: (role: UserRole, resource: ResourceType, action: ResourceAction, value: boolean) => void;
}

export default function PermissionManagement({
  role,
  currentUserRole,
  rolePermissions,
  onPermissionChange,
}: PermissionManagementProps) {
  const disabled =
    role === UserRole.SUPER_ADMIN ||
    (role === UserRole.ADMIN && currentUserRole !== UserRole.SUPER_ADMIN);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These are the role-level capability gates enforced by the permission table.
        Access to existing POVs, phases, and tasks (view/edit/delete) is governed
        per-resource by ownership and team membership — not here.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell>Resource</TableCell>
              {ENFORCED_ACTIONS.map((action) => (
                <TableCell key={action} align="center">
                  {action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()}
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ENFORCED_RESOURCES.map((resource) => (
              <TableRow key={resource}>
                <TableCell>
                  <div>
                    <p className="font-medium">{getResourceLabel(resource)}</p>
                    <p className="text-sm text-muted-foreground">
                      {getResourceDescription(resource)}
                    </p>
                  </div>
                </TableCell>
                {ENFORCED_ACTIONS.map((action) => {
                  const enforced = ENFORCED_GRANTS[resource]!.includes(action);
                  return (
                    <TableCell key={action} align="center">
                      {enforced ? (
                        <div className="flex justify-center">
                          <Checkbox
                            checked={rolePermissions[resource]?.[action] || false}
                            onCheckedChange={(checked: boolean | 'indeterminate') =>
                              onPermissionChange(role, resource, action, checked === true)
                            }
                            disabled={disabled}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getResourceLabel(resource: ResourceType): string {
  switch (resource) {
    case ResourceType.MCP_SERVICE:
      return 'MCP Service';
    case ResourceType.PoV:
      return 'POV';
    default:
      return resource;
  }
}

function getResourceDescription(resource: ResourceType): string {
  switch (resource) {
    case ResourceType.MCP_SERVICE:
      return 'Register services in the hub & view the service registry';
    case ResourceType.PoV:
      return 'Create new POVs (access to existing POVs is governed by ownership)';
    default:
      return '';
  }
}
