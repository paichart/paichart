import React from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';

export interface StepperProps {
  steps: {
    id: string;
    label: string;
  }[];
  currentStep: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export function Stepper({ steps, currentStep, onStepClick, className }: StepperProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = onStepClick && (isCompleted || index === currentStep + 1);
          
          return (
            <React.Fragment key={step.id}>
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                    isCompleted ? 'border-blue-600 bg-blue-600 text-white' :
                    isCurrent ? 'border-blue-600 text-blue-600' :
                    'border-border text-muted-foreground',
                    isClickable ? 'cursor-pointer hover:border-blue-500' : 'cursor-default'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <CheckIcon className="h-5 w-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>
                <span
                  className={cn(
                    'mt-2 text-sm font-medium',
                    isCurrent ? 'text-blue-600' :
                    isCompleted ? 'text-foreground' :
                    'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-full max-w-[100px] flex-1 mx-2',
                    index < currentStep ? 'bg-blue-600' : 'bg-border'
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default Stepper;
