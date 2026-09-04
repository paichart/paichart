import React, { useState, useEffect, useRef } from 'react';
import { Stage, Task } from '../../types';
import { ChevronLeft, ChevronRight, Edit, Plus, Trash } from 'lucide-react';

interface StageCarouselProps {
  stages: Stage[];
  currentStageIndex: number;
  onStageSelect: (index: number) => void;
  onStageUpdate: (stageId: string, updatedStage: Partial<Stage>) => void;
  onTaskUpdate: (stageId: string, taskId: string, updatedTask: Partial<Task>) => void;
  isReadOnly: boolean;
  prevStage: Stage | null;
  nextStage: Stage | null;
}

/**
 * Horizontal carousel for stages with previews of adjacent stages
 */
export const StageCarousel: React.FC<StageCarouselProps> = ({
  stages,
  currentStageIndex,
  onStageSelect,
  onStageUpdate,
  onTaskUpdate,
  isReadOnly,
  prevStage,
  nextStage
}) => {
  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right' | null>(null);
  
  // Refs for the carousel items
  const mainStageRef = useRef<HTMLDivElement>(null);
  const prevStageRef = useRef<HTMLDivElement>(null);
  const nextStageRef = useRef<HTMLDivElement>(null);
  
  // Current stage
  const currentStage = stages[currentStageIndex];
  
  // Handle navigation
  const handlePrevStage = () => {
    if (currentStageIndex > 0 && !isAnimating) {
      setIsAnimating(true);
      setAnimationDirection('right');
      
      // Animate transition
      setTimeout(() => {
        onStageSelect(currentStageIndex - 1);
        setIsAnimating(false);
        setAnimationDirection(null);
      }, 300);
    }
  };
  
  const handleNextStage = () => {
    if (currentStageIndex < stages.length - 1 && !isAnimating) {
      setIsAnimating(true);
      setAnimationDirection('left');
      
      // Animate transition
      setTimeout(() => {
        onStageSelect(currentStageIndex + 1);
        setIsAnimating(false);
        setAnimationDirection(null);
      }, 300);
    }
  };
  
  // Handle stage edit
  const handleStageEdit = (e: React.MouseEvent, stageId: string) => {
    e.stopPropagation();
    
    // In a real implementation, this would open a modal or inline editor
    const newName = prompt('Enter new stage name:', currentStage.name);
    if (newName && newName !== currentStage.name) {
      onStageUpdate(stageId, { name: newName });
    }
  };
  
  // Handle task edit
  const handleTaskEdit = (e: React.MouseEvent, stageId: string, taskId: string, task: Task) => {
    e.stopPropagation();
    
    // In a real implementation, this would open a modal or inline editor
    const newName = prompt('Enter new task name:', task.title);
    if (newName && newName !== task.title) {
      onTaskUpdate(stageId, taskId, { title: newName });
    }
  };
  
  // Animation classes
  const getAnimationClass = (type: 'main' | 'prev' | 'next') => {
    if (!isAnimating) return '';
    
    if (type === 'main') {
      return animationDirection === 'left' 
        ? 'animate-slide-left-out' 
        : 'animate-slide-right-out';
    } else if (type === 'prev') {
      return animationDirection === 'right' 
        ? 'animate-slide-right-in' 
        : '';
    } else if (type === 'next') {
      return animationDirection === 'left' 
        ? 'animate-slide-left-in' 
        : '';
    }
    
    return '';
  };
  
  return (
    <div className="h-full flex items-center justify-center relative">
      {/* Navigation buttons */}
      <button
        className={`absolute left-2 z-10 p-2 rounded-full bg-card shadow-md hover:bg-accent ${
          currentStageIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={handlePrevStage}
        disabled={currentStageIndex === 0 || isAnimating}
        aria-label="Previous stage"
      >
        <ChevronLeft size={24} />
      </button>
      
      <button
        className={`absolute right-2 z-10 p-2 rounded-full bg-card shadow-md hover:bg-accent ${
          currentStageIndex === stages.length - 1 ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onClick={handleNextStage}
        disabled={currentStageIndex === stages.length - 1 || isAnimating}
        aria-label="Next stage"
      >
        <ChevronRight size={24} />
      </button>
      
      {/* Carousel container */}
      <div className="w-full h-full flex items-stretch overflow-hidden">
        {/* Previous stage preview */}
        {prevStage && (
          <div
            ref={prevStageRef}
            className={`absolute left-0 top-0 w-1/5 h-full bg-card border-r p-4 transform -translate-x-full opacity-70 ${
              getAnimationClass('prev')
            }`}
          >
            <div className="h-full overflow-hidden">
              <h3 className="text-lg font-medium mb-2 truncate">{prevStage.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{prevStage.description}</p>
              <div className="text-xs text-muted-foreground/70 mb-2">
                {prevStage.tasks.length} {prevStage.tasks.length === 1 ? 'task' : 'tasks'}
              </div>
            </div>
          </div>
        )}
        
        {/* Current stage */}
        {currentStage && (
          <div
            ref={mainStageRef}
            className={`w-full h-full bg-card p-6 ${getAnimationClass('main')}`}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{currentStage.name}</h2>
              
              {!isReadOnly && (
                <button
                  className="p-1 rounded hover:bg-accent"
                  onClick={(e) => handleStageEdit(e, currentStage.id)}
                  title="Edit Stage"
                >
                  <Edit size={16} />
                </button>
              )}
            </div>
            
            <p className="text-muted-foreground mb-6">{currentStage.description}</p>
            
            <h3 className="text-lg font-medium mb-3">Tasks</h3>
            
            {currentStage.tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tasks in this stage
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100% - 150px)' }}>
                {currentStage.tasks.map(task => (
                  <div
                    key={task.id}
                    className="p-3 border rounded-md hover:bg-accent/50"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{task.title}</h4>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <div className="text-xs text-muted-foreground/70 mt-2">
                          Type: {task.type}
                        </div>
                      </div>
                      
                      {!isReadOnly && (
                        <button
                          className="p-1 rounded hover:bg-accent"
                          onClick={(e) => handleTaskEdit(e, currentStage.id, task.id, task)}
                          title="Edit Task"
                        >
                          <Edit size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {!isReadOnly && (
              <div className="mt-4">
                <button
                  className="flex items-center text-primary hover:text-primary/80"
                  onClick={() => {
                    // In a real implementation, this would open a modal or inline editor
                    alert('Add task functionality would be implemented here');
                  }}
                >
                  <Plus size={16} className="mr-1" />
                  Add Task
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Next stage preview */}
        {nextStage && (
          <div
            ref={nextStageRef}
            className={`absolute right-0 top-0 w-1/5 h-full bg-card border-l p-4 transform translate-x-full opacity-70 ${
              getAnimationClass('next')
            }`}
          >
            <div className="h-full overflow-hidden">
              <h3 className="text-lg font-medium mb-2 truncate">{nextStage.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{nextStage.description}</p>
              <div className="text-xs text-muted-foreground/70 mb-2">
                {nextStage.tasks.length} {nextStage.tasks.length === 1 ? 'task' : 'tasks'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
