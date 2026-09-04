import React from 'react';
import { Stage } from '../../types';
import { Check, Circle } from 'lucide-react';

interface TimelineBarProps {
  stages: Stage[];
  currentStageIndex: number;
  onStageSelect: (index: number) => void;
  isReadOnly: boolean;
}

/**
 * Timeline/progress bar showing all stages
 */
export const TimelineBar: React.FC<TimelineBarProps> = ({
  stages,
  currentStageIndex,
  onStageSelect,
  isReadOnly
}) => {
  // Calculate progress percentage
  const progressPercentage = stages.length > 0 
    ? ((currentStageIndex + 1) / stages.length) * 100 
    : 0;
  
  return (
    <div className="mb-6">
      {/* Progress bar */}
      <div className="relative h-2 bg-muted rounded-full mb-4">
        <div
          className="absolute h-full bg-primary rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      {/* Stage indicators */}
      <div className="flex justify-between items-center">
        {stages.map((stage, index) => {
          // Determine stage status
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;
          
          return (
            <div 
              key={stage.id}
              className="flex flex-col items-center"
              style={{ width: `${100 / stages.length}%` }}
            >
              {/* Stage indicator */}
              <button
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center mb-2
                  ${isCompleted ? 'bg-success text-success-foreground' : ''}
                  ${isCurrent ? 'bg-primary text-primary-foreground' : ''}
                  ${isPending ? 'bg-muted text-muted-foreground' : ''}
                  ${!isReadOnly ? 'hover:opacity-80 cursor-pointer' : ''}
                  transition-all duration-200
                `}
                onClick={() => !isReadOnly && onStageSelect(index)}
                disabled={isReadOnly}
                title={stage.name}
              >
                {isCompleted ? (
                  <Check size={16} />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </button>
              
              {/* Stage name */}
              <span 
                className={`
                  text-xs text-center truncate w-full px-1
                  ${isCurrent ? 'font-medium text-primary' : 'text-muted-foreground'}
                `}
                title={stage.name}
              >
                {stage.name}
              </span>
            </div>
          );
        })}
      </div>
      
      {/* Stage details */}
      <div className="mt-4 p-3 bg-muted rounded-md">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-sm font-medium">
              Stage {currentStageIndex + 1} of {stages.length}
            </span>
            <div className="text-xs text-muted-foreground mt-1">
              {stages[currentStageIndex]?.tasks.length || 0} tasks in this stage
            </div>
          </div>
          
          <div className="text-sm">
            <span className="font-medium">{Math.round(progressPercentage)}%</span> complete
          </div>
        </div>
      </div>
    </div>
  );
};
