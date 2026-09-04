import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

const ErrorFallback = ({ error }: FallbackProps) => (
  <Card>
    <CardContent>
      <Alert variant="destructive">
        <AlertDescription>
          {error.message || 'Failed to load widget'}
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
);

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
}

export const WidgetErrorBoundary = ({ children }: WidgetErrorBoundaryProps) => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset widget state if needed
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

export default WidgetErrorBoundary;
