"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/lib/hooks/useToast';
import { ToastAction } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';
import { MetricTooltip } from '@/components/ui/MetricTooltip';
import { 
  Brain, 
  Zap,
  CheckCircle,
  Clock,
  AlertTriangle,
  Play,
  Pause,
  Settings,
  BarChart3,
  Target,
  Lightbulb,
  ArrowRight,
  RefreshCw,
  Loader2,
  Star,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';

// Browser automation - now handled by browser-automation-service (MCP service at port 3100)
// Use services(action: "call", targetService: 'browser-automation-service', method: 'scrape_page', {...}) via Hub orchestration

interface MCPRecommendation {
  id: string;
  type: 'OPTIMIZATION' | 'AUTOMATION' | 'QUALITY_IMPROVEMENT' | 'RISK_MITIGATION' | 'PERFORMANCE_ENHANCEMENT' | 'COST_REDUCTION';
  title: string;
  description: string;
  confidence: number; // 0-100
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'REVIEWED' | 'APPROVED' | 'IMPLEMENTED' | 'REJECTED' | 'EXPIRED';
  taskId?: string;
  povId?: string;
  actions: Array<Record<string, any>>; // WorkflowStep[] or legacy format
  expectedBenefits: string[];
  estimatedTimeSavings: number; // minutes
  estimatedCostSavings: number; // percentage
  source?: 'data-driven' | 'service-template';
  createdAt: Date;
  implementedAt?: Date;
  feedback?: {
    rating: number;
    comment: string;
    userId: string;
  };
}

interface PreviewAction {
  type: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresApproval: boolean;
}

interface PreviewResult {
  recommendationId: string;
  title: string;
  actions: PreviewAction[];
  overallRisk: string;
  summary: string;
  counts: { total: number; LOW: number; MEDIUM: number; HIGH: number };
  expectedBenefits: string[];
  estimatedTimeSavings: number;
  estimatedCostSavings: number;
}

interface ActiveAutomation {
  id: string;
  name: string;
  type: 'WORKFLOW' | 'TASK_ASSIGNMENT' | 'STATUS_UPDATE' | 'NOTIFICATION' | 'ANALYSIS';
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  taskId?: string;
  povId?: string;
  progress: number; // 0-100
  startedAt: Date;
  estimatedCompletion?: Date;
  performance: {
    successRate: number;
    averageTime: number;
    totalExecutions: number;
  };
  lastExecution?: {
    timestamp: Date;
    status: 'SUCCESS' | 'FAILED';
    duration: number;
    result?: any;
  };
}

interface AutomationMetrics {
  totalRecommendations: number;
  implementedRecommendations: number;
  implementationRate: number;
  totalTimeSaved: number; // minutes
  totalCostSavings: number; // percentage
  activeAutomations: number;
  automationSuccessRate: number;
  trends: {
    recommendationTrend: number;
    implementationTrend: number;
    timeSavingsTrend: number;
    successRateTrend: number;
  };
}

interface IntelligentTaskAutomationProps {
  taskId?: string;
  povId?: string;
  mode?: 'suggestion' | 'automation' | 'monitoring';
  povSelector?: React.ReactNode;
}

export function IntelligentTaskAutomation({
  taskId,
  povId,
  mode = 'suggestion',
  povSelector
}: IntelligentTaskAutomationProps) {
  const [recommendations, setRecommendations] = useState<MCPRecommendation[]>([]);
  const [automations, setAutomations] = useState<ActiveAutomation[]>([]);
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<MCPRecommendation | null>(null);
  const [selectedAutomation, setSelectedAutomation] = useState<ActiveAutomation | null>(null);
  const [automationConfig, setAutomationConfig] = useState<any>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editConfig, setEditConfig] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedRecs, setExpandedRecs] = useState<Set<string>>(new Set());
  const [previewData, setPreviewData] = useState<Record<string, PreviewResult | null>>({});
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
  const [kpiScores, setKpiScores] = useState<Array<{ name: string; current: number; target: number; weight: number; status: string; abbreviation: string }>>([]);

  // Use the proper toast hook
  const { toast } = useToast();
  const router = useRouter();

  // Enhanced error handling with user feedback using proper toast
  const handleApiError = (error: any, operation: string) => {
        
    let errorMessage = 'An unexpected error occurred. Please try again.';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    toast({
      variant: 'destructive',
      title: `${operation} Failed`,
      description: errorMessage,
    });
  };

  const handleApiSuccess = (operation: string, details?: string) => {
    toast({
      variant: 'success',
      title: `${operation} Successful`,
      description: details || `${operation} completed successfully.`,
    });
  };

  // Form input components for configuration editing using themed UI components
  const TimeoutInput = ({ value, onChange, error }: {
    value: number;
    onChange: (value: number) => void;
    error?: string;
  }) => (
    <div className="space-y-2">
      <Label htmlFor="timeout-input" className="text-sm font-medium">
        Timeout (seconds)
      </Label>
      <Input
        id="timeout-input"
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className={error ? 'border-destructive' : ''}
        min="1"
        max="86400"
        placeholder="300"
      />
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground">Recommended: 300-3600 seconds for most tasks</p>
    </div>
  );

  const RetryInput = ({ value, onChange, error }: {
    value: number;
    onChange: (value: number) => void;
    error?: string;
  }) => (
    <div className="space-y-2">
      <Label htmlFor="retry-input" className="text-sm font-medium">
        Max Retries
      </Label>
      <Input
        id="retry-input"
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className={error ? 'border-destructive' : ''}
        min="0"
        max="10"
        placeholder="3"
      />
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      <p className="text-xs text-muted-foreground">0 = no retries, 3 = recommended default</p>
    </div>
  );

  const PrioritySelect = ({ value, onChange }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Priority</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="LOW">Low</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // Phase 2: Simple Resource Management Components
  const MemoryLimitSelect = ({ value, onChange }: {
    value: number;
    onChange: (value: number) => void;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Memory Limit</Label>
      <Select value={value.toString()} onValueChange={(val) => onChange(parseInt(val))}>
        <SelectTrigger>
          <SelectValue placeholder="Select memory limit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="256">256 MB (Light tasks)</SelectItem>
          <SelectItem value="512">512 MB (Standard)</SelectItem>
          <SelectItem value="1024">1 GB (Heavy processing)</SelectItem>
          <SelectItem value="2048">2 GB (Intensive tasks)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const CpuLimitSelect = ({ value, onChange }: {
    value: number;
    onChange: (value: number) => void;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-medium">CPU Cores</Label>
      <Select value={value.toString()} onValueChange={(val) => onChange(parseFloat(val))}>
        <SelectTrigger>
          <SelectValue placeholder="Select CPU limit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.5">0.5 cores (Light tasks)</SelectItem>
          <SelectItem value="1">1 core (Standard)</SelectItem>
          <SelectItem value="2">2 cores (Heavy processing)</SelectItem>
          <SelectItem value="4">4 cores (Intensive tasks)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // Phase 2: Notification Settings Panel
  const NotificationPanel = ({ config, onChange }: {
    config: any;
    onChange: (config: any) => void;
  }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="notify-success"
            checked={config?.onSuccess || false}
            onChange={(e) => onChange({ ...config, onSuccess: e.target.checked })}
            className="rounded border-input"
          />
          <Label htmlFor="notify-success" className="text-sm cursor-pointer">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              Success Notifications
            </div>
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="notify-failure"
            checked={config?.onFailure || false}
            onChange={(e) => onChange({ ...config, onFailure: e.target.checked })}
            className="rounded border-input"
          />
          <Label htmlFor="notify-failure" className="text-sm cursor-pointer">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-400" />
              Failure Notifications
            </div>
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="notify-timeout"
            checked={config?.onTimeout || false}
            onChange={(e) => onChange({ ...config, onTimeout: e.target.checked })}
            className="rounded border-input"
          />
          <Label htmlFor="notify-timeout" className="text-sm cursor-pointer">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-400" />
              Timeout Notifications
            </div>
          </Label>
        </div>
      </div>
      
      <div className="space-y-2">
        <Label className="text-sm font-medium">Recipients</Label>
        <Input
          type="text"
          value={config?.recipients?.join(', ') || ''}
          onChange={(e) => onChange({
            ...config,
            recipients: e.target.value.split(',').map((email: string) => email.trim()).filter(Boolean)
          })}
          placeholder="system@paichart.com, user@example.com"
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Enter email addresses separated by commas
        </p>
      </div>
      
      <div className="space-y-2">
        <Label className="text-sm font-medium">Notification Frequency</Label>
        <Select 
          value={config?.frequency || 'immediate'} 
          onValueChange={(value) => onChange({ ...config, frequency: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="immediate">Immediate</SelectItem>
            <SelectItem value="hourly">Hourly Digest</SelectItem>
            <SelectItem value="daily">Daily Summary</SelectItem>
            <SelectItem value="weekly">Weekly Report</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // Validation function
  const validateConfig = (config: any): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (config.execution) {
      if (config.execution.timeout < 1 || config.execution.timeout > 86400) {
        errors.timeout = 'Timeout must be between 1 second and 24 hours';
      }
      if (config.execution.maxRetries < 0 || config.execution.maxRetries > 10) {
        errors.maxRetries = 'Max retries must be between 0 and 10';
      }
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(config.execution.priority)) {
        errors.priority = 'Priority must be LOW, MEDIUM, or HIGH';
      }
    }

    return errors;
  };

  // Edit mode handlers
  const handleEditMode = () => {
    setIsEditMode(true);
    setEditConfig({ ...automationConfig });
    setValidationErrors({});
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditConfig(null);
    setValidationErrors({});
  };

  const handleSaveConfig = async () => {
    if (!selectedAutomation || !editConfig) return;
    
    setIsSaving(true);
    
    // Validate before saving
    const errors = validateConfig(editConfig);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setIsSaving(false);
      return;
    }

    // Optimistic update
    const originalConfig = { ...automationConfig };
    setAutomationConfig(editConfig);

    try {
      const response = await fetch(`/api/mcp/automations/${selectedAutomation.id}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editConfig)
      });

      if (!response.ok) {
        throw new Error('Failed to save configuration');
      }

      const result = await response.json();
      
      // Success - exit edit mode
      setIsEditMode(false);
      setEditConfig(null);
      setValidationErrors({});
      
      // Show success notification
      handleApiSuccess('Configuration Update', 'Automation settings have been saved successfully.');
      
      // Refresh automation data to get latest state
      fetchAutomationData();
      
    } catch (error) {
      // Rollback optimistic update
      setAutomationConfig(originalConfig);
      
      // Show error notification
      handleApiError(error, 'Configuration Update');
      setValidationErrors({ general: 'Failed to save configuration. Please try again.' });
      
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch automation data
  const fetchAutomationData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (taskId) params.append('taskId', taskId);
      if (povId) params.append('povId', povId);

      // Fetch recommendations, automations, and metrics in parallel
      const [recommendationsResponse, automationsResponse, metricsResponse] = await Promise.all([
        fetch(`/api/mcp/recommendations?${params}`),
        fetch(`/api/mcp/automations?${params}`),
        fetch(`/api/mcp/automation-metrics?${params}`)
      ]);

      if (!recommendationsResponse.ok || !automationsResponse.ok || !metricsResponse.ok) {
        throw new Error('Failed to fetch automation data');
      }

      const [recommendationsData, automationsData, metricsData] = await Promise.all([
        recommendationsResponse.json(),
        automationsResponse.json(),
        metricsResponse.json()
      ]);

      setRecommendations(recommendationsData.data?.recommendations || []);
      setAutomations(automationsData.data?.automations || []);
      setMetrics(metricsData.data || null);

      // Read KPI scores from recommendations response (included in same API call — no separate fetch)
      const rawKpiScores = recommendationsData.data?.kpiScores || [];
      if (rawKpiScores.length > 0) {
        const abbrMap: Record<string, string> = {
          'Task Completion Rate': 'COMP', 'On-Time Delivery': 'TIME', 'Stale Task Ratio': 'STAL',
        };
        const kpis = rawKpiScores.map((kpi: any) => {
          const isLowerBetter = kpi.direction === 'lower_is_better';
          const isOk = isLowerBetter ? kpi.current <= kpi.target : kpi.current >= kpi.target;
          return {
            name: kpi.name || 'Unknown',
            current: kpi.current ?? 0,
            target: kpi.target ?? 0,
            weight: kpi.weight ?? 0,
            status: isOk ? 'success' : 'warning',
            abbreviation: abbrMap[kpi.name] || kpi.name?.substring(0, 4).toUpperCase() || '????',
          };
        });
        setKpiScores(kpis);
      } else {
        setKpiScores([]);
      }
    } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to load automation data');
    } finally {
      setIsLoading(false);
    }
  }, [taskId, povId]);

  useEffect(() => {
    fetchAutomationData();
    // Manual refresh only - no automatic interval
  }, [fetchAutomationData]);

  // Filter recommendations
  const filteredRecommendations = recommendations.filter(rec => {
    const matchesType = filterType === 'all' || rec.type === filterType;
    const matchesStatus = filterStatus === 'all' || rec.status === filterStatus;
    return matchesType && matchesStatus;
  });

  // Get recommendation type color (Bloomberg opacity pattern — P2 2026-06-12)
  const getRecommendationTypeColor = (type: string) => {
    switch (type) {
      case 'OPTIMIZATION':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'AUTOMATION':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'QUALITY_IMPROVEMENT':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'RISK_MITIGATION':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'PERFORMANCE_ENHANCEMENT':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      case 'COST_REDUCTION':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  // Get impact color
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-400';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-400';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-400';
      case 'LOW':
        return 'bg-green-500/10 text-green-400';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  // Get automation status color
  const getAutomationStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'bg-green-500/10 text-green-400';
      case 'PAUSED':
        return 'bg-yellow-500/10 text-yellow-400';
      case 'COMPLETED':
        return 'bg-blue-500/10 text-blue-400';
      case 'FAILED':
        return 'bg-red-500/10 text-red-400';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  // Format numbers
  const formatNumber = (num?: number) => {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Format duration
  const formatDuration = (minutes?: number) => {
    if (!minutes && minutes !== 0) return '0m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Handle recommendation actions
  const [implementingId, setImplementingId] = useState<string | null>(null);
  const handleImplementRecommendation = async (recommendation: MCPRecommendation, riskFilter?: 'LOW' | 'MEDIUM' | 'HIGH') => {
    setImplementingId(recommendation.id);
    try {
      const url = `/api/mcp/recommendations/${recommendation.id}/implement${riskFilter ? `?riskFilter=${riskFilter}` : ''}`;
      const response = await fetch(url, { method: 'POST' });
      const result = await response.json();

      if (response.ok && result.data?.success) {
        const details = result.data.executionDetails;
        const filterLabel = riskFilter ? ` (${riskFilter}-risk only)` : '';
        // Progress-report recs generate analytics viewable on the POV's Analytics tab
        // (/pov/view defaults to it). Offer a direct link so the result isn't invisible.
        const isReport = recommendation.type === 'PERFORMANCE_ENHANCEMENT' && !!recommendation.povId;
        toast({
          title: 'Recommendation Implemented',
          description: `${details.stepsSucceeded}/${details.stepsExecuted} actions executed in ${details.totalTime}ms${filterLabel}${isReport ? ' · report generated' : ''}`,
          action: isReport ? (
            <ToastAction altText="View analytics" onClick={() => router.push(`/pov/view/${recommendation.povId}`)}>
              View analytics →
            </ToastAction>
          ) : undefined,
        });
        fetchAutomationData();
      } else if (response.ok && result.data && !result.data.success) {
        toast({
          title: 'Implementation Partially Failed',
          description: result.data.message || 'Some actions failed',
          variant: 'destructive',
        });
        fetchAutomationData();
      } else {
        const errorMsg = result.error?.message || 'Failed to implement recommendation';
        toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Network error implementing recommendation', variant: 'destructive' });
    } finally {
      setImplementingId(null);
    }
  };

  const handleDismissRecommendation = async (recommendation: MCPRecommendation) => {
    try {
      const response = await fetch(`/api/mcp/recommendations/${recommendation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REJECTED' })
      });

      if (response.ok) {
        fetchAutomationData();
      }
    } catch (error) {
          }
  };

  const handleRecommendationFeedback = async (
    recommendation: MCPRecommendation,
    rating: number,
    comment: string
  ) => {
    try {
      const response = await fetch(`/api/mcp/recommendations/${recommendation.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment })
      });

      if (response.ok) {
        fetchAutomationData();
      }
    } catch (error) {
          }
  };

  const fetchPreview = async (id: string) => {
    if (previewData[id]) return; // Already cached
    setLoadingPreview(id);
    try {
      const res = await fetch(`/api/mcp/recommendations/${id}/preview`);
      if (res.ok) {
        const json = await res.json();
        setPreviewData(prev => ({ ...prev, [id]: json.data }));
      }
    } catch {
      // Preview fetch failed — expanded section will show benefits fallback
    } finally {
      setLoadingPreview(null);
    }
  };

  const toggleRecExpanded = (recId: string) => {
    const newExpanded = new Set(expandedRecs);
    if (newExpanded.has(recId)) {
      newExpanded.delete(recId);
    } else {
      newExpanded.add(recId);
      fetchPreview(recId); // Fetch preview on expand
    }
    setExpandedRecs(newExpanded);
  };

  // Handle automation actions
  const handlePauseAutomation = async (automation: ActiveAutomation) => {
    try {
      const response = await fetch(`/api/mcp/automations/${automation.id}/pause`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchAutomationData();
      }
    } catch (error) {
          }
  };

  const handleResumeAutomation = async (automation: ActiveAutomation) => {
    try {
      const response = await fetch(`/api/mcp/automations/${automation.id}/resume`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchAutomationData();
      }
    } catch (error) {
          }
  };

  // Handle automation configuration
  const handleConfigureAutomation = async (automation: ActiveAutomation) => {
    try {
      setIsConfigLoading(true);
      setSelectedAutomation(automation);
      
      const response = await fetch(`/api/mcp/automations/${automation.id}/configure`);
      
      if (response.ok) {
        const configData = await response.json();
        setAutomationConfig(configData.data);
      } else {
              }
    } catch (error) {
          } finally {
      setIsConfigLoading(false);
    }
  };

  const handleSaveAutomationConfig = async (updates: any) => {
    if (!selectedAutomation) return;
    
    try {
      const response = await fetch(`/api/mcp/automations/${selectedAutomation.id}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        setSelectedAutomation(null);
        setAutomationConfig(null);
        fetchAutomationData();
      }
    } catch (error) {
          }
  };

  if (isLoading && recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading intelligent automation...</span>
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
          <span className={BLOOMBERG_HEADER.title}>AUTOMATION</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>RECS:</span>
          <span className="text-blue-400">{metrics.totalRecommendations}</span>
          <span className="text-muted-foreground text-[10px]">({metrics.implementedRecommendations} impl)</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>TIME:</span>
          <span className="text-green-400">{formatDuration(metrics.totalTimeSaved)}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>ACTIVE:</span>
          <span className="text-purple-400">{metrics.activeAutomations}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>RATE:</span>
          <span className={`font-bold ${(metrics.implementationRate || 0) >= 80 ? 'text-green-400' : (metrics.implementationRate || 0) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
            {(metrics.implementationRate || 0).toFixed(1)}%
          </span>
          <div className="flex-1"></div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAutomationData}
            disabled={isLoading}
            className="text-amber-400 hover:text-amber-300 h-6 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="recommendations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recommendations">AI Recommendations</TabsTrigger>
          <TabsTrigger value="automations">Active Automations</TabsTrigger>
          {/* Browser Automation tab removed 2026-06-12 — vestigial after the
              domain moved to the standalone Docker MCP service (17185e45):
              content was a moved-service notice, a static savings banner, and
              three handler-less buttons. Service remains reachable via Hub
              orchestration (services action:'call' → browser-automation-service). */}
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          {/* Filters + Engine Coverage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filter Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                {povSelector && (
                  <div className="mb-3">
                    {povSelector}
                  </div>
                )}
                <div className="flex gap-4">
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="OPTIMIZATION">Optimization</SelectItem>
                      <SelectItem value="AUTOMATION">Automation</SelectItem>
                      <SelectItem value="QUALITY_IMPROVEMENT">Quality</SelectItem>
                      <SelectItem value="RISK_MITIGATION">Risk Mitigation</SelectItem>
                      <SelectItem value="PERFORMANCE_ENHANCEMENT">Performance</SelectItem>
                      <SelectItem value="COST_REDUCTION">Cost Reduction</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="REVIEWED">Reviewed</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="IMPLEMENTED">Implemented</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Engine Coverage Panel */}
            <div className="bg-background border border-border font-mono text-xs">
              <div className="px-3 py-1.5 border-b border-border bg-muted/30">
                <span className="text-amber-400 font-bold">RECOMMENDATION ENGINE</span>
                <span className="text-muted-foreground ml-2">v1.5</span>
              </div>
              {/* 2026-06-12 UX: column header row — columns were unlabeled
                  (the RISK and count columns were undecipherable) */}
              <div className="px-3 py-1 flex items-center gap-2 border-b border-border bg-muted/20 text-[10px] text-muted-foreground">
                <span className="w-10">TYPE</span>
                <span className="w-36">DETECTS</span>
                <span className="flex-1">TRIGGER</span>
                <MetricTooltip explainer="Risk level of auto-acting on this recommendation type" className="w-12 text-right">RISK</MetricTooltip>
                <span className="w-6 text-right">ST</span>
                <MetricTooltip explainer="Current matching recommendations" className="w-8 text-right">N</MetricTooltip>
              </div>
              <div className="divide-y divide-border/50">
                {[
                  { abbr: 'AUTO', type: 'AUTOMATION', name: 'Stale Tasks', trigger: '7d no update', risk: 'LOW', status: 'active' as const },
                  { abbr: 'QUAL', type: 'QUALITY_IMPROVEMENT', name: 'Unassigned Tasks', trigger: '3d no assignee', risk: 'MEDIUM', status: 'active' as const },
                  { abbr: 'RISK', type: 'RISK_MITIGATION', name: 'Approaching Deadlines', trigger: '3d to due date', risk: 'LOW', status: 'active' as const },
                  { abbr: 'PERF', type: 'PERFORMANCE_ENHANCEMENT', name: 'POV Progress Reports', trigger: '7d no analytics', risk: 'LOW', status: 'active' as const },
                  { abbr: 'OPTM', type: 'OPTIMIZATION', name: 'Phase Transitions', trigger: '>80% complete', risk: 'MEDIUM', status: 'planned' as const },
                  { abbr: 'KPI', type: 'RISK_MITIGATION', name: 'KPI Health Alerts', trigger: 'KPI below target', risk: 'LOW', status: 'active' as const },
                ].map((gen) => {
                  const count = recommendations.filter(r => r.type === gen.type && r.source === 'data-driven').length;
                  const hasResults = count > 0;
                  const statusIndicator = gen.status === 'planned' ? '◌' : hasResults ? '●' : '○';
                  const statusColor = gen.status === 'planned' ? 'text-muted-foreground' : hasResults ? 'text-green-400' : 'text-muted-foreground/50';
                  const riskColor = gen.risk === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400';

                  return (
                    <div key={gen.abbr} className="px-3 py-1 flex items-center gap-2">
                      <MetricTooltip className="text-blue-400 font-bold w-10" explainer={`Recommendation type: ${gen.type.replace(/_/g, ' ').toLowerCase()}`}>{gen.abbr}</MetricTooltip>
                      <span className="text-foreground w-36 truncate">{gen.name}</span>
                      <span className="text-muted-foreground flex-1 truncate">{gen.trigger}</span>
                      <span className={`${riskColor} w-12 text-right`}>{gen.risk}</span>
                      <span className={`${statusColor} w-6 text-right`}>{statusIndicator}</span>
                      <MetricTooltip
                        className={`w-8 text-right ${hasResults ? 'text-amber-400' : 'text-muted-foreground/50'}`}
                        explainer={gen.status === 'planned' ? 'Planned generator — not yet implemented' : `${count} matching recommendation${count === 1 ? '' : 's'} right now`}
                      >
                        {gen.status === 'planned' ? 'P2' : count || '—'}
                      </MetricTooltip>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-1 border-t border-border text-muted-foreground/70 text-[10px]">
                <span className="text-green-400">●</span> Active
                <span className="ml-2">○</span> No matches
                <span className="ml-2">◌</span> Planned
              </div>
            </div>
          </div>

          {/* KPI Scorecard Panel */}
          {kpiScores.length > 0 && (
            <div className="bg-background border border-border font-mono text-xs">
              <div className="px-3 py-1.5 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <span className="text-cyan-400 font-bold">KPI SCORECARD</span>
                  <span className="text-muted-foreground ml-2">
                    {(() => {
                      const totalWeight = kpiScores.reduce((s, k) => s + k.weight, 0);
                      const weightedScore = totalWeight > 0
                        ? Math.round(kpiScores.reduce((s, k) => s + (k.current * k.weight), 0) / totalWeight)
                        : 0;
                      return `${weightedScore}/100`;
                    })()}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-border/50">
                {kpiScores.map((kpi) => {
                  const pct = kpi.target > 0 ? Math.min(100, Math.round((kpi.current / kpi.target) * 100)) : 0;
                  const statusColor = kpi.status === 'success' ? 'text-green-400' : 'text-yellow-400';
                  const barColor = kpi.status === 'success' ? 'bg-green-400' : 'bg-yellow-400';

                  return (
                    <div key={kpi.abbreviation} className="px-3 py-1.5 flex items-center gap-2">
                      <span className="text-cyan-400 font-bold w-10">{kpi.abbreviation}</span>
                      <span className="text-foreground w-36 truncate">{kpi.name}</span>
                      <span className={`${statusColor} w-16 text-right`}>{kpi.current}%</span>
                      <span className="text-muted-foreground w-4 text-center">/</span>
                      <span className="text-muted-foreground w-10">{kpi.target}%</span>
                      {/* Progress bar */}
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`${statusColor} w-4`}>{kpi.status === 'success' ? '✓' : '!'}</span>
                      <span className="text-muted-foreground w-10 text-right">{kpi.weight}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendations List - Bloomberg Dense Format */}
          <div className="bg-background border border-border divide-y divide-border">
            {filteredRecommendations.map((recommendation, index) => {
              const isExpanded = expandedRecs.has(recommendation.id);
              const typeAbbr = (recommendation.type || '').substring(0, 4).toUpperCase();
              const impactColor =
                recommendation.impact === 'CRITICAL' ? 'text-red-400' :
                recommendation.impact === 'HIGH' ? 'text-orange-400' :
                recommendation.impact === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400';

              return (
                <div key={recommendation.id} className={`${index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                  {/* Main row */}
                  <div className="px-3 py-1.5 flex items-start gap-3 text-xs">
                    {/* Row number */}
                    <span className="text-muted-foreground font-mono w-6">{String(index + 1).padStart(2, '0')}</span>

                    {/* Type abbreviated */}
                    <span className="text-blue-400 font-bold w-12">{typeAbbr}</span>

                    {/* Title and description inline */}
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground">{recommendation.title}</span>
                      <span className="text-muted-foreground ml-2">{recommendation.description.substring(0, 80)}...</span>
                    </div>

                    {/* Impact */}
                    <span className={`font-bold ${impactColor} w-12`}>{recommendation.impact.substring(0, 4)}</span>

                    {/* Confidence */}
                    <span className="text-amber-400 w-10 text-right">{recommendation.confidence}%</span>

                    {/* Time */}
                    <span className="text-green-400 w-12 text-right">{formatDuration(recommendation.estimatedTimeSavings)}</span>

                    {/* Cost */}
                    <span className="text-muted-foreground w-10 text-right">{recommendation.estimatedCostSavings}%</span>

                    {/* Actions toggle */}
                    <button
                      onClick={() => toggleRecExpanded(recommendation.id)}
                      className="text-amber-400 hover:text-amber-300 transition-colors w-24 text-right"
                    >
                      {recommendation.expectedBenefits?.length || 0} {isExpanded ? 'HIDE ▲' : 'INFO ▼'}
                    </button>

                    {/* Action buttons */}
                    {recommendation.status === 'PENDING' && recommendation.source === 'data-driven' && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDismissRecommendation(recommendation)}
                          className="h-6 px-2 text-[10px]"
                        >
                          <ThumbsDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {recommendation.status === 'PENDING' && recommendation.source !== 'data-driven' && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono">
                        TEMPLATE
                      </span>
                    )}
                    {recommendation.status === 'IMPLEMENTED' && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-400" />
                        <span className="text-[10px] text-green-400 font-mono">DONE</span>
                      </div>
                    )}
                  </div>

                  {/* Expanded preview/benefits section */}
                  {isExpanded && (
                    <div className="px-3 py-2 border-t border-border bg-muted/50">
                      <div className="ml-20 space-y-1">
                        {/* Preview loading */}
                        {loadingPreview === recommendation.id && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Loading action preview...</span>
                          </div>
                        )}

                        {/* Preview actions panel */}
                        {previewData[recommendation.id] && (
                          <>
                            {/* Context info */}
                            <div className="text-[10px] text-muted-foreground/70 font-mono mb-1.5 flex gap-4">
                              <span>ID: {recommendation.id.slice(0, 12)}...</span>
                              <span>SRC: {recommendation.source || 'unknown'}</span>
                              {recommendation.povId && <span>POV: {recommendation.povId.slice(0, 12)}...</span>}
                              <span>RISK: <span className={
                                previewData[recommendation.id]!.overallRisk === 'HIGH' ? 'text-red-400' :
                                previewData[recommendation.id]!.overallRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'
                              }>{previewData[recommendation.id]!.overallRisk}</span></span>
                            </div>

                            {/* Action list */}
                            <div className="space-y-0.5">
                              {previewData[recommendation.id]!.actions.slice(0, 10).map((action, idx) => {
                                const riskColor = action.riskLevel === 'HIGH' ? 'text-red-400' :
                                  action.riskLevel === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400';
                                return (
                                  <div key={idx} className="text-xs flex items-center gap-2 text-muted-foreground">
                                    <span className="text-muted-foreground/50 w-4 text-right font-mono text-[10px]">{String(idx + 1).padStart(2, '0')}</span>
                                    <span className="flex-1 truncate">{action.description}</span>
                                    <span className={`font-mono text-[10px] ${riskColor}`}>{action.riskLevel}</span>
                                  </div>
                                );
                              })}
                              {previewData[recommendation.id]!.actions.length > 10 && (
                                <div className="text-xs text-muted-foreground pl-6">
                                  ...and {previewData[recommendation.id]!.actions.length - 10} more actions
                                </div>
                              )}
                            </div>

                            {/* Summary + graduated execution */}
                            <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                              <div className="text-xs text-muted-foreground font-mono">
                                {previewData[recommendation.id]!.counts.total} actions:
                                {previewData[recommendation.id]!.counts.LOW > 0 && (
                                  <span className="text-green-400 ml-1">{previewData[recommendation.id]!.counts.LOW} LOW</span>
                                )}
                                {previewData[recommendation.id]!.counts.MEDIUM > 0 && (
                                  <span className="text-yellow-400 ml-1">{previewData[recommendation.id]!.counts.MEDIUM} MED</span>
                                )}
                                {previewData[recommendation.id]!.counts.HIGH > 0 && (
                                  <span className="text-red-400 ml-1">{previewData[recommendation.id]!.counts.HIGH} HIGH</span>
                                )}
                              </div>
                              {recommendation.status === 'PENDING' && recommendation.source === 'data-driven' && (
                                <div className="flex gap-1">
                                  {previewData[recommendation.id]!.counts.LOW > 0 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleImplementRecommendation(recommendation, 'LOW')}
                                      className="h-5 px-2 text-[10px] text-green-400 border-green-400/30"
                                      disabled={!!implementingId}
                                    >
                                      Execute LOW-risk
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => handleImplementRecommendation(recommendation)}
                                    className="h-5 px-2 text-[10px]"
                                    disabled={!!implementingId}
                                  >
                                    Execute All
                                  </Button>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Fallback: benefits (when no preview data and not loading) */}
                        {!previewData[recommendation.id] && loadingPreview !== recommendation.id && (
                          <>
                            {(recommendation.expectedBenefits || []).map((benefit, idx) => (
                              <div key={idx} className="text-xs flex items-start gap-2 text-muted-foreground">
                                <span className="text-green-400 font-mono w-6">{idx + 1})</span>
                                <span className="flex-1">{benefit}</span>
                              </div>
                            ))}
                            <div className="mt-2 pt-2 border-t border-border/50 text-muted-foreground text-xs">
                              <span>Effort: </span>
                              <span className="text-foreground">{recommendation.effort}</span>
                              <span className="ml-4">Status: </span>
                              <span className={
                                recommendation.status === 'IMPLEMENTED' ? 'text-green-400' :
                                recommendation.status === 'PENDING' ? 'text-yellow-400' : 'text-muted-foreground'
                              }>{recommendation.status}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredRecommendations.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Lightbulb className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No recommendations found</h3>
                <p className="text-muted-foreground">
                  {filterType !== 'all' || filterStatus !== 'all'
                    ? 'Try adjusting your filters to see more recommendations.'
                    : 'AI recommendations will appear here as the system analyzes your tasks and workflows.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Automations Tab — P2 decision-matrix verdict (2026-06-12): cards
            are CORRECT here — complex nested data (progress bar, performance
            metrics grid, last-execution detail, controls), not a plain item
            list. Do not flatten. */}
        <TabsContent value="automations" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {automations.map((automation) => (
              <Card key={automation.id} className="bg-card border overflow-hidden">
                {/* Bloomberg-style header bar — aligns with the other dashboard panels */}
                <div className={`${BLOOMBERG_HEADER.container} flex items-center justify-between gap-2 font-mono`}>
                  <span className={`${BLOOMBERG_HEADER.title} truncate`} title={automation.name}>{automation.name}</span>
                  <Badge className={`${getAutomationStatusColor(automation.status)} font-mono text-[10px] shrink-0`}>
                    {automation.status}
                  </Badge>
                </div>
                <CardContent className="space-y-3 font-mono text-xs pt-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {(automation.type || '').replace('_', ' ')}
                  </div>
                  {/* Progress. 2026-06-12: RUNNING progress is an elapsed-time
                      estimate (capped at 90% server-side) — say so. */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <MetricTooltip explainer={automation.status === 'RUNNING' ? 'Estimated from elapsed time (assumes ~30 min typical run)' : undefined}>
                        {automation.progress}%{automation.status === 'RUNNING' ? ' (est.)' : ''}
                      </MetricTooltip>
                    </div>
                    <Progress value={automation.progress} className="h-2" />
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Success</p>
                      <p className="text-foreground">{(automation.performance?.successRate || 0).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Avg Time</p>
                      <p className="text-foreground">{formatDuration(automation.performance?.averageTime)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Execs</p>
                      <p className="text-foreground">{automation.performance?.totalExecutions || 0}</p>
                    </div>
                  </div>

                  {/* Last Execution */}
                  {automation.lastExecution && (
                    <div className="border-t border-border pt-2 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Last Execution</p>
                        <p className="text-muted-foreground">
                          {new Date(automation.lastExecution.timestamp).toLocaleString()} • {formatDuration(automation.lastExecution.duration)}
                        </p>
                      </div>
                      <span className={automation.lastExecution.status === 'SUCCESS' ? BLOOMBERG_COLORS.success : BLOOMBERG_COLORS.error}>
                        {automation.lastExecution.status}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {automation.status === 'RUNNING' ? (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handlePauseAutomation(automation)}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    ) : automation.status === 'PAUSED' ? (
                      <Button 
                        size="sm"
                        onClick={() => handleResumeAutomation(automation)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    ) : null}
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleConfigureAutomation(automation)}
                      disabled={isConfigLoading}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Configure
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {automations.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No active automations</h3>
                <p className="text-muted-foreground">
                  Implement AI recommendations to start automating your workflows.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Configuration Dialog */}
          <Dialog open={!!selectedAutomation} onOpenChange={() => {
            setSelectedAutomation(null);
            setAutomationConfig(null);
          }}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  Configure Automation: {selectedAutomation?.name}
                </DialogTitle>
                <DialogDescription>
                  View and modify automation settings, execution parameters, and notification preferences.
                </DialogDescription>
              </DialogHeader>
              
              {isConfigLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2">Loading configuration...</span>
                </div>
              ) : automationConfig ? (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Automation Type</label>
                      <p className="text-sm text-muted-foreground">{automationConfig.type}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Status</label>
                      <Badge className={getAutomationStatusColor(automationConfig.status)}>
                        {automationConfig.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Execution Configuration */}
                  {automationConfig.execution && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Execution Settings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {isEditMode ? (
                          <div className="grid grid-cols-3 gap-4">
                            <RetryInput
                              value={editConfig?.execution?.maxRetries || 3}
                              onChange={(value) => setEditConfig({
                                ...editConfig,
                                execution: { ...editConfig.execution, maxRetries: value }
                              })}
                              error={validationErrors.maxRetries}
                            />
                            <TimeoutInput
                              value={editConfig?.execution?.timeout || 300}
                              onChange={(value) => setEditConfig({
                                ...editConfig,
                                execution: { ...editConfig.execution, timeout: value }
                              })}
                              error={validationErrors.timeout}
                            />
                            <PrioritySelect
                              value={editConfig?.execution?.priority || 'MEDIUM'}
                              onChange={(value) => setEditConfig({
                                ...editConfig,
                                execution: { ...editConfig.execution, priority: value }
                              })}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-sm font-medium">Max Retries</label>
                              <p className="text-sm text-muted-foreground">{automationConfig.execution.maxRetries}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Timeout</label>
                              <p className="text-sm text-muted-foreground">{automationConfig.execution.timeout}s</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Priority</label>
                              <p className="text-sm text-muted-foreground">{automationConfig.execution.priority}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Agent Configuration */}
                  {automationConfig.agent && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Agent Configuration</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Template</label>
                            <p className="text-sm text-muted-foreground">{automationConfig.agent.templateName}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Category</label>
                            <p className="text-sm text-muted-foreground">{automationConfig.agent.category}</p>
                          </div>
                        </div>
                        
                        {automationConfig.agent.capabilities && Object.keys(automationConfig.agent.capabilities).length > 0 && (
                          <div>
                            <label className="text-sm font-medium">Capabilities</label>
                            <div className="mt-2 p-3 bg-muted/20 rounded-lg">
                              <pre className="text-xs text-muted-foreground overflow-x-auto">
                                {JSON.stringify(automationConfig.agent.capabilities, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Task Configuration */}
                  {automationConfig.task && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Task Configuration</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Task Title</label>
                          <p className="text-sm text-muted-foreground">{automationConfig.task.title}</p>
                        </div>
                        {automationConfig.task.description && (
                          <div>
                            <label className="text-sm font-medium">Description</label>
                            <p className="text-sm text-muted-foreground">{automationConfig.task.description}</p>
                          </div>
                        )}
                        <div>
                          <label className="text-sm font-medium">Priority</label>
                          <p className="text-sm text-muted-foreground">{automationConfig.task.priority}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Performance Settings */}
                  {(automationConfig.performance || isEditMode) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Performance Settings</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isEditMode ? (
                          <div className="grid grid-cols-2 gap-4">
                            <MemoryLimitSelect
                              value={editConfig?.performance?.memoryLimit || 512}
                              onChange={(value) => setEditConfig({
                                ...editConfig,
                                performance: { ...editConfig?.performance, memoryLimit: value }
                              })}
                            />
                            <CpuLimitSelect
                              value={editConfig?.performance?.cpuLimit || 1}
                              onChange={(value) => setEditConfig({
                                ...editConfig,
                                performance: { ...editConfig?.performance, cpuLimit: value }
                              })}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <label className="text-sm font-medium">Memory Limit</label>
                              <p className="text-sm text-muted-foreground">{automationConfig.performance?.memoryLimit || 'Not set'}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium">CPU Limit</label>
                              <p className="text-sm text-muted-foreground">{automationConfig.performance?.cpuLimit || 'Not set'}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium">Disk Limit</label>
                              <p className="text-sm text-muted-foreground">{automationConfig.performance?.diskLimit || 'Not set'}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Notification Settings */}
                  {(automationConfig.notifications || isEditMode) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Notification Settings</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isEditMode ? (
                          <NotificationPanel
                            config={editConfig?.notifications || {}}
                            onChange={(config) => setEditConfig({
                              ...editConfig,
                              notifications: config
                            })}
                          />
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm">Success Notifications</span>
                              <Badge variant={automationConfig.notifications?.onSuccess ? "default" : "secondary"}>
                                {automationConfig.notifications?.onSuccess ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">Failure Notifications</span>
                              <Badge variant={automationConfig.notifications?.onFailure ? "default" : "secondary"}>
                                {automationConfig.notifications?.onFailure ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm">Timeout Notifications</span>
                              <Badge variant={automationConfig.notifications?.onTimeout ? "default" : "secondary"}>
                                {automationConfig.notifications?.onTimeout ? "Enabled" : "Disabled"}
                              </Badge>
                            </div>
                            {automationConfig.notifications?.recipients && (
                              <div>
                                <label className="text-sm font-medium">Recipients</label>
                                <p className="text-sm text-muted-foreground">
                                  {automationConfig.notifications.recipients.join(', ')}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Validation Errors */}
                  {validationErrors.general && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{validationErrors.general}</AlertDescription>
                    </Alert>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    {isEditMode ? (
                      <>
                        <Button 
                          onClick={handleCancelEdit}
                          variant="outline"
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleSaveConfig}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Settings className="h-4 w-4 mr-1" />
                              Save Changes
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          onClick={() => {
                            setSelectedAutomation(null);
                            setAutomationConfig(null);
                            setIsEditMode(false);
                            setEditConfig(null);
                            setValidationErrors({});
                          }}
                          variant="outline"
                        >
                          Close
                        </Button>
                        <Button
                          onClick={handleEditMode}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Edit Configuration
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Configuration Not Available</h3>
                  <p className="text-muted-foreground">
                    Unable to load configuration for this automation.
                  </p>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Analytics Tab - Bloomberg Dense Format */}
        <TabsContent value="analytics" className="space-y-0">
          {metrics && (
            <div className="bg-background border border-border">
              {/* Implementation Trends Section */}
              <div className="px-3 py-1.5 bg-muted border-b text-xs">
                <span className="text-amber-400 font-bold">IMPLEMENTATION TRENDS</span>
              </div>
              <div className="divide-y divide-border">
                <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors">
                  <span className="text-muted-foreground">Total Recommendations</span>
                  <span className="text-foreground font-mono">{metrics.totalRecommendations}</span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors bg-muted/30">
                  <span className="text-muted-foreground">Implemented</span>
                  <span className="text-green-400 font-mono">{metrics.implementedRecommendations}</span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors">
                  <span className="text-muted-foreground">Implementation Rate</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-muted/30 h-2 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${(metrics.implementationRate || 0) >= 80 ? 'bg-green-400' : (metrics.implementationRate || 0) >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`}
                        style={{ width: `${metrics.implementationRate || 0}%` }}
                      />
                    </div>
                    <span className="text-foreground font-mono w-12 text-right">{(metrics.implementationRate || 0).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Time Savings Section */}
              <div className="px-3 py-1.5 bg-muted border-y text-xs mt-4">
                <span className="text-amber-400 font-bold">TIME SAVINGS IMPACT</span>
              </div>
              <div className="divide-y divide-border">
                <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors">
                  <span className="text-muted-foreground">Total Time Saved</span>
                  <span className="text-green-400 font-mono">{formatDuration(metrics.totalTimeSaved)}</span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors bg-muted/30">
                  <span className="text-muted-foreground">Average per Recommendation</span>
                  <span className="text-foreground font-mono">
                    {formatDuration(metrics.totalTimeSaved / Math.max(metrics.implementedRecommendations, 1))}
                  </span>
                </div>
                <div className="px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent transition-colors">
                  <span className="text-muted-foreground">Weekly Trend</span>
                  <span className={`font-mono ${metrics.trends.timeSavingsTrend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {metrics.trends.timeSavingsTrend > 0 ? '+' : ''}{formatDuration(metrics.trends.timeSavingsTrend)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
