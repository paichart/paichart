import React from 'react';
import { Template } from '../../types';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbNavigationProps {
  template: Template;
  selectedStageId: string | null;
  selectedTaskId: string | null;
  onStageSelect: (stageId: string) => void;
  onTaskSelect: (taskId: string) => void;
}

/**
 * Breadcrumb Navigation component for the Split View
 * Displays the current navigation path and allows quick navigation
 */
export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  template,
  selectedStageId,
  selectedTaskId,
  onStageSelect,
  onTaskSelect
}) => {
  // Get the selected stage and task
  const selectedStage = selectedStageId
    ? template.stages.find(stage => stage.id === selectedStageId)
    : null;
  
  const selectedTask = selectedStageId && selectedTaskId
    ? selectedStage?.tasks.find(task => task.id === selectedTaskId)
    : null;
  
  return (
    <nav className="flex items-center text-sm mb-4 bg-muted p-2 rounded-md">
      <button
        className="flex items-center text-primary hover:text-primary/80"
        onClick={() => {
          // Clear selection
          onStageSelect('');
          onTaskSelect('');
        }}
      >
        <Home size={14} className="mr-1" />
        <span>Template</span>
      </button>
      
      {selectedStage && (
        <>
          <ChevronRight size={14} className="mx-2 text-muted-foreground" />
          <button
            className={`flex items-center ${selectedTask ? 'text-primary hover:text-primary/80' : 'text-foreground'}`}
            onClick={() => {
              // Select stage but clear task
              onStageSelect(selectedStage.id);
              onTaskSelect('');
            }}
          >
            <span>{selectedStage.name}</span>
          </button>
        </>
      )}
      
      {selectedTask && (
        <>
          <ChevronRight size={14} className="mx-2 text-muted-foreground" />
          <span className="text-foreground">{selectedTask.name}</span>
        </>
      )}
    </nav>
  );
};
