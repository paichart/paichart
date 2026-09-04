"use client";

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Derive sorted, de-duplicated {value,label} options from a list + a field accessor. Works for any field
 * type (string enum, string | null, etc.) — falsy values are dropped and everything is stringified.
 */
export function deriveTableOptions<T>(items: T[], get: (i: T) => unknown): { value: string; label: string }[] {
  const set = new Set<string>();
  for (const i of items) {
    const v = get(i);
    if (v) set.add(String(v));
  }
  return Array.from(set).sort().map(v => ({ value: v, label: v }));
}

/**
 * Compact filter dropdown for a table toolbar. Native select, Bloomberg-styled. Empty value = "all"
 * (no filter). Options are typically derived from the data so only present values appear.
 */
export function TableFilter({
  value,
  onChange,
  options,
  allLabel = 'All',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40',
        className
      )}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
