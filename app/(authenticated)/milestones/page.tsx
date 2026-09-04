'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Calendar, ArrowLeft } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { Milestone } from '@/lib/dashboard/types';
import { formatDistanceToNow, isPast, format } from 'date-fns';
import { fromLocalYmd } from '@/lib/utils/local-date';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

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

export default function MilestonesPage() {
  const { data: milestones, isLoading, error } = useDashboardData('milestones');

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center mb-6">
          <Skeleton className="h-10 w-10 rounded-full mr-4" />
          <div>
            <Skeleton className="h-6 w-[200px] mb-2" />
            <Skeleton className="h-4 w-[150px]" />
          </div>
        </div>
        
        <div className="grid gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <Skeleton className="h-5 w-3/5 mb-2" />
                    <Skeleton className="h-4 w-2/5 mb-4" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-[80px]" />
                    <Skeleton className="h-6 w-[80px] rounded-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-8">
        <Alert variant="destructive">
          <AlertDescription>Failed to load milestones data</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Ensure milestones is an array
  if (!Array.isArray(milestones)) {
    return (
      <div className="container py-8">
        <Alert variant="destructive">
          <AlertDescription>Invalid milestones data format</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Sort milestones by due date
  const sortedMilestones = [...milestones]
    .filter((m: Milestone) => {
      if (!m || typeof m.status !== 'string' || !m.dueDate) return false;
      return true;
    })
    .sort((a: Milestone, b: Milestone) => {
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      return dateA - dateB;
    });

  // Group milestones by status
  const groupedMilestones = {
    overdue: sortedMilestones.filter(m => 
      m.status === 'OVERDUE' || 
      (m.status === 'PENDING' && isPast(new Date(m.dueDate)))
    ),
    inProgress: sortedMilestones.filter(m => m.status === 'IN_PROGRESS'),
    pending: sortedMilestones.filter(m => 
      m.status === 'PENDING' && !isPast(new Date(m.dueDate))
    ),
    completed: sortedMilestones.filter(m => m.status === 'COMPLETED'),
  };

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <Calendar className="h-8 w-8 text-primary mr-4" />
          <div>
            <h1 className="text-3xl font-bold">All Milestones</h1>
            <p className="text-muted-foreground">
              {sortedMilestones.length} milestones total
            </p>
          </div>
        </div>
        <Link href="/dashboard">
          <Button variant="outline" className="flex items-center">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {sortedMilestones.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground py-8">No milestones found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Overdue Milestones */}
          {groupedMilestones.overdue.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-destructive">Overdue</h2>
              <div className="grid gap-4">
                {groupedMilestones.overdue.map((milestone: Milestone) => (
                  <MilestoneCard key={milestone.id} milestone={milestone} />
                ))}
              </div>
            </div>
          )}

          {/* In Progress Milestones */}
          {groupedMilestones.inProgress.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">In Progress</h2>
              <div className="grid gap-4">
                {groupedMilestones.inProgress.map((milestone: Milestone) => (
                  <MilestoneCard key={milestone.id} milestone={milestone} />
                ))}
              </div>
            </div>
          )}

          {/* Pending Milestones */}
          {groupedMilestones.pending.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Upcoming</h2>
              <div className="grid gap-4">
                {groupedMilestones.pending.map((milestone: Milestone) => (
                  <MilestoneCard key={milestone.id} milestone={milestone} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Milestones */}
          {groupedMilestones.completed.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 text-success">Completed</h2>
              <div className="grid gap-4">
                {groupedMilestones.completed.map((milestone: Milestone) => (
                  <MilestoneCard key={milestone.id} milestone={milestone} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium mb-3">{milestone.title}</h3>
            {milestone.assignees.length > 0 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Assigned to: </span>
                {milestone.assignees.map((a: { name: string }) => a.name).join(', ')}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              variant={getStatusVariant(milestone)}
              className="capitalize"
            >
              {getStatusLabel(milestone.status)}
            </Badge>
            <div className="text-sm text-muted-foreground">
              Due {format(fromLocalYmd(milestone.dueDate), 'MMM d, yyyy')}
              <span className="ml-2 text-xs">
                ({formatDistanceToNow(new Date(milestone.dueDate), { addSuffix: true })})
              </span>
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <Link href={`/pov/view/${milestone.povId}`}>
            <Button variant="outline" size="sm" className="flex items-center">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="mr-2"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              View POV
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
