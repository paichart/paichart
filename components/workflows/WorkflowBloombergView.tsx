"use client";

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Workflow } from '@/lib/workflows/types';
import { BLOOMBERG_TABLE, BLOOMBERG_TYPOGRAPHY } from '@/lib/constants/bloomberg-styles';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import { Play, Edit2, Copy, Trash2, Plus } from 'lucide-react';
import { RowActionIcon } from '@/components/ui/RowActionIcon';
import { useSortableRows } from '@/components/ui/useSortableRows';
import { TableSearch } from '@/components/ui/TableSearch';
import { TableFilter, deriveTableOptions } from '@/components/ui/TableFilter';

type SortField = 'name' | 'status' | 'steps' | 'executionCount' | 'successRate' | 'lastExecution';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'text-emerald-400',
  PAUSED: 'text-gray-400',
  DEPRECATED: 'text-red-400',
};
const STATUS_SYMBOL: Record<string, string> = { ACTIVE: '●', PAUSED: '○', DEPRECATED: '✗' };

function formatLastRun(d: string | null): string {
  if (!d) return 'Never';
  const dt = new Date(d);
  return `${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getDate().toString().padStart(2, '0')}`;
}

interface WorkflowBloombergViewProps {
  workflows: Workflow[];
  isAdmin: boolean;
  onRun: (w: Workflow) => void;
  onEdit: (w: Workflow) => void;
  onClone: (w: Workflow) => void;
  onDelete: (w: Workflow) => void;
  onCreate: () => void;
}

/**
 * Sortable workflow overview table — mirrors AgentTemplateBloombergView's chrome.
 *
 * ⚠️ M3 (boundary-contract): keep FULL objects — `[...workflows].sort()` copies the array but preserves
 * element references, and `onEdit(w)` passes that SAME reference, so `_rawConfig` + orchestration fields ride
 * through to the editor untouched. Do NOT `.map()` rows into a view-model — the compiler won't catch it
 * (optional fields), but the form-strip bug regresses if you do. Cells read fields off the full object.
 */
export function WorkflowBloombergView({
  workflows,
  isAdmin,
  onRun,
  onEdit,
  onClone,
  onDelete,
  onCreate,
}: WorkflowBloombergViewProps) {
  const { sortField, sortDirection, SortHeader } = useSortableRows<SortField>('name');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const categoryOptions = useMemo(() => deriveTableOptions(workflows, w => w.category), [workflows]);
  const statusOptions = useMemo(() => deriveTableOptions(workflows, w => w.status), [workflows]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = workflows.filter(w =>
      (!q ||
        w.name.toLowerCase().includes(q) ||
        (w.description ?? '').toLowerCase().includes(q) ||
        (w.category ?? '').toLowerCase().includes(q)) &&
      (!catFilter || w.category === catFilter) &&
      (!statusFilter || w.status === statusFilter)
    );
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'steps': cmp = a.steps.length - b.steps.length; break;
        case 'executionCount': cmp = a.executionCount - b.executionCount; break;
        case 'successRate': cmp = (a.successRate ?? -1) - (b.successRate ?? -1); break;
        case 'lastExecution': cmp = new Date(a.lastExecution ?? 0).getTime() - new Date(b.lastExecution ?? 0).getTime(); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [workflows, search, catFilter, statusFilter, sortField, sortDirection]);

  return (
    <TooltipProvider>
      <div className={cn(BLOOMBERG_TABLE.container, 'rounded-md')}>
        {/* Header Bar */}
        <div className={cn(BLOOMBERG_TABLE.header, 'flex items-center justify-between')}>
          <span className={BLOOMBERG_TABLE.headerTitle}>WORKFLOWS</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {workflows.length} workflow{workflows.length !== 1 ? 's' : ''}
            </span>
            {isAdmin && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onCreate}>
                <Plus className="h-3 w-3 mr-1" />
                NEW
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar — search + filters above the table */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
          <TableSearch value={search} onChange={setSearch} placeholder="Search workflows…" className="w-64" />
          <TableFilter value={catFilter} onChange={setCatFilter} options={categoryOptions} allLabel="All categories" />
          <TableFilter value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="All statuses" />
        </div>

        {/* Table */}
        <table className="w-full text-xs">
          <thead className={BLOOMBERG_TABLE.thead}>
            <tr>
              <SortHeader field="name" className="w-[28%]">NAME</SortHeader>
              <SortHeader field="status" className="w-[12%]">STATUS</SortHeader>
              <SortHeader field="steps" className="w-[8%]">STEPS</SortHeader>
              <SortHeader field="executionCount" className="w-[8%]">RUNS</SortHeader>
              <SortHeader field="successRate" className="w-[10%]">SUCCESS</SortHeader>
              <SortHeader field="lastExecution" className="w-[12%]">LAST RUN</SortHeader>
              {isAdmin && (
                <th className={cn(BLOOMBERG_TABLE.th, BLOOMBERG_TYPOGRAPHY.mono, 'w-[18%] text-right')}>ACTIONS</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                  No workflows found. {isAdmin ? 'Create one to get started.' : ''}
                </td>
              </tr>
            ) : (
              sorted.map((w, i) => (
                <tr
                  key={w.id}
                  className={cn(
                    i % 2 === 0 ? BLOOMBERG_TABLE.rowEven : BLOOMBERG_TABLE.rowOdd,
                    BLOOMBERG_TABLE.rowHover,
                    'cursor-default'
                  )}
                >
                  {/* Name + hover description */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, 'font-medium text-foreground')}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate block max-w-[280px]">{w.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-md">
                        <p className="font-medium">{w.name}</p>
                        {w.description && <p className="text-xs text-muted-foreground mt-1">{w.description}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Status */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, STATUS_COLOR[w.status] ?? 'text-muted-foreground')}>
                    {STATUS_SYMBOL[w.status] ?? '○'} {w.status}
                  </td>

                  {/* Steps */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {w.steps.length}
                  </td>

                  {/* Runs */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {w.executionCount}
                  </td>

                  {/* Success rate */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {w.successRate != null ? `${Math.round(w.successRate)}%` : '—'}
                  </td>

                  {/* Last run */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {formatLastRun(w.lastExecution)}
                  </td>

                  {/* Actions */}
                  {isAdmin && (
                    <td className={cn(BLOOMBERG_TABLE.td, 'text-right')}>
                      <div className="flex items-center justify-end gap-1">
                        {/* M3: each handler gets the SAME object reference — no reconstruction */}
                        <RowActionIcon icon={Play} tooltip="Run workflow" variant="run" onClick={() => onRun(w)} />
                        <RowActionIcon icon={Edit2} tooltip="Edit workflow" onClick={() => onEdit(w)} />
                        <RowActionIcon icon={Copy} tooltip="Clone workflow" onClick={() => onClone(w)} />
                        <RowActionIcon icon={Trash2} tooltip="Delete workflow" variant="danger" onClick={() => onDelete(w)} />
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div className={cn(BLOOMBERG_TABLE.header, 'flex items-center justify-between border-t')}>
          <span className="text-muted-foreground">
            {sorted.length} workflow{sorted.length !== 1 ? 's' : ''}
            {' | Sorted by: '}{sortField}
          </span>
          <span className="text-muted-foreground">{isAdmin ? 'Admin mode' : 'Read-only'}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
