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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlusIcon } from 'lucide-react';

interface CustomRoleSelectProps {
  value?: string;
  onChange: (roleId: string | undefined) => void;
  error?: string;
  jobTitles: Array<{ id: string; name: string }>;
  onRoleCreated?: (role: { id: string; name: string }) => void;
  onDialogOpenChange?: (isOpen: boolean) => void;
}

export default function CustomRoleSelect({
  value,
  onChange,
  error,
  jobTitles,
  onRoleCreated,
  onDialogOpenChange
}: CustomRoleSelectProps): JSX.Element {
  const [openDialog, setOpenDialog] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState('');
  const [localError, setLocalError] = React.useState<string | undefined>(error);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleChange = (roleId: string) => {
    onChange(roleId === 'none' ? undefined : roleId);
  };

  const handleCreateRole = async () => {
    try {
      setIsLoading(true);
      setLocalError(undefined);

      const response = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newRoleName,
          permissions: [], // Default permissions
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Failed to create role: ${responseText}`);
      }

      // Parse the response
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid response format: ${responseText}`);
      }
      
      const newRole = data.data;

      if (!newRole || !newRole.id) {
        throw new Error('Invalid role data returned from server');
      }
      
      // Notify parent component about the new role
      if (onRoleCreated) {
        onRoleCreated(newRole);
      }

      // Automatically select the new role
      // Use setTimeout to ensure the UI updates properly
      setTimeout(() => {
        onChange(newRole.id);
      }, 0);
      
      // Close the dialog and reset the form
      setNewRoleName('');
      setOpenDialog(false);
      
      return newRole;
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to create role');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Update local error when prop changes
  React.useEffect(() => {
    setLocalError(error);
  }, [error]);

  // Ensure dialog state is synced with parent
  React.useEffect(() => {
    if (onDialogOpenChange) {
      onDialogOpenChange(openDialog);
    }
  }, [openDialog, onDialogOpenChange]);

  const handleOpenDialog = () => {
    // First notify parent that dialog is opening
    if (onDialogOpenChange) {
      onDialogOpenChange(true);
    }
    // Then open the dialog
    setOpenDialog(true);
  };

  return (
    <>
      <div className="flex gap-2">
        <FormItem className="flex-1">
          <FormLabel>Job Title (Optional)</FormLabel>
          <Select value={value || 'none'} onValueChange={handleChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select a job title" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">No Job Title</span>
              </SelectItem>
              {jobTitles.map((title) => (
                <SelectItem key={title.id} value={title.id}>
                  {title.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {localError && <FormMessage>{localError}</FormMessage>}
        </FormItem>
        <Button
          variant="outline"
          size="icon"
          onClick={handleOpenDialog}
          className="self-end mb-[2px]"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={openDialog} onOpenChange={(open) => {
        // Only close the dialog if the user explicitly clicks the close button
        // or clicks outside the dialog. Don't close it when we programmatically
        // set openDialog to false after creating a role.
        if (!open) {
          setOpenDialog(false);
          if (onDialogOpenChange) {
            onDialogOpenChange(false);
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Job Title</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="Enter job title name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateRole}
              disabled={!newRoleName.trim() || isLoading}
            >
              {isLoading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
