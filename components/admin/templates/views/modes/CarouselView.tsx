import React, { useState, useEffect, useRef } from 'react';
import { ViewModeProps } from '../types';
import { 
  StageCarousel, 
  TimelineBar, 
  TaskPinning,
  useCarouselState
} from './carousel-view';

/**
 * Carousel-Style Stage Navigator with Context Preservation
 * 
 * Features:
 * - Horizontal carousel for stages
 * - Previews of adjacent stages
 * - Timeline/progress bar showing all stages
 * - Animated transitions between stages
 * - Task pinning across stages
 */
export const CarouselView: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly
}) => {
  // Use the carousel state hook
  const {
    currentStageIndex,
    setCurrentStageIndex,
    pinnedTasks,
    pinTask,
    unpinTask,
    updateStage,
    updateTask,
    stages
  } = useCarouselState(template, onTemplateChange);
  
  // Ref for the carousel container
  const carouselContainerRef = useRef<HTMLDivElement>(null);
  
  // Handle save
  const handleSave = () => {
    onSave(template);
  };
  
  // Get the current stage and adjacent stages
  const currentStage = stages[currentStageIndex] || null;
  const prevStage = currentStageIndex > 0 ? stages[currentStageIndex - 1] : null;
  const nextStage = currentStageIndex < stages.length - 1 ? stages[currentStageIndex + 1] : null;
  
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-bold">{template.name}</h2>
        <p className="text-muted-foreground text-sm">{template.description}</p>
      </div>
      
      {/* Timeline Bar */}
      <TimelineBar
        stages={stages}
        currentStageIndex={currentStageIndex}
        onStageSelect={setCurrentStageIndex}
        isReadOnly={isReadOnly || false}
      />
      
      {/* Main Carousel */}
      <div 
        ref={carouselContainerRef}
        className="flex-1 relative overflow-hidden border rounded-lg bg-card"
      >
        <StageCarousel
          stages={stages}
          currentStageIndex={currentStageIndex}
          onStageSelect={setCurrentStageIndex}
          onStageUpdate={updateStage}
          onTaskUpdate={updateTask}
          isReadOnly={isReadOnly || false}
          prevStage={prevStage}
          nextStage={nextStage}
        />
      </div>
      
      {/* Pinned Tasks */}
      <TaskPinning
        pinnedTasks={pinnedTasks}
        onUnpinTask={unpinTask}
        onTaskUpdate={updateTask}
        isReadOnly={isReadOnly || false}
      />
    </div>
  );
};
