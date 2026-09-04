"use client";

import React from 'react';
import type { ExecutionRow } from './SignalTypes';

interface AllClearBannerProps {
  execution: ExecutionRow;
  toolCallsTotal?: number;
  toolCallsFailed?: number;
}

/**
 * Happy-path indicator shown when no detection signals fired for an execution.
 * Decision #1 (Steve, 2026-04-16): render affirmative "all clear" rather than
 * staying silent, overriding frontend-provocateur's default preference.
 *
 * Appears at the top of the Pipeline tab when `hasAnySignal(result) === false`.
 */
export function AllClearBanner({ execution, toolCallsTotal, toolCallsFailed }: AllClearBannerProps) {
  const completedAt = execution.endTime
    ? new Date(execution.endTime).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
    : null;
  const durationSec = execution.duration ? Math.round(execution.duration / 1000) : null;

  return (
    <div className="bg-green-500/10 border border-green-500/30 px-3 py-2 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="text-green-400 font-bold">▸ ALL CLEAR</span>
        <span className="text-muted-foreground">— No detection signals fired</span>
      </div>
      <div className="text-muted-foreground mt-1 ml-5">
        {completedAt && <span>Completed {completedAt}</span>}
        {durationSec !== null && <span> · {durationSec}s</span>}
        {typeof toolCallsTotal === 'number' && (
          <span>
            {' · '}
            {toolCallsTotal} tool call{toolCallsTotal === 1 ? '' : 's'}
            {typeof toolCallsFailed === 'number' && toolCallsFailed > 0 && (
              <span className="text-yellow-400"> · {toolCallsFailed} failed</span>
            )}
            {typeof toolCallsFailed === 'number' && toolCallsFailed === 0 && (
              <span> · 0 failures</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
