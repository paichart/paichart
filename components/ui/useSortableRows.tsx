"use client";

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { BLOOMBERG_TABLE, BLOOMBERG_TYPOGRAPHY } from '@/lib/constants/bloomberg-styles';

/**
 * Shared sort state + <SortHeader> for Bloomberg-style tables.
 * The COMPARATOR stays per-page (field-specific) — only the asc/desc state + the clickable-th
 * chrome (▲▼) are shared. Behaviorally identical to AgentTemplateBloombergView's inline version.
 */
export function useSortableRows<F extends string>(initialField: F, initialDir: 'asc' | 'desc' = 'asc') {
  const [sortField, setSortField] = useState<F>(initialField);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialDir);

  const handleSort = useCallback((field: F) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const SortHeader = ({ field, children, className }: { field: F; children: React.ReactNode; className?: string }) => (
    <th
      className={cn(
        BLOOMBERG_TABLE.th,
        'cursor-pointer select-none hover:text-foreground transition-colors',
        BLOOMBERG_TYPOGRAPHY.mono,
        className
      )}
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && (
        <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
      )}
    </th>
  );

  return { sortField, sortDirection, handleSort, SortHeader };
}
