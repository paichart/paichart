import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { Users } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { TeamStatusData, TeamMember } from '@/lib/dashboard/types';
import { formatDistanceToNow } from 'date-fns';

const TeamStatus = () => {
  const { data: teamData } = useDashboardData('teamStatus');

  // Ensure teamData exists and has required properties
  if (!teamData || !Array.isArray(teamData.members)) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid team status data format</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { members } = teamData;

  // Validate member data
  const validMembers = members.filter((member: Record<string, any>): member is TeamMember => (
    member &&
    typeof member === 'object' &&
    typeof member.userId === 'string' &&
    typeof member.userName === 'string' &&
    typeof member.currentTasks === 'number' &&
    typeof member.completedTasks === 'number' &&
    (!member.lastActive || member.lastActive instanceof Date)
  ));

  if (validMembers.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No team members data available</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const formatTimestamp = (timestamp: Date) => {
    if (!timestamp) return '';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return '';
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center mb-6">
          <Users className="h-10 w-10 text-primary mr-4" />
          <div>
            <h3 className="text-lg font-semibold">Team Activity</h3>
            <p className="text-sm text-muted-foreground">Recent updates</p>
          </div>
        </div>

        <div className="space-y-4">
          {validMembers.map((member: TeamMember) => (
            <div
              key={member.userId}
              className="flex gap-4 p-3 bg-muted rounded-md"
            >
              <Avatar>
                <AvatarFallback>
                  {member.userName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">
                    {member.userName}
                  </span>
                </div>
                <div className="flex gap-4">
                  <span className="text-sm text-muted-foreground">
                    Current Tasks: {member.currentTasks}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Completed: {member.completedTasks}
                  </span>
                </div>
                {member.lastActive && (
                  <span className="text-xs text-muted-foreground mt-1 block">
                    Last active: {formatTimestamp(member.lastActive)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamStatus;
