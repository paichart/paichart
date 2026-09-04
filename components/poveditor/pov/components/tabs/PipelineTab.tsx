"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { AllClearBanner } from './signals/AllClearBanner';
import { ExecutionStack } from './signals/ExecutionStack';
import { PrimaryFaultBanner } from './signals/PrimaryFaultBanner';
import { hasAnySignal } from './signals/SignalTypes';
import type {
  ExecutionRow,
  ArtifactRow,
  ResultJsonSignals,
  PipelineContext,
} from './signals/SignalTypes';
import { PipelineSiblingsBlock } from './signals/PipelineSiblingsBlock';

interface PipelineTabProps {
  taskId: string;
  taskType?: string | null;
  taskMetadata?: any;
  povId?: string;
  phaseId?: string;
}

/**
 * Pipeline Results tab for the Comments & Activity collapsible in the inline
 * POV TaskEditor. Surfaces agent-output-trustworthiness defense stack signals
 * from `agent_artifacts.result.json` that are otherwise invisible in the GUI.
 *
 * Design: cline_docs/reviews/gui-pipeline-context-panel-2026-04-16/design.md
 * Pattern: .claude/knowledge/patterns/agent-output-trustworthiness-defense-stack-pattern.md
 *
 * MVP scope (Steve's call, 2026-04-16):
 *   - Snapshot on tab-open (no live updates / SSE / polling)
 *   - Composes existing endpoints (no new composite API)
 *   - No JSONB index dependency (parent-harness lookup skipped for MVP; defers
 *     to reactor-userid-propagation work which plans the index)
 *   - Race detection deferred (needs `source` field propagation from
 *     execution.context.triggeredBy to API response)
 *   - "All Clear" indicator on happy path (overrode silent default)
 */
