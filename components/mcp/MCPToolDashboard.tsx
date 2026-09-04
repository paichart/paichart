"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';
import { MetricTooltip } from '@/components/ui/MetricTooltip';
import {
  Activity,
  Bot,
  CheckCircle,
  Clock,
  Settings,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  BarChart3,
  Zap,
  Shield,
  Database,
  Loader2,
  XCircle
} from 'lucide-react';

interface MCPTool {
  name: string;
  serverName: string;
  description: string;
  category: string;
  tags: string[];
  inputSchema: any;
  outputSchema?: any;
  performance: {
    averageExecutionTime: number;
    successRate: number;
    totalExecutions: number;
    tokenUsage: {
      averageInputTokens: number;
      averageOutputTokens: number;
      totalTokens: number;
    };
  };
  reliability: {
    uptime: number;
    errorRate: number;
    healthScore: number;
  };
  lastUpdated: Date;
  version: string;
  deprecated: boolean;
}

interface MCPMetrics {
  totalTools: number;
  activeTools: number;
  // 2026-06-12: connected MCP servers (was conflated into activeTools)
  connectedServers?: number;
  totalInteractions: number;
  successRate: number;
  // 2026: success/error computed over RESOLVED interactions; PENDING surfaced separately
  failureRate?: number;
  pendingInteractions?: number;
  avgResponseTime: number;
  trends: {
    toolGrowth: number;
    interactionTrend: number;
    successTrend: number;
    responseTrend: number;
  };
  toolPerformance: Array<{
    toolId: string;
    name: string;
    executions: number;
    successRate: number;
    avgTime: number;
  }>;
  interactionPatterns: Array<{
    hour: number;
    interactions: number;
    successRate: number;
  }>;
  // 2026-06-12: real data replacing hardcoded mocks
  recentActivity?: Array<{
    type: 'interaction' | 'registration';
    label: string;
    timestamp: string | Date;
  }>;
  systemHealth?: {
    overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    processUptimeSeconds: number;
    memoryUsage: number;
    cpuUsage: number;
  };
}

// Relative-time helper for Recent Activity (real timestamps since 2026-06-12)
function timeAgo(ts: string | Date): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface MCPToolDashboardProps {
  mode?: 'overview' | 'detailed' | 'monitoring';
}

