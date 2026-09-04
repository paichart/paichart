"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AgentTemplate, AgentTemplateService } from '@/lib/pov/api/agent-templates-adapter';
import {
  BLOOMBERG_TABLE,
  BLOOMBERG_TYPOGRAPHY,
  BLOOMBERG_COLORS,
} from '@/lib/constants/bloomberg-styles';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { Edit, Copy, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RowActionIcon } from '@/components/ui/RowActionIcon';
import { useSortableRows } from '@/components/ui/useSortableRows';
import { TableSearch } from '@/components/ui/TableSearch';
import { TableFilter, deriveTableOptions } from '@/components/ui/TableFilter';

interface AgentTemplateBloombergViewProps {
  templates: AgentTemplate[];
  isAdmin: boolean;
  onEdit?: (template: AgentTemplate) => void;
  onDuplicate?: (template: AgentTemplate) => void;
  onDelete?: (template: AgentTemplate) => void;
  onCreate?: () => void;
  onRefresh?: () => void;
}

type SortField = 'role' | 'templateType' | 'category' | 'name' | 'model' | 'updatedAt';

function formatDate(date: string): string {
  const d = new Date(date);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
}

// Derive a compact label from the model id (NOT a hardcoded family→version map, which
// silently drops minor bumps — e.g. claude-opus-4-8 rendered as "opus-4"). Parse the
// version out of the id so any future bump (4.8→4.9, new minor) just works; a trailing
// dated suffix (claude-haiku-4-5-20251001) is intentionally ignored.
//   claude-opus-4-8 → opus-4.8 · claude-sonnet-4-6 → sonnet-4.6 · claude-fable-5 → fable-5
function getModelShort(model?: string): string {
  if (!model) return 'default';
  const m = model.replace(/^claude-/, '');
  const av = m.match(/^(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/);
  if (av) return av[3] ? `${av[1]}-${av[2]}.${av[3]}` : `${av[1]}-${av[2]}`;
  return m; // anything else is already compact
}

function getCategoryColor(category?: string): string {
  switch (category?.toUpperCase()) {
    case 'DEVELOPMENT': return 'text-emerald-400';
    case 'TESTING': return 'text-amber-400';
    case 'ANALYSIS': return 'text-blue-400';
    case 'SECURITY': return 'text-red-400';
    case 'DOCUMENTATION': case 'DOCS': return 'text-purple-400';
    case 'OPERATIONS': return 'text-cyan-400';
    default: return 'text-muted-foreground';
  }
}

function getCategoryShort(category?: string): string {
  switch (category?.toUpperCase()) {
    case 'DEVELOPMENT': return 'DEV';
    case 'TESTING': return 'TEST';
    case 'ANALYSIS': return 'ANLS';
    case 'SECURITY': return 'SEC';
    case 'DOCUMENTATION': return 'DOCS';
    case 'OPERATIONS': return 'OPS';
    case 'GENERAL': return 'GEN';
    default: return (category || 'GEN').substring(0, 4).toUpperCase();
  }
}

export function AgentTemplateBloombergView({
  templates,
  isAdmin,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
  onRefresh,
}: AgentTemplateBloombergViewProps) {
  const { sortField, sortDirection, SortHeader } = useSortableRows<SortField>('category');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const categoryOptions = useMemo(() => deriveTableOptions(templates, t => t.category), [templates]);
  const typeOptions = useMemo(() => deriveTableOptions(templates, t => t.templateType), [templates]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = templates.filter(t =>
      (!q ||
        t.name.toLowerCase().includes(q) ||
        t.role.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.protocol ?? '').toLowerCase().includes(q)) &&
      (!catFilter || t.category === catFilter) &&
      (!typeFilter || t.templateType === typeFilter)
    );
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'role': cmp = a.role.localeCompare(b.role); break;
        case 'templateType': cmp = (a.templateType || '').localeCompare(b.templateType || ''); break;
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'model': cmp = getModelShort(a.modelParameters?.model).localeCompare(getModelShort(b.modelParameters?.model)); break;
        case 'updatedAt': cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(); break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [templates, search, catFilter, typeFilter, sortField, sortDirection]);

  const handleDelete = useCallback(async (template: AgentTemplate) => {
    if (template.isBuiltIn) return;
    setDeletingId(template.id);
    try {
      const res = await AgentTemplateService.deleteTemplate(template.id);
      if (res.success) {
        onRefresh?.();
      }
    } finally {
      setDeletingId(null);
    }
  }, [onRefresh]);

  return (
    <TooltipProvider>
      <div className={cn(BLOOMBERG_TABLE.container, 'rounded-md')}>
        {/* Header Bar */}
        <div className={cn(BLOOMBERG_TABLE.header, 'flex items-center justify-between')}>
          <span className={BLOOMBERG_TABLE.headerTitle}>AGENT TEMPLATES</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? 's' : ''}
            </span>
            {isAdmin && onCreate && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onCreate}>
                <Plus className="h-3 w-3 mr-1" />
                NEW
              </Button>
            )}
          </div>
        </div>

        {/* Toolbar — search + filters above the table */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
          <TableSearch value={search} onChange={setSearch} placeholder="Search agents…" className="w-64" />
          <TableFilter value={catFilter} onChange={setCatFilter} options={categoryOptions} allLabel="All categories" />
          <TableFilter value={typeFilter} onChange={setTypeFilter} options={typeOptions} allLabel="All types" />
        </div>

        {/* Table */}
        <table className="w-full text-xs">
          <thead className={BLOOMBERG_TABLE.thead}>
            <tr>
              <SortHeader field="role" className="w-[16%]">ROLE</SortHeader>
              <SortHeader field="templateType" className="w-[9%]">TYPE</SortHeader>
              <SortHeader field="category" className="w-[8%]">CAT</SortHeader>
              <SortHeader field="name" className="w-[20%]">NAME</SortHeader>
              <SortHeader field="model" className="w-[9%]">MODEL</SortHeader>
              <th className={cn(BLOOMBERG_TABLE.th, BLOOMBERG_TYPOGRAPHY.mono, 'w-[11%]')}>PROTOCOL</th>
              <th className={cn(BLOOMBERG_TABLE.th, BLOOMBERG_TYPOGRAPHY.mono, 'w-[5%]')}>TAGS</th>
              <SortHeader field="updatedAt" className="w-[8%]">UPDATED</SortHeader>
              {isAdmin && (
                <th className={cn(BLOOMBERG_TABLE.th, BLOOMBERG_TYPOGRAPHY.mono, 'w-[14%] text-right')}>ACTIONS</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No agent templates found. {isAdmin ? 'Create one to get started.' : ''}
                </td>
              </tr>
            ) : (
              sorted.map((template, i) => (
                <tr
                  key={template.id}
                  className={cn(
                    i % 2 === 0 ? BLOOMBERG_TABLE.rowEven : BLOOMBERG_TABLE.rowOdd,
                    BLOOMBERG_TABLE.rowHover,
                    hoveredRow === template.id && 'bg-accent',
                    'cursor-default'
                  )}
                  onMouseEnter={() => setHoveredRow(template.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* Role */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, 'font-medium text-foreground')}>
                    {template.role}
                  </td>

                  {/* Template Type (2026-04-18) — load-bearing for P9 harness scope matcher */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, template.templateType ? 'text-amber-400' : 'text-muted-foreground')}>
                    {template.templateType ?? '—'}
                  </td>

                  {/* Category */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, getCategoryColor(template.category))}>
                    {getCategoryShort(template.category)}
                  </td>

                  {/* Name */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono)}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="truncate block max-w-[200px]">{template.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="font-medium">{template.name}</p>
                        {template.description && <p className="text-xs text-muted-foreground mt-1">{template.description}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </td>

                  {/* Model */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {getModelShort(template.modelParameters?.model)}
                  </td>

                  {/* Protocol (2026-04-17) */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, template.protocol ? 'text-amber-400' : template.loadProtocols ? 'text-sky-400' : 'text-muted-foreground')}>
                    {template.protocol ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate block max-w-[110px]" title={template.protocol}>
                            {template.protocol.replace(/-protocol$/, '')}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="font-mono text-xs">{template.protocol}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : template.loadProtocols ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help border-b border-dotted border-sky-400/50">—</span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="text-xs max-w-[220px]">Meta-agent: uses <span className="font-mono">loadProtocols</span> — every protocol-tagged prompt is injected and the harness selects the matching one per task. Spans <em>all</em> protocols, not one.</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span>—</span>
                    )}
                  </td>

                  {/* Tags count */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {template.tags?.length || 0}
                  </td>

                  {/* Updated */}
                  <td className={cn(BLOOMBERG_TABLE.td, BLOOMBERG_TYPOGRAPHY.mono, BLOOMBERG_TABLE.tdNumber)}>
                    {formatDate(template.updatedAt)}
                  </td>

                  {/* Actions (admin only) */}
                  {isAdmin && (
                    <td className={cn(BLOOMBERG_TABLE.td, 'text-right')}>
                      <div className="flex items-center justify-end gap-1">
                        <RowActionIcon icon={Edit} tooltip="Edit template" onClick={() => onEdit?.(template)} />
                        <RowActionIcon icon={Copy} tooltip="Duplicate template" onClick={() => onDuplicate?.(template)} />
                        {!template.isBuiltIn && (
                          <RowActionIcon
                            icon={Trash2}
                            tooltip="Delete template"
                            variant="danger"
                            disabled={deletingId === template.id}
                            onClick={() => (onDelete ? onDelete(template) : handleDelete(template))}
                          />
                        )}
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
            {sorted.length} template{sorted.length !== 1 ? 's' : ''}
            {' | Sorted by: '}{sortField.charAt(0).toUpperCase() + sortField.slice(1)}
          </span>
          <span className="text-muted-foreground">
            {isAdmin ? 'Admin mode' : 'Read-only'}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
