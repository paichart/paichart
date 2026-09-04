'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MetricTooltip } from '@/components/ui/MetricTooltip';
import { AlertCircle, TrendingUp, Users, AlertTriangle } from 'lucide-react';
import { useTaskInsights, TimeRange, TaskInsightsResponse } from '../hooks';
import {
  RecommendationCard,
  NoRecommendationsCard,
  InsightsSkeleton,
  type Recommendation,
} from '../core';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';

interface InsightsTabProps {
  povId: string | 'all';
  timeRange: string;
  filter?: string; // 'at-risk' | 'blocked' - from RiskDashboard "View All" deep link
}

/**
 * Insights Tab Component
 * Displays AI-generated recommendations and predictive insights
 *
 * Features:
 * - Risk indicators (tasks at risk, blocked tasks)
 * - Productivity trends
 * - Workload balance
 * - AI recommendations (4 types: risk, workload, productivity, bottleneck)
 * - Action buttons to navigate to relevant tasks
 */
export function InsightsTab({ povId, timeRange, filter }: InsightsTabProps) {
  const router = useRouter();

  // Handle deep link from RiskDashboard "View All"
  useEffect(() => {
    if (filter === 'at-risk' || filter === 'blocked') {
      // Scroll to recommendations section when deep linked
      setTimeout(() => {
        const element = document.getElementById('ai-recommendations');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [filter]);

  const { data: rawData, isLoading, error } = useTaskInsights(
    povId === 'all' ? '' : povId,
    timeRange as TimeRange
  );

  // Extract insights from typed response
  const data = rawData?.insights;

  // Handle recommendation action clicks - navigate to POV editor
  const handleRecommendationAction = (action: string, type: string) => {
    // Navigate to POV editor page
    router.push(`/pov/edit/${povId}`);
  };

  // Generate MCP prompt for copying to clipboard
  const generatePrompt = (action: string, type: string): string => {
    const baseContext = `I'm working on POV ${povId}. `;

    // Map action items to specific MCP tool prompts
    const promptTemplates: Record<string, Record<string, string>> = {
      'RISK_MITIGATION': {
        'Review overdue tasks and update priorities':
          `${baseContext}Please use project(action: "task.list") to show me all overdue or at-risk tasks, sorted by priority. For each task, analyze why it's at risk and suggest whether to extend the deadline, reassign, or escalate.`,
        'Contact assignees for status updates':
          `${baseContext}Please use project(action: "task.list") to identify tasks that are overdue or stalled. Show me the assignee for each and draft a brief status check message I can send them.`,
        'Consider deadline extensions where appropriate':
          `${baseContext}Please use project(action: "task.list") to show overdue tasks. For each, analyze the remaining work and suggest a realistic new deadline using perform if I approve.`,
      },
      'WORKLOAD_BALANCING': {
        'Redistribute tasks from overloaded team members':
          `${baseContext}Please use project(action: "task.list") to analyze workload by team member. Identify who is overloaded and suggest specific tasks that could be reassigned to balance the workload.`,
        'Review task complexity and effort estimates':
          `${baseContext}Please use project(action: "task.list") to show tasks for overloaded team members. Analyze task complexity and suggest which ones might need to be broken down or re-estimated.`,
        'Consider additional resources for high-workload areas':
          `${baseContext}Please use project(action: "pov.details") to analyze the current team and workload. Identify phases or areas that need additional resources and suggest what skills would help.`,
      },
      'PRODUCTIVITY_IMPROVEMENT': {
        'Identify and remove blockers':
          `${baseContext}Please use project(action: "task.list") to show all BLOCKED tasks. For each, analyze what's blocking it and suggest actions to unblock using perform.`,
        'Review and optimize task workflows':
          `${baseContext}Please use project(action: "pov.details") to analyze the phase structure and task flow. Identify bottlenecks and suggest workflow improvements.`,
        'Implement automation for repetitive tasks':
          `${baseContext}Please use project(action: "task.list") to identify tasks that follow repetitive patterns. Suggest which ones could benefit from agent automation.`,
      },
      'BOTTLENECK_RESOLUTION': {
        'Review phase requirements and dependencies':
          `${baseContext}Please use project(action: "pov.details") to analyze the bottleneck phase. Show me all tasks in this phase, their dependencies, and what's causing the slowdown.`,
        'Allocate additional resources to bottleneck phase':
          `${baseContext}Please use project(action: "task.list") to show tasks in the bottleneck phase. Identify which tasks could be parallelized or need additional help.`,
        'Consider parallel execution where possible':
          `${baseContext}Please use project(action: "pov.details") to analyze task dependencies in the bottleneck phase. Identify tasks that could be executed in parallel to speed up delivery.`,
      },
    };

    // Find matching prompt or generate a generic one
    const typeTemplates = promptTemplates[type];
    if (typeTemplates) {
      // Try exact match first
      if (typeTemplates[action]) {
        return typeTemplates[action];
      }
      // Try partial match
      for (const [key, prompt] of Object.entries(typeTemplates)) {
        if (action.toLowerCase().includes(key.toLowerCase().split(' ')[0])) {
          return prompt;
        }
      }
    }

    // Generic fallback prompt
    return `${baseContext}I need help with: "${action}". Please use the appropriate pAIchart tools (project, perform, analytics) to analyze the situation and suggest specific actions I can take.`;
  };

  // Handle "All Projects" selection
  if (povId === 'all') {
    return (
      <Card>
        <CardContent className="p-8">
          <p className="text-center text-muted-foreground">
            Please select a specific project to view AI-generated insights and recommendations.
          </p>
          <p className="text-center text-sm text-muted-foreground mt-2">
            Recommendations are project-specific and cannot be aggregated across all projects.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <InsightsSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-destructive">
            Failed to load insights. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-0 font-mono">
      {/* Bloomberg Header Bar */}
      <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
        <span className={BLOOMBERG_HEADER.title}>INSIGHTS</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>AT RISK:</span>
        <span className={BLOOMBERG_COLORS.warning}>{data.summary.tasksAtRisk}</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>BLOCKED:</span>
        <span className={BLOOMBERG_COLORS.error}>{data.summary.blockedTasks}</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>PRODUCTIVITY:</span>
        <span className={`font-bold ${data.summary.productivityTrend >= 0 ? BLOOMBERG_COLORS.success : BLOOMBERG_COLORS.error}`}>
          {data.summary.productivityTrend > 0 ? '+' : ''}{Math.round(data.summary.productivityTrend)}%
        </span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>WORKLOAD:</span>
        <span className={BLOOMBERG_COLORS.info}>{data.summary.averageWorkload.toFixed(1)}</span>
      </div>

      {/* AI Recommendations Section */}
      <div id="ai-recommendations">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold">AI-Generated Recommendations</h3>
          {data.recommendations && data.recommendations.length > 0 && (
            <Badge variant="secondary">{data.recommendations.length}</Badge>
          )}
        </div>

        {/* P2 decision-matrix verdict (2026-06-12): RecommendationCard stays a
            card — complex nested data with actions (description, impact,
            action buttons, copy-prompt), not a plain item list */}
        {data.recommendations && data.recommendations.length > 0 ? (
          <div className="space-y-4">
            {data.recommendations.map((rec, index) => (
              <RecommendationCard
                key={index}
                {...rec}
                showActionButtons={true}
                onAction={handleRecommendationAction}
                onCopyPrompt={generatePrompt}
              />
            ))}
          </div>
        ) : (
          <NoRecommendationsCard />
        )}
      </div>

      {/* Workload Distribution — P2 2026-06-12: was a shadcn Card; plain
          item list (name + count per row) → Bloomberg dense list per the
          decision matrix */}
      {data.workload.distribution.length > 0 && (
        <div className="mt-4 bg-background border border-border">
          <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
            <span className="text-amber-400 font-bold">TEAM WORKLOAD</span>
            {data.workload.imbalanceScore > 1.5 && (
              <MetricTooltip
                explainer={`Imbalance score ${data.workload.imbalanceScore.toFixed(1)}: max assignee load vs team average (warning above 1.5)`}
                className={`${BLOOMBERG_COLORS.warning} ml-auto`}
              >
                ⚠ IMBALANCE {data.workload.imbalanceScore.toFixed(1)}
              </MetricTooltip>
            )}
          </div>
          <div className="divide-y divide-border">
            {data.workload.distribution.slice(0, 10).map((item: any, idx: number) => (
              <div key={idx} className={`px-3 py-1.5 flex items-center gap-3 text-xs ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                <span className="text-muted-foreground w-6">{String(idx + 1).padStart(2, '0')}</span>
                <span className="flex-1">{item.assignee?.name || 'Unassigned'}</span>
                <span className={BLOOMBERG_COLORS.info}>{item.activeTasks}</span>
                <span className="text-muted-foreground">active</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottlenecks — P2 2026-06-12: same conversion; the dashboard's
          Phase Bottlenecks section already uses this dense-list shape */}
      {data.bottlenecks && data.bottlenecks.length > 0 && (
        <div className="mt-4 bg-background border border-border">
          <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
            <span className="text-amber-400 font-bold">PHASE BOTTLENECKS</span>
            <span className="text-muted-foreground ml-auto">most incomplete tasks</span>
          </div>
          <div className="divide-y divide-border">
            {data.bottlenecks.map((bottleneck: any, idx: number) => (
              <div key={idx} className={`px-3 py-1.5 flex items-center gap-3 text-xs ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                <span className="text-muted-foreground w-6">{String(idx + 1).padStart(2, '0')}</span>
                <span className="flex-1">{bottleneck.phase?.name || 'Unknown Phase'}</span>
                <span className={idx === 0 ? BLOOMBERG_COLORS.error : 'text-muted-foreground'}>
                  {bottleneck.incompleteTasks} incomplete
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

