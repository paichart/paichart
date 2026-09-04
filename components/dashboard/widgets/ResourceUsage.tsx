import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, TooltipProps } from 'recharts';
import { Users } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { ResourceUsageData } from '@/lib/dashboard/types';

interface ChartData {
  name: string;
  allocated: number;
  available: number;
}

interface CustomTooltipProps extends TooltipProps<number, string> {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    color: string;
  }>;
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover p-3 border rounded-md shadow-md">
        <p className="text-sm font-medium mb-1">{label}</p>
        {payload.map((entry) => (
          <p
            key={entry.dataKey}
            className="text-xs text-muted-foreground"
          >
            {entry.dataKey === 'allocated' ? 'Allocated' : 'Available'}: {entry.value}%
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const ResourceUsage = () => {
  const { data: resourceData, isLoading, error } = useDashboardData('resourceUsage');

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
          <div className="w-full h-[200px]">
            <Skeleton className="h-full w-full rounded-md" />
          </div>
          <div className="mt-4 flex gap-4 justify-end">
            <Skeleton className="h-4 w-[60px]" />
            <Skeleton className="h-4 w-[60px]" />
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
            <AlertDescription>Failed to load resource usage data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Ensure resourceData exists and has required properties
  if (!resourceData || typeof resourceData !== 'object') {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid resource usage data format</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Helper function to safely calculate percentage
  const calculatePercentage = (value: number, total: number): number => {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  };

  // Helper function to validate resource data
  const isValidResource = (resource: any): resource is ResourceUsageData['team'] => {
    return resource && 
           typeof resource.allocated === 'number' && 
           typeof resource.available === 'number' && 
           typeof resource.total === 'number';
  };

  // Validate each resource
  if (!isValidResource(resourceData.team) || 
      !isValidResource(resourceData.tasks) || 
      !isValidResource(resourceData.timeline)) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid resource data structure</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Transform data for chart with safe calculations
  const chartData: ChartData[] = [
    {
      name: 'Team',
      allocated: calculatePercentage(resourceData.team.allocated, resourceData.team.total),
      available: calculatePercentage(resourceData.team.available, resourceData.team.total)
    },
    {
      name: 'Tasks',
      allocated: calculatePercentage(resourceData.tasks.allocated, resourceData.tasks.total),
      available: calculatePercentage(resourceData.tasks.available, resourceData.tasks.total)
    },
    {
      name: 'Timeline',
      allocated: calculatePercentage(resourceData.timeline.allocated, resourceData.timeline.total),
      available: calculatePercentage(resourceData.timeline.available, resourceData.timeline.total)
    }
  ];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center mb-6">
          <Users className="h-10 w-10 text-primary mr-4" />
          <div>
            <h3 className="text-lg font-semibold">Resource Usage</h3>
            <p className="text-sm text-muted-foreground">Current allocation</p>
          </div>
        </div>

        <div className="w-full h-[200px]">
          <ResponsiveContainer>
            <BarChart
              data={chartData}
              layout="vertical"
              barGap={0}
              barCategoryGap={20}
            >
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis
                dataKey="name"
                type="category"
                width={100}
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="allocated"
                stackId="a"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
              />
              <Bar
                dataKey="available"
                stackId="a"
                fill="hsl(var(--muted))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex gap-4 justify-end">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span className="text-xs text-muted-foreground">Allocated</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <span className="text-xs text-muted-foreground">Available</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResourceUsage;
