'use client';

import React from 'react';
import UserForm, { UserFormData } from '@/components/admin/UserForm';
import { UserManagement } from '@/components/admin/UserManagement/UserManagement';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { UserRole, UserStatus, AVAILABLE_ROLES } from '@/lib/types/auth';
import { AdminUser } from '@/components/admin/UserManagement/types';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { PlusIcon, Loader2Icon } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

export default function UsersPage() {
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<AdminUser | null>(null);
  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [jobTitles, setJobTitles] = React.useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [deleteUserId, setDeleteUserId] = React.useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const fetchData = React.useCallback(async () => {
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/roles')
      ]);

      if (!usersResponse.ok) {
        throw new Error('Failed to fetch users');
      }
      if (!rolesResponse.ok) {
        throw new Error('Failed to fetch roles');
      }

      const [usersData, rolesData] = await Promise.all([
        usersResponse.json(),
        rolesResponse.json()
      ]);

      setUsers(usersData.data.users);
      setJobTitles(rolesData.data.map((role: { id: string; name: string }) => ({
        id: role.id,
        name: role.name
      })));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('An error occurred'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUserCreate = async (userData: UserFormData) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create user');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create user'));
      throw err;
    }
  };

  const handleUserEdit = async (userId: string, userData: UserFormData) => {
    try {
      const response = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...userData,
          // Preserve the email if it's an edit operation
          email: users.find(u => u.id === userId)?.email || userData.email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update user');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update user'));
      throw err;
    }
  };

  const handleUserDelete = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete user';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.message || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          errorMessage = `Failed to delete user: ${response.status} ${response.statusText}`;
        }
        
        // Show error toast instead of throwing
        toast({
          title: "Delete Failed",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }

      // Show success toast
      toast({
        title: "User Deleted",
        description: "User has been successfully deleted",
        variant: "default",
      });

      // Refresh the user list
      await fetchData();
    } catch (err) {
      console.error('Delete user error:', err);
      
      // Show error toast
      toast({
        title: "Delete Failed",
        description: "An unexpected error occurred while deleting the user",
        variant: "destructive",
      });
    }
  };

  if (error) {
    return (
      <div className="p-6 text-center">
        <Alert variant="destructive" className="mb-4">
          {error.message}
        </Alert>
        <Button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchData();
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setSelectedUser(null);
            setIsFormOpen(true);
          }}
          className="gap-2"
        >
          <PlusIcon className="h-4 w-4" />
          Create User
        </Button>
      </div>

      <UserManagement
        users={users.map(user => ({
          ...user,
          lastLogin: user.lastLogin ? new Date(user.lastLogin) : null,
          createdAt: user.createdAt || new Date().toISOString()
        }))}
        roles={AVAILABLE_ROLES}
        jobTitles={jobTitles}
        onEdit={(user: AdminUser) => {
          setSelectedUser(user);
          setIsFormOpen(true);
        }}
        onDelete={(user: AdminUser) => setDeleteUserId(user.id)}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteUserId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteUserId) {
                  await handleUserDelete(deleteUserId);
                  setDeleteUserId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedUser(null);
        }}
        onSubmit={async (userData) => {
          try {
            if (selectedUser) {
              await handleUserEdit(selectedUser.id, userData);
            } else {
              await handleUserCreate(userData);
            }
            setIsFormOpen(false);
            setSelectedUser(null);
          } catch (err) {
            // Error is already set in the handlers
            // Keep form open to show the error
          }
        }}
        initialData={selectedUser ? {
          name: selectedUser.name,
          email: selectedUser.email,
          role: selectedUser.role,
          status: selectedUser.status,
          customRoleId: selectedUser.customRoleId
        } : undefined}
        mode={selectedUser ? 'edit' : 'create'}
        currentUserRole={user?.role as UserRole}
        jobTitles={jobTitles}
        onRoleCreated={(newRole) => {
          // Add the new role to the jobTitles list
          setJobTitles(prevTitles => [...prevTitles, newRole]);
        }}
      />
    </div>
  );
}
