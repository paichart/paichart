import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { ValidationError } from '../utils/validation';

interface ValidationErrorsProps {
  errors: ValidationError[];
  onNavigateToError?: (error: ValidationError) => void;
}

export function ValidationErrors({ errors, onNavigateToError }: ValidationErrorsProps) {
  if (errors.length === 0) {
    return null;
  }
  
  const errorCount = errors.filter(e => e.type === 'error').length;
  const warningCount = errors.filter(e => e.type === 'warning').length;
  
  return (
    <div className="space-y-4">
      <Alert variant={errorCount > 0 ? "destructive" : "default"}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>
          {errorCount > 0 
            ? `${errorCount} error${errorCount !== 1 ? 's' : ''}`
            : `${warningCount} warning${warningCount !== 1 ? 's' : ''}`
          }
        </AlertTitle>
        <AlertDescription>
          Please fix the following issues before saving the template.
        </AlertDescription>
      </Alert>
      
      <div className="space-y-2 max-h-60 overflow-y-auto p-2 border rounded-md">
        {errors.map((error, index) => (
          <div 
            key={index}
            className={`p-3 rounded-md flex items-start cursor-pointer hover:bg-muted ${
              error.type === 'error' ? 'bg-destructive/10' : 'bg-warning/10'
            }`}
            onClick={() => onNavigateToError && onNavigateToError(error)}
          >
            {error.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-destructive mr-2 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning mr-2 mt-0.5" />
            )}
            
            <div className="flex-1">
              <div className={error.type === 'error' ? 'text-destructive' : 'text-warning'}>
                {error.message}
              </div>
              
              {(error.stageName || error.taskId) && (
                <div className="text-xs mt-1">
                  {error.stageName && <span className="text-muted-foreground">Stage: {error.stageName}</span>}
                  {error.stageName && error.taskId && <span className="mx-1">•</span>}
                  {error.taskId && <span className="text-muted-foreground">Task ID: {error.taskId}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
