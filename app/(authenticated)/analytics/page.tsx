'use client';

import { AnalyticsProvider, useAnalyticsContext } from '@/components/analytics/AnalyticsContext';
import { POVSelector } from '@/components/analytics/POVSelector';
import { OverviewTab } from '@/components/analytics/tabs/OverviewTab';
import { TaskMetricsCard } from '@/components/analytics/tabs/TaskMetricsCard';
import { InsightsTab } from '@/components/analytics/tabs/InsightsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { AgentHistoryView } from '@/components/poveditor/pov/components/AgentHistoryView';
import { TaskActivityTimeline } from '@/components/tasks/TaskActivityTimeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BarChart, Bot, Activity, Lightbulb, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/**
 * AI Analytics Dashboard Page
 * Phase 2 Task 2.4: User-facing analytics dashboard
 *
 * Features:
 * - POV-scoped analytics (select specific project or "All Projects")
 * - 5 tabs: Overview, Tasks & Performance, Insights & Recommendations, AI & Agents, Tools & ROI
 * - URL-synced state (shareable links)
 * - Real-time data with React Query caching
 * - AI-generated recommendations (restored from dashboard rationalization)
 *
 * Security:
 * - All APIs validate POV access (Phase 0 fixes)
 * - Input validation on all endpoints (Phase 0 fixes)
 * - User can only see POVs they have access to
 */
function AnalyticsContent() {
  const { selectedPOVId, setSelectedPOVId, timeRange, setTimeRange } = useAnalyticsContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read active tab from URL (for deep linking from RiskDashboard "View All")
  const activeTab = searchParams.get('tab') || 'overview';

  // Handle tab change - update URL
  const handleTabChange = (newTab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Shared chrome: full-width + PageHeader (shared-list-page-primitives-pattern — chrome half) */}
      <PageHeader
        icon={BarChart}
        title="Analytics Dashboard"
        subtitle="Performance insights, automation metrics, and intelligent recommendations"
        actions={
          <>
            <POVSelector
              value={selectedPOVId}
              onChange={setSelectedPOVId}
              includeAllOption={true}
            />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            {/* Export button - moved from TaskActivityTimeline */}
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </>
        }
      />

      {/* Tabbed content - URL-synced for deep linking */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Task Activity
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Insights & Recommendations
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI & Agents
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-4">
          <OverviewTab povId={selectedPOVId} timeRange={timeRange} />
        </TabsContent>

        {/* Tab 2: Tasks & Performance */}
        <TabsContent value="tasks" className="space-y-4">
          {selectedPOVId !== 'all' ? (
            <>
              <TaskMetricsCard povId={selectedPOVId} timeRange={timeRange} />
              <TaskActivityTimeline
                taskId="global"
                povId={selectedPOVId}
                compact={false}
                showFilters={true}
                maxItems={15}
                dateRange={timeRange}
              />
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Task Performance Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground py-8">
                  Please select a specific project to view task performance metrics and activity
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 3: Insights & Recommendations */}
        <TabsContent value="insights" className="space-y-4">
          <InsightsTab povId={selectedPOVId} timeRange={timeRange} filter={searchParams.get('filter') || undefined} />
        </TabsContent>

        {/* Tab 4: AI & Agents */}
        <TabsContent value="agents" className="space-y-4">
          <AgentHistoryView
            povId={selectedPOVId !== 'all' ? selectedPOVId : undefined}
            taskId="global"
            compact={false}
            showFilters={true}
            maxItems={20}
            dateRange={timeRange}
            onViewExecution={(_executionId) => {
              // TODO: Navigate to execution detail view
            }}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <AnalyticsProvider>
      <AnalyticsContent />
    </AnalyticsProvider>
  );
}
