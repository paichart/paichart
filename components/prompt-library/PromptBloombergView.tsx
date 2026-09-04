"use client";

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Prompt } from '@/lib/prompts/types';
import { BLOOMBERG_TABLE, BLOOMBERG_TYPOGRAPHY } from '@/lib/constants/bloomberg-styles';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import { Edit2, Copy, Trash2, Plus } from 'lucide-react';
import { RowActionIcon } from '@/components/ui/RowActionIcon';
import { useSortableRows } from '@/components/ui/useSortableRows';
import { TableSearch } from '@/components/ui/TableSearch';
import { TableFilter, deriveTableOptions } from '@/components/ui/TableFilter';

type SortField = 'name' | 'category' | 'status' | 'version' | 'isPublic' | 'usageCount' | 'updatedAt';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'text-emerald-400',
  DRAFT: 'text-gray-400',
  DEPRECATED: 'text-red-400',
  INACTIVE: 'text-gray-500',
};

function formatDate(d: string): string {
  const dt = new Date(d);
  return `${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getDate().toString().padStart(2, '0')}`;
}

interface PromptBloombergViewProps {
  prompts: Prompt[];
  isAdmin: boolean;
  onEdit: (p: Prompt) => void;
  onClone: (p: Prompt) => void;
  onDelete: (p: Prompt) => void;
  onCreate: () => void;
}

/**
 * Sortable prompt-library table — mirrors AgentTemplateBloombergView/WorkflowBloombergView chrome.
 * M3: keep FULL objects ([...].sort, same reference to onEdit) — no row-model. No Run action (prompts
 * aren't executed) — which is the proof RowActionIcon wasn't over-fit to workflows.
 */
export function PromptBloombergView({ prompts, isAdmin, onEdit, onClone, onDelete, onCreate }: PromptBloombergViewProps) {
  const { sortField, sortDirection, SortHeader } = useSortableRows<SortField>('name');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const categoryOptions = useMemo(() => deriveTableOptions(prompts, p => p.category), [prompts]);
  const statusOptions = useMemo(() => deriveTableOptions(prompts, p => p.status), [prompts]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = prompts.filter(p =>
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)) &&
      (!catFilter || p.category === catFilter) &&
      (!statusFilter || p.status === statusFilter)
    );
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'version': cmp = a.version.localeCompare(b.version); break;
        case 'isPublic': cmp = Number(a.isPublic) - Number(b.isPublic); break;
        case 'usageCount': cmp = a.usageCount - b.usageCount; break;
        case 'updatedAt': cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [prompts, search, catFilter, statusFilter, sortField, sortDirection]);

  return (
    <TooltipProvider>
      <div className={cn(BLOOMBERG_TABLE.container, 'rounded-md')}>
        {/* Header Bar */}
        <div className={cn(BLOOMBERG_TABLE.header, 'flex items-center justify-between')}>
          <span className={BLOOMBERG_TABLE.headerTitle}>SKILLS</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {prompts.length} skill{prompts.length !== 1 ? 's' : ''}
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
          <TableSearch value={search} onChange={setSearch} placeholder="Search skills…" className="w-64" />
          <TableFilter value={catFilter} onChange={setCatFilter} options={categoryOptions} allLabel="All categories" />
          <TableFilter value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="All statuses" />
        </div>

        {/* Table */}
        <table className="w-full text-xs">
          <thead className={BLOOMBERG_TABLE.thead}>
            <tr>
              <SortHeader field="name" className="w-[18%]">NAME</SortHeader>
              <SortHeader field="category" className="w-[12%]">CATEGORY</SortHeader>
              <th className={cn(BLOOMBERG_TABLE.th, BLOOMBERG_TYPOGRAPHY.mono, 'w-[16%]')}>TAGS</th>
              <SortHeader field="status" className="w-[10%]">STATUS</SortHeader>
              <SortHeader field="version" className="w-[8%]">VER</SortHeader>
              <SortHeader field="isPublic" className="w-[10%]">VISIBILITY</SortHeader>
              <SortHeader field="usageCount" className="w-[8%]">USES</SortHeader>
              <SortHeader field="updatedAt" className="w-[10%]">UPDATED</SortHeader>
              {isAdmin && (
                <th className={cn(BLOOMBERG_TABLE.th, BLOOMBERG_TYPOGRAPHY.mono, 'w-[12%] text-right')}>ACTIONS</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No skills found. {isAdmin ? 'Create one to get started.' : ''}
                </td>
              </tr>
            ) : (
              sorted.map((p, i) => (
                <tr
                  key={p.id}
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
                        <span className="truncate block max-w-[260px]">{p.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-md">
                        <p className="font-medium">{p.name}</p>
                        {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Category */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, 'text-muted-foreground')}>
                    {p.category}
                  </td>

                  {/* Tags — flex-wrap badges; mcp + protocol (the functional tags) emphasized */}
                  <td className={BLOOMBERG_TABLE.td}>
                    <div className="flex flex-wrap gap-1">
                      {(p.tags ?? []).length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        p.tags.map(tag => (
                          <span
                            key={tag}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap',
                              tag === 'mcp'
                                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                                : tag === 'protocol'
                                ? 'bg-violet-500/10 text-violet-400 border-violet-500/30'
                                : 'bg-muted/40 text-muted-foreground border-border'
                            )}
                          >
                            {tag}
                          </span>
                        ))
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, STATUS_COLOR[p.status] ?? 'text-muted-foreground')}>
                    {p.status}
                  </td>

                  {/* Version */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    v{p.version}
                  </td>

                  {/* Visibility */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, p.isPublic ? 'text-sky-400' : 'text-muted-foreground')}>
                    {p.isPublic ? 'Public' : 'Private'}
                  </td>

                  {/* Uses */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {p.usageCount}
                  </td>

                  {/* Updated */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {formatDate(p.updatedAt)}
                  </td>

                  {/* Actions — edit / clone / delete (NO run) */}
                  {isAdmin && (
                    <td className={cn(BLOOMBERG_TABLE.td, 'text-right')}>
                      <div className="flex items-center justify-end gap-1">
                        <RowActionIcon icon={Edit2} tooltip="Edit prompt" onClick={() => onEdit(p)} />
                        <RowActionIcon icon={Copy} tooltip="Clone prompt" onClick={() => onClone(p)} />
                        <RowActionIcon icon={Trash2} tooltip="Delete prompt" variant="danger" onClick={() => onDelete(p)} />
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
            {sorted.length} skill{sorted.length !== 1 ? 's' : ''}
            {' | Sorted by: '}{sortField}
          </span>
          <span className="text-muted-foreground">{isAdmin ? 'Admin mode' : 'Read-only'}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