export function MCPToolDashboard({ mode = 'overview' }: MCPToolDashboardProps) {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [metrics, setMetrics] = useState<MCPMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Fetch MCP tools and metrics
  useEffect(() => {
    fetchMCPData();
    const interval = setInterval(fetchMCPData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchMCPData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch tools and metrics in parallel
      const [toolsResponse, metricsResponse] = await Promise.all([
        fetch('/api/mcp/tools'),
        fetch('/api/mcp/metrics')
      ]);

      if (!toolsResponse.ok || !metricsResponse.ok) {
        throw new Error('Failed to fetch MCP data');
      }

      const toolsData = await toolsResponse.json();
      const metricsData = await metricsResponse.json();

      setTools(toolsData.data?.tools || []);
      setMetrics(metricsData.data || null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load MCP data');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter tools based on search and filters
  const filteredTools = tools.filter(tool => {
    const matchesSearch = tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tool.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'ACTIVE' && !tool.deprecated) ||
                         (statusFilter === 'INACTIVE' && tool.deprecated);
    const matchesCategory = categoryFilter === 'all' || tool.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Get unique categories for filter
  const categories = Array.from(new Set(tools.map(tool => tool.category)));

  // Get status badge color based on deprecated field
  const getStatusBadgeColor = (deprecated: boolean) => {
    return deprecated
      ? 'bg-gray-500/10 text-gray-400 border-gray-500/30'
      : 'bg-green-500/10 text-green-400 border-green-500/30';
  };
  
  // Get status text
  const getStatusText = (deprecated: boolean) => {
    return deprecated ? 'INACTIVE' : 'ACTIVE';
  };

  // Get status icon based on deprecated field
  const getStatusIcon = (deprecated: boolean) => {
    return deprecated 
      ? <Minus className="h-4 w-4" />
      : <CheckCircle className="h-4 w-4" />;
  };

  // Get trend icon
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className={`h-4 w-4 ${BLOOMBERG_COLORS.success}`} />;
    if (trend < 0) return <TrendingDown className={`h-4 w-4 ${BLOOMBERG_COLORS.error}`} />;
    return <Minus className={`h-4 w-4 ${BLOOMBERG_COLORS.neutral}`} />;
  };

  // Format numbers
  const formatNumber = (num?: number) => {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Format percentage
  const formatPercentage = (num?: number) => `${(num || 0).toFixed(1)}%`;

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms && ms !== 0) return '0ms';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Handle tool actions
  const handleToolConfigure = (tool: MCPTool) => {
    setSelectedTool(tool);
    // TODO: Open configuration modal
  };

  const handleToolTest = async (tool: MCPTool) => {
    try {
      // URL encode the tool ID to handle special characters like ':'
      const toolId = `${tool.serverName}:${tool.name}`;
      const encodedToolId = encodeURIComponent(toolId);
      const response = await fetch(`/api/mcp/tools/${encodedToolId}/test`, {
        method: 'POST'
      });
      
      if (response.ok) {
        // Refresh data to show updated status
        fetchMCPData();
      }
    } catch {
      // Error testing tool
    }
  };

  const handleToolDisable = async (tool: MCPTool) => {
    try {
      const toolId = `${tool.serverName}:${tool.name}`;
      const response = await fetch(`/api/mcp/tools/${toolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INACTIVE' })
      });

      if (response.ok) {
        fetchMCPData();
      }
    } catch {
      // Error disabling tool
    }
  };

  const toggleToolExpanded = (toolKey: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolKey)) {
      newExpanded.delete(toolKey);
    } else {
      newExpanded.add(toolKey);
    }
    setExpandedTools(newExpanded);
  };

  // Discover/Register removed 2026: tools are code-defined/auto-discovered and MCP servers are
  // registered via the registry tool, not here. The old per-tool Register was a prompt()/alert()
  // placeholder ("in production this would be a proper modal"). Refresh covers manual re-fetch.

  if (isLoading && tools.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading MCP services...</span>
      </div>
    );
  }

  return (
    <div className="space-y-0 font-mono">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Bloomberg Header Bar */}
      {metrics && (
        <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
          <span className={BLOOMBERG_HEADER.title}>MCP SERVICES</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          {/* 2026-06-12 UX: ACTIVE was connected-servers/tool-count (apples
              over oranges) — now real ACTIVE-status tools over catalog total.
              All chips carry point-of-use explainers. */}
          <span className={BLOOMBERG_HEADER.metric}>ACTIVE:</span>
          <MetricTooltip explainer="Services with ACTIVE status in the catalog" className={BLOOMBERG_COLORS.success}>{metrics.activeTools}</MetricTooltip>
          <MetricTooltip explainer="Total services in the catalog" className="text-muted-foreground text-[10px]">/{metrics.totalTools}</MetricTooltip>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>INTERACTIONS:</span>
          <MetricTooltip explainer="Service interactions in the last 30 days" className={BLOOMBERG_COLORS.info}>{formatNumber(metrics.totalInteractions)}</MetricTooltip>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>SUCCESS:</span>
          <MetricTooltip explainer="Completed as a share of RESOLVED interactions (completed + failed); excludes pending (last 30 days)" className={BLOOMBERG_COLORS.success}>{formatPercentage(metrics.successRate)}</MetricTooltip>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>PENDING:</span>
          <MetricTooltip explainer="Interactions logged but not resolved to completed/failed (last 30 days)" className="text-muted-foreground">{formatNumber(metrics.pendingInteractions || 0)}</MetricTooltip>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>AVG:</span>
          <MetricTooltip explainer="Average interaction execution time (last 30 days)" className={BLOOMBERG_COLORS.warning}>{formatDuration(metrics.avgResponseTime)}</MetricTooltip>
          <div className="flex-1"></div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchMCPData}
            disabled={isLoading}
            className="text-amber-400 hover:text-amber-300 h-6 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {/* Consolidated Content - All data in one view */}
      <div className="space-y-4">
        {/* MONITORING Section */}
        {metrics && (
          <>
            <div id="tools-monitoring" className={BLOOMBERG_HEADER.container + " flex items-center gap-4 scroll-mt-12"}>
              <span className={BLOOMBERG_HEADER.title}>MONITORING</span>
              <span className={BLOOMBERG_HEADER.separator}>|</span>
              <span className={BLOOMBERG_HEADER.metric}>HEALTH:</span>
              {/* 2026-06-12: was a hardcoded "100%" literal; now the real
                  success-rate-derived status from the API */}
              <span className={
                metrics.systemHealth?.overallStatus === 'healthy' ? BLOOMBERG_COLORS.success :
                metrics.systemHealth?.overallStatus === 'degraded' ? BLOOMBERG_COLORS.warning :
                metrics.systemHealth ? BLOOMBERG_COLORS.error : BLOOMBERG_COLORS.muted
              }>
                {metrics.systemHealth?.overallStatus?.toUpperCase() ?? '—'}
              </span>
              <span className={BLOOMBERG_HEADER.separator}>|</span>
              <span className={BLOOMBERG_HEADER.metric}>CONNECTIONS:</span>
              {/* 2026-06-12: was metrics.activeTools (mislabeled) — now the
                  actual connected-server count */}
              <MetricTooltip explainer="Connected MCP servers" className={BLOOMBERG_COLORS.info}>{metrics.connectedServers ?? 0}</MetricTooltip>
              <span className={BLOOMBERG_HEADER.separator}>|</span>
              <span className={BLOOMBERG_HEADER.metric}>ERRORS:</span>
              {/* True FAILED rate (of resolved interactions). Was 100−successRate, which
                  counted PENDING (logged-not-finalized) as errors → a false ~87%. */}
              <span className={
                (metrics.failureRate ?? 0) >= 20 ? BLOOMBERG_COLORS.error :
                (metrics.failureRate ?? 0) >= 5 ? BLOOMBERG_COLORS.warning :
                BLOOMBERG_COLORS.success
              }>{formatPercentage(metrics.failureRate ?? 0)}</span>
            </div>

            {/* RESOURCE USAGE (process RSS/CPU) removed 2026-06-22 — process telemetry isn't
                meaningful on an MCP services dashboard; it belongs in an ops/infra view. */}

            {/* Recent Activity - real events from the API (2026-06-12: was
                three hardcoded rows with fake "2min/5min/12min ago" times) */}
            <div className="bg-background border border-border">
              <div className="px-3 py-1.5 bg-muted border-b text-xs">
                <span className="text-amber-400 font-bold">RECENT ACTIVITY</span>
              </div>
              <div className="divide-y divide-border">
                {(metrics.recentActivity?.length ?? 0) > 0 ? (
                  metrics.recentActivity!.map((event, idx) => (
                    <div
                      key={`${event.type}-${idx}`}
                      className={
                        "px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-accent transition-colors" +
                        (idx % 2 === 1 ? " bg-muted/30" : "")
                      }
                    >
                      <div className={
                        "w-1.5 h-1.5 rounded-full " +
                        (event.type === 'registration' ? "bg-green-400" : "bg-blue-400")
                      }></div>
                      <span className={BLOOMBERG_COLORS.foreground}>{event.label}</span>
                      <span className={BLOOMBERG_COLORS.muted}>• {timeAgo(event.timestamp)}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-1.5 text-xs">
                    <span className={BLOOMBERG_COLORS.muted}>No recent activity</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* NOTE: Server cards rendered separately in DashboardTabs.tsx between Monitoring and Performance */}

      {/* PERFORMANCE Section */}
      {metrics && (
        <>
          {/* Tool Performance - Dense inline metrics */}
          <div id="tools-performance" className="bg-background border border-border mt-4 scroll-mt-12">
            <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
              <span className="text-amber-400 font-bold">SERVICE PERFORMANCE</span>
              <MetricTooltip explainer="MCP services with interactions in the last 30 days (internal + external), ranked by volume — not the full registry. Success = completed of RESOLVED (completed + failed); pending excluded." className="text-muted-foreground text-[10px]">(30d · top 5 by volume)</MetricTooltip>
            </div>
            <div className="divide-y divide-border">
              {(metrics.toolPerformance || []).slice(0, 5).map((tool, idx) => (
                <div key={tool.toolId} className={`px-3 py-1.5 flex items-center gap-3 text-xs hover:bg-accent transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/30'}`}>
                  <span className={BLOOMBERG_COLORS.foreground + " flex-1"}>{tool.name}</span>
                  <span className={BLOOMBERG_COLORS.muted + " w-24"}>{formatNumber(tool.executions)} exec</span>
                  <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 bg-muted/30 h-2 rounded-sm overflow-hidden">
                      <div className={`h-full ${tool.successRate >= 95 ? 'bg-green-400' : tool.successRate >= 80 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${tool.successRate}%` }} />
                    </div>
                    <span className={`${tool.successRate >= 95 ? BLOOMBERG_COLORS.success : tool.successRate >= 80 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error} font-mono w-12 text-right`}>
                      {formatPercentage(tool.successRate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interaction Patterns Chart */}
          <div id="tools-patterns" className="bg-background border border-border scroll-mt-12">
            <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center gap-2">
              <span className="text-amber-400 font-bold">INTERACTION PATTERNS (24H)</span>
              <MetricTooltip explainer="Service interaction count bucketed by hour-of-day (UTC) over the last 24 hours. Taller bar = more calls in that hour. X-axis = UTC hour 0–23." className="text-muted-foreground text-[10px]">calls per UTC hour</MetricTooltip>
            </div>
            <div className="p-4" style={{ height: '140px' }}>
              {metrics.interactionPatterns && metrics.interactionPatterns.length > 0 ? (
                <svg width="100%" height="100%" className="font-mono">
                  {(() => {
                    const maxInteractions = Math.max(...metrics.interactionPatterns.map(p => p.interactions), 1);
                    const barWidth = 100 / 24; // 24 hours

                    return metrics.interactionPatterns.map((pattern, idx) => {
                      const barHeight = (pattern.interactions / maxInteractions) * 80; // 80% of chart height
                      const x = idx * barWidth;
                      const y = 100 - barHeight;

                      return (
                        <g key={pattern.hour}>
                          {/* Bar */}
                          <rect
                            x={`${x}%`}
                            y={`${y}%`}
                            width={`${barWidth * 0.8}%`}
                            height={`${barHeight}%`}
                            className={pattern.interactions > maxInteractions * 0.7 ? 'fill-blue-400' : 'fill-blue-400/50'}
                          />
                          {/* Hour label (every 4 hours) */}
                          {pattern.hour % 4 === 0 && (
                            <text
                              x={`${x + barWidth / 2}%`}
                              y="98%"
                              textAnchor="middle"
                              className="fill-muted-foreground text-[8px]"
                            >
                              {pattern.hour}
                            </text>
                          )}
                        </g>
                      );
                    });
                  })()}
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  No interaction data available
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* TOOLS Section */}
      <div id="tools-list" className="space-y-4 scroll-mt-12">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search services..."
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
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tools Dense List - Bloomberg Format */}
          <div className="bg-background border border-border divide-y divide-border">
            {filteredTools.map((tool, index) => {
              const toolKey = `${tool.serverName}:${tool.name}`;
              const isExpanded = expandedTools.has(toolKey);
              const categoryAbbr = tool.category.substring(0, 4).toUpperCase();

              return (
                <div key={toolKey} className={`${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                  {/* Main row */}
                  <div className="px-3 py-1.5 flex items-start gap-3 text-xs">
                    {/* Row number */}
                    <span className="text-muted-foreground font-mono w-6">{String(index + 1).padStart(2, '0')}</span>

                    {/* Tool name */}
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground font-bold">{tool.name}</span>
                      <span className="text-muted-foreground ml-2">{tool.description.substring(0, 80)}...</span>
                    </div>

                    {/* Category */}
                    <span className="text-blue-400 w-12">{categoryAbbr}</span>

                    {/* Success rate with inline bar */}
                    <div className="flex items-center gap-2 w-32">
                      <div className="flex-1 bg-muted/30 h-2 rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${tool.performance.successRate >= 95 ? 'bg-green-400' : tool.performance.successRate >= 80 ? 'bg-yellow-400' : 'bg-red-400'}`}
                          style={{ width: `${tool.performance.successRate}%` }}
                        />
                      </div>
                      <span className={`${tool.performance.successRate >= 95 ? BLOOMBERG_COLORS.success : tool.performance.successRate >= 80 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error} font-mono w-12 text-right`}>
                        {formatPercentage(tool.performance.successRate)}
                      </span>
                    </div>

                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleToolExpanded(toolKey)}
                      className="text-amber-400 hover:text-amber-300 transition-colors w-16 text-right"
                    >
                      {isExpanded ? 'HIDE ▲' : 'INFO ▼'}
                    </button>

                    {/* Action buttons */}
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToolTest(tool)}
                        className="h-6 px-2 text-[10px]"
                        title="Test service"
                      >
                        <Zap className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToolConfigure(tool)}
                        className="h-6 px-2 text-[10px]"
                        title="Configure service"
                      >
                        <Settings className="h-3 w-3" />
                      </Button>
                      {!tool.deprecated && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToolDisable(tool)}
                          className="h-6 px-2 text-[10px]"
                          title="Disable service"
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 py-2 border-t border-border bg-muted/50">
                      <div className="ml-10 space-y-2">
                        {/* Full description */}
                        <div className="text-xs text-muted-foreground">
                          {tool.description}
                        </div>

                        {/* Performance metrics grid */}
                        <div className="grid grid-cols-4 gap-4 pt-2 border-t border-border/50">
                          <div>
                            <span className="text-muted-foreground">Response:</span>
                            <span className={`ml-1 ${BLOOMBERG_COLORS.info}`}>{formatDuration(tool.performance.averageExecutionTime)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Executions:</span>
                            <span className="ml-1 text-foreground">{formatNumber(tool.performance.totalExecutions)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Health:</span>
                            <span className={`ml-1 ${tool.reliability.healthScore >= 80 ? BLOOMBERG_COLORS.success : BLOOMBERG_COLORS.warning}`}>
                              {tool.reliability.healthScore}%
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Server:</span>
                            <span className="ml-1 text-foreground">{tool.serverName}</span>
                          </div>
                        </div>

                        {/* Capabilities */}
                        {tool.tags && tool.tags.length > 0 && (
                          <div className="pt-2">
                            <span className="text-muted-foreground">Tags: </span>
                            {tool.tags.slice(0, 5).map((tag, idx) => (
                              <span key={tag} className="text-foreground">
                                {tag}{idx < Math.min(4, tool.tags.length - 1) ? ', ' : ''}
                              </span>
                            ))}
                            {tool.tags.length > 5 && (
                              <span className="text-muted-foreground"> +{tool.tags.length - 5} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredTools.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No services found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all'
                    ? 'Try adjusting your filters to see more services.'
                    : 'No MCP services are registered yet.'}
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={fetchMCPData}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* OLD tabs removed - all content consolidated above */}
    </div>
  );
}
