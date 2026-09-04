'use client';

import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';

/**
 * Workflow Management Loading State
 * Bloomberg terminal style skeleton
 */
export default function WorkflowsLoading() {
  return (
    <div className="p-6 space-y-4">
      {/* Header skeleton */}
      <div className={`${BLOOMBERG_HEADER.container} animate-pulse`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-4 w-32 bg-amber-400/20 rounded" />
            <div className="h-3 w-24 bg-muted-foreground/20 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-muted rounded" />
            <div className="h-8 w-20 bg-amber-400/20 rounded" />
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-12rem)]">
        {/* Left panel - workflow list */}
        <div className="col-span-4 bg-background border border-border rounded overflow-hidden">
          <div className={`${BLOOMBERG_HEADER.container}`}>
            <div className="h-4 w-24 bg-amber-400/20 rounded animate-pulse" />
          </div>
          <div className="p-2 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="p-3 bg-muted/30 rounded animate-pulse">
                <div className="h-4 w-3/4 bg-muted rounded mb-2" />
                <div className="h-3 w-1/2 bg-muted/50 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Center panel - editor */}
        <div className="col-span-5 bg-background border border-border rounded overflow-hidden">
          <div className={`${BLOOMBERG_HEADER.container}`}>
            <div className="h-4 w-32 bg-amber-400/20 rounded animate-pulse" />
          </div>
          <div className="p-4 space-y-4">
            <div className="h-10 bg-muted/30 rounded animate-pulse" />
            <div className="h-10 bg-muted/30 rounded animate-pulse" />
            <div className="h-40 bg-muted/20 rounded animate-pulse" />
          </div>
        </div>

        {/* Right panel - recommendations */}
        <div className="col-span-3 bg-background border border-border rounded overflow-hidden">
          <div className={`${BLOOMBERG_HEADER.container}`}>
            <div className="h-4 w-28 bg-amber-400/20 rounded animate-pulse" />
          </div>
          <div className="p-2 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-2 bg-muted/30 rounded animate-pulse">
                <div className="h-3 w-full bg-muted rounded mb-1" />
                <div className="h-3 w-2/3 bg-muted/50 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
