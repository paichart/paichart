'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { TeamRole } from '@prisma/client';
import { useToast } from '@/lib/hooks/useToast';
import { BatchAddTeamMembersSchema } from '@/lib/validation/team-validation';
import { Loader2 } from 'lucide-react';

interface TeamBatchAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  povId: string;
  availableUsers: Array<{ id: string; name: string }>;
  onSuccess: () => void;
}

export function TeamBatchAddDialog({
  open,
  onOpenChange,
  povId,
  availableUsers,
  onSuccess,
}: TeamBatchAddDialogProps) {
  const { toast } = useToast();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [defaultRole, setDefaultRole] = useState<TeamRole>(TeamRole.MEMBER);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const members = selectedUserIds.map(userId => ({ userId, role: defaultRole }));
    const validation = BatchAddTeamMembersSchema.safeParse({ members });

    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/pov/${povId}/team/members/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add team members');
      }

      const result = await response.json();

      toast({
        title: 'Team members added',
        description: `Successfully added ${result.data.added} member(s) to the team.`,
        variant: 'success',
      });

      setSelectedUserIds([]);
      setDefaultRole(TeamRole.MEMBER);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Failed to add team members',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Multiple Team Members</DialogTitle>
          <DialogDescription>
            Select up to 20 users to add to the team. All will be assigned the same role.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Team Members (Max 20)</Label>
            <CustomDropdown
              options={availableUsers}
              value={selectedUserIds}
              onChange={(value) => setSelectedUserIds(value as string[])}
              placeholder="Select users to add"
              isMulti={true}
              searchable={true}
            />
            <p className="text-sm text-muted-foreground">
              {selectedUserIds.length}/20 selected
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Role</Label>
            <Select value={defaultRole} onValueChange={(value) => setDefaultRole(value as TeamRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TeamRole.ADMIN}>Admin</SelectItem>
                <SelectItem value={TeamRole.PROJECT_MANAGER}>Project Manager</SelectItem>
                <SelectItem value={TeamRole.SALES_ENGINEER}>Sales Engineer</SelectItem>
                <SelectItem value={TeamRole.TECHNICAL_TEAM}>Technical Team</SelectItem>
                <SelectItem value={TeamRole.MEMBER}>Member</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedUserIds([]);
                setDefaultRole(TeamRole.MEMBER);
                onOpenChange(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || selectedUserIds.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${selectedUserIds.length} Member(s)`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
