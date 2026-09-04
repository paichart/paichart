'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  Lightbulb,
  Shield,
  Zap,
  TrendingUp,
  Settings,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  DollarSign,
  Activity,
  BarChart3,
  Globe,
  Users,
  Briefcase,
  Server,
  Cpu,
  HardDrive,
  Gauge,
  TrendingDown,
  PlayCircle,
  PauseCircle,
  AlertCircle,
  Wrench,
  RefreshCw,
  Network,
  Brain,
  CheckCircle,
  Plug,
  FileText,
  ExternalLink,
  // Phase 7: Activity-based recommendation icons
  Timer,
  Repeat,
  UserMinus,
  MessageSquare,
  Bot,
  RotateCcw,
} from 'lucide-react';
import {
  generateAdminBriefing,
  getBriefingSentimentConfig,
  type BriefingData,
  type AdminBriefing,
} from '@/lib/utils/admin-briefing';
import { HealthScoreTimeline } from './HealthScoreTimeline';
import { getStatusSymbol, getPriorityDisplay, getTheatreAbbreviation, BLOOMBERG_COLORS, BLOOMBERG_HEADER } from '@/lib/constants/bloomberg-styles';
import { MetricTooltip } from '@/components/ui/MetricTooltip';

/**
 * Admin Recommendations interfaces from /api/analytics?domain=admin&metrics=recommendations
 * Phase 3 of Admin Intelligence Implementation + Phase 7 Activity-Based Recommendations
 */
type AdminRecommendationType =
  // Source data recommendations (1-8)
  | 'PORTFOLIO_RISK'
  | 'PHASE_BOTTLENECK'
  | 'RESOURCE_ALLOCATION'
  | 'TOOL_PERFORMANCE'
  | 'TEAM_EFFICIENCY'
  | 'TEMPLATE_OPTIMIZATION'
  | 'GEOGRAPHIC_INSIGHT'
  | 'CROSS_POV_PATTERN'
  // Activity-based recommendations (9-14) - Phase 7
  | 'STALE_TASK_DETECTION'
  | 'ACTIVITY_BOTTLENECK'
  | 'ASSIGNMENT_VOLATILITY'
  | 'COMMENT_HEAVY_TASKS'
  | 'AGENT_RETRY_PATTERN'
  | 'RAPID_STATUS_CYCLING';

type RecommendationScope = 'PORTFOLIO' | 'REGIONAL' | 'TEAM' | 'SYSTEM';

interface AdminRecommendation {
  id: string;
  type: AdminRecommendationType;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  actionItems: string[];
  scope: RecommendationScope;
  affectedCount: number;
  affectedEntities?: {
    id: string;
    title: string;
    type: string;
  }[];
  metrics?: {
    current: number;
    threshold: number;
    trend?: 'improving' | 'declining' | 'stable';
  };
  generatedAt: Date;
}

interface AdminRecommendationsData {
  recommendations: AdminRecommendation[];
  summary: {
    total: number;
    byPriority: { priority: string; count: number }[];
    byType: { type: string; count: number }[];
  };
  generatedAt: Date;
}

interface AdminRecommendationsResponse {
  data: {
    recommendations: AdminRecommendationsData;
  };
}

/**
 * Portfolio Health interfaces from /api/analytics?domain=admin
 */
interface AtRiskPOV {
  id: string;
  title: string;
  status: string;
  priority: string;
  overdueTaskCount: number;
  totalTaskCount: number;
  completionRate: number;
  // 2026-06-12: age of oldest incomplete task — explains stuck-only at-risk
  // rows (which can have 0 overdue tasks)
  daysStuck?: number;
  ownerEmail?: string;
  salesTheatre: string;
}

interface PhaseBottleneck {
  phaseName: string;
  phaseType: string;
  incompleteTasks: number;
  povCount: number;
  avgDaysStuck: number;
  // 2026-06-12: worst-stuck POVs for the drill-down dialog
  affectedPOVs?: Array<{ id: string; title: string; daysStuck: number }>;
}

interface GeographicDistribution {
  theatre: string;
  povCount: number;
  avgHealthScore: number;
  atRiskCount: number;
}

