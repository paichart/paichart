'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Badge } from '@/components/ui/Badge';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import UserForm, { UserFormData } from './UserForm';
import { UserRole, UserStatus } from '@/lib/types/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

interface Column {
  id: keyof User;
  label: string;
  sortable?: boolean;
  render?: (value: any, user: User) => React.ReactNode;
}

const columns: Column[] = [
  { id: 'name', label: 'Name', sortable: true },
  { id: 'email', label: 'Email', sortable: true },
  {
    id: 'role',
    label: 'Role',
    sortable: true,
    render: (value: UserRole) => (
      <Badge variant={value === UserRole.SUPER_ADMIN ? 'destructive' : value === UserRole.ADMIN ? 'secondary' : 'default'}>
        {value}
      </Badge>
    ),
  },
  {
    id: 'status',
    label: 'Status',
    sortable: true,
    render: (value: UserStatus) => (
      <Badge variant={
        value === UserStatus.ACTIVE
          ? 'success'
          : value === UserStatus.INACTIVE
          ? 'default'
          : 'destructive'
      }>
        {value}
      </Badge>
    ),
  },
  {
    id: 'createdAt',
    label: 'Created At',
    sortable: true,
    render: (value: string) => new Date(value).toLocaleDateString(),
  },
];

interface UserManagementProps {
  users: User[];
  onUserCreate: (userData: UserFormData) => Promise<void>;
  onUserEdit: (userId: string, userData: UserFormData) => Promise<void>;
  onUserDelete: (userId: string) => Promise<void>;
}

export default function UserManagement({
  users,
  onUserCreate,
  onUserEdit,
  onUserDelete,
}: UserManagementProps) {
  const [orderBy, setOrderBy] = React.useState<keyof User>('createdAt');
  const [orderDirection, setOrderDirection] = React.useState<'asc' | 'desc'>('desc');
  const [formOpen, setFormOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);

  const handleSort = (property: keyof User) => {
    const isAsc = orderBy === property && orderDirection === 'asc';
    setOrderDirection(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleCreateClick = () => {
    setSelectedUser(null);
    setFormOpen(true);
  };

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setSelectedUser(null);
  };

  const handleFormSubmit = async (data: UserFormData) => {
    if (selectedUser) {
      await onUserEdit(selectedUser.id, data);
    } else {
      await onUserCreate(data);
    }
    handleFormClose();
  };

  const sortedUsers = React.useMemo(() => {
    return [...users].sort((a, b) => {
      const aValue = a[orderBy];
      const bValue = b[orderBy];

      if (!aValue && !bValue) return 0;
      if (!aValue) return orderDirection === 'asc' ? 1 : -1;
      if (!bValue) return orderDirection === 'asc' ? -1 : 1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return orderDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return orderDirection === 'asc'
        ? (aValue > bValue ? 1 : -1)
        : (bValue > aValue ? 1 : -1);
    });
  }, [users, orderBy, orderDirection]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Users</h2>
        <Button
          onClick={handleCreateClick}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={column.sortable ? 'cursor-pointer select-none' : ''}
                    onClick={column.sortable ? () => handleSort(column.id) : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {column.label}
                      {column.sortable && orderBy === column.id && (
                        <span className="text-xs">
                          {orderDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user) => (
                <TableRow key={user.id}>
                  {columns.map((column) => (
                    <TableCell key={column.id}>
                      {column.render
                        ? column.render(user[column.id], user)
                        : user[column.id]}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(user)}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit user</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Edit user
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onUserDelete(user.id)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete user</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Delete user
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {formOpen && (
        <UserForm
          open={true}
          onClose={handleFormClose}
          onSubmit={handleFormSubmit}
          initialData={
            selectedUser
              ? {
                  email: selectedUser.email,
                  name: selectedUser.name,
                  role: selectedUser.role,
                  status: selectedUser.status,
                }
              : undefined
          }
          mode={selectedUser ? 'edit' : 'create'}
        />
      )}
    </div>
  );
}
