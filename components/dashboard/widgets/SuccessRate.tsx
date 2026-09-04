import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { SuccessRateData } from '@/lib/dashboard/types';

const COLORS = {
  Successful: 'hsl(var(--success))',
  'In Progress': 'hsl(var(--primary))',
  Failed: 'hsl(var(--destructive))'
};

const SuccessRate = () => {
  const { data: successData, isLoading, error } = useDashboardData('successRate');

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
          <div className="w-full h-[200px] flex items-center justify-center">
            <Skeleton className="h-40 w-40 rounded-full" />
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
            <AlertDescription>Failed to load success rate data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Ensure successData exists and has required properties
  if (!successData || typeof successData.current !== 'number' || !Array.isArray(successData.historical)) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid success rate data format</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Initialize values with proper type checking
  const currentSuccess = Math.max(0, Math.min(100, successData.current));
  
  // Calculate in progress value with validation
  const inProgressValue = successData.historical.reduce((sum: number, period: SuccessRateData['historical'][0]) => {
    if (typeof period.total !== 'number' || typeof period.successful !== 'number') {
      return sum;
    }
    return sum + Math.max(0, period.total - period.successful);
  }, 0);

  // Calculate failed value ensuring it stays within bounds
  const failedValue = Math.max(0, Math.min(100, 100 - currentSuccess - inProgressValue));

  // Transform data for pie chart with validated values
  const chartData = [
    { name: 'Successful', value: currentSuccess, color: COLORS.Successful },
    { name: 'In Progress', value: inProgressValue, color: COLORS['In Progress'] },
    { name: 'Failed', value: failedValue, color: COLORS.Failed }
  ].filter(item => item.value > 0); // Only show segments with values > 0

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center mb-4">
          <TrendingUp className="h-10 w-10 text-primary mr-4" />
          <div>
            <div className="text-3xl font-semibold">{currentSuccess}%</div>
            <div className="text-sm text-muted-foreground">Success Rate</div>
          </div>
        </div>

        <div className="w-full h-[200px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value}%`}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Show success factors if available */}
        {successData.historical.length > 0 && 
         Array.isArray(successData.historical[0]?.factors) && 
         successData.historical[0].factors.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium mb-2">
              Key Success Factors
            </div>
            {successData.historical[0].factors.map((factor: SuccessRateData['historical'][0]['factors'][0], index: number) => (
              <div key={index} className="flex justify-between mb-1">
                <span className="text-sm text-muted-foreground">
                  {factor.name}
                </span>
                <span className="text-sm">
                  {factor.impact}%
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SuccessRate;
