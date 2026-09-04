import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useDashboardData } from '@/lib/dashboard/hooks/useDashboard';
import { RiskOverviewData } from '@/lib/dashboard/types';

interface ChartDataItem {
  name: string;
  count: number;
  color: string;
}

const COLORS: Record<RiskOverviewData['overall'][0]['level'], string> = {
  LOW: 'hsl(var(--success))',
  MEDIUM: 'hsl(var(--warning))',
  HIGH: 'hsl(var(--destructive))'
};

const RiskOverview = () => {
  const { data: riskData, isLoading, error } = useDashboardData('riskOverview');

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
          <div className="flex items-center">
            <div className="w-1/2 h-40 flex justify-center items-center">
              <Skeleton className="h-20 w-40 rounded-full" />
            </div>
            <div className="w-1/2 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Skeleton className="h-4 w-full" />
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
            <AlertDescription>Failed to load risk overview data</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Ensure riskData exists and has required properties
  if (!riskData || !Array.isArray(riskData.overall) || !riskData.byCategory) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>Invalid risk overview data format</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Transform data for gauge chart with validation
  // Type guard for risk data
  const isValidRisk = (risk: any): risk is RiskOverviewData['overall'][0] => (
    risk && 
    typeof risk.level === 'string' && 
    typeof risk.count === 'number' &&
    (risk.level === 'LOW' || risk.level === 'MEDIUM' || risk.level === 'HIGH')
  );

  const chartData: ChartDataItem[] = riskData.overall
    .filter(isValidRisk)
    .map((risk: RiskOverviewData['overall'][0]) => ({
      name: `${risk.level} Risk`,
      count: risk.count,
      color: COLORS[risk.level as keyof typeof COLORS]
    }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert>
            <AlertDescription>No risk data available</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const totalCount = chartData.reduce((sum: number, item: ChartDataItem) => sum + item.count, 0);

  // Calculate percentages for the summary
  const riskPercentages = chartData.reduce((acc: Record<string, number>, item: ChartDataItem) => {
    acc[item.name] = Math.round((item.count / totalCount) * 100);
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center mb-6">
          <AlertTriangle className="h-10 w-10 text-warning mr-4" />
          <div>
            <h3 className="text-lg font-semibold">Risk Overview</h3>
            <p className="text-sm text-muted-foreground">{totalCount} Active PoVs</p>
          </div>
        </div>

        <div className="flex items-center">
          {/* Gauge Chart */}
          <div className="w-1/2 h-40">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                >
                  {chartData.map((entry: ChartDataItem, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Risk Breakdown */}
          <div className="w-1/2">
            {chartData.map((item: ChartDataItem) => (
              <div
                key={item.name}
                className="flex items-center justify-between mb-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}</span>
                </div>
                <span className="text-sm font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="mt-4 p-3 bg-muted rounded-md text-center">
          <p className="text-sm text-muted-foreground">
            {riskPercentages['Low Risk'] || 0}% of PoVs are low risk,{' '}
            {riskPercentages['High Risk'] || 0}% require immediate attention
          </p>
        </div>

        {/* Risk Trends */}
        {Object.entries(riskData.byCategory).map(([category, risks]) => {
          if (!Array.isArray(risks)) return null;
          const highRisk = risks.find((r): r is RiskOverviewData['overall'][0] => 
            isValidRisk(r) && r.level === 'HIGH' && typeof r.trend === 'string'
          );
          if (highRisk && highRisk.count > 0) {
            return (
              <div
                key={category}
                className="mt-2 p-2 bg-destructive/15 text-destructive rounded-md text-sm"
              >
                {category}: {highRisk.count} high risk items ({highRisk.trend.toLowerCase()} trend)
              </div>
            );
          }
          return null;
        })}
      </CardContent>
    </Card>
  );
};

export default RiskOverview;
