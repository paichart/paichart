import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

export const WidgetSkeleton = () => {
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
            className="flex gap-4 p-3 mb-4 bg-muted rounded-md"
          >
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default WidgetSkeleton;
