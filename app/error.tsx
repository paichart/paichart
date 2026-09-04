'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Application error:', error);
  }, [error]);

  // Check if this is a session expiration error
  const isAuthError =
    error.message?.includes('Unauthorized') ||
    error.message?.includes('401') ||
    error.message?.includes('session') ||
    error.message?.includes('authentication');

  if (isAuthError) {
    // For auth errors, redirect to login immediately
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="flex justify-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold">Something went wrong!</h2>
        <p className="text-muted-foreground">
          {typeof error.message === 'string'
            ? error.message
            : typeof error === 'string'
              ? error
              : 'An unexpected error occurred'}
        </p>
        <div className="flex gap-4 justify-center">
          <Button
            onClick={reset}
            variant="default"
          >
            Try again
          </Button>
          <Button
            onClick={() => window.location.href = '/dashboard'}
            variant="outline"
          >
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
