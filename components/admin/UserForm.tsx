'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { UserRole, UserStatus } from '@/lib/types/auth';
import RoleSelect from './RoleSelect';
import StatusSelect from './StatusSelect';
import CustomRoleSelect from './CustomRoleSelect';

const userFormSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.nativeEnum(UserRole),
  status: z.nativeEnum(UserStatus),
  customRoleId: z.string().optional(),
  // Optional on create: a self-host with no OAuth provider (and no mail key, so no /register)
  // has NO other way to give a new account a password. Blank = the user signs in with OAuth.
  // Mirrors CreateUserSchema.password (12+, mixed classes) so the server never rejects what the
  // form accepted; empty is stripped before submit.
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character')
    .optional()
    .or(z.literal('')),
});

export type UserFormData = z.infer<typeof userFormSchema>;

interface UserFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (userData: UserFormData) => Promise<void>;
  initialData?: UserFormData;
  mode: 'create' | 'edit';
  currentUserRole?: UserRole;
  jobTitles?: Array<{ id: string; name: string }>;
  onRoleCreated?: (role: { id: string; name: string }) => void;
}

export default function UserForm({
  open,
  onClose,
  onSubmit,
  initialData,
  mode,
  currentUserRole,
  jobTitles = [],
  onRoleCreated
}: UserFormProps): JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = React.useState(false);

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: initialData || {
      email: '',
      name: '',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      customRoleId: undefined,
    }
  });
  
  // Update form values when initialData changes or when opening the form for a new user
  React.useEffect(() => {
    if (initialData) {
      form.reset(initialData);
    } else if (open && mode === 'create') {
      form.reset({
        email: '',
        name: '',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        customRoleId: undefined,
      });
    }
  }, [initialData, form, open, mode]);

  const handleSubmit = async (data: UserFormData) => {
    setError(null);
    setIsLoading(true);
    try {
      // Blank password = "will sign in with OAuth": send nothing rather than '' (the API's optional
      // password runs the full strength chain on any string it receives).
      const { password, ...rest } = data;
      await onSubmit(password ? data : rest);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // This is a workaround to prevent the main dialog from closing when the role dialog is open
  const actuallyOpen = React.useMemo(() => {
    return open || isRoleDialogOpen;
  }, [open, isRoleDialogOpen]);

  // This is a workaround to prevent the main dialog from closing when the role dialog is open
  const handleOpenChange = React.useCallback((isOpen: boolean) => {
    // If trying to close and role dialog is open, do nothing
    if (!isOpen && isRoleDialogOpen) {
      return;
    }

    // Otherwise, proceed with normal close
    if (!isOpen) {
      onClose();
    }
  }, [isRoleDialogOpen, onClose]);

  return (
    <Dialog 
      open={actuallyOpen} 
      onOpenChange={handleOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New User' : 'Edit User'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Form form={form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  {error}
                </Alert>
              )}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="email"
                        disabled={mode === 'edit' || isLoading}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isLoading}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === 'create' && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          type="password"
                          autoComplete="new-password"
                          disabled={isLoading}
                          placeholder="Set one and the account can sign in now; blank = signs in with OAuth"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <RoleSelect
                      value={field.value}
                      onChange={field.onChange}
                      currentUserRole={currentUserRole}
                      mode={mode}
                      initialRole={initialData?.role}
                    />
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <StatusSelect
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="customRoleId"
                render={({ field }) => (
                  <CustomRoleSelect
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      // Ensure the form state is updated
                      form.setValue('customRoleId', value);
                    }}
                    jobTitles={jobTitles}
                    onRoleCreated={(role) => {
                      // Track when the role dialog is open/closed
                      setIsRoleDialogOpen(false);
                      
                      // Update the form with the new role
                      form.setValue('customRoleId', role.id);
                      
                      if (onRoleCreated) {
                        onRoleCreated(role);
                      }
                    }}
                    onDialogOpenChange={setIsRoleDialogOpen}
                  />
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
