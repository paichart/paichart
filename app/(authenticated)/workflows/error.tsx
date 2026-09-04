'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BLOOMBERG_COLORS, BLOOMBERG_HEADER } from '@/lib/constants/bloomberg-styles';

/**
 * Workflow Management Error Boundary
 * Bloomberg terminal style error display
 */
export default function WorkflowsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for monitoring
    console.error('[Workflows Error]', {
      message: error.message,
      digest: error.digest,
      timestamp: new Date().toISOString()
    });
  }, [error]);

  return (
    <div className="p-6">
      <div className="bg-background border border-red-500/30 rounded overflow-hidden">
        {/* Header */}
        <div className={`${BLOOMBERG_HEADER.container} bg-red-500/10 border-b border-red-500/30`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-red-400 font-bold text-xs">WORKFLOW ERROR</span>
            <span className="text-muted-foreground text-xs">|</span>
            <span className="text-muted-foreground text-xs font-mono">
              {new Date().toISOString()}
            </span>
          </div>
        </div>

        {/* Error content */}
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              An error occurred while loading the workflow management interface.
            </p>
            <pre className="text-xs font-mono p-3 bg-muted/30 rounded text-red-400 overflow-auto">
              {error.message}
            </pre>
            {error.digest && (
              <p className="text-xs text-muted-foreground font-mono">
                Error ID: {error.digest}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={reset}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/dashboard'}
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
