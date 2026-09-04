import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Calendar } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { Milestone } from '@/lib/dashboard/types';
import { formatDistanceToNow, isPast } from 'date-fns';

const getStatusVariant = (milestone: Milestone): 'success' | 'destructive' | 'default' | 'secondary' => {
  switch (milestone.status) {
    case 'COMPLETED':
      return 'success';
    case 'OVERDUE':
      return 'destructive';
    case 'IN_PROGRESS':
      return 'default';
    case 'PENDING':
      return isPast(new Date(milestone.dueDate)) ? 'destructive' : 'secondary';
    default:
      return 'secondary';
  }
};

const getStatusLabel = (status: Milestone['status']) => {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'COMPLETED':
      return 'Completed';
    case 'OVERDUE':
      return 'Overdue';
    default:
      return status;
  }
};

const Milestones = () => {
  const { data: milestones, isLoading, error } = useDashboardData('milestones');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center mb-6">
            <Skeleton className="h-10 w-10 rounded-full mr-4" />
            <div>
              <Skeleton className="h-6 w-[120px] mb-2" />
              <Skeleton className="h-4 w-[80px]" />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex justify-between items-center p-3 mb-4 bg-muted rounded-md"
            >
              <div className="flex-1">
                <Skeleton className="h-4 w-3/5 mb-2" />
                <Skeleton className="h-4 w-2/5" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-[60px]" />
                <Skeleton className="h-6 w-[60px] rounded-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Failed to load milestones data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Ensure milestones is an array
  if (!Array.isArray(milestones)) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid milestones data format</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Sort milestones by due date and filter out completed ones older than 7 days
  const sortedMilestones = milestones
    .filter((m: Milestone) => {
      if (!m || typeof m.status !== 'string' || !m.dueDate) return false;
      return m.status !== 'COMPLETED' || 
             new Date(m.dueDate).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
    })
    .sort((a: Milestone, b: Milestone) => {
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      return dateA - dateB;
    });

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Calendar className="h-10 w-10 text-primary mr-4" />
            <div>
              <h3 className="text-lg font-semibold">Upcoming Milestones</h3>
              <p className="text-sm text-muted-foreground">Next 7 days</p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {sortedMilestones.length} total
          </div>
        </div>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {sortedMilestones.map((milestone: Milestone) => (
            <div
              key={milestone.id}
              className="flex justify-between items-center p-3 bg-muted rounded-md"
            >
              <div>
                <p className="text-sm font-medium">{milestone.title}</p>
                {milestone.assignees.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {milestone.assignees.map((a: { name: string }) => a.name).join(', ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(milestone.dueDate), { addSuffix: true })}
                </span>
                <Badge
                  variant={getStatusVariant(milestone)}
                  className="capitalize"
                >
                  {getStatusLabel(milestone.status)}
                </Badge>
              </div>
            </div>
          ))}

          {sortedMilestones.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                No upcoming milestones
              </p>
            </div>
          )}
        </div>
        
        <div className="mt-4 text-center">
          <a 
            href="/milestones" 
            className="text-sm font-medium text-primary hover:text-primary/90"
          >
            View All {sortedMilestones.length} Milestones
          </a>
        </div>
      </CardContent>
    </Card>
  );
};

export default Milestones;
