"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getStatusSymbol } from '@/lib/constants/bloomberg-styles';
import type { ExecutionRow } from './SignalTypes';

interface ExecutionStackProps {
  executions: ExecutionRow[];
  selectedExecutionId: string | null;
  onSelect: (executionId: string) => void;
}

/**
 * Vertical stack of executions for a task, newest-on-top. User clicks a row
 * to select it — the selected execution drives the Primary Fault / All Clear
 * rendering below.
 *
 * Race-detection + source-anomaly chip are MVP-deferred (require `source`
 * field propagation from agent_executions.context.triggeredBy.source to the
 * API response, which is a small API tweak but out of scope for this pass).
 * When added, this component renders it inline per the design doc.
 */
export function ExecutionStack({ executions, selectedExecutionId, onSelect }: ExecutionStackProps) {
  if (executions.length === 0) {
    return (
      <div className="px-3 py-4 font-mono text-xs text-muted-foreground">
        No executions yet.
      </div>
    );
  }

  const fmtTime = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    // UTC ISO without milliseconds, e.g. "2026-04-16 14:32:18 UTC"
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  };

  const fmtDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m${sec % 60 > 0 ? ` ${sec % 60}s` : ''}`;
  };

  const statusColor = (status: string): string => {
    if (status === 'COMPLETED') return 'text-emerald-400';
    if (status === 'FAILED') return 'text-red-400';
    if (status === 'CANCELLED') return 'text-gray-400';
    if (status === 'TIMEOUT') return 'text-red-400';
    if (status === 'RUNNING') return 'text-amber-400';
    if (status === 'PENDING') return 'text-blue-400';
    return 'text-muted-foreground';
  };

  const statusSymbol = (status: string): string => {
    if (status === 'COMPLETED') return '●';
    if (status === 'FAILED') return '✗';
    if (status === 'CANCELLED') return '‖';
    if (status === 'TIMEOUT') return '⏱';
    if (status === 'RUNNING') return '●';
    if (status === 'PENDING') return '○';
    return '?';
  };

  return (
    <div className="bg-background border border-border font-mono">
      <div className="px-3 py-1.5 bg-muted border-b text-xs">
        <span className="text-amber-400 font-bold">EXECUTIONS</span>
        <span className="text-muted-foreground ml-2">({executions.length})</span>
      </div>
      <div className="divide-y divide-border">
        {executions.map((exec) => {
          const isSelected = exec.id === selectedExecutionId;
          return (
            <button
              key={exec.id}
              onClick={() => onSelect(exec.id)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors ${
                isSelected ? 'bg-accent' : ''
              }`}
              aria-label={`Select execution ${exec.id}`}
              aria-pressed={isSelected}
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground w-3" aria-hidden="true">
                  {isSelected ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </span>
                <span className={`${statusColor(exec.status)} w-3 text-center`} aria-hidden="true">
                  {statusSymbol(exec.status)}
                </span>
                <span className={`${statusColor(exec.status)} w-24 font-bold`}>
                  {exec.status}
                </span>
                <span className="text-muted-foreground flex-1 truncate">
                  {fmtTime(exec.startTime)}
                </span>
                <span className="text-muted-foreground text-right">
                  {fmtDuration(exec.duration)}
                </span>
              </div>
              <div className="mt-1 ml-9 text-[10px] text-muted-foreground">
                exec:{exec.id} · model: {exec.model || '—'} · role: {exec.agentRole}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
