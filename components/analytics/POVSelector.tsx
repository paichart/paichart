'use client';

import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';

interface POVSelectorProps {
  value: string | 'all';
  onChange: (value: string | 'all') => void;
  includeAllOption?: boolean;
}

interface POV {
  id: string;
  title: string;
  status: string;
}

/**
 * POV Selector Component
 * Phase 2 Task 2.1: Dropdown for selecting Project (POV)
 *
 * Features:
 * - Fetches user's accessible POVs from /api/pov
 * - Includes "All Projects" option for cross-POV analytics
 * - Loading and error states
 * - 5-minute cache for performance
 */
export function POVSelector({ value, onChange, includeAllOption = true }: POVSelectorProps) {
  const { data: povs, isLoading, error } = useQuery({
    queryKey: ['user-povs'],
    queryFn: async () => {
      const res = await fetch('/api/pov');
      if (!res.ok) throw new Error('Failed to fetch POVs');
      const json = await res.json();
      return json.data || json; // Handle both { data: [...] } and [...] formats
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="w-96 h-10 bg-muted animate-pulse rounded"
           role="status"
           aria-label="Loading projects"
      />
    );
  }

  if (error) {
    return (
      <div className="w-96 h-10 px-3 py-2 border border-destructive rounded text-sm text-destructive">
        Failed to load projects
      </div>
    );
  }

  const povList: POV[] = Array.isArray(povs) ? povs : [];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-96">
        <SelectValue placeholder="Select Project" />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption && (
          <SelectItem value="all">All Projects ({povList.length})</SelectItem>
        )}
        {povList.map((pov) => (
          <SelectItem key={pov.id} value={pov.id}>
            {pov.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
