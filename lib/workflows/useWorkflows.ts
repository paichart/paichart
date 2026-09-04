"use client";

import { useState, useEffect, useCallback } from 'react';
import { Workflow } from './types';

/** The editor's serialized save payload (config-wrapper object — matches CreateWorkflowSchema). */
export interface WorkflowSaveData {
  name: string;
  description: string | null;
  category: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DEPRECATED';
  steps: {
    steps: unknown[];
    executionMode: 'sequential' | 'parallel' | 'conditional';
    failureStrategy: 'stop' | 'continue' | 'rollback';
    timeout: number;
  };
}

/**
 * Workflow data layer (UI-alignment migration 2026-06-30) — the CRUD/run handlers lifted out of
 * WorkflowTerminal so the new table + the promoted Builder share one source. No polling/SSE exists,
 * so this is a pure handler lift. The confirm()/alert() UI is kept verbatim from the terminal.
 */
export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/workflows', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch workflows');
      const data = await response.json();
      // API returns { data: { total, limit, offset, workflows } } — pass the FULL objects through (M3).
      setWorkflows(data.data?.workflows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = useCallback(async (workflow: Workflow) => {
    if (!confirm(`Run workflow "${workflow.name}"?`)) return;
    try {
      const response = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ workflowName: workflow.name }), // server hydrates mode/strategy/timeout from DB
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || errorData.message || 'Failed to run workflow');
      }
      const result = await response.json();
      const wfResult = result?.data?.result ?? result?.data ?? {};
      const execId = wfResult.data?.executionId || wfResult.executionId || result?.data?.executionId || 'unknown';
      alert(
        (wfResult.success === false ? 'Execution completed with errors' : 'Execution succeeded')
        + ` — for a detailed, step-by-step run, use an AI client (workflow.execute).\n\nExecution ID: ${execId}`
      );
      await refresh();
    } catch (err) {
      alert(`Execution failed — for a detailed run, use an AI client (workflow.execute).\n\n${err instanceof Error ? err.message : 'Failed to run workflow'}`);
    }
  }, [refresh]);

  const remove = useCallback(async (workflow: Workflow): Promise<boolean> => {
    if (!confirm(`Delete workflow "${workflow.name}"? This cannot be undone.`)) return false;
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to delete workflow');
      await refresh();
      return true;
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to delete workflow'}`);
      return false;
    }
  }, [refresh]);

  const clone = useCallback(async (workflow: Workflow) => {
    try {
      // M5 fix: the pre-migration clone POSTed a BARE `steps` array, which fails CreateWorkflowSchema.steps
      // (expects the config-wrapper object) and dropped _rawConfig + orchestration config entirely. Send the
      // wrapper, spread _rawConfig FIRST (top-level lane), and prefer the raw steps so per-step unknown keys survive.
      const rawSteps = (workflow._rawConfig?.steps as unknown[]) ?? workflow.steps;
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: `${workflow.name}-copy`,
          description: workflow.description,
          category: workflow.category,
          steps: {
            ...(workflow._rawConfig || {}),
            steps: rawSteps,
            executionMode: workflow.executionMode ?? 'sequential',
            failureStrategy: workflow.failureStrategy ?? 'stop',
            timeout: workflow.timeout ?? 60000,
          },
        }),
      });
      if (!response.ok) throw new Error('Failed to clone workflow');
      await refresh();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to clone workflow'}`);
    }
  }, [refresh]);

  const save = useCallback(async (id: string | undefined, workflowData: WorkflowSaveData): Promise<boolean> => {
    try {
      const url = id ? `/api/workflows/${id}` : '/api/workflows';
      const method = id ? 'PUT' : 'POST';
      // `name` is immutable on update (the unique run key); UpdateWorkflowSchema omits it + is now .strict(),
      // so strip it from the PUT body or the whole request is rejected (it was silently dropped before).
      const reqBody: Record<string, unknown> = { ...workflowData };
      if (id) delete reqBody.name;
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(reqBody),
      });
      if (!response.ok) {
        const errorData = await response.json();
        const fieldErrors = errorData.error?.details?.fieldErrors;
        const detailStr = fieldErrors
          ? ': ' + Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v}`).join(', ')
          : '';
        throw new Error((errorData.error?.message || errorData.message || 'Failed to save workflow') + detailStr);
      }
      await refresh();
      return true;
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to save workflow'}`);
      return false;
    }
  }, [refresh]);

  return { workflows, isLoading, error, refresh, run, remove, clone, save };
}