interface PortfolioHealthData {
  summary: {
    totalPOVs: number;
    activePOVs: number;
    atRiskPOVs: number;
    healthScore: number;
    avgCompletionRate: number;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
  atRiskPOVs: AtRiskPOV[];
  phaseBottlenecks: PhaseBottleneck[];
  geographicDistribution: GeographicDistribution[];
  statusBreakdown: { status: string; count: number; percentage: number }[];
  priorityBreakdown: { priority: string; count: number; percentage: number }[];
}

interface PortfolioHealthResponse {
  data: {
    portfolioHealth: PortfolioHealthData;
  };
}

/**
 * System Health interfaces from /api/analytics?domain=admin&metrics=system-health
 * Phase 4 of Admin Intelligence Implementation
 */
interface ToolHealth {
  toolName: string;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  avgDuration: number;
  recentErrors: string[];
  trend: 'improving' | 'declining' | 'stable';
}

interface TemplateHealth {
  id: string;
  name: string;
  category: string;
  totalExecutions: number;
  successRate: number;
  avgDuration: number;
  reliability: number;
  performanceScore: number;
}

interface QueueHealth {
  pendingExecutions: number;
  runningExecutions: number;
  stuckExecutions: number;
  avgWaitTime: number;
  queueDepth: number;
}

interface SystemRecommendation {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  effort: string;
  suggestion: string;
  metrics?: Record<string, number>;
  details?: string[];
}

interface SystemHealthData {
  summary: {
    overallHealth: number;
    agentSuccessRate: number;
    avgExecutionTime: number;
    activeExecutions: number;
    errorRate: number;
    lastUpdated: Date;
  };
  toolHealth: ToolHealth[];
  templateHealth: TemplateHealth[];
  queueHealth: QueueHealth;
  trends: {
    type: string;
    description: string;
    significance: number;
    direction: 'up' | 'down' | 'stable';
  }[];
  recommendations: SystemRecommendation[];
  insights: {
    type: 'positive' | 'concern' | 'neutral';
    category: string;
    title: string;
    description: string;
  }[];
}

interface SystemHealthResponse {
  data: {
    systemHealth: SystemHealthData;
  };
}

/**
 * Infrastructure Status interfaces from /api/mcp/status
 * Consolidated from the MCPIntelligenceStatus component (deleted 2026-06-12 — zero importers)
 */
interface MCPServerStatus {
  name: string;
  type: string;
  connected: boolean;
  status: string;
  toolCount?: number;
  capabilities?: string[];
  health?: {
    uptime: string;
    responseTime: string;
    errorRate: string;
  };
  lastHeartbeat?: string | null;
}

interface MCPInfrastructureData {
  timestamp: string;
  systemHealth: {
    score: number;
    status: string;
    color: string;
  };
  servers: {
    embedded: MCPServerStatus;
    external: MCPServerStatus;
    total: number;
    connected: number;
  };
  tools: {
    total: number;
    active: number;
    categories: string[];
  };
  performance: {
    system: {
      uptime: string;
      responseTime: string;
      throughput: string;
      errorRate: string;
    };
  };
  recommendations: {
    type: string;
    title: string;
    description: string;
    action: string;
    priority: string;
  }[];
}

interface MCPInfrastructureResponse {
  success: boolean;
  data: MCPInfrastructureData;
}

/**
 * Type icons for visual distinction
 */
const typeIcons: Record<string, React.ReactNode> = {
  OPTIMIZATION: <TrendingUp className="h-4 w-4" />,
  AUTOMATION: <Zap className="h-4 w-4" />,
  INTEGRATION: <Settings className="h-4 w-4" />,
  SECURITY: <Shield className="h-4 w-4" />,
  PERFORMANCE: <Target className="h-4 w-4" />,
};

/**
 * Status icons and colors - Using Bloomberg colors
 */
const statusConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string }> = {
  PENDING: {
    icon: <Clock className="h-3 w-3" />,
    color: BLOOMBERG_COLORS.warning,
    bgColor: 'bg-yellow-500/10'
  },
  APPROVED: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    color: BLOOMBERG_COLORS.info,
    bgColor: 'bg-blue-500/10'
  },
  REJECTED: {
    icon: <XCircle className="h-3 w-3" />,
    color: BLOOMBERG_COLORS.error,
    bgColor: 'bg-red-500/10'
  },
  IMPLEMENTED: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    color: BLOOMBERG_COLORS.success,
    bgColor: 'bg-green-500/10'
  },
};

/**
 * Priority styling
 */
const priorityConfig: Record<string, { variant: 'destructive' | 'default' | 'secondary' | 'outline'; border: string }> = {
  CRITICAL: { variant: 'destructive', border: 'border-red-400' },
  HIGH: { variant: 'destructive', border: 'border-red-500/30' },
  MEDIUM: { variant: 'default', border: 'border-yellow-500/30' },
  LOW: { variant: 'secondary', border: 'border-gray-500/30' },
};

/**
 * Admin Recommendation Type Icons (Phase 3 + Phase 7)
 * Using BLOOMBERG_COLORS for consistency
 */
const adminRecTypeIcons: Record<AdminRecommendationType, React.ReactNode> = {
  // Source data recommendations (1-8)
  PORTFOLIO_RISK: <AlertTriangle className={`h-4 w-4 ${BLOOMBERG_COLORS.error}`} />,
  PHASE_BOTTLENECK: <Target className={`h-4 w-4 ${BLOOMBERG_COLORS.warning}`} />,
  RESOURCE_ALLOCATION: <Users className={`h-4 w-4 ${BLOOMBERG_COLORS.info}`} />,
  TOOL_PERFORMANCE: <Zap className="h-4 w-4 text-purple-400" />,
  TEAM_EFFICIENCY: <TrendingUp className={`h-4 w-4 ${BLOOMBERG_COLORS.success}`} />,
  TEMPLATE_OPTIMIZATION: <Settings className={`h-4 w-4 ${BLOOMBERG_COLORS.neutral}`} />,
  GEOGRAPHIC_INSIGHT: <Globe className="h-4 w-4 text-teal-400" />,
  CROSS_POV_PATTERN: <Briefcase className="h-4 w-4 text-indigo-400" />,
  // Activity-based recommendations (9-14) - Phase 7
  STALE_TASK_DETECTION: <Timer className={`h-4 w-4 ${BLOOMBERG_COLORS.neutral}`} />,
  ACTIVITY_BOTTLENECK: <Repeat className={`h-4 w-4 ${BLOOMBERG_COLORS.warning}`} />,
  ASSIGNMENT_VOLATILITY: <UserMinus className="h-4 w-4 text-purple-400" />,
  COMMENT_HEAVY_TASKS: <MessageSquare className={`h-4 w-4 ${BLOOMBERG_COLORS.info}`} />,
  AGENT_RETRY_PATTERN: <Bot className="h-4 w-4 text-cyan-400" />,
  RAPID_STATUS_CYCLING: <RotateCcw className={`h-4 w-4 ${BLOOMBERG_COLORS.warning}`} />,
};

/**
 * Admin Recommendation Type Labels (Phase 3 + Phase 7)
 */
