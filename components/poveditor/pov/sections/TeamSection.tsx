"use client";

import { useEditorContext } from '../context';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useState, useEffect, useRef } from 'react';
import { PlusCircle, Trash2, Edit, UserPlus, Users, Mail, Phone, Loader2, AlertCircle, Search, History } from 'lucide-react';
import { CustomDropdown } from '@/components/ui/CustomDropdown';
import { GeographicalSelect } from '@/components/ui/GeographicalSelect';
import { SalesTheatre, TeamRole } from '@prisma/client';
import { useToast } from '@/lib/hooks/useToast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { AddTeamMemberSchema } from '@/lib/validation/team-validation';
import { TeamBatchAddDialog } from '../components/TeamBatchAddDialog';

// Team member interface (TeamRole imported from Prisma)
interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  avatarUrl?: string;  // Matches Prisma User.avatarUrl field
}

export default function TeamSection() {
  const { state, addEntity, updateEntity, removeEntity, updateField, isSaving } = useEditorContext();
  const { toast } = useToast();

  // Get POV ID and owner (from state or API data)
  const povId = state.data.id;
  const povOwnerId = (state.data as any).ownerId; // Owner ID from POV data

  // Backend enforces: POV owner, site admins (ADMIN/SUPER_ADMIN), or Project Manager can manage team
  const canManageTeam = true;

  // State for team members (POV-specific)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  // State for available users (not in team)
  const [availableUsers, setAvailableUsers] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);

  // Local state for team member form
  const [showForm, setShowForm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [memberRole, setMemberRole] = useState<TeamRole>(TeamRole.MEMBER);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // State for delete conflict (409 - member has active tasks)
  const [deleteConflict, setDeleteConflict] = useState<{ activeTasks: number } | null>(null);
  const [reassignToUserId, setReassignToUserId] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);

  // State for role updates
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  // State for search/filter
  const [searchQuery, setSearchQuery] = useState('');

  // State for activity history
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // State for bulk add
  const [showBatchAdd, setShowBatchAdd] = useState(false);

  // Legacy state for team selection dropdowns (keep for backward compatibility)
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // State for geographical selection
  const [geographicalData, setGeographicalData] = useState<{
    theatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  }>({
    theatre: state.data.salesTheatre as SalesTheatre,
    countryId: state.data.countryId,
    regionId: state.data.regionId,
  });
  
  // Fetch team members from POV-specific endpoint
  const fetchTeamMembers = async () => {
    if (!povId) return;

    try {
      setIsLoadingMembers(true);
      // no-store: this list is refetched after mutations + saves; a cached GET
      // would resurface a stale list (the "appears only after Ctrl+F5" bug).
      const response = await fetch(`/api/pov/${povId}/team/members`, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error('Failed to fetch team members');
      }

      const data = await response.json();
      setTeamMembers(data);
    } catch (error: any) {
      toast({
        title: 'Failed to load team members',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMembers(false);
    }
  };

  // Fetch available users (not in team)
  const fetchAvailableUsers = async () => {
    if (!povId) return;

    try {
      setIsLoadingAvailable(true);
      const response = await fetch(`/api/pov/${povId}/team/available`, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error('Failed to fetch available users');
      }

      const data = await response.json();
      setAvailableUsers(data);
    } catch (error: any) {
      toast({
        title: 'Failed to load available users',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAvailable(false);
    }
  };

  // Fetch team members on mount
  useEffect(() => {
    if (povId) {
      fetchTeamMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [povId]);

  // Refetch after a main POV Save completes. The members table is a plain fetch,
  // NOT tied to the react-query ['pov', povId] cache the Save invalidates — so
  // members added via the Team Selection dropdowns (persisted on Save) never
  // appeared until a hard refresh. Watch isSaving going true→false (a finished
  // save) and refetch. Delete already refetches via confirmDelete, so it was fine.
  const prevIsSaving = useRef(false);
  useEffect(() => {
    if (prevIsSaving.current && !isSaving && povId) {
      fetchTeamMembers();
      fetchAvailableUsers();
    }
    prevIsSaving.current = isSaving;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving]);

  // Fetch available users when Add Member form OR Add Multiple dialog opens
  useEffect(() => {
    if ((showForm || showBatchAdd) && povId) {
      fetchAvailableUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, showBatchAdd, povId]);

  // Legacy: Fetch users from global API (for backward compatibility with other dropdowns)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const response = await fetch('/api/users');

        if (response.ok) {
          const data = await response.json();

          // Handle both paginated { data: [...], pagination: {...} } and raw array responses
          if (Array.isArray(data)) {
            setUsers(data);
          } else if (data && Array.isArray(data.data)) {
            setUsers(data.data);
          } else {
            setUsers([]);
          }
        }
      } catch {
        // Failed to fetch users
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);
  
  // Set team name based on POV title and ensure team members are properly set
  useEffect(() => {
    if (state.data.title) {
      const generatedTeamName = `${state.data.title} Team`;
      updateField(['data', 'teamName'], generatedTeamName);
      
      // Initialize team arrays if they don't exist
      if (!state.data.salesEngineers) {
        updateField(['data', 'salesEngineers'], []);
      }
      
      if (!state.data.technicalTeam) {
        updateField(['data', 'technicalTeam'], []);
      }
    }
  }, [state.data.title, state.data.salesEngineers, state.data.technicalTeam, updateField]);
  
  // Handle team selection changes
  const handleProjectManagerChange = (value: string | string[]) => {
    if (typeof value === 'string') {
      updateField(['data', 'projectManager'], value);
    }
  };
  
  const handleSalesEngineersChange = (value: string | string[]) => {
    if (Array.isArray(value)) {
      updateField(['data', 'salesEngineers'], value);
    }
  };
  
  const handleTechnicalTeamChange = (value: string | string[]) => {
    if (Array.isArray(value)) {
      updateField(['data', 'technicalTeam'], value);
    }
  };
  
  // Handle geographical selection changes
  const handleGeographicalChange = (data: {
    theatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  }) => {
    setGeographicalData({
      theatre: data.theatre,
      countryId: data.countryId || '',
      regionId: data.regionId || '',
    });

    if (data.theatre) {
      updateField(['data', 'salesTheatre'], data.theatre);
    }
    
    if (data.countryId !== undefined) {
      updateField(['data', 'countryId'], data.countryId);
    }
    
    if (data.regionId !== undefined) {
      updateField(['data', 'regionId'], data.regionId);
    }
  };
  
  // Initialize geographical data from state
  useEffect(() => {
    setGeographicalData({
      theatre: state.data.salesTheatre as SalesTheatre,
      countryId: state.data.countryId,
      regionId: state.data.regionId,
    });
  }, [state.data.salesTheatre, state.data.countryId, state.data.regionId]);

  // Reset form
  const resetForm = () => {
    setSelectedUserId('');
    setMemberRole(TeamRole.MEMBER);
    setShowForm(false);
  };

  // Handle form submission (POST - Add Member)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    const validation = AddTeamMemberSchema.safeParse({
      userId: selectedUserId,
      role: memberRole,
    });

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
      const response = await fetch(`/api/pov/${povId}/team/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add team member');
      }

      const result = await response.json();

      // Success: Update local state
      addEntity('team', result.data);

      toast({
        title: 'Team member added',
        description: `${result.data.name} has been added to the team.`,
        variant: 'success',
      });

      // Refresh lists
      fetchTeamMembers();
      fetchAvailableUsers();

      // Reset form
      resetForm();

    } catch (error: any) {
      toast({
        title: 'Failed to add team member',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle role change (PUT - Update Role)
  const handleRoleChange = async (memberId: string, newRole: TeamRole) => {
    setUpdatingRoleId(memberId);

    try {
      const response = await fetch(`/api/pov/${povId}/team/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update role');
      }

      // Success: Update local state
      updateEntity('team', memberId, { role: newRole });

      toast({
        title: 'Role updated',
        description: 'Team member role has been updated.',
        variant: 'success',
      });

      // Refresh team list
      fetchTeamMembers();

    } catch (error: any) {
      toast({
        title: 'Failed to update role',
        description: error.message || 'You do not have permission to update team member roles.',
        variant: 'destructive',
      });

      // Refresh to revert UI back to actual role
      fetchTeamMembers();
    } finally {
      setUpdatingRoleId(null);
    }
  };

  // Show delete confirmation
  const handleDeleteMember = (memberId: string, memberName: string) => {
    setMemberToDelete({ id: memberId, name: memberName });
    setDeleteConflict(null);
    setReassignToUserId('');
    setShowDeleteConfirm(true);
  };

  // Confirm delete (DELETE - Remove Member)
  const confirmDelete = async () => {
    if (!memberToDelete) return;

    setDeletingId(memberToDelete.id);
    let gotConflict = false;

    try {
      const response = await fetch(`/api/pov/${povId}/team/members/${memberToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();

        // Handle active tasks error (409) - show conflict state in dialog
        if (response.status === 409) {
          gotConflict = true;
          setDeleteConflict({ activeTasks: error.data?.activeTasks || 0 });
          // Pre-select POV owner as default reassignment target
          if (povOwnerId && povOwnerId !== memberToDelete.id) {
            setReassignToUserId(povOwnerId);
          }
          return;
        }

        throw new Error(error.error || 'Failed to remove team member');
      }

      // Success: close dialog and update state
      setShowDeleteConfirm(false);
      removeEntity('team', memberToDelete.id);

      toast({
        title: 'Team member removed',
        description: `${memberToDelete.name} has been removed from the team.`,
        variant: 'success',
      });

      fetchTeamMembers();
      fetchAvailableUsers();

    } catch (error: any) {
      setShowDeleteConfirm(false);
      toast({
        title: 'Failed to remove team member',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
      if (!gotConflict) {
        setMemberToDelete(null);
      }
    }
  };

  // Reassign tasks and remove member
  const confirmReassignAndDelete = async () => {
    if (!memberToDelete || !reassignToUserId) return;

    setIsReassigning(true);

    try {
      const response = await fetch(`/api/pov/${povId}/team/members/${memberToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reassignTasksTo: reassignToUserId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reassign tasks and remove member');
      }

      const result = await response.json();

      // Success: close dialog and update state
      setShowDeleteConfirm(false);
      setDeleteConflict(null);
      removeEntity('team', memberToDelete.id);

      toast({
        title: 'Team member removed',
        description: result.message || `${memberToDelete.name} removed. Tasks reassigned.`,
        variant: 'success',
      });

      fetchTeamMembers();
      fetchAvailableUsers();

    } catch (error: any) {
      toast({
        title: 'Failed to reassign and remove',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsReassigning(false);
      setMemberToDelete(null);
      setDeleteConflict(null);
    }
  };

  // Fetch activity history (admin endpoint - show error for non-admins)
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`/api/admin/audit?type=TEAM_MEMBERSHIP&povId=${povId}`);

      if (!response.ok) {
        if (response.status === 403) {
          toast({
            title: 'Access Denied',
            description: 'Team history is only available to site administrators.',
            variant: 'destructive',
          });
        } else {
          throw new Error('Failed to fetch history');
        }
        setShowHistory(false);
        return;
      }

      const data = await response.json();
      setHistory(data.activities || []);
    } catch (error: any) {
      toast({
        title: 'Failed to load history',
        description: error.message,
        variant: 'destructive',
      });
      setShowHistory(false);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // Get role badge color
  const getRoleBadgeColor = (role: TeamRole) => {
    switch (role) {
      case 'PROJECT_MANAGER':
        return 'bg-primary/20 text-primary';
      case 'SALES_ENGINEER':
        return 'bg-success/20 text-success';
      case 'TECHNICAL_TEAM':
        return 'bg-warning/20 text-warning';
      case 'ADMIN':
        return 'bg-destructive/20 text-destructive';
      case 'OWNER':
        return 'bg-secondary/20 text-secondary';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };
  
  // Format role for display
  const formatRole = (role: TeamRole) => {
    return role.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };
  
  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  // Filter team members by search query
  const filteredMembers = teamMembers.filter((member) =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // POV ID validation
  if (!povId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">POV Not Loaded</h3>
          <p className="text-sm text-muted-foreground">
            Please save this POV before managing team members.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Team Management</CardTitle>
            <CardDescription>
              Manage team members and their roles for this POV
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                fetchHistory();
                setShowHistory(true);
              }}
            >
              <History className="h-4 w-4 mr-2" />
              View History
            </Button>
            {canManageTeam && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBatchAdd(true)}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Add Multiple
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(!showForm)}
                >
                  {showForm ? 'Cancel' : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Member
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Team Selection and Geographical Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Team Selection */}
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Team Selection</CardTitle>
              <CardDescription>
                Select team members and assign roles for the POV
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectManager">Project Manager</Label>
                <CustomDropdown
                  options={users.map(user => ({ id: user.id, name: user.name }))}
                  value={state.data.projectManager || ''}
                  onChange={handleProjectManagerChange}
                  placeholder="Select a project manager"
                  disabled={loadingUsers}
                  searchable={true}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="salesEngineers">Sales Engineers</Label>
                <CustomDropdown
                  options={users.map(user => ({ id: user.id, name: user.name }))}
                  value={state.data.salesEngineers || []}
                  onChange={handleSalesEngineersChange}
                  placeholder="Select sales engineers"
                  disabled={loadingUsers}
                  searchable={true}
                  isMulti={true}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="technicalTeam">Technical Team</Label>
                <CustomDropdown
                  options={users.map(user => ({ id: user.id, name: user.name }))}
                  value={state.data.technicalTeam || []}
                  onChange={handleTechnicalTeamChange}
                  placeholder="Select technical team members"
                  disabled={loadingUsers}
                  searchable={true}
                  isMulti={true}
                />
              </div>
            </CardContent>
          </Card>
          
          {/* Geographical Selection */}
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Geographical Selection</CardTitle>
              <CardDescription>
                Select the geographical location for this POV
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeographicalSelect
                selectedTheatre={geographicalData.theatre}
                selectedCountry={geographicalData.countryId}
                selectedRegion={geographicalData.regionId}
                onChange={handleGeographicalChange}
              />
            </CardContent>
          </Card>
        </div>
        
        {/* Team Member Form */}
        {showForm && (
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Add New Team Member</CardTitle>
              <CardDescription>
                Select a user from the available users list
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault();
                // Double catch pattern to ensure toast shows on async errors
                handleSubmit(e).catch((err) => {
                  toast({
                    title: 'Failed to add team member',
                    description: err.message || 'You do not have permission to add team members.',
                    variant: 'destructive',
                  });
                });
              }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="member-user">Team Member</Label>
                  <CustomDropdown
                    options={availableUsers.map(user => ({ id: user.id, name: user.name }))}
                    value={selectedUserId}
                    onChange={(value) => setSelectedUserId(value as string)}
                    placeholder="Select a user to add"
                    disabled={isLoadingAvailable}
                    searchable={true}
                  />
                  {isLoadingAvailable && (
                    <p className="text-sm text-muted-foreground">Loading available users...</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="member-role">Role</Label>
                  <Select
                    value={memberRole}
                    onValueChange={(value) => setMemberRole(value as TeamRole)}
                  >
                    <SelectTrigger id="member-role">
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

                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !selectedUserId}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Team Member'
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* Team Members List */}
        {isLoadingMembers ? (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading team members...</p>
          </div>
        ) : teamMembers.length > 0 ? (
          <div className="space-y-4">
            {/* Search and count */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Badge variant="outline">
                {filteredMembers.length} of {teamMembers.length} members
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length === 0 && searchQuery ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No members found matching &quot;{searchQuery}&quot;
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMembers.map((member: TeamMember) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar>
                          {member.avatarUrl ? (
                            <AvatarImage
                              src={member.avatarUrl}
                              alt={member.name}
                            />
                          ) : (
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div>
                          <div className="font-medium">{member.name}</div>
                          <div className="text-sm text-muted-foreground">{member.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Inline role editing */}
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => {
                          // Wrap async call to ensure errors are caught
                          handleRoleChange(member.id, newRole as TeamRole).catch((err) => {
                            toast({
                              title: 'Failed to update role',
                              description: 'You do not have permission to update team member roles.',
                              variant: 'destructive',
                            });
                          });
                        }}
                        disabled={!canManageTeam || member.userId === povOwnerId || updatingRoleId === member.id}
                      >
                        <SelectTrigger className="w-[180px]">
                          {updatingRoleId === member.id ? (
                            <div className="flex items-center">
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Updating...
                            </div>
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TeamRole.OWNER}>Owner</SelectItem>
                          <SelectItem value={TeamRole.ADMIN}>Admin</SelectItem>
                          <SelectItem value={TeamRole.PROJECT_MANAGER}>Project Manager</SelectItem>
                          <SelectItem value={TeamRole.SALES_ENGINEER}>Sales Engineer</SelectItem>
                          <SelectItem value={TeamRole.TECHNICAL_TEAM}>Technical Team</SelectItem>
                          <SelectItem value={TeamRole.MEMBER}>Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center text-sm">
                          <Mail className="h-3 w-3 mr-1 text-muted-foreground" />
                          <a href={`mailto:${member.email}`} className="hover:underline">
                            {member.email}
                          </a>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2 items-center">
                        {member.userId === povOwnerId && (
                          <Badge variant="outline" className="mr-2">Owner</Badge>
                        )}
                        {canManageTeam && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMember(member.id, member.name)}
                            disabled={member.userId === povOwnerId || deletingId === member.id}
                            title={member.userId === povOwnerId ? 'Cannot remove POV owner' : undefined}
                          >
                            {deletingId === member.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span className="sr-only">Delete</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 border rounded-md bg-muted/20">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Add Team Members to Collaborate on this POV</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Include people you would like to approve tasks or be notified
            </p>
            {canManageTeam && (
              <Button
                variant="outline"
                onClick={() => setShowForm(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            )}
          </div>
        )}

        {/* Delete Confirmation Dialog (two states: confirm / conflict) */}
        <Dialog open={showDeleteConfirm} onOpenChange={(open) => {
          if (!open) {
            setDeleteConflict(null);
            setReassignToUserId('');
          }
          setShowDeleteConfirm(open);
        }}>
          <DialogContent>
            {!deleteConflict ? (
              <>
                {/* State 1: Confirmation */}
                <DialogHeader>
                  <DialogTitle>Remove Team Member?</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove {memberToDelete?.name} from the team?
                    This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={!!deletingId}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!!deletingId}
                    onClick={() => {
                      confirmDelete().catch((err) => {
                        toast({
                          title: 'Failed to remove team member',
                          description: err.message || 'You do not have permission to remove team members.',
                          variant: 'destructive',
                        });
                      });
                    }}
                  >
                    {deletingId ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      'Remove'
                    )}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                {/* State 2: Conflict - member has active tasks */}
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    Active Tasks Must Be Reassigned
                  </DialogTitle>
                  <DialogDescription>
                    {memberToDelete?.name} has {deleteConflict.activeTasks} active task{deleteConflict.activeTasks !== 1 ? 's' : ''} on this POV.
                    Choose a team member to reassign them to before removing.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-3">
                  <Label htmlFor="reassign-to">Reassign tasks to</Label>
                  <CustomDropdown
                    options={teamMembers
                      .filter(m => m.id !== memberToDelete?.id && m.userId !== memberToDelete?.id)
                      .map(m => ({ id: m.userId, name: m.name }))}
                    value={reassignToUserId}
                    onChange={(value) => setReassignToUserId(value as string)}
                    placeholder="Select a team member"
                    searchable={true}
                  />
                  {reassignToUserId && (
                    <p className="text-sm text-muted-foreground">
                      {deleteConflict.activeTasks} task{deleteConflict.activeTasks !== 1 ? 's' : ''} will
                      be reassigned to {teamMembers.find(m => m.userId === reassignToUserId)?.name || 'selected member'}.
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConflict(null);
                      setReassignToUserId('');
                      setMemberToDelete(null);
                    }}
                    disabled={isReassigning}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={!reassignToUserId || isReassigning}
                    onClick={() => {
                      confirmReassignAndDelete().catch((err) => {
                        toast({
                          title: 'Failed to reassign and remove',
                          description: err.message,
                          variant: 'destructive',
                        });
                      });
                    }}
                  >
                    {isReassigning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reassigning...
                      </>
                    ) : (
                      'Reassign & Remove'
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Activity History Dialog */}
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Team Management History</DialogTitle>
              <DialogDescription>Recent team member additions and removals</DialogDescription>
            </DialogHeader>

            {isLoadingHistory ? (
              <div className="py-8 text-center">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-4">Loading history...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">No history available</div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {history.map((log: any) => (
                  <div key={log.id} className="border-l-2 border-primary/20 pl-4 py-2">
                    <p className="font-medium">
                      {log.metadata.memberName || 'Unknown'} was {log.action === 'ADD' ? 'added to' : 'removed from'} the team
                    </p>
                    <p className="text-sm text-muted-foreground">
                      by {log.user?.name || 'Unknown'} • {new Date(log.createdAt).toLocaleString()}
                    </p>
                    {log.metadata.role && (
                      <p className="text-sm text-muted-foreground">
                        Role: {formatRole(log.metadata.role)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bulk Add Dialog */}
        <TeamBatchAddDialog
          open={showBatchAdd}
          onOpenChange={setShowBatchAdd}
          povId={povId}
          availableUsers={availableUsers}
          onSuccess={() => {
            fetchTeamMembers();
            fetchAvailableUsers();
          }}
        />
      </CardContent>
    </Card>
  );
}
