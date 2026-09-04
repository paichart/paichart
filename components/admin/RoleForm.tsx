'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Label } from '@/components/ui/Label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/Form';

const availablePermissions = [
  'View Users',
  'Create Users',
  'Edit Users',
  'Delete Users',
  'View Roles',
  'Create Roles',
  'Edit Roles',
  'Delete Roles',
  'View PoVs',
  'Create PoVs',
  'Edit PoVs',
  'Delete PoVs',
];

interface RoleFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (roleData: RoleFormData) => Promise<void>;
  initialData?: RoleFormData;
  mode: 'create' | 'edit';
}

export interface RoleFormData {
  name: string;
  permissions: string[];
}

export default function RoleForm({ open, onClose, onSubmit, initialData, mode }: RoleFormProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<RoleFormData>({
    defaultValues: {
      name: initialData?.name || '',
      permissions: initialData?.permissions || [],
    },
  });

  const onFormSubmit = async (data: RoleFormData) => {
    setError(null);
    setLoading(true);

    try {
      await onSubmit(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New Role' : 'Edit Role'}
          </DialogTitle>
        </DialogHeader>
        <Form form={form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input {...field} required />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissions</FormLabel>
                  <div className="space-y-2">
                    {availablePermissions.map((permission) => (
                      <div key={permission} className="flex items-center space-x-2">
                        <Checkbox
                          id={permission}
                          checked={field.value?.includes(permission)}
                          onCheckedChange={(checked) => {
                            const newPermissions = checked
                              ? [...(field.value || []), permission]
                              : (field.value || []).filter((p) => p !== permission);
                            field.onChange(newPermissions);
                          }}
                        />
                        <Label htmlFor={permission}>{permission}</Label>
                      </div>
                    ))}
                  </div>
                </FormItem>
              )}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