const adminRecTypeLabels: Record<AdminRecommendationType, string> = {
  // Source data recommendations (1-8)
  PORTFOLIO_RISK: 'Portfolio Risk',
  PHASE_BOTTLENECK: 'Phase Bottleneck',
  RESOURCE_ALLOCATION: 'Resource Allocation',
  TOOL_PERFORMANCE: 'Tool Performance',
  TEAM_EFFICIENCY: 'Team Efficiency',
  TEMPLATE_OPTIMIZATION: 'Template Optimization',
  GEOGRAPHIC_INSIGHT: 'Geographic Insight',
  CROSS_POV_PATTERN: 'Cross-POV Pattern',
  // Activity-based recommendations (9-14) - Phase 7
  STALE_TASK_DETECTION: 'Stale Tasks',
  ACTIVITY_BOTTLENECK: 'Activity Churn',
  ASSIGNMENT_VOLATILITY: 'Assignment Volatility',
  COMMENT_HEAVY_TASKS: 'High Comments',
  AGENT_RETRY_PATTERN: 'Agent Retries',
  RAPID_STATUS_CYCLING: 'Status Cycling',
};

/**
 * Scope styling - Using Bloomberg colors
 */
const scopeConfig: Record<RecommendationScope, { color: string; bgColor: string }> = {
  PORTFOLIO: { color: BLOOMBERG_COLORS.info, bgColor: 'bg-blue-500/10' },
  REGIONAL: { color: 'text-teal-400', bgColor: 'bg-teal-500/10' },
  TEAM: { color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  SYSTEM: { color: BLOOMBERG_COLORS.neutral, bgColor: 'bg-gray-500/10' },
};

/**
 * Health Score Gauge Component
 */
function HealthScoreGauge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return BLOOMBERG_COLORS.success;
    if (s >= 60) return BLOOMBERG_COLORS.warning;
    if (s >= 40) return 'text-orange-400';
    return BLOOMBERG_COLORS.error;
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`text-5xl font-bold ${getColor(score)}`}>{score}</div>
      <div className="text-sm text-muted-foreground">Health Score</div>
      <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
        <div
          className={`h-full ${getBgColor(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Portfolio Health Section Component
 * Phase 2 of Admin Intelligence Implementation
 */
function PortfolioHealthSection() {
  const [selectedBottleneck, setSelectedBottleneck] = useState<PhaseBottleneck | null>(null);

  const { data, isLoading, error } = useQuery<PortfolioHealthResponse>({
    queryKey: ['admin-portfolio-health'],
    queryFn: async () => {
      const res = await fetch('/api/analytics?domain=admin&metrics=portfolio-health');
      if (!res.ok) throw new Error('Failed to fetch portfolio health');
      return res.json();
    },
    staleTime: 15 * 60 * 1000, // 15 minutes - expensive cross-POV query
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading portfolio health...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.data?.portfolioHealth) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/10">
        <CardContent className="p-6">
          <p className="text-center text-yellow-400">
            Portfolio health data unavailable. This may be due to no active POVs or a temporary issue.
          </p>
        </CardContent>
      </Card>
    );
  }

  const health = data.data.portfolioHealth;

  return (
    <div className="space-y-0 font-mono">
      {/* Bloomberg Header Bar - Phase 1 */}
      <div className="bg-muted border-y border-border text-xs px-3 py-1.5 flex items-center gap-4">
        <span className="text-amber-400 font-bold">ADMIN DASHBOARD</span>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">HEALTH:</span>
        {/* 2026-06-12 UX: explain the formula at point of use — this 3-factor
            portfolio score legitimately differs from the chart's 2-factor
            trend score (see health-history.ts header) */}
        <MetricTooltip
          explainer="Portfolio health: task completion (40%) + overdue ratio (35%) + timeline-to-deadline (25%), averaged across active POVs. Differs from the HEALTH SCORE chart below, which is a 2-factor trend (completion 55% + overdue 45%) — historical snapshots have no timeline context."
          className={`font-bold ${health.summary.healthScore >= 80 ? 'text-green-400' : health.summary.healthScore >= 60 ? 'text-yellow-400' : 'text-red-400'}`}
        >
          {health.summary.healthScore}
        </MetricTooltip>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">POVs:</span>
        <MetricTooltip explainer="Active POVs: status IN_PROGRESS, STALLED, or VALIDATION (excludes PROJECTED/WON/LOST)" className="text-blue-400">{health.summary.activePOVs}</MetricTooltip>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">AT-RISK:</span>
        <MetricTooltip explainer="At-risk: any overdue task, health score below 50, or incomplete tasks older than 30 days (stuck)" className="text-red-400">{health.summary.atRiskPOVs}</MetricTooltip>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">TASKS:</span>
        <span className="text-foreground">{health.summary.completedTasks}/{health.summary.totalTasks}</span>
        <div className="ml-auto text-muted-foreground">
          {/* 2026-06-12: was toLocaleTimeString() (LOCAL time) labeled UTC */}
          {new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false })} UTC
        </div>
      </div>

      {/* Health Score Timeline - Bloomberg style */}
      <HealthScoreTimeline />

      {/* At-Risk POVs Table - Phase 2: Bloomberg dense style */}
      {health.atRiskPOVs.length > 0 && (
        <div className="bg-background border border-border overflow-hidden">
          <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <span className="text-amber-400 font-bold">AT-RISK POVs</span>
            <span className="text-muted-foreground ml-auto">TOP 10</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-normal">#</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-normal">POV</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-normal">Status</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-normal">Priority</th>
                  <th className="text-center px-3 py-1.5 text-muted-foreground font-normal">Overdue</th>
                  <th className="text-center px-3 py-1.5 text-muted-foreground font-normal"><MetricTooltip explainer="Age of the oldest incomplete task — POVs are at-risk when this exceeds 30 days, even with no overdue tasks">Stuck</MetricTooltip></th>
                  <th className="text-center px-3 py-1.5 text-muted-foreground font-normal">Completion</th>
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-normal">Theatre</th>
                </tr>
              </thead>
              <tbody>
                {health.atRiskPOVs.map((pov, index) => {
                  const statusInfo = getStatusSymbol(pov.status);
                  const priorityInfo = getPriorityDisplay(pov.priority);
                  return (
                    <tr
                      key={pov.id}
                      className={`border-b hover:bg-accent transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {(index + 1).toString().padStart(2, '0')}
                      </td>
                      {/* native title= OK here: truncated-content reveal, not a metric explainer (see BLOOMBERG_TOOLTIP rule) */}
                      <td className="px-3 py-1.5 max-w-[250px] truncate" title={pov.title}>
                        <Link
                          href={`/pov/view/${pov.id}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {pov.title}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`${statusInfo.color} mr-1`}>{statusInfo.symbol}</span>
                        <span className="text-muted-foreground">{pov.status.substring(0, 4)}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`font-bold ${priorityInfo.color}`}>{priorityInfo.text}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center text-red-400 font-bold">
                        {pov.overdueTaskCount}
                      </td>
                      <td className={`px-3 py-1.5 text-center font-mono ${(pov.daysStuck ?? 0) >= 90 ? 'text-red-400' : (pov.daysStuck ?? 0) > 30 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                        {pov.daysStuck != null ? `${pov.daysStuck}d` : '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {/* Value centered directly under the centered "Completion" header,
                            with the bar stacked beneath it (the side-by-side layout left the
                            % right-of-center). */}
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-foreground text-xs tabular-nums">{pov.completionRate}%</span>
                          <div className="w-16 bg-muted/30 h-1.5 rounded-sm overflow-hidden">
                            <div
                              className={`h-full ${pov.completionRate >= 80 ? BLOOMBERG_COLORS.success.replace('text-', 'bg-') : pov.completionRate >= 50 ? BLOOMBERG_COLORS.warning.replace('text-', 'bg-') : BLOOMBERG_COLORS.error.replace('text-', 'bg-')}`}
                              style={{ width: `${pov.completionRate}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{getTheatreAbbreviation(pov.salesTheatre)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phase Bottlenecks - Phase 2: Bloomberg dense list */}
      {health.phaseBottlenecks.length > 0 && (
        <div className="bg-background border border-border">
          <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
            <Target className="h-3 w-3 text-orange-400" />
            <span className="text-amber-400 font-bold">PHASE BOTTLENECKS</span>
            <span className="text-muted-foreground ml-auto">TOP 5</span>
          </div>
          <div className="divide-y divide-border">
            {health.phaseBottlenecks.slice(0, 5).map((bottleneck, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedBottleneck(bottleneck)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent transition-colors cursor-pointer text-left text-xs"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-muted-foreground">
                    {(idx + 1).toString().padStart(2, '0')}
                  </span>
                  <div className="flex-1">
                    <span className="text-foreground font-medium">{bottleneck.phaseName}</span>
                    <span className="text-muted-foreground ml-3">
                      {bottleneck.povCount} POVs • {bottleneck.avgDaysStuck}d stuck
                    </span>
                  </div>
                </div>
                <span className={`font-bold ${idx === 0 ? 'text-red-400' : idx === 1 ? 'text-orange-400' : 'text-yellow-400'}`}>
                  {bottleneck.incompleteTasks} TASKS
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottleneck Drill-Down Modal */}
      <BottleneckDrillDownModal
        bottleneck={selectedBottleneck}
        open={selectedBottleneck !== null}
        onClose={() => setSelectedBottleneck(null)}
      />
    </div>
  );
}

/**
 * Admin Recommendation Card
 * Displays individual recommendation with expandable details
 */
function AdminRecommendationCard({ rec, index }: { rec: AdminRecommendation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const priorityInfo = getPriorityDisplay(rec.priority);
  const scope = scopeConfig[rec.scope] || scopeConfig.PORTFOLIO;

  return (
    <div className={`${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
      {/* Main row */}
      <div className="px-3 py-1.5 flex items-start gap-3 text-xs">
        {/* Row number */}
        <span className="text-muted-foreground font-mono w-6">{String(index + 1).padStart(2, '0')}</span>

        {/* Priority prefix (colored text) */}
        <span className={`font-bold ${priorityInfo.color} w-10`}>{priorityInfo.text}</span>

        {/* Title and description inline.
            2026-06-12 UX: was unconditionally truncated at 80 chars with no
            way to read the rest — full description now shows on expand. */}
        <div className="flex-1 min-w-0">
          <span className="text-foreground">{rec.title}</span>
          <span className="text-muted-foreground ml-2">
            {!expanded && rec.description.length > 80
              ? `${rec.description.substring(0, 80)}…`
              : !expanded ? rec.description : null}
          </span>
        </div>

        {/* Affected count — labeled with the entity type (was a bare number) */}
        <MetricTooltip className="text-right whitespace-nowrap" explainer={`${rec.affectedCount} affected ${(rec.affectedEntities?.[0]?.type || 'item').toLowerCase()}s`}>
          <span className="text-blue-400">{rec.affectedCount}</span>
          <span className="text-muted-foreground ml-1">{(rec.affectedEntities?.[0]?.type || '').toLowerCase()}{rec.affectedEntities?.[0]?.type && rec.affectedCount !== 1 ? 's' : ''}</span>
        </MetricTooltip>

        {/* Actions toggle ("ACTS" was cryptic) */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-400 hover:text-amber-300 transition-colors w-24 text-right"
        >
          {rec.actionItems.length} {expanded ? 'HIDE ▲' : 'ACTIONS ▼'}
        </button>
      </div>

      {/* Expanded: full description + action items + linked entities */}
      {expanded && (
        <div className="px-3 py-2 border-t border-border bg-muted/50">
          <div className="ml-20 space-y-1">
            <p className="text-xs text-foreground/90 mb-2">{rec.description}</p>
            {rec.actionItems.map((action, idx) => (
              <div key={idx} className="text-xs flex items-start gap-2 text-muted-foreground">
                <span className="text-amber-400 font-mono w-6">{idx + 1})</span>
                <span className="flex-1">{action}</span>
              </div>
            ))}
            {rec.affectedEntities && rec.affectedEntities.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50 text-xs">
                <span className="text-muted-foreground">Affected: </span>
                {/* 2026-06-12 UX: POV entities are now links (were plain text) */}
                {rec.affectedEntities.slice(0, 5).map((entity, idx) => (
                  <span key={entity.id || idx}>
                    {entity.type === 'POV' ? (
                      <Link href={`/pov/view/${entity.id}`} className="text-blue-400 hover:underline">
                        {entity.title}
                      </Link>
                    ) : (
                      <span className="text-foreground">{entity.title}</span>
                    )}
                    {idx < Math.min(4, rec.affectedEntities!.length - 1) ? ', ' : ''}
                  </span>
                ))}
                {rec.affectedEntities.length > 5 && (
                  <span className="text-muted-foreground"> +{rec.affectedEntities.length - 5} more</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Recommendations List - Just the cards, no header/summary
 */
function RecommendationsList() {
  const { data, isLoading, error } = useQuery<AdminRecommendationsResponse>({
    queryKey: ['admin-portfolio-intelligence'],
    queryFn: async () => {
      const res = await fetch('/api/analytics?domain=admin&metrics=recommendations');
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.data?.recommendations?.recommendations) {
    return null; // Silently hide if no recommendations
  }

  const { recommendations } = data.data.recommendations;
  if (recommendations.length === 0) return null;

  return (
    <div className="bg-background border border-border divide-y divide-border">
      {recommendations.map((rec, index) => (
        <AdminRecommendationCard key={rec.id} rec={rec} index={index} />
      ))}
    </div>
  );
}

/**
 * System Health Score Gauge
 */
function SystemHealthGauge({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return BLOOMBERG_COLORS.success;
    if (s >= 60) return BLOOMBERG_COLORS.warning;
    if (s >= 40) return 'text-orange-400';
    return BLOOMBERG_COLORS.error;
  };

  const getBgColor = (s: number) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col items-center">
      <div className={`text-5xl font-bold ${getColor(score)}`}>{score}</div>
      <div className="text-sm text-muted-foreground">System Health</div>
      <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
        <div
          className={`h-full ${getBgColor(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Execution Performance Section Component (formerly System Health Section)
 * Phase 4 of Admin Intelligence Implementation
 *
 * Moved to Operations tab - answers "How well are agents performing?"
 * - Agent execution metrics (success rates, durations)
 * - Queue health (pending, running, stuck executions)
 * - Tool health (error rates, trends)
 * - Template performance
 */
export function ExecutionPerformanceSection() {
  const [selectedTool, setSelectedTool] = useState<ToolHealth | null>(null);

  const { data, isLoading, error } = useQuery<SystemHealthResponse>({
    queryKey: ['admin-system-health'],
    queryFn: async () => {
      const res = await fetch('/api/analytics?domain=admin&metrics=system-health');
      if (!res.ok) throw new Error('Failed to fetch system health');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - near real-time for system health
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading system health...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.data?.systemHealth) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/10">
        <CardContent className="p-6">
          <p className="text-center text-yellow-400">
            System health data unavailable. This may be due to no recent agent executions.
          </p>
        </CardContent>
      </Card>
    );
  }

  const health = data.data.systemHealth;

  const getHealthColorClass = (score: number) => {
    if (score >= 90) return BLOOMBERG_COLORS.success;
    if (score >= 70) return BLOOMBERG_COLORS.info;
    if (score >= 50) return BLOOMBERG_COLORS.warning;
    return BLOOMBERG_COLORS.error;
  };

  return (
    <div className="space-y-0 font-mono">
      {/* Bloomberg Header Bar */}
      <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
        <span className={BLOOMBERG_HEADER.title}>EXECUTION</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>HEALTH:</span>
        {/* 2026-06-12 UX: point-of-use explainers on all chips */}
        <MetricTooltip
          explainer="Execution health: agent success rate (35%) + error rate (25%) + queue health (20%) + template reliability (20%)"
          className={`font-bold ${getHealthColorClass(health.summary.overallHealth)}`}
        >
          {health.summary.overallHealth}
        </MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>SUCCESS:</span>
        <MetricTooltip explainer="Agent executions completed successfully (recent window)" className={BLOOMBERG_COLORS.success}>{health.summary.agentSuccessRate}%</MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>AVG:</span>
        <MetricTooltip explainer="Average agent execution duration" className={BLOOMBERG_COLORS.info}>{Math.round(health.summary.avgExecutionTime / 1000)}s</MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>ACTIVE:</span>
        <MetricTooltip explainer="Executions currently running" className="text-purple-400">{health.summary.activeExecutions}</MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>ERRORS:</span>
        <MetricTooltip explainer="Failed executions as % of total (recent window)" className={health.summary.errorRate > 20 ? BLOOMBERG_COLORS.error : BLOOMBERG_COLORS.warning}>
          {health.summary.errorRate}%
        </MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>QUEUE:</span>
        <MetricTooltip explainer="Queue depth: pending + running executions (red if any stuck >30m)" className={health.queueHealth.stuckExecutions > 0 ? BLOOMBERG_COLORS.error : BLOOMBERG_COLORS.success}>
          {health.queueHealth.queueDepth}
        </MetricTooltip>
      </div>

      {/* Queue Health - Bloomberg Dense Format */}
      <div className="bg-background border border-border mt-4">
        <div className="px-3 py-1.5 bg-muted border-b text-xs">
          <span className="text-amber-400 font-bold">QUEUE HEALTH</span>
        </div>
        <div className="divide-y divide-border">
          <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors">
            <span className={BLOOMBERG_COLORS.muted}>Pending</span>
            <span className={`${BLOOMBERG_COLORS.warning} font-mono`}>{health.queueHealth.pendingExecutions}</span>
          </div>
          <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors bg-muted/30">
            <span className={BLOOMBERG_COLORS.muted}>Running</span>
            <span className={`${BLOOMBERG_COLORS.info} font-mono`}>{health.queueHealth.runningExecutions}</span>
          </div>
          <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors">
            <span className={BLOOMBERG_COLORS.muted}>Stuck (&gt;30m)</span>
            <span className={`font-mono ${health.queueHealth.stuckExecutions > 0 ? BLOOMBERG_COLORS.error : BLOOMBERG_COLORS.success}`}>
              {health.queueHealth.stuckExecutions}
            </span>
          </div>
          <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors bg-muted/30">
            <span className={BLOOMBERG_COLORS.muted}>Avg Wait</span>
            <span className={`${BLOOMBERG_COLORS.neutral} font-mono`}>{health.queueHealth.avgWaitTime}s</span>
          </div>
        </div>
      </div>

      {/* Tool Health & Template Health Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tool Health */}
        {health.toolHealth.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className={`h-4 w-4 ${BLOOMBERG_COLORS.warning}`} />
                Tool Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {health.toolHealth.slice(0, 8).map((tool, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedTool(tool)}
                    className="w-full flex items-center justify-between p-2 -mx-2 rounded hover:bg-muted/50 transition-colors cursor-pointer text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate flex items-center gap-1">
                        {tool.toolName}
                        {tool.errorRate > 10 && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tool.totalExecutions} executions • {tool.avgDuration}ms avg
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tool.trend === 'improving' && <TrendingUp className={`h-3 w-3 ${BLOOMBERG_COLORS.success}`} />}
                      {tool.trend === 'declining' && <TrendingDown className={`h-3 w-3 ${BLOOMBERG_COLORS.error}`} />}
                      <Badge
                        variant={tool.errorRate > 30 ? 'destructive' : tool.errorRate > 10 ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {tool.errorRate}% error
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Template Health */}
        {health.templateHealth.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-purple-400" />
                Template Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {health.templateHealth.slice(0, 8).map((template, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{template.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {template.totalExecutions} runs • {Math.round(template.avgDuration / 1000)}s avg
                      </div>
                    </div>
                    <Badge
                      variant={template.successRate >= 80 ? 'secondary' : template.successRate >= 60 ? 'default' : 'destructive'}
                      className={`text-xs ${template.successRate >= 80 ? `bg-green-500/10 ${BLOOMBERG_COLORS.success}` : ''}`}
                    >
                      {template.successRate}% success
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* System Recommendations */}
      {health.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              System Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {health.recommendations.slice(0, 5).map((rec, idx) => (
                <div key={idx} className={`p-3 rounded border-l-4 ${
                  rec.priority === 'critical' ? 'border-red-500 bg-red-500/10' :
                  rec.priority === 'high' ? 'border-orange-500 bg-orange-500/10' :
                  rec.priority === 'medium' ? 'border-yellow-500 bg-yellow-500/10' :
                  'border-gray-500/30 bg-gray-500/10'
                }`}>
                  <div className="flex items-start gap-2">
                    <Badge
                      variant={rec.priority === 'critical' || rec.priority === 'high' ? 'destructive' : 'default'}
                      className="text-xs uppercase"
                    >
                      {rec.priority}
                    </Badge>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{rec.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{rec.description}</div>
                      <div className={`text-xs ${BLOOMBERG_COLORS.info} mt-2`}>{rec.suggestion}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insights */}
      {health.insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className={`h-4 w-4 ${BLOOMBERG_COLORS.accent}`} />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {health.insights.slice(0, 6).map((insight, idx) => (
                <div key={idx} className={`p-3 rounded ${
                  insight.type === 'positive' ? 'bg-green-500/10' :
                  insight.type === 'concern' ? 'bg-red-500/10' :
                  'bg-muted/30'
                }`}>
                  <div className="flex items-center gap-2">
                    {insight.type === 'positive' && <CheckCircle2 className={`h-4 w-4 ${BLOOMBERG_COLORS.success}`} />}
                    {insight.type === 'concern' && <AlertTriangle className={`h-4 w-4 ${BLOOMBERG_COLORS.error}`} />}
                    {insight.type === 'neutral' && <Activity className={`h-4 w-4 ${BLOOMBERG_COLORS.neutral}`} />}
                    <span className="font-medium text-sm">{insight.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{insight.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tool Error Drill-Down Modal */}
      <ToolErrorDrillDownModal
        tool={selectedTool}
        open={selectedTool !== null}
        onClose={() => setSelectedTool(null)}
      />
    </div>
  );
}

/**
 * Infrastructure Status Section Component
 * Consolidated from MCPIntelligenceStatus (deleted 2026-06-12) - MCP Server connectivity and tool registration
 *
 * This answers: "Are the MCP servers running?"
 * - Server connectivity (embedded, external)
 * - Tool registration counts
 * - Response time estimates
 * - Server-level recommendations
 */
export function InfrastructureStatusSection() {
  const { data, isLoading, error, refetch } = useQuery<MCPInfrastructureResponse>({
    queryKey: ['mcp-infrastructure-status'],
    queryFn: async () => {
      const res = await fetch('/api/mcp/status');
      if (!res.ok) throw new Error('Failed to fetch MCP status');
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds - near real-time for infrastructure
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Checking infrastructure status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.success || !data?.data) {
    return (
      <Card className="border-red-500/30 bg-red-500/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400">
              <XCircle className="h-5 w-5" />
              <span>Unable to connect to MCP infrastructure</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const infra = data.data;

  const getHealthColorClass = (score: number) => {
    if (score >= 90) return BLOOMBERG_COLORS.success;
    if (score >= 70) return BLOOMBERG_COLORS.info;
    if (score >= 50) return BLOOMBERG_COLORS.warning;
    return BLOOMBERG_COLORS.error;
  };

  const getStatusBadge = (connected: boolean, status: string) => {
    if (connected) {
      return (
        <Badge className={`${BLOOMBERG_COLORS.success.replace('text-', 'bg-').replace('-400', '-500/20')} ${BLOOMBERG_COLORS.success}`}>
          <CheckCircle className="h-3 w-3 mr-1" />
          {status}
        </Badge>
      );
    }
    return (
      <Badge className={`${BLOOMBERG_COLORS.error.replace('text-', 'bg-').replace('-400', '-500/20')} ${BLOOMBERG_COLORS.error}`}>
        <XCircle className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-0 font-mono">
      {/* Bloomberg Header Bar */}
      <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
        <span className={BLOOMBERG_HEADER.title}>INFRASTRUCTURE</span>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>HEALTH:</span>
        {/* 2026-06-12 UX: point-of-use explainers on all chips */}
        <MetricTooltip
          explainer="Liveness score: 25 points each for embedded server connected, external server connected, any active tools, and catalog >5 tools"
          className={`font-bold ${getHealthColorClass(infra.systemHealth.score)}`}
        >
          {infra.systemHealth.score}%
        </MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>SERVERS:</span>
        <MetricTooltip explainer="MCP servers connected / total (embedded + external)" className={BLOOMBERG_COLORS.info}>{infra.servers.connected}/{infra.servers.total}</MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        <span className={BLOOMBERG_HEADER.metric}>TOOLS:</span>
        <MetricTooltip explainer="Active MCP tools across connected servers" className={BLOOMBERG_COLORS.success}>{infra.tools.active}</MetricTooltip>
        <span className={BLOOMBERG_HEADER.separator}>|</span>
        {/* Was "WS:" — read as WebSockets; it's workflow throughput */}
        <span className={BLOOMBERG_HEADER.metric}>WF/HR:</span>
        <MetricTooltip explainer="Workflow executions started in the last hour" className="text-purple-400">{infra.performance.system.throughput.split(' ')[0]}</MetricTooltip>
        <div className="flex-1"></div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-amber-400 hover:text-amber-300 h-6 px-2"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Server Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Embedded Server */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className={`h-4 w-4 ${BLOOMBERG_COLORS.info}`} />
                {infra.servers.embedded.name}
              </CardTitle>
              {getStatusBadge(infra.servers.embedded.connected, infra.servers.embedded.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tools:</span>
                <span className="font-medium">{infra.servers.embedded.toolCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <MetricTooltip className="text-muted-foreground" explainer="Measured: average MCP interaction execution time over the last 24h (was a fabricated static value until 2026-06-12)">Response Time:</MetricTooltip>
                <span className="font-medium">{infra.servers.embedded.health?.responseTime || 'N/A'}</span>
              </div>
              {infra.servers.embedded.capabilities && (
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1">Capabilities:</div>
                  <div className="flex flex-wrap gap-1">
                    {infra.servers.embedded.capabilities.slice(0, 4).map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* External Server */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-purple-400" />
                {infra.servers.external.name}
              </CardTitle>
              {getStatusBadge(infra.servers.external.connected, infra.servers.external.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tools:</span>
                <span className="font-medium">{infra.servers.external.toolCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <MetricTooltip className="text-muted-foreground" explainer="Measured: average MCP interaction execution time over the last 24h (was a fabricated static value until 2026-06-12)">Response Time:</MetricTooltip>
                <span className="font-medium">{infra.servers.external.health?.responseTime || 'N/A'}</span>
              </div>
              {infra.servers.external.capabilities && (
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1">Capabilities:</div>
                  <div className="flex flex-wrap gap-1">
                    {infra.servers.external.capabilities.slice(0, 4).map((cap) => (
                      <Badge key={cap} variant="outline" className="text-xs">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Infrastructure Recommendations */}
      {infra.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              Server Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {infra.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded border-l-4 ${
                    rec.type === 'CRITICAL' ? 'border-destructive bg-destructive/10' :
                    rec.type === 'WARNING' ? 'border-warning bg-warning/10' :
                    rec.type === 'SUCCESS' ? 'border-success bg-success/10' :
                    'border-primary bg-primary/10'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {rec.type === 'CRITICAL' && <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
                    {rec.type === 'WARNING' && <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />}
                    {rec.type === 'SUCCESS' && <CheckCircle className="h-4 w-4 text-success mt-0.5" />}
                    <div className="flex-1">
                      <div className="font-medium text-sm">{rec.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{rec.description}</div>
                      {rec.action && (
                        <div className="text-xs text-primary mt-1 font-mono bg-primary/10 p-1 rounded">
                          {rec.action}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Admin Briefing Card Component
 * Phase 6 of Admin Intelligence Implementation
 *
 * Transforms metrics into narrative "storytelling"
 * Addresses Reed Hastings insight: "interpret the world"
 */
function AdminBriefingCard() {
  // Fetch all data sources for briefing generation
  const portfolioHealth = useQuery<PortfolioHealthResponse>({
    queryKey: ['admin-portfolio-health-briefing'],
    queryFn: async () => {
      const res = await fetch('/api/analytics?domain=admin&metrics=portfolio-health');
      if (!res.ok) throw new Error('Failed to fetch portfolio health');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const systemHealth = useQuery<SystemHealthResponse>({
    queryKey: ['admin-system-health-briefing'],
    queryFn: async () => {
      const res = await fetch('/api/analytics?domain=admin&metrics=system-health');
      if (!res.ok) throw new Error('Failed to fetch system health');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const infrastructure = useQuery<MCPInfrastructureResponse>({
    queryKey: ['mcp-infrastructure-briefing'],
    queryFn: async () => {
      const res = await fetch('/api/mcp/status');
      if (!res.ok) throw new Error('Failed to fetch MCP status');
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  // Generate briefing when all data is available
  const briefing = useMemo<AdminBriefing | null>(() => {
    // Wait for at least portfolio and system health
    if (!portfolioHealth.data?.data?.portfolioHealth || !systemHealth.data?.data?.systemHealth) {
      return null;
    }

    const briefingData: BriefingData = {
      portfolioHealth: {
        summary: portfolioHealth.data.data.portfolioHealth.summary,
        atRiskPOVs: portfolioHealth.data.data.portfolioHealth.atRiskPOVs,
      },
      systemHealth: {
        summary: systemHealth.data.data.systemHealth.summary,
        queueHealth: systemHealth.data.data.systemHealth.queueHealth,
        toolHealth: systemHealth.data.data.systemHealth.toolHealth,
      },
    };

    // Add infrastructure if available
    if (infrastructure.data?.success && infrastructure.data?.data) {
      briefingData.infrastructure = {
        systemHealth: infrastructure.data.data.systemHealth,
        servers: infrastructure.data.data.servers,
      };
    }

    return generateAdminBriefing(briefingData);
  }, [portfolioHealth.data, systemHealth.data, infrastructure.data]);

  // Loading state
  const isLoading = portfolioHealth.isLoading || systemHealth.isLoading;
  if (isLoading) {
    return (
      <Card className="border-l-4 border-l-gray-300">
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Generating briefing...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error or no data state
  if (!briefing) {
    return (
      <Card className="border-l-4 border-l-gray-300">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            Unable to generate briefing. Data sources unavailable.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sentimentConfig = getBriefingSentimentConfig(briefing.sentiment);

  return (
    <Card className={`border-l-4 ${sentimentConfig.borderColor} ${sentimentConfig.bgColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className={`h-5 w-5 ${sentimentConfig.iconColor}`} />
            Today&apos;s Briefing
          </CardTitle>
          <Badge variant={sentimentConfig.badgeVariant}>
            {briefing.sentiment === 'positive' && 'All Good'}
            {briefing.sentiment === 'attention' && 'Needs Attention'}
            {briefing.sentiment === 'critical' && 'Critical'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground mb-4 leading-relaxed">
          {briefing.summary}
        </p>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Recommended focus:</span>
          <span className="text-primary">{briefing.focus}</span>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Generated {briefing.generatedAt.toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Phase Bottleneck Drill-Down Modal
 * Phase 8: Shows POVs stuck in a specific phase
 */
function BottleneckDrillDownModal({
  bottleneck,
  open,
  onClose
}: {
  bottleneck: PhaseBottleneck | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!bottleneck) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className={`h-5 w-5 ${BLOOMBERG_COLORS.warning}`} />
            POVs Stuck in &quot;{bottleneck.phaseName}&quot;
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <Badge variant="outline">{bottleneck.povCount} POVs affected</Badge>
            <Badge variant="outline">{bottleneck.incompleteTasks} incomplete tasks</Badge>
            <Badge variant="outline">Avg {bottleneck.avgDaysStuck} days stuck</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            These POVs have been in the &quot;{bottleneck.phaseName}&quot; phase longer than expected.
            Consider reviewing blockers and reassigning resources.
          </p>
          {/* 2026-06-12 UX: actual affected POVs with links (was a static
              "view the table above" message with nothing actionable) */}
          {(bottleneck.affectedPOVs?.length ?? 0) > 0 ? (
            <div className="border-t pt-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Worst affected (top {bottleneck.affectedPOVs!.length} of {bottleneck.povCount}):
              </p>
              {bottleneck.affectedPOVs!.map((pov) => (
                <Link
                  key={pov.id}
                  href={`/pov/view/${pov.id}`}
                  className="flex items-center justify-between px-3 py-2 rounded border hover:bg-accent transition-colors text-sm"
                >
                  <span className="truncate mr-4">{pov.title}</span>
                  <span className={`font-mono text-xs whitespace-nowrap ${pov.daysStuck >= 90 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {pov.daysStuck}d stuck
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-2">
                View affected POVs in the At-Risk table above, or navigate to individual POVs for details.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tool Error Drill-Down Modal
 * Phase 8: Shows recent errors for a specific tool
 */
function ToolErrorDrillDownModal({
  tool,
  open,
  onClose
}: {
  tool: ToolHealth | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!tool) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className={`h-5 w-5 ${BLOOMBERG_COLORS.warning}`} />
            Tool Errors: {tool.toolName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <Badge variant={tool.errorRate > 30 ? 'destructive' : 'outline'}>
              {tool.errorRate}% error rate
            </Badge>
            <Badge variant="outline">{tool.totalExecutions} total executions</Badge>
            <Badge variant="outline">{tool.errorCount} errors</Badge>
          </div>

          {tool.recentErrors && tool.recentErrors.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Recent Errors</h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {tool.recentErrors.map((error, idx) => (
                  <div key={idx} className="text-xs bg-red-500/10 p-2 rounded border border-red-500/30">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recent error messages available. Check execution logs for more details.
            </p>
          )}

          <div className="border-t pt-4 text-sm text-muted-foreground">
            <p>
              <strong>Suggestions:</strong> Review API rate limits, check connection stability,
              and consider implementing retry logic for this tool.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Admin Recommendations Tab
 * Consolidated Admin Intelligence Dashboard
 *
 * Sections:
 * - Admin Briefing (Phase 6) - Narrative storytelling
 * - Portfolio Health (Phase 2) - Cross-POV aggregation metrics
 * - Portfolio Intelligence (Phase 3) - Pattern-based recommendations
 *
 * Note: Execution Performance moved to Operations tab (ExecutionPerformanceSection)
 * Note: AI-Generated Recommendations moved to Automation tab (IntelligentTaskAutomation)
 */
export function AdminRecommendationsTab() {
  return (
    <div className="space-y-8">
      {/* Portfolio Health Section */}
      <PortfolioHealthSection />

      {/* Recommendations (cards only, no header) */}
      <RecommendationsList />
    </div>
  );
}
