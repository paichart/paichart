"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ExtendedPoVDetails } from '@/lib/pov/hooks/usePOVList';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  Edit,
  GitBranch,
  Trash2
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';
import { getStatusSymbol as getSharedStatusSymbol, getPriorityDisplay } from '@/lib/constants/bloomberg-styles';

interface POVBloombergViewProps {
  povs: ExtendedPoVDetails[];
  onPovDeleted?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  pov: ExtendedPoVDetails;
}

// Format currency - compact Bloomberg style
function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

// Format date - compact MM/DD
function formatDate(date: string | Date): string {
  const d = new Date(date);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
}

// Status symbols now imported from shared bloomberg-styles.ts
const getStatusSymbol = getSharedStatusSymbol;

// Calculate days remaining
function getDaysRemaining(endDate: string | Date): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Get days color
function getDaysColor(days: number): string {
  if (days < 0) return 'text-red-400';
  if (days <= 7) return 'text-amber-400';
  if (days <= 30) return 'text-yellow-400';
  return 'text-green-400';
}

type SortField = 'revenue' | 'endDate' | 'status' | 'title' | 'owner';
type SortDirection = 'asc' | 'desc';

export function POVBloombergView({ povs, onPovDeleted }: POVBloombergViewProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [povToDelete, setPovToDelete] = useState<ExtendedPoVDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, pov: ExtendedPoVDetails) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, pov });
  }, []);

  // Delete handlers
  const handleDeleteClick = useCallback((pov: ExtendedPoVDetails) => {
    setContextMenu(null);
    setPovToDelete(pov);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!povToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/pov/${povToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete POV');
      }

      setDeleteDialogOpen(false);
      setPovToDelete(null);

      if (onPovDeleted) {
        onPovDeleted();
      }
    } catch {
      // Could not delete POV
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setPovToDelete(null);
  };

  // Sort POVs
  const sortedPovs = useMemo(() => {
    return [...povs].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'revenue':
          const revA = a.revenue ? parseFloat(a.revenue.toString()) : 0;
          const revB = b.revenue ? parseFloat(b.revenue.toString()) : 0;
          comparison = revA - revB;
          break;
        case 'endDate':
          comparison = new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'owner':
          const ownerA = a.owner?.name || '';
          const ownerB = b.owner?.name || '';
          comparison = ownerA.localeCompare(ownerB);
          break;
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [povs, sortField, sortDirection]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalRevenue = povs.reduce((sum, p) => sum + (p.revenue ? parseFloat(p.revenue.toString()) : 0), 0);
    const avgProgress = povs.length > 0
      ? povs.reduce((sum, p) => sum + (p.progress || 0), 0) / povs.length
      : 0;
    const byStatus = povs.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { totalRevenue, avgProgress, byStatus, count: povs.length };
  }, [povs]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortHeader = ({ field, label, className }: { field: SortField; label: string; className?: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={cn(
        "text-left hover:text-foreground transition-colors flex items-center gap-1",
        sortField === field ? "text-amber-400" : "text-muted-foreground",
        className
      )}
    >
      {label}
      {sortField === field && (
        <span className="text-xs">{sortDirection === 'desc' ? '▼' : '▲'}</span>
      )}
    </button>
  );

  if (povs.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground font-mono text-sm">
        NO DATA AVAILABLE
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="bg-background rounded border border-border font-mono text-sm overflow-hidden">
        {/* Header Bar - Bloomberg style divider */}
        <div className="px-3 py-1.5 bg-muted border-b border-border text-xs">
          <span className="text-amber-400 font-bold">DETAIL VIEW</span>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-[auto_1fr_100px_80px_80px_100px_80px_100px] gap-2 px-3 py-2 bg-muted/50 border-b border-border text-xs uppercase tracking-wide">
          <div className="w-6 text-muted-foreground">#</div>
          <SortHeader field="title" label="POV" />
          <SortHeader field="revenue" label="Revenue" className="text-right" />
          <SortHeader field="endDate" label="Close" className="text-center" />
          <div className="text-center text-muted-foreground">Days</div>
          <SortHeader field="status" label="Status" className="text-center" />
          <div className="text-center text-muted-foreground">Prog</div>
          <SortHeader field="owner" label="Owner" />
        </div>

        {/* Data Rows */}
        <div className="divide-y divide-border">
          {sortedPovs.map((pov, index) => {
            const { symbol, color, bg } = getStatusSymbol(pov.status);
            const revenue = pov.revenue ? parseFloat(pov.revenue.toString()) : 0;
            const daysRemaining = getDaysRemaining(pov.forecastDate || pov.endDate);
            const progress = pov.progress || 0;
            const isHovered = hoveredRow === pov.id;

            return (
              <div
                key={pov.id}
                className={cn(
                  "grid grid-cols-[auto_1fr_100px_80px_80px_100px_80px_100px] gap-2 px-3 py-2 cursor-pointer transition-colors",
                  isHovered ? "bg-accent" : index % 2 === 0 ? "bg-background" : "bg-muted/30"
                )}
                onClick={() => router.push(`/pov/view/${pov.id}`)}
                onContextMenu={(e) => handleContextMenu(e, pov)}
                onMouseEnter={() => setHoveredRow(pov.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                {/* Row Number */}
                <div className="w-6 text-muted-foreground text-xs flex items-center">
                  {(index + 1).toString().padStart(2, '0')}
                </div>

                {/* Title + Customer */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate">
                      <span className="text-foreground">{pov.title}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{pov.customerName}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-mono text-xs">
                    <p className="font-bold">{pov.title}</p>
                    <p className="text-muted-foreground">{pov.customerName}</p>
                    {pov.salesTheatre && <p className="text-muted-foreground">{pov.salesTheatre}</p>}
                  </TooltipContent>
                </Tooltip>

                {/* Revenue */}
                <div className="text-right text-green-400 font-bold">
                  ${formatCurrency(revenue)}
                </div>

                {/* Close Date */}
                <div className="text-center text-muted-foreground">
                  {formatDate(pov.forecastDate || pov.endDate)}
                </div>

                {/* Days Remaining */}
                <div className={cn("text-center font-bold", getDaysColor(daysRemaining))}>
                  {daysRemaining > 0 ? `+${daysRemaining}` : daysRemaining}
                </div>

                {/* Status Symbol */}
                <div className="flex items-center justify-center">
                  <span className={cn("px-2 py-0.5 rounded text-xs", bg, color)}>
                    {symbol} {pov.status.substring(0, 4)}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        progress >= 80 ? "bg-green-500" :
                        progress >= 50 ? "bg-amber-500" :
                        "bg-red-500"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8">{progress}%</span>
                </div>

                {/* Owner */}
                <div className="text-muted-foreground text-xs truncate">
                  {pov.owner?.name?.split(' ')[0] || '—'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer - Summary Row */}
        <div className="grid grid-cols-[auto_1fr_100px_80px_80px_100px_80px_100px] gap-2 px-3 py-2 bg-muted border-t border-border text-xs font-bold">
          <div className="w-6"></div>
          <div className="text-amber-400">TOTAL ({totals.count})</div>
          <div className="text-right text-green-400">${formatCurrency(totals.totalRevenue)}</div>
          <div></div>
          <div></div>
          <div></div>
          <div className="text-center text-muted-foreground">{Math.round(totals.avgProgress)}%</div>
          <div></div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-end px-3 py-2 bg-muted/50 border-t border-border text-xs">
          <span className="text-muted-foreground">Click to view • Right-click for actions</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              router.push(`/pov/edit/${contextMenu.pov.id}?mode=project`);
              setContextMenu(null);
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit Tasks
          </button>
          <button
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              router.push(`/pov/edit/${contextMenu.pov.id}`);
              setContextMenu(null);
            }}
          >
            <GitBranch className="mr-2 h-4 w-4" />
            Edit POV
          </button>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <button
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => handleDeleteClick(contextMenu.pov)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete POV
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={handleDeleteCancel} />
          <div className="relative bg-card p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete POV</h3>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete &ldquo;{povToDelete?.title}&rdquo;? This action cannot be undone and will permanently remove the POV and all associated data.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete POV'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}

export default POVBloombergView;
