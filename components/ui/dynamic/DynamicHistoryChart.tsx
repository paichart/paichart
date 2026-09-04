"use client";

import dynamic from 'next/dynamic';
import { HistoryChartSkeleton } from '@/components/pov/kpi/HistoryChart';

// Dynamic import of HistoryChart with loading state
const DynamicHistoryChart = dynamic(
  () => import('@/components/pov/kpi/HistoryChart'),
  {
    loading: () => <HistoryChartSkeleton />,
    ssr: false,
  }
);

export default DynamicHistoryChart;
