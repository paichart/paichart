import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { FileText } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';

const ActivePoVs = () => {
  const { data: stats, isLoading, error } = useDashboardData('activePoVs');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center mb-4">
            <Skeleton className="h-10 w-10 rounded-full mr-4" />
            <div>
              <Skeleton className="h-10 w-[60px] mb-2" />
              <Skeleton className="h-4 w-[100px]" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-5" />
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
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Failed to load active PoVs</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Ensure stats exists and has required properties
  if (!stats || typeof stats !== 'object') {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid active PoVs data format</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Validate and extract stats with defaults
  const {
    total = 0,
    pending = 0,
    active = 0,
    completed = 0
  } = stats as { [key: string]: number };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <FileText className="h-10 w-10 text-primary mr-4" />
          <div>
            <div className="text-3xl font-semibold">{total}</div>
            <div className="text-sm text-muted-foreground">Active PoVs</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Draft</span>
            <span className="text-sm">{pending}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">In Progress</span>
            <span className="text-sm">{active}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Completed</span>
            <span className="text-sm">{completed}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivePoVs;
