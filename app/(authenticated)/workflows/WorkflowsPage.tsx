'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { GitBranch, Sparkles, Play, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, ChevronRight, Code, Copy, Wrench, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Bloomberg design system
import {
  BLOOMBERG_COLORS,
  BLOOMBERG_HEADER,
  BLOOMBERG_TABLE,
  BLOOMBERG_TYPOGRAPHY
} from '@/lib/constants/bloomberg-styles';
import { cn } from '@/lib/utils';

// Workflow types
import { WorkflowExecution, ServiceCallResult, Workflow } from '@/lib/workflows/types';

// Workflow components
import { WorkflowBloombergView } from '@/components/workflows/WorkflowBloombergView';
import { WorkflowEditor } from '@/components/workflows/WorkflowEditor';
import { WorkflowsHowItWorks } from '@/components/workflows/WorkflowsHowItWorks';
import { RecommendationEngine } from '@/components/workflows/RecommendationEngine';
import { useWorkflows } from '@/lib/workflows/useWorkflows';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * Workflow Management Page Client Component
 *
 * Bloomberg-style terminal interface for:
 * - Managing named workflows (CRUD)
 * - Discovering available services and tools
 * - Running workflows and monitoring execution
 * - AI-powered workflow recommendations
 */
interface WorkflowsPageProps {
  userRole: string;
}

export function WorkflowsPage({ userRole }: WorkflowsPageProps) {
  const [activeTab, setActiveTab] = useState('workflows');
  const { workflows, isLoading, error, refresh, run, remove, clone, save } = useWorkflows();
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null); // M2: store the full OBJECT, not an id
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';

  const handleEdit = (w: Workflow) => { setEditingWorkflow(w); setActiveTab('builder'); };
  const handleCreate = () => { setEditingWorkflow(null); setActiveTab('builder'); };
  const handleClose = () => { setEditingWorkflow(null); setActiveTab('workflows'); refresh(); };

  return (
    <div className="p-6 h-full">
      <PageHeader icon={GitBranch} title="Workflows" subtitle="Build, run, and monitor MCP service workflows" />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 mt-4 h-[calc(100%-4rem)]">
        <TabsList>
          <TabsTrigger value="workflows" className="gap-1.5">
            <GitBranch className="h-4 w-4" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="builder" className="gap-1.5">
            <Wrench className="h-4 w-4" />
            Builder
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            Discover
          </TabsTrigger>
          <TabsTrigger value="executions" className="gap-1.5">
            <Play className="h-4 w-4" />
            Executions
          </TabsTrigger>
          <TabsTrigger value="howitworks" className="gap-1.5">
            <HelpCircle className="h-4 w-4" />
            How it works
          </TabsTrigger>
        </TabsList>

        {/* Workflows — sortable table overview */}
        <TabsContent value="workflows">
          {isLoading ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Loading workflows…</CardContent></Card>
          ) : error ? (
            <Card><CardContent className="py-12 text-center text-red-400">{error}</CardContent></Card>
          ) : (
            <WorkflowBloombergView
              workflows={workflows}
              isAdmin={isAdmin}
              onRun={run}
              onEdit={handleEdit}
              onClone={clone}
              onDelete={remove}
              onCreate={handleCreate}
            />
          )}
        </TabsContent>

        {/* Builder — promoted WorkflowEditor (M1 remount key, M2 full-object state) */}
        <TabsContent value="builder">
          <WorkflowEditor
            key={editingWorkflow?.id ?? 'new'}
            workflow={editingWorkflow ?? undefined}
            onSave={async (data) => { const ok = await save(editingWorkflow?.id, data); if (ok) handleClose(); }}
            onCancel={handleClose}
          />
        </TabsContent>

        {/* Discover — service recommendations */}
        <TabsContent value="recommendations" className="h-[calc(100%-3rem)]">
          <RecommendationEngine userRole={userRole} />
        </TabsContent>

        {/* Executions — run history */}
        <TabsContent value="executions" className="h-[calc(100%-3rem)]">
          <WorkflowExecutionsPanel />
        </TabsContent>

        {/* How it works — conceptual explainer (service / step / workflow model) */}
        <TabsContent value="howitworks">
          <WorkflowsHowItWorks />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Individual step result row with expandable JSON payload
 * Phase 4: StepResultRow Component
 */
