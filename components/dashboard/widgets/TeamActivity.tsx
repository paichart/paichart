import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { TeamStatusData } from '@/lib/dashboard/types';

export function TeamActivity() {
  const { data: teamData, isLoading, error } = useDashboardData('teamStatus');

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center mb-6">
            <h2 className="text-xl font-semibold">
              Team Activity
            </h2>
          </div>
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex gap-4 p-4 bg-muted rounded-md"
              >
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-[60%]" />
                  <Skeleton className="h-4 w-[40%]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>Failed to load team activity</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center mb-6">
          <h2 className="text-xl font-semibold">
            Team Activity
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Recent updates
        </p>
        <div className="flex flex-col gap-4">
          {teamData.recentActivities.map((activity: TeamStatusData['recentActivities'][0]) => (
            <div
              key={activity.id}
              className="flex gap-4 p-4 bg-muted rounded-md"
            >
              <Avatar>
                <AvatarFallback>
                  {activity.userName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium">
                    {activity.userName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    • {activity.role}
                  </p>
                </div>
                <p className="text-sm">
                  {activity.type === 'USER_ROLE' ? 
                    activity.action :
                    `${activity.action} for ${activity.poVName}`}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
          {teamData.recentActivities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              No recent activity
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