export function PipelineTab({ taskId, taskType, taskMetadata, povId, phaseId }: PipelineTabProps) {
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [signals, setSignals] = useState<ResultJsonSignals | null>(null);
  const [loadingExecs, setLoadingExecs] = useState(true);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pipeline context — A6 live (2026-04-18). Fetched from the dedicated
  // /pipeline-context endpoint which returns the discriminated union shape
  // (HARNESS | CHILD | NONE). On API failure we degrade to local HARNESS-
  // only classification (matches the pre-A6 tab behavior) so the tab never
  // blocks on pipeline-context data.
  const [ctx, setCtx] = useState<PipelineContext | null>(null);
  useEffect(() => {
    // Always initialise ctx — never leave it null after mount. If we lack
    // the props needed to call the API, fall back to local HARNESS-only
    // classification immediately (matches pre-A6 behaviour). This guarantees
    // the tab renders SOMETHING pipeline-aware even when the POV editor
    // didn't drill the povId/phaseId down into this task selection.
    if (!povId || !phaseId || !taskId) {
      setCtx(localFallbackContext(taskType, taskMetadata));
      return;
    }
    let alive = true;
    (async () => {
      try {
        const url = `/api/pov/${encodeURIComponent(povId)}/phase/${encodeURIComponent(phaseId)}/pipeline-context?taskId=${encodeURIComponent(taskId)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`pipeline-context fetch failed: ${res.status}`);
        const payload: PipelineContext = await res.json();
        if (alive) setCtx(payload);
      } catch {
        // Graceful degradation — fall back to local HARNESS-only classification
        // (matches pre-A6 behavior). Renders "no siblings yet" state.
        if (alive) setCtx(localFallbackContext(taskType, taskMetadata));
      }
    })();
    return () => { alive = false; };
  }, [povId, phaseId, taskId, taskType, taskMetadata]);

  // Fetch executions for this task
  const fetchExecutions = useCallback(async () => {
    try {
      setLoadingExecs(true);
      setError(null);
      const url = `/api/agent-executions?taskId=${encodeURIComponent(taskId)}${
        povId ? `&povId=${encodeURIComponent(povId)}` : ''
      }&limit=5&sortBy=startTime&sortOrder=desc&dateRange=all`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch executions (HTTP ${res.status})`);
      const payload = await res.json();
      // api-handler wraps responses — executions may be at payload.data.executions or payload.executions
      const rows: ExecutionRow[] =
        payload?.data?.executions ??
        payload?.executions ??
        payload?.data ??
        [];
      setExecutions(rows);
      if (rows.length > 0 && !selectedExecutionId) {
        setSelectedExecutionId(rows[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load executions');
    } finally {
      setLoadingExecs(false);
    }
  }, [taskId, povId, selectedExecutionId]);

  // Fetch signals for the selected execution (via artifacts → result.json)
  const fetchSignalsForExecution = useCallback(async (executionId: string) => {
    try {
      setLoadingSignals(true);
      setSignals(null);
      const res = await fetch(`/api/pov/agent/artifacts/${encodeURIComponent(executionId)}`);
      if (!res.ok) throw new Error(`Failed to fetch artifacts (HTTP ${res.status})`);
      const payload = await res.json();
      const artifacts: ArtifactRow[] = payload?.data ?? payload ?? [];
      const resultArtifact = artifacts.find((a) => a.name === 'result.json');
      if (!resultArtifact) {
        setSignals(null); // No result.json = no signals to show
        return;
      }
      try {
        const parsed: ResultJsonSignals = JSON.parse(resultArtifact.content);
        setSignals(parsed);
      } catch {
        // result.json malformed — render as "no signals" rather than error out
        setSignals(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load signals');
    } finally {
      setLoadingSignals(false);
    }
  }, []);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  useEffect(() => {
    if (selectedExecutionId) fetchSignalsForExecution(selectedExecutionId);
  }, [selectedExecutionId, fetchSignalsForExecution]);

  const selectedExecution = executions.find((e) => e.id === selectedExecutionId);

  // --- Rendering ---

  if (loadingExecs && executions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading executions…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-2 text-sm text-red-400 py-4">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-bold">Failed to load pipeline data</div>
              <div className="text-muted-foreground text-xs mt-1">{error}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (executions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="text-center py-8 text-muted-foreground text-sm">
            No agent executions yet for this task.
          </div>
        </CardContent>
      </Card>
    );
  }

  const showAllClear = !loadingSignals && !hasAnySignal(signals);

  return (
    <div className="space-y-4">
      {/* Role HUD — one-line cockpit mode indicator, no box (P0.5 C2) */}
      {ctx && ctx.role !== 'NONE' && <PipelineRoleHUD ctx={ctx} />}

      {/* Pipeline context — slim metadata-only (P0.5 C1) */}
      {ctx && ctx.role !== 'NONE' && <PipelineContextSection ctx={ctx} />}

      {/* Children / Peers block — peer-level to ExecutionStack, not nested */}
      {ctx && ctx.role === 'HARNESS' && (
        <PipelineSiblingsBlock
          label="CHILDREN"
          rows={ctx.siblings}
          counts={ctx.counts}
          truncated={ctx.siblingsTruncated}
          onSelectTask={() => { /* GUI swap not yet wired — design calls for this in a future iteration */ }}
        />
      )}
      {ctx && ctx.role === 'CHILD' && (
        <PipelineSiblingsBlock
          label="PEERS"
          rows={ctx.peers}
          counts={ctx.counts}
          truncated={ctx.peersTruncated}
          selfTaskId={taskId}
          onSelectTask={() => { /* as above */ }}
        />
      )}

      {/* Executions stack */}
      <ExecutionStack
        executions={executions}
        selectedExecutionId={selectedExecutionId}
        onSelect={setSelectedExecutionId}
      />

      {/* All-clear banner OR primary fault banner */}
      {loadingSignals ? (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading signals…
            </div>
          </CardContent>
        </Card>
      ) : showAllClear && selectedExecution ? (
        <AllClearBanner
          execution={selectedExecution}
          toolCallsTotal={signals?.toolLoop?.totalToolCalls}
          toolCallsFailed={signals?.toolLoop?.failedToolCalls}
        />
      ) : signals && hasAnySignal(signals) ? (
        <PrimaryFaultBanner signals={signals} />
      ) : null}

      {/* Actions */}
      {selectedExecutionId && (
        <div className="flex items-center gap-2 pt-1">
          <a
            href={`/api/pov/agent/artifacts/${encodeURIComponent(selectedExecutionId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs"
          >
            <Button variant="outline" size="sm" className="font-mono text-xs">
              <ExternalLink className="h-3 w-3 mr-1" />
              View artifacts (raw)
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pipeline context rendering (A6 live 2026-04-18 — discriminated union)
// ----------------------------------------------------------------------------

/**
 * Local fallback when the /pipeline-context API is unavailable. Matches the
 * pre-A6 HARNESS-only behavior: if THIS task is a PIPELINE, render as HARNESS
 * with empty siblings; otherwise NONE. The tab degrades gracefully instead of
 * showing an error banner.
 */
function localFallbackContext(taskType: string | null | undefined, metadata: any): PipelineContext {
  if (taskType === 'PIPELINE') {
    const childStageId =
      typeof metadata === 'object' && metadata
        ? ((metadata as { pipelineStageId?: string }).pipelineStageId ?? null)
        : null;
    return {
      role: 'HARNESS',
      childStageId,
      childStageName: null,
      siblings: [],
      siblingsTruncated: false,
      counts: { total: 0, done: 0, running: 0, pending: 0, failed: 0 },
      synthesisStatus: null,  // unknown until the API returns real data
    };
  }
  return { role: 'NONE' };
}

/**
 * One-line role HUD at the top of the tab (frontend-provocateur C2).
 * No box, no border — glance-readable cockpit mode-indicator.
 */
function PipelineRoleHUD({ ctx }: { ctx: PipelineContext }) {
  if (ctx.role === 'NONE') return null;
  return (
    <div className="text-xs font-mono mb-2">
      <span className="text-amber-400 font-bold">{ctx.role}</span>
      {ctx.role === 'HARNESS' && (
        <>
          <span className="text-muted-foreground">
            {' · '}
            {ctx.counts.total} children · {ctx.counts.done} done · {ctx.counts.running} running
            {ctx.counts.failed > 0 && <> · <span className="text-red-400">{ctx.counts.failed} failed</span></>}
          </span>
          {/* 2026-04-20 (#1): synthesis status — prevents "specialist report.md
              exists → pipeline done" trap. SYNTHESIZE = green ✓, anything else
              = amber ⚠. Omitted when server returned null (unknown). */}
          {ctx.synthesisStatus === 'SYNTHESIZE' && (
            <span className="text-green-400 font-bold ml-2">· ✓ synthesised</span>
          )}
          {ctx.synthesisStatus === 'CREATE' && (
            <span className="text-amber-400 ml-2">· ⚠ CREATE only — SYNTHESIZE pending</span>
          )}
          {ctx.synthesisStatus === 'ORCHESTRATE' && (
            <span className="text-amber-400 ml-2">· ⚠ ORCHESTRATE — SYNTHESIZE pending</span>
          )}
        </>
      )}
      {ctx.role === 'CHILD' && (
        <span className="text-muted-foreground">
          {' · '}of &ldquo;{ctx.parentHarness.title}&rdquo; · {ctx.counts.total} peers
        </span>
      )}
    </div>
  );
}

/**
 * Slim metadata-only context section (frontend-provocateur C1):
 * 2 content lines max. The sibling list lives in a separate peer block.
 */
function PipelineContextSection({ ctx }: { ctx: PipelineContext }) {
  if (ctx.role === 'NONE') return null;

  return (
    <div className="bg-background border border-border font-mono">
      <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center justify-between">
        <span className="text-amber-400 font-bold">PIPELINE CONTEXT</span>
        <span className="text-muted-foreground text-[11px] uppercase">
          {ctx.role === 'HARNESS' ? 'Harness' : 'Child (peer)'}
        </span>
      </div>
      <div className="px-3 py-2 text-xs space-y-1">
        {ctx.role === 'HARNESS' && (
          <>
            {ctx.childStageId ? (
              <div>
                <span className="text-muted-foreground w-24 inline-block align-top">Child stage:</span>
                <span className="inline-block">
                  {ctx.childStageName ? (
                    <>
                      <span className="text-foreground">{ctx.childStageName}</span>
                      <span className="text-muted-foreground font-mono text-[10px] ml-2">({ctx.childStageId})</span>
                    </>
                  ) : (
                    <span className="text-foreground font-mono text-[11px]">{ctx.childStageId}</span>
                  )}
                </span>
              </div>
            ) : (
              <div className="text-yellow-400 text-[11px]">
                ⚠ Pipeline metadata incomplete — pipelineStageId missing on harness.
              </div>
            )}
            {ctx.parentHarness && (
              <div>
                <span className="text-muted-foreground w-24 inline-block align-top">Parent harness:</span>
                <span className="text-foreground">{ctx.parentHarness.title}</span>
              </div>
            )}
          </>
        )}
        {ctx.role === 'CHILD' && (
          <>
            <div>
              <span className="text-muted-foreground w-24 inline-block align-top">Harness:</span>
              <span className="text-foreground">{ctx.parentHarness.title}</span>
            </div>
            <div>
              <span className="text-muted-foreground w-24 inline-block align-top">Stage:</span>
              <span className="text-foreground font-mono text-[11px]">{ctx.parentHarness.stageId}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
