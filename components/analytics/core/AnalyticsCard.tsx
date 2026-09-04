import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactNode } from 'react';

interface AnalyticsCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * AnalyticsCard Component
 * Phase 1+3B: Reusable analytics card wrapper
 *
 * Features:
 * - Consistent card layout with title and optional description
 * - Optional action buttons (refresh, export, etc.)
 * - Flexible content area
 * - Used across all analytics views
 *
 * Usage:
 * <AnalyticsCard
 *   title="Performance Metrics"
 *   description="Last 30 days"
 *   actions={<RefreshButton />}
 * >
 *   {content}
 * </AnalyticsCard>
 */
export function AnalyticsCard({
  title,
  description,
  children,
  actions,
  className = ''
}: AnalyticsCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
