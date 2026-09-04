"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import {
  Bot,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Download,
  Filter,
  Search,
  Calendar,
  BarChart3,
  Activity,
  Zap,
  FileText,
  Code,
  Database,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Target
} from 'lucide-react';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS, BLOOMBERG_EMPTY } from '@/lib/constants/bloomberg-styles';

interface AgentExecution {
  id: string;
  taskId: string;
  agentTemplateId: string;
  agentName: string;
  agentType: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startedAt: Date;
  startTime?: string; // API returns this field
  completedAt?: Date;
  endTime?: string; // API returns this field
  duration?: number; // milliseconds
  progress: number; // 0-100
  result?: {
    success: boolean;
    output: any;
    artifacts: Array<{
      type: string;
      name: string;
      url: string;
      size: number;
    }>;
    metrics: {
      tokensUsed: number;
      apiCalls: number;
      executionSteps: number;
      errorCount: number;
    };
  };
  error?: {
    message: string;
    code: string;
    stack?: string;
    context?: Record<string, any>;
  };
  logs: Array<string | {
    timestamp: Date;
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    message: string;
    context?: Record<string, any>;
  }>;
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    networkCalls: number;
    cacheHits: number;
  };
  context: {
    userId: string;
    povId?: string;
    phaseId?: string;
    triggerType: 'MANUAL' | 'SCHEDULED' | 'EVENT' | 'API';
    parameters: Record<string, any>;
  };
}

interface AgentExecutionSummary {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  totalTokensUsed: number;
  // token-usage-persistence: real token facts + derived cost (per-POV rolling window; see costCoverage)
  totalCostUsd?: number;
  costCoverage?: number;
  successRate: number;
  trends: {
    executionTrend: number;
    successRateTrend: number;
    performanceTrend: number;
  };
  topAgents: Array<{
    agentName: string;
    executions: number;
    successRate: number;
    avgDuration: number;
  }>;
  recentActivity: Array<{
    date: string;
    executions: number;
    successRate: number;
    avgDuration: number;
  }>;
}

interface AgentHistoryViewProps {
  taskId: string;
  povId?: string;
  onViewExecution: (executionId: string) => void;
  compact?: boolean;
  showFilters?: boolean;
  maxItems?: number;
  dateRange?: string; // External date range control (syncs with analytics page)
}

