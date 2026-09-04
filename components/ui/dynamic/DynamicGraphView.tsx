"use client";

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';
import { ViewModeProps } from '@/components/admin/templates/views/types';

// Loading component for graph view
const GraphViewLoader = () => (
  <div className="h-full flex flex-col">
    <div className="mb-4">
      <Skeleton className="h-8 w-64 mb-2" />
      <Skeleton className="h-4 w-96" />
    </div>
    <div className="bg-primary/10 border border-primary/20 rounded-md p-3 mb-4">
      <Skeleton className="h-4 w-24 mb-2" />
      <Skeleton className="h-4 w-full mb-1" />
      <div className="space-y-1 ml-2 mt-1">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
    <div className="flex-1 border rounded-lg bg-muted flex items-center justify-center" style={{ height: '600px' }}>
      <Skeleton className="w-24 h-24" />
    </div>
  </div>
);

// Dynamic import of GraphView with loading state
const DynamicGraphView = dynamic(
  () => import('@/components/admin/templates/views/modes/GraphView').then(mod => mod.GraphView),
  {
    loading: () => <GraphViewLoader />,
    ssr: false,
  }
);

export default DynamicGraphView;
export type { ViewModeProps };
