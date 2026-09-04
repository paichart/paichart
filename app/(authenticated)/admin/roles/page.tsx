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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/Form';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { useRoles } from '@/lib/admin/hooks/useRoles';
import { Role } from '@/lib/admin/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const roleFormSchema = z.object({
  name: z.string().min(1, 'Job title name is required'),
});

type RoleFormData = z.infer<typeof roleFormSchema>;

export default function RolesPage() {
  const [openDialog, setOpenDialog] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<{ id: string; name: string } | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const { data: roles, isLoading, error, mutate } = useRoles();

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: '',
    },
  });

  const handleCreateRole = async (data: RoleFormData) => {
    try {
      setErrorMessage(null);
      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          permissions: [], // Required permissions field
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        const message = responseData.error?.message || 'Failed to create role';
        throw new Error(message);
      }

      await mutate();
      handleCloseDialog();
    } catch (error) {
      console.error('Failed to create role:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create role');
    }
  };

  const handleUpdateRole = async (data: RoleFormData) => {
    if (!editingRole) return;

    try {
      setErrorMessage(null);
      const response = await fetch(`/api/admin/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          permissions: [], // Required permissions field
        }),
      });

      const responseData = await response.json();
      if (!response.ok) {
        const message = responseData.error?.message || 'Failed to update role';
        throw new Error(message);
      }

      await mutate();
      handleCloseDialog();
    } catch (error) {
      console.error('Failed to update role:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update role');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to delete this role?')) return;

    try {
      setErrorMessage(null);
      const response = await fetch(`/api/admin/roles/${roleId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok) {
        const message = data.error?.message || 'Failed to delete role';
        throw new Error(message);
      }

      await mutate();
    } catch (error) {
      console.error('Failed to delete role:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete role');
    }
  };

  const handleOpenDialog = (role?: { id: string; name: string }) => {
    setErrorMessage(null);
    if (role) {
      setEditingRole(role);
      form.reset({ name: role.name });
    } else {
      setEditingRole(null);
      form.reset({ name: '' });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingRole(null);
    form.reset();
    setErrorMessage(null);
    mutate(); // Refresh the list when dialog closes
  };

  if (isLoading) {
    return <p className="text-lg">Loading...</p>;
  }

  if (error) {
    return <p className="text-lg text-destructive">Error loading roles</p>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Job Titles</h1>
        <Button onClick={() => handleOpenDialog()}>
          Add Job Title
        </Button>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          {errorMessage}
        </Alert>
      )}

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles?.map((role: Role) => (
                <TableRow key={role.id}>
                  <TableCell>{role.name}</TableCell>
                  <TableCell>{role.users?.length || 0}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog({ id: role.id, name: role.name })}
                      className="h-8 w-8"
                    >
                      <PencilIcon className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRole(role.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <TrashIcon className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {roles?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">
                    No job titles found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'Edit Job Title' : 'Create New Job Title'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Form form={form}>
              <form
                onSubmit={form.handleSubmit(editingRole ? handleUpdateRole : handleCreateRole)}
                className="space-y-4"
              >
              {errorMessage && (
                <Alert variant="destructive">
                  {errorMessage}
                </Alert>
              )}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoFocus
                        placeholder="Enter job title name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!form.formState.isValid}
                >
                  {editingRole ? 'Save' : 'Create'}
                </Button>
              </DialogFooter>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