export const AgentHistoryView: React.FC<AgentHistoryViewProps> = ({
  taskId,
  povId,
  onViewExecution,
  compact = false,
  showFilters = true,
  maxItems = 50,
  dateRange: externalDateRange
}) => {
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [summary, setSummary] = useState<AgentExecutionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<AgentExecution | null>(null);

  // Filters - dateFilter can be controlled externally via dateRange prop
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(externalDateRange || '7d');
  const [searchTerm, setSearchTerm] = useState('');

  // Sync dateFilter when external dateRange prop changes
  useEffect(() => {
    if (externalDateRange) {
      setDateFilter(externalDateRange);
    }
  }, [externalDateRange]);

  // Fetch agent execution history
  const fetchAgentHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        taskId,
        ...(povId && { povId }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(agentFilter !== 'all' && { agentType: agentFilter }),
        dateRange: dateFilter,
        limit: maxItems.toString()
      });

      // Fetch executions and summary in parallel
      // NOTE: Executions kept as operational endpoint (listing/filtering)
      // Summary consolidated to unified analytics endpoint (aggregated stats)
      const [executionsResponse, summaryResponse] = await Promise.all([
        fetch(`/api/agent-executions?${params}`),
        fetch(`/api/analytics?domain=agents&metrics=summary&${params}`)
      ]);

      if (!executionsResponse.ok || !summaryResponse.ok) {
        throw new Error('Failed to fetch agent execution history');
      }

      const [executionsData, summaryData] = await Promise.all([
        executionsResponse.json(),
        summaryResponse.json()
      ]);

      setExecutions(executionsData.data?.executions || []);
      setSummary(summaryData.data?.summary?.summary || null);
    } catch (error) {
      // Could not fetch agent history
      setError(error instanceof Error ? error.message : 'Failed to load agent history');
    } finally {
      setIsLoading(false);
    }
  }, [taskId, povId, statusFilter, agentFilter, dateFilter, maxItems]);

  useEffect(() => {
    fetchAgentHistory();
    const interval = setInterval(fetchAgentHistory, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchAgentHistory]);

  // Filter executions based on search term
  const filteredExecutions = executions.filter(execution => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      // 2026-06-12: optional-chained — these fields were absent from the API
      // until today, so typing in the search box threw on undefined
      (execution.agentName || '').toLowerCase().includes(searchLower) ||
      (execution.agentType || '').toLowerCase().includes(searchLower) ||
      execution.id.toLowerCase().includes(searchLower) ||
      (execution.error?.message || '').toLowerCase().includes(searchLower)
    );
  });

  // Get unique agent types for filter
  const agentTypes = Array.from(new Set(executions.map(exec => exec.agentType))).filter(Boolean);

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return `bg-green-500/10 ${BLOOMBERG_COLORS.success} border-green-500/30`;
      case 'RUNNING':
        return `bg-blue-500/10 ${BLOOMBERG_COLORS.info} border-blue-500/30`;
      case 'PENDING':
        return `bg-yellow-500/10 ${BLOOMBERG_COLORS.warning} border-yellow-500/30`;
      case 'FAILED':
        return `bg-red-500/10 ${BLOOMBERG_COLORS.error} border-red-500/30`;
      case 'CANCELLED':
        return `bg-gray-500/10 ${BLOOMBERG_COLORS.neutral} border-gray-500/30`;
      case 'TIMEOUT':
        return `bg-orange-500/10 text-orange-400 border-orange-500/30`;
      default:
        return `bg-gray-500/10 ${BLOOMBERG_COLORS.neutral} border-gray-500/30`;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4" />;
      case 'RUNNING':
        return <Play className="h-4 w-4" />;
      case 'PENDING':
        return <Clock className="h-4 w-4" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4" />;
      case 'CANCELLED':
        return <Pause className="h-4 w-4" />;
      case 'TIMEOUT':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };

  // Format numbers
  const formatNumber = (num?: number) => {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Derived cost (Protocol 10 — computed server-side, priced as-of execution date). Sub-dollar shows
  // cents precision; larger totals round to cents. Coverage <100% ⇒ some in-window rows are pre-Phase-1
  // (null tokens) or on unpriceable models — the number is a floor, not an all-time total.
  const formatCurrency = (usd?: number) => {
    if (!usd && usd !== 0) return '$0';
    if (usd > 0 && usd < 1) return `$${usd.toFixed(usd < 0.01 ? 4 : 2)}`;
    return `$${usd.toFixed(2)}`;
  };

  // Format percentage
  const formatPercentage = (num: number) => `${num.toFixed(1)}%`;

  // Get trend icon
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className={`h-4 w-4 ${BLOOMBERG_COLORS.success}`} />;
    if (trend < 0) return <TrendingDown className={`h-4 w-4 ${BLOOMBERG_COLORS.error}`} />;
    return <div className="h-4 w-4" />;
  };

  // Handle execution actions
  const handleRetryExecution = async (execution: AgentExecution) => {
    try {
      const response = await fetch(`/api/agent-executions/${execution.id}/retry`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchAgentHistory();
      }
    } catch (error) {
      // Could not retry execution
    }
  };

  const handleCancelExecution = async (execution: AgentExecution) => {
    try {
      const response = await fetch(`/api/agent-executions/${execution.id}/cancel`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchAgentHistory();
      }
    } catch (error) {
      // Could not cancel execution
    }
  };

  const handleDownloadLogs = async (execution: AgentExecution) => {
    try {
      const response = await fetch(`/api/agent-executions/${execution.id}/logs`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agent-logs-${execution.id}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      // Could not download logs
    }
  };

  if (isLoading && executions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading agent execution history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-0 font-mono">
      {/* Header */}
      {/* Title removed — redundant under the page PageHeader + tab; keep the Refresh control, right-aligned */}
      {!compact && (
        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchAgentHistory}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Bloomberg Header Bar */}
      {summary && !compact && (
        <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
          <span className={BLOOMBERG_HEADER.title}>AGENT EXECUTIONS</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>TOTAL:</span>
          <span className={BLOOMBERG_COLORS.info}>{summary.totalExecutions}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>SUCCESS:</span>
          <span className={`font-bold ${summary.successRate >= 80 ? BLOOMBERG_COLORS.success : summary.successRate >= 60 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error}`}>
            {formatPercentage(summary.successRate)}
          </span>
          <span className="text-muted-foreground text-[10px]">({summary.successfulExecutions} ok)</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>AVG:</span>
          <span className={BLOOMBERG_COLORS.warning}>{formatDuration(summary.averageDuration)}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>TOKENS:</span>
          <span className="text-purple-400">{formatNumber(summary?.totalTokensUsed || 0)}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>COST:</span>
          <span
            className="text-green-400"
            title={
              summary?.costCoverage != null && summary.costCoverage < 1
                ? `Floor — ${Math.round(summary.costCoverage * 100)}% of in-window executions carry token data (pre-2026-07-02 rows are unpriced). Derived from token usage, priced as-of each run.`
                : 'Derived from token usage, priced as-of each run.'
            }
          >
            {formatCurrency(summary?.totalCostUsd || 0)}
          </span>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="executions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="executions">Execution History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="agents">Top Agents</TabsTrigger>
        </TabsList>

        {/* Executions Tab */}
        <TabsContent value="executions" className="space-y-4">
          {/* Filters */}
          {showFilters && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filter Executions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search executions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                      <SelectItem value="RUNNING">Running</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      <SelectItem value="TIMEOUT">Timeout</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Filter by agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {agentTypes.map((type, index) => (
                        <SelectItem key={`agent-type-${index}-${type}`} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1d">Last day</SelectItem>
                      <SelectItem value="7d">Last week</SelectItem>
                      <SelectItem value="30d">Last month</SelectItem>
                      <SelectItem value="90d">Last 3 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Execution List — P2 decision-matrix verdict (2026-06-12): cards
              are CORRECT here — complex nested data (status, prompt, result,
              tokens, duration, artifacts, expandable detail), not a plain
              item list. Specialist-validated Dec 2025; do not flatten. */}
          <div className="space-y-4">
            {filteredExecutions.map((execution) => (
              <Card key={execution.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getStatusBadgeColor(execution.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(execution.status)}
                            <span>{execution.status}</span>
                          </div>
                        </Badge>
                        <Badge variant="outline">{execution.agentType}</Badge>
                        {execution.duration && (
                          <Badge variant="secondary">
                            {formatDuration(execution.duration)}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg">{execution.agentName}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Started: {(execution.startedAt || execution.startTime) ? 
                          new Date(execution.startedAt || execution.startTime).toLocaleString() : 'Unknown'}
                        {(execution.completedAt || execution.endTime) && (
                          <> • Completed: {new Date(execution.completedAt || execution.endTime!).toLocaleString()}</>
                        )}
                      </p>
                      
                      {/* Task and User Context */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(execution as any).pov && (
                          <Badge variant="outline" className="text-xs">
                            POV: {(execution as any).pov.title}
                          </Badge>
                        )}
                        {(execution as any).task && (
                          <Badge variant="outline" className="text-xs">
                            Task: {(execution as any).task.title}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          TaskID: {execution.taskId}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress Bar for Running Executions.
                      2026-06-12: progress was a phantom field (undefined%) —
                      now an API-provided elapsed-time estimate, labeled. */}
                  {execution.status === 'RUNNING' && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span title="Estimated from elapsed time (assumes ~30 min typical run)">{execution.progress ?? 0}% (est.)</span>
                      </div>
                      <Progress value={execution.progress ?? 0} className="h-2" />
                    </div>
                  )}

                  {/* Execution Metrics */}
                  {execution.result && execution.result.metrics && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Tokens Used</p>
                        <p className="font-medium">{formatNumber(execution.result.metrics.tokensUsed || 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">API Calls</p>
                        <p className="font-medium">{execution.result.metrics.apiCalls || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Steps</p>
                        <p className="font-medium">{execution.result.metrics.executionSteps || 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Errors</p>
                        <p className="font-medium">{execution.result.metrics.errorCount || 0}</p>
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {execution.error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className={`text-sm font-medium ${BLOOMBERG_COLORS.error} mb-1`}>Error:</p>
                      <p className={`text-sm ${BLOOMBERG_COLORS.error}`}>{execution.error.message}</p>
                      {execution.error.code && (
                        <p className={`text-xs ${BLOOMBERG_COLORS.error} mt-1`}>Code: {execution.error.code}</p>
                      )}
                    </div>
                  )}

                  {/* Artifacts */}
                  {execution.result?.artifacts && execution.result.artifacts.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Generated Artifacts:</p>
                      <div className="flex flex-wrap gap-2">
                        {execution.result.artifacts.map((artifact, index) => (
                          <Badge key={index} variant="outline" className="cursor-pointer">
                            <FileText className="h-3 w-3 mr-1" />
                            {artifact.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setSelectedExecution(execution)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Execution Details - {execution.agentName}</DialogTitle>
                          <DialogDescription>
                            View detailed information about this agent execution including performance metrics, logs, and context parameters.
                          </DialogDescription>
                        </DialogHeader>
                        {selectedExecution && (
                          <div className="space-y-4">
                            {/* Execution Info */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="font-medium">Execution ID</p>
                                <p className="text-muted-foreground font-mono">{selectedExecution.id}</p>
                              </div>
                              <div>
                                <p className="font-medium">Agent Template</p>
                                <p className="text-muted-foreground">{selectedExecution.agentTemplateId}</p>
                              </div>
                              <div>
                                <p className="font-medium">Trigger Type</p>
                                <p className="text-muted-foreground">{selectedExecution.context?.triggerType || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="font-medium">Duration</p>
                                <p className="text-muted-foreground">
                                  {selectedExecution.duration ? formatDuration(selectedExecution.duration) : 'N/A'}
                                </p>
                              </div>
                            </div>

                            {/* Performance Metrics */}
                            {selectedExecution.performance && (
                              <div>
                                <h4 className="font-medium mb-2">Performance Metrics</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-muted-foreground">CPU Usage</p>
                                    <p className="font-medium">{selectedExecution.performance?.cpuUsage?.toFixed(1) || '0'}%</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Memory Usage</p>
                                    <p className="font-medium">{selectedExecution.performance?.memoryUsage?.toFixed(1) || '0'} MB</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Network Calls</p>
                                    <p className="font-medium">{selectedExecution.performance?.networkCalls || 0}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Cache Hits</p>
                                    <p className="font-medium">{selectedExecution.performance?.cacheHits || 0}</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Execution Logs */}
                            <div>
                              <h4 className="font-medium mb-2">Execution Logs</h4>
                              <div className="max-h-64 overflow-y-auto bg-muted p-3 rounded-lg">
                                {selectedExecution.logs && selectedExecution.logs.length > 0 ? (
                                  selectedExecution.logs.map((log, index) => (
                                    <div key={index} className="text-xs mb-1">
                                      <span className="text-muted-foreground">
                                        {selectedExecution.startTime ? new Date(selectedExecution.startTime).toLocaleTimeString() : 
                                         selectedExecution.startedAt ? new Date(selectedExecution.startedAt).toLocaleTimeString() : 
                                         'N/A'}
                                      </span>
                                      <span className="ml-2 font-medium text-primary">
                                        [INFO]
                                      </span>
                                      <span className="ml-2 text-foreground">
                                        {typeof log === 'string' ? log : log.message || 'No message'}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-muted-foreground">No logs available</div>
                                )}
                              </div>
                            </div>

                            {/* Context Parameters */}
                            {selectedExecution.context?.parameters && Object.keys(selectedExecution.context.parameters).length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2">Context Parameters</h4>
                                <div className="bg-gray-50 p-3 rounded-lg">
                                  <pre className="text-xs overflow-x-auto">
                                    {JSON.stringify(selectedExecution.context.parameters, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>

                    {execution.status === 'FAILED' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleRetryExecution(execution)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                    )}

                    {execution.status === 'RUNNING' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleCancelExecution(execution)}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Cancel
                      </Button>
                    )}

                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleDownloadLogs(execution)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Logs
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {filteredExecutions.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No executions found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== 'all' || agentFilter !== 'all'
                    ? 'Try adjusting your filters to see more executions.'
                    : 'Agent executions will appear here once agents start running.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Activity Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {summary.recentActivity.map((activity, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{activity.date}</span>
                          <span className="text-sm text-muted-foreground">
                            {activity.executions} executions
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Executions</p>
                            <Progress value={(activity.executions / Math.max(...summary.recentActivity.map(a => a.executions))) * 100} className="h-1" />
                          </div>
                          <div>
                            <p className="text-muted-foreground">Success Rate</p>
                            <Progress value={activity.successRate} className="h-1" />
                          </div>
                          <div>
                            <p className="text-muted-foreground">Avg Duration</p>
                            <p className="font-medium">{formatDuration(activity.avgDuration)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Performance Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Performance Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Execution Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(summary.trends.executionTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.executionTrend > 0 ? '+' : ''}{summary.trends.executionTrend}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Success Rate Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(summary.trends.successRateTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.successRateTrend > 0 ? '+' : ''}{formatPercentage(summary.trends.successRateTrend)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Performance Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(-summary.trends.performanceTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.performanceTrend > 0 ? '+' : ''}{formatDuration(summary.trends.performanceTrend)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Top Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {(summary.topAgents || []).map((agent, index) => (
                <Card key={agent.agentName}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{agent.agentName}</CardTitle>
                      <Badge className="bg-blue-100 text-blue-800">
                        #{index + 1}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Agent Metrics */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Executions</p>
                        <p className="font-medium">{agent.executions}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Success Rate</p>
                        <p className="font-medium">{formatPercentage(agent.successRate)}</p>
                      </div>
                    </div>

                    {/* Success Rate Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Success Rate</span>
                        <span>{formatPercentage(agent.successRate)}</span>
                      </div>
                      <Progress value={agent.successRate} className="h-2" />
                    </div>

                    {/* Average Duration */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Avg Duration</span>
                      <span className="font-medium">{formatDuration(agent.avgDuration)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State — P4 2026-06-12: BLOOMBERG_EMPTY pattern (was the
              generic icon-card) */}
          {summary && (summary.topAgents || []).length === 0 && (
            <div className={`${BLOOMBERG_EMPTY.container} border border-border bg-background`}>
              <p className={BLOOMBERG_EMPTY.message}>No agent executions in this window</p>
              <p className={BLOOMBERG_EMPTY.hint}>Top agents rank by success rate and volume once executions complete</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
