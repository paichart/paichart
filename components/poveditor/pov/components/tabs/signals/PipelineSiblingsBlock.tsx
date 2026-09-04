/**
 * PipelineSiblingsBlock — dense numbered list mirroring ExecutionStack
 *
 * Renders either:
 *   - CHILDREN (N): harness's child tasks (role='HARNESS')
 *   - PEERS (N): sibling tasks of a CHILD, with `← you` marker on self
 *
 * Pattern: Bloomberg dense-list, peer-of-ExecutionStack (NOT nested in
 *          PipelineContextSection). Single source of truth for pipeline-
 *          child rendering — both HARNESS and CHILD paths share this shape.
 *
 * Scale states (P0.5 frontend-provocateur I1):
 *   - 0 rows: muted "No child tasks templated yet" inside the bordered block
 *   - 1-20: full dense list, no scroll
 *   - 21-99: max-h-[420px] overflow-y-auto
 *   - 100+: filter input above the list (not currently implemented; MVP scale
 *     cap is 50 truncation on the API side — see SIBLINGS_CAP in the endpoint)
 *
 * Interaction (frontend-provocateur I3):
 *   - Plain click: invokes onSelect(taskId) to swap selectedTaskId in place
 *   - Cmd/Ctrl-click: standard browser new-tab via <a> semantics
 *
 * Design: cline_docs/reviews/pipeline-context-a6-2026-04-18/implementation-plan.md §Phase 3.5
 */

import React from 'react';
import type { SiblingRow, PipelineCounts } from './SignalTypes';
import { getStatusSymbol, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';

interface PipelineSiblingsBlockProps {
  /** "CHILDREN" (HARNESS variant) or "PEERS" (CHILD variant) */
  label: 'CHILDREN' | 'PEERS';
  /** Sibling rows (from `siblings` HARNESS or `peers` CHILD) */
  rows: SiblingRow[];
  /** Server counts (`counts`) — used for the summary line */
  counts: PipelineCounts;
  /** Whether the API truncated at SIBLINGS_CAP */
  truncated: boolean;
  /** Self-row marker for CHILD variant — taskId of the currently-viewed task */
  selfTaskId?: string;
  /** Plain click: swap selected task */
  onSelectTask: (taskId: string) => void;
}

export function PipelineSiblingsBlock({
  label,
  rows,
  counts,
  truncated,
  selfTaskId,
  onSelectTask,
}: PipelineSiblingsBlockProps) {
  const scrollClass = rows.length > 20 ? 'max-h-[420px] overflow-y-auto' : '';

  return (
    <div className="bg-background border border-border font-mono">
      {/* Header bar — matches ExecutionStack amber/mono aesthetic */}
      <div className="px-3 py-1.5 bg-muted border-b text-xs flex items-center justify-between">
        <span className="text-amber-400 font-bold">
          {label} ({counts.total})
        </span>
        <span className="text-muted-foreground text-[11px]">
          {counts.done} done · {counts.running} running
          {counts.failed > 0 && (
            <>
              {' · '}
              <span className={BLOOMBERG_COLORS.error}>{counts.failed} failed</span>
            </>
          )}
        </span>
      </div>

      {/* Body — dense numbered rows OR empty state */}
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {label === 'CHILDREN'
            ? 'No child tasks templated yet. The harness execution will populate these.'
            : 'No peer tasks in this stage.'}
        </div>
      ) : (
        <div className={scrollClass}>
          <table className="w-full text-xs">
            <tbody>
              {rows.map((row, idx) => {
                const isSelf = selfTaskId && row.taskId === selfTaskId;
                const indexStr = String(idx + 1).padStart(2, '0');
                const symbol = getStatusSymbolForRow(row);
                return (
                  <tr
                    key={row.taskId}
                    className={`border-b last:border-b-0 border-border ${
                      isSelf ? 'bg-amber-500/5' : 'hover:bg-accent cursor-pointer'
                    }`}
                    onClick={isSelf ? undefined : () => onSelectTask(row.taskId)}
                    role={isSelf ? undefined : 'button'}
                    tabIndex={isSelf ? undefined : 0}
                    onKeyDown={
                      isSelf
                        ? undefined
                        : (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectTask(row.taskId);
                            }
                          }
                    }
                  >
                    <td className="px-3 py-1.5 text-muted-foreground w-8 text-right">{indexStr}</td>
                    <td className={`py-1.5 pr-2 w-4 text-center ${symbol.color}`}>{symbol.symbol}</td>
                    <td className="py-1.5 pr-3 text-foreground truncate max-w-[280px]">{row.title}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground text-[11px] uppercase">
                      {row.executionStatus ?? row.status}
                    </td>
                    <td className="py-1.5 pr-3 text-[11px] text-amber-400 text-right w-16">
                      {isSelf ? '← you' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {truncated && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">
              … more rows not shown (cap {rows.length}). Refine POV scope if you need to see them all.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Resolve the status glyph for a sibling row. Prefers executionStatus (the
 * operational signal) over task status (lifecycle signal) when both are present.
 * Matches the Bloomberg status-symbol mapping used elsewhere.
 */
function getStatusSymbolForRow(row: SiblingRow): { symbol: string; color: string } {
  if (row.executionStatus) {
    // Map ExecutionStatus to Bloomberg visual language.
    switch (row.executionStatus) {
      case 'SUCCESS':
      case 'REVIEW_APPROVED':
        return { symbol: '●', color: 'text-green-400' };
      case 'FAILED':
      case 'REVIEW_REJECTED':
        return { symbol: '◣', color: 'text-red-400' };
      case 'RUNNING':
        return { symbol: '◐', color: 'text-amber-400' };
      case 'PENDING':
      case 'READY':
      case 'PENDING_REVIEW':
        return { symbol: '○', color: 'text-muted-foreground' };
      default:
        return { symbol: '·', color: 'text-muted-foreground' };
    }
  }
  // Fall back to task status via shared helper.
  return getStatusSymbol(row.status);
}