function StepResultRow({
  result,
  stepIndex,
  executionId,
  expandedSteps,
  toggleStep
}: {
  result: ServiceCallResult;
  stepIndex: number;
  executionId: string;
  expandedSteps: Set<string>;
  toggleStep: (key: string) => void;
}) {
  const stepKey = `${executionId}-${stepIndex}`;
  const isDataExpanded = expandedSteps.has(stepKey);
  const hasData = result.data !== null && result.data !== undefined;

  // Step status badge
  const getStepStatusBadge = (success: boolean, error?: string, errorType?: string) => {
    if (success) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-400/10 text-green-400 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          Success
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-400/10 text-red-400 text-xs">
        <XCircle className="h-3 w-3" />
        {errorType || (error ? 'Error' : 'Failed')}
      </span>
    );
  };

  return (
    <>
      {/* Step row */}
      <tr className={cn(
        BLOOMBERG_TABLE.rowHover,
        !result.success && 'bg-red-400/5'
      )}>
        <td className="px-3 py-2 font-mono text-amber-400 text-xs">
          {stepIndex + 1}
        </td>
        <td className="px-3 py-2 font-mono text-xs">
          {result.service}
        </td>
        <td className="px-3 py-2 font-mono text-muted-foreground text-xs">
          {result.tool}
        </td>
        <td className="px-3 py-2">
          {getStepStatusBadge(result.success, result.error, result.errorType)}
        </td>
        <td className="px-3 py-2 text-right font-mono text-muted-foreground text-xs">
          {result.executionTime}ms
        </td>
        <td className="px-3 py-2 text-center">
          {hasData ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                toggleStep(stepKey);
              }}
              className="h-6 gap-1"
            >
              <Code className="h-3 w-3" />
              {isDataExpanded ? 'Hide' : 'View'}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">No data</span>
          )}
        </td>
      </tr>

      {/* Error row (if step failed) */}
      {result.error && (
        <tr className="bg-red-400/5">
          <td colSpan={6} className="px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <AlertCircle className="h-3 w-3 text-red-400 mt-0.5" />
              <span className="text-red-400">Error:</span>
              <span className="text-muted-foreground font-mono">{result.error}</span>
              {(result.attempts ?? 0) > 1 && (
                <span className="text-amber-400 ml-2">({result.attempts} attempts)</span>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Expanded data payload */}
      {isDataExpanded && hasData && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="bg-muted/50 border-t border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-mono">
                  Step {stepIndex + 1} Data Payload
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
                  }}
                  className="h-6 gap-1"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <div className="rounded overflow-hidden max-h-96 overflow-y-auto">
                <SyntaxHighlighter
                  language="json"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: '0.75rem',
                    fontSize: '11px',
                    lineHeight: '1.4'
                  }}
                >
                  {JSON.stringify(result.data, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Workflow Executions Panel
 * Shows execution history with real-time data from /api/workflows/executions
 */
function WorkflowExecutionsPanel() {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Phase 1: Expansion state
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const fetchExecutions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/workflows/executions?limit=50', { credentials: 'include' });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to fetch executions');
      }
      const data = await response.json();
      setExecutions(data.data?.executions || []);
      setTotal(data.data?.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
  }, []);

  // Status badge helper
  const getStatusBadge = (status: WorkflowExecution['status']) => {
    const config = {
      RUNNING: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-400/10', animate: true },
      COMPLETED: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10', animate: false },
      FAILED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', animate: false },
      CANCELLED: { icon: AlertCircle, color: 'text-yellow-400', bg: 'bg-yellow-400/10', animate: false },
      TIMEOUT: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-400/10', animate: false }
    }[status] || { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', animate: false };

    const Icon = config.icon;
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs', config.bg, config.color)}>
        <Icon className={cn('h-3 w-3', config.animate && 'animate-spin')} />
        {status}
      </span>
    );
  };

  // Map execution mode to user-friendly labels
  const getExecutionModeLabel = (mode: string) => {
    const MODE_LABELS: Record<string, string> = {
      'PREDEFINED': 'GUI',
      'AD_HOC': 'MCP'
    };
    return MODE_LABELS[mode] || mode;
  };

  // Phase 1: Toggle helpers
  const toggleExecution = (executionId: string) => {
    setExpandedExecutions(prev => {
      const next = new Set(prev);
      if (next.has(executionId)) {
        next.delete(executionId);
      } else {
        next.add(executionId);
      }
      return next;
    });
  };

  const toggleStep = (stepKey: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepKey)) {
        next.delete(stepKey);
      } else {
        next.add(stepKey);
      }
      return next;
    });
  };

  // Format duration
  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Format time ago
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-background border border-border rounded h-full flex flex-col">
      {/* Header */}
      <div className={cn(BLOOMBERG_HEADER.container, 'flex items-center justify-between')}>
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-amber-400" />
          <span className={BLOOMBERG_HEADER.title}>EXECUTION HISTORY</span>
          {!isLoading && (
            <span className="text-xs text-muted-foreground ml-2">
              ({total} total)
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchExecutions}
          disabled={isLoading}
          className="h-7 px-2"
        >
          <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400 text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchExecutions} className="mt-2">
              Retry
            </Button>
          </div>
        ) : executions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <p>No workflow executions yet.</p>
            <p className="text-xs mt-2">Run a workflow to see results here.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className={BLOOMBERG_TABLE.thead}>
              <tr>
                <th className={BLOOMBERG_TABLE.th}>Workflow</th>
                <th className={BLOOMBERG_TABLE.th}>Status</th>
                <th className={BLOOMBERG_TABLE.th}>Mode</th>
                <th className={BLOOMBERG_TABLE.th}>Duration</th>
                <th className={BLOOMBERG_TABLE.th}>Started</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((exec, idx) => {
                const isExpanded = expandedExecutions.has(exec.id);

                return (
                  <React.Fragment key={exec.id}>
                    {/* Main execution row - Phase 2 */}
                    <tr
                      className={cn(
                        idx % 2 === 0 ? BLOOMBERG_TABLE.rowEven : BLOOMBERG_TABLE.rowOdd,
                        BLOOMBERG_TABLE.rowHover,
                        'cursor-pointer'
                      )}
                      onClick={() => toggleExecution(exec.id)}
                    >
                      <td className={cn(BLOOMBERG_TABLE.td, 'font-medium')}>
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={cn(
                              'h-3 w-3 text-muted-foreground transition-transform',
                              isExpanded && 'rotate-90'
                            )}
                          />
                          {exec.workflow?.name || exec.workflowType || 'Ad-hoc'}
                          {exec.workflow?.category && (
                            <span className="text-xs text-muted-foreground ml-2">
                              [{exec.workflow.category}]
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={BLOOMBERG_TABLE.td}>
                        {getStatusBadge(exec.status)}
                      </td>
                      <td className={cn(BLOOMBERG_TABLE.td, 'text-xs text-muted-foreground')}>
                        {getExecutionModeLabel(exec.executionMode)}
                      </td>
                      <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, 'text-xs')}>
                        {formatDuration(exec.duration)}
                      </td>
                      <td className={cn(BLOOMBERG_TABLE.td, 'text-xs text-muted-foreground')}>
                        {formatTimeAgo(exec.startTime)}
                      </td>
                    </tr>

                    {/* Expanded step results - Phase 3 */}
                    {isExpanded && exec.output && exec.output.length > 0 && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <div className="bg-muted/30 border-t border-border p-4">
                            <div className="space-y-3">
                              {/* Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-0.5">
                                  <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                                    Step Results ({exec.output.length} steps)
                                  </h4>
                                  <span className="text-[10px] font-mono text-muted-foreground/70 select-all">ID: {exec.id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(JSON.stringify(exec.output, null, 2));
                                    }}
                                    className="h-6 gap-1"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Copy All
                                  </Button>
                                </div>
                              </div>

                              {/* Step results table */}
                              <div className="bg-background border border-border rounded overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className={BLOOMBERG_TABLE.thead}>
                                    <tr>
                                      <th className="px-3 py-2 text-left w-12">#</th>
                                      <th className="px-3 py-2 text-left">Service</th>
                                      <th className="px-3 py-2 text-left">Tool</th>
                                      <th className="px-3 py-2 text-left w-24">Status</th>
                                      <th className="px-3 py-2 text-right w-20">Time</th>
                                      <th className="px-3 py-2 text-center w-24">Data</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {exec.output.map((result, stepIdx) => (
                                      <StepResultRow
                                        key={stepIdx}
                                        result={result}
                                        stepIndex={stepIdx}
                                        executionId={exec.id}
                                        expandedSteps={expandedSteps}
                                        toggleStep={toggleStep}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Empty state if no output */}
                    {isExpanded && (!exec.output || exec.output.length === 0) && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <div className="bg-muted/30 border-t border-border p-4 space-y-2">
                            <p className="text-[10px] font-mono text-muted-foreground/70 select-all">ID: {exec.id}</p>
                            {exec.error ? (
                              <div className="text-xs font-mono">
                                <span className="text-red-400">Error: </span>
                                <span className="text-muted-foreground">{exec.error}</span>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center">
                                No step results available for this execution
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
