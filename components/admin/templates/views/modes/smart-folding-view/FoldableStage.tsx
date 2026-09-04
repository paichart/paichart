import React, { useState } from 'react';
import { Stage, Task } from '../../types';
import { RelatedSection } from './hooks/useSmartFoldingState';
import { ChevronDown, ChevronRight, Edit, Plus, Trash, GitBranch } from 'lucide-react';

interface FoldableStageProps {
  stage: Stage;
  isFolded: boolean;
  foldedTaskIds: string[];
  isCurrentStage: boolean;
  currentTaskId: string | null;
  onStageSelect: () => void;
  onTaskSelect: (taskId: string) => void;
  onStageUpdate: (updatedStage: Partial<Stage>) => void;
  onTaskUpdate: (taskId: string, updatedTask: Partial<Task>) => void;
  relatedSections: RelatedSection[];
  isReadOnly: boolean;
}

/**
 * Foldable stage component with intelligent folding
 */
export const FoldableStage: React.FC<FoldableStageProps> = ({
  stage,
  isFolded,
  foldedTaskIds,
  isCurrentStage,
  currentTaskId,
  onStageSelect,
  onTaskSelect,
  onStageUpdate,
  onTaskUpdate,
  relatedSections,
  isReadOnly
}) => {
  // State for stage expansion
  const [isExpanded, setIsExpanded] = useState(!isFolded);
  
  // Handle stage click
  const handleStageClick = () => {
    onStageSelect();
    setIsExpanded(!isExpanded);
  };
  
  // Handle stage edit
  const handleStageEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // In a real implementation, this would open a modal or inline editor
    const newName = prompt('Enter new stage name:', stage.name);
    if (newName && newName !== stage.name) {
      onStageUpdate({ name: newName });
    }
  };
  
  // Handle task edit
  const handleTaskEdit = (e: React.MouseEvent, taskId: string, task: Task) => {
    e.stopPropagation();
    
    // In a real implementation, this would open a modal or inline editor
    const newName = prompt('Enter new task name:', task.title);
    if (newName && newName !== task.title) {
      onTaskUpdate(taskId, { title: newName });
    }
  };
  
  // Check if a task is related to the current task
  const isRelatedTask = (taskId: string) => {
    if (!currentTaskId) return false;
    
    return relatedSections.some(rs => 
      (rs.sourceStageId === stage.id && rs.sourceTaskId === taskId) ||
      (rs.relatedStageId === stage.id && rs.relatedTaskId === taskId)
    );
  };
  
  // Get relationship type for a task
  const getRelationshipType = (taskId: string) => {
    if (!currentTaskId) return null;
    
    const relation = relatedSections.find(rs => 
      (rs.sourceStageId === stage.id && rs.sourceTaskId === taskId) ||
      (rs.relatedStageId === stage.id && rs.relatedTaskId === taskId)
    );
    
    return relation ? relation.relationshipType : null;
  };
  
  // Get relationship confidence for a task
  const getRelationshipConfidence = (taskId: string) => {
    if (!currentTaskId) return 0;
    
    const relation = relatedSections.find(rs => 
      (rs.sourceStageId === stage.id && rs.sourceTaskId === taskId) ||
      (rs.relatedStageId === stage.id && rs.relatedTaskId === taskId)
    );
    
    return relation ? relation.confidence : 0;
  };
  
  return (
    <div className={`mb-4 border rounded-lg overflow-hidden ${isCurrentStage ? 'border-primary' : 'border-border'}`}>
      {/* Stage header */}
      <div 
        className={`
          flex items-center justify-between p-3 cursor-pointer
          ${isCurrentStage ? 'bg-primary/10' : 'bg-muted'}
          ${isFolded ? 'border-b-0' : 'border-b'}
        `}
        onClick={handleStageClick}
      >
        <div className="flex items-center">
          {isExpanded ? (
            <ChevronDown className="mr-2" size={16} />
          ) : (
            <ChevronRight className="mr-2" size={16} />
          )}
          <h3 className="font-medium">{stage.name}</h3>
          {stage.description && (
            <span className="text-muted-foreground text-sm ml-2">
              {stage.description.length > 50 
                ? `${stage.description.substring(0, 50)}...` 
                : stage.description}
            </span>
          )}
        </div>
        
        <div className="flex items-center">
          <span className="text-sm text-muted-foreground mr-2">
            {stage.tasks.length} {stage.tasks.length === 1 ? 'task' : 'tasks'}
          </span>
          
          {!isReadOnly && (
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={handleStageEdit}
              title="Edit Stage"
            >
              <Edit size={14} />
            </button>
          )}
        </div>
      </div>
      
      {/* Stage content */}
      {isExpanded && (
        <div className="p-3">
          {/* Tasks */}
          {stage.tasks.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No tasks in this stage
            </div>
          ) : (
            <div className="space-y-2">
              {stage.tasks.map((task: Task) => {
                const isTaskFolded = foldedTaskIds.includes(task.id);
                const isTaskSelected = isCurrentStage && currentTaskId === task.id;
                const isRelated = isRelatedTask(task.id);
                const relationshipType = getRelationshipType(task.id);
                const relationshipConfidence = getRelationshipConfidence(task.id);
                
                // Skip folded tasks unless they are related to the current task
                if (isTaskFolded && !isRelated) return null;
                
                return (
                  <div 
                    key={task.id}
                    className={`
                      p-3 border rounded-md cursor-pointer
                      ${isTaskSelected ? 'bg-primary/20 border-primary/50' : 'hover:bg-muted'}
                      ${isRelated ? 'border-primary/50' : ''}
                      ${isTaskFolded ? 'opacity-70' : ''}
                    `}
                    onClick={() => onTaskSelect(task.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{task.title}</h4>
                        {task.description && !isTaskFolded && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          Type: {task.type}
                        </div>
                        
                        {/* Relationship indicator */}
                        {isRelated && relationshipType && (
                          <div className="flex items-center mt-2 text-xs text-primary">
                            <GitBranch size={12} className="mr-1" />
                            <span>
                              {relationshipType} 
                              {relationshipConfidence > 0 && ` (${Math.round(relationshipConfidence * 100)}% confidence)`}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {!isReadOnly && (
                        <button
                          className="p-1 rounded hover:bg-muted"
                          onClick={(e) => handleTaskEdit(e, task.id, task)}
                          title="Edit Task"
                        >
                          <Edit size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Add task button */}
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
    </div>
  );
};
