"use client";

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChartProps } from '@/components/ui/Chart';

// Loading component for chart
const ChartLoader = () => (
  <div className="w-full h-[300px] flex items-center justify-center">
    <Skeleton className="w-full h-full" />
  </div>
);

// Dynamic import of Chart component with loading state
const DynamicChart = dynamic(
  () => import('@/components/ui/Chart').then(mod => ({ default: mod.default })),
  {
    loading: () => <ChartLoader />,
    ssr: false,
  }
);

export default DynamicChart;
export type { ChartProps };
