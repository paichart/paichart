'use client';

import React, { Suspense, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Settings,
  Brain,
  Server,
  Zap,
  Activity
} from 'lucide-react';

// Widget utilities
import WidgetSkeleton from '@/components/dashboard/widgets/WidgetSkeleton';
import WidgetErrorBoundary from '@/components/dashboard/widgets/WidgetErrorBoundary';

// Admin-only MCP Components
import { MCPToolDashboard } from '@/components/mcp/MCPToolDashboard';
import { MCPServerManager } from '@/components/mcp/MCPServerManager';

// Consolidated Admin Intelligence Tab (combines Portfolio + Recommendations)
// Operations Tab sections (Infrastructure + Execution Performance)
import { AdminRecommendationsTab, InfrastructureStatusSection, ExecutionPerformanceSection } from './AdminRecommendationsTab';
import { TokenCostPanel } from './TokenCostPanel';

// Intelligent Task Automation - Real recommendation engine with automations
import { IntelligentTaskAutomation } from '@/components/mcp/IntelligentTaskAutomation';

// POV Selector for KPI scorecard
import { POVSelector } from '@/components/analytics/POVSelector';

// Bloomberg design system
import { BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';

// Widget wrapper with error boundary and suspense
const WidgetWrapper = ({ children }: { children: React.ReactNode }) => (
  <WidgetErrorBoundary>
    <Suspense fallback={<WidgetSkeleton />}>
      {children}
    </Suspense>
  </WidgetErrorBoundary>
);

// Tab content wrapper for consistent spacing
const TabContentWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-6">
    {children}
  </div>
);

export function DashboardTabs() {
  // Default to Admin Intelligence (consolidated view)
  const [activeTab, setActiveTab] = useState('admin-intelligence');
  const [automationPovId, setAutomationPovId] = useState<string | 'all'>('all');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="admin-intelligence" className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Intelligence
        </TabsTrigger>
        <TabsTrigger value="automation" className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Automation
        </TabsTrigger>
        <TabsTrigger value="operations" className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Operations
        </TabsTrigger>
        <TabsTrigger value="tools-config" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Services
        </TabsTrigger>
      </TabsList>

      {/* Tab 1: Admin Intelligence - Portfolio, execution, and recommendations */}
      <TabsContent value="admin-intelligence">
        <TabContentWrapper>
          <WidgetWrapper>
            <TokenCostPanel />
          </WidgetWrapper>
          <WidgetWrapper>
            <AdminRecommendationsTab />
          </WidgetWrapper>
        </TabContentWrapper>
      </TabsContent>

      {/* Tab 2: Automation - Real recommendation engine with task automation */}
      <TabsContent value="automation">
        <TabContentWrapper>
          <WidgetWrapper>
            <IntelligentTaskAutomation
              mode="suggestion"
              povId={automationPovId !== 'all' ? automationPovId : undefined}
              povSelector={
                <POVSelector
                  value={automationPovId}
                  onChange={setAutomationPovId}
                  includeAllOption={true}
                />
              }
            />
          </WidgetWrapper>
        </TabContentWrapper>
      </TabsContent>

      {/* Tab 3: Operations - Infrastructure status + Agent execution performance */}
      <TabsContent value="operations">
        <TabContentWrapper>
          {/* Infrastructure Status - "Are the servers running?" */}
          <WidgetWrapper>
            <InfrastructureStatusSection />
          </WidgetWrapper>

          {/* Section Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-sm text-muted-foreground">
                Execution Performance
              </span>
            </div>
          </div>

          {/* Execution Performance - "How well are agents performing?" */}
          <WidgetWrapper>
            <ExecutionPerformanceSection />
          </WidgetWrapper>
        </TabContentWrapper>
      </TabsContent>

      {/* Tab 4: Services - Consolidated MCP service monitoring, performance, patterns, catalog, servers */}
      <TabsContent value="tools-config">
        <TabContentWrapper>
          {/* Stacked single-page layout — Monitoring → Performance → Patterns → Services → Servers.
              (Tools sub-tabs were consolidated into one view in Dec 2025; the JUMP quick-nav bar
              was removed 2026-06-22.) */}
          <div className="space-y-6">
            <WidgetWrapper>
              <MCPToolDashboard mode="detailed" />
            </WidgetWrapper>
            <div id="tools-servers" className="scroll-mt-12">
              <WidgetWrapper>
                <MCPServerManager
                  showAdvancedOptions={true}
                  allowServerDeletion={true}
                  showConnectionLogs={true}
                />
              </WidgetWrapper>
            </div>
          </div>
        </TabContentWrapper>
      </TabsContent>
    </Tabs>
  );
}
