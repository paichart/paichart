import React from 'react';
import { Stage } from '../../types';
import { RelatedSection } from './hooks/useSmartFoldingState';
import { GitBranch, RefreshCw, Loader2 } from 'lucide-react';

interface RelatedSectionsProps {
  relatedSections: RelatedSection[];
  stages: Stage[];
  currentStageId: string | null;
  currentTaskId: string | null;
  onStageSelect: (stageId: string) => void;
  onTaskSelect: (stageId: string, taskId: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

/**
 * Related sections component for displaying relationships between tasks
 */
export const RelatedSections: React.FC<RelatedSectionsProps> = ({
  relatedSections,
  stages,
  currentStageId,
  currentTaskId,
  onStageSelect,
  onTaskSelect,
  onRefresh,
  isLoading
}) => {
  // Get stage name by ID
  const getStageName = (stageId: string) => {
    const stage = stages.find((s: Stage) => s.id === stageId);
    return stage ? stage.name : 'Unknown Stage';
  };
  
  // Get task name by stage ID and task ID
  const getTaskName = (stageId: string, taskId: string) => {
    const stage = stages.find((s: Stage) => s.id === stageId);
    if (!stage) return 'Unknown Task';
    
    const task = stage.tasks.find(t => t.id === taskId);
    return task ? task.title : 'Unknown Task';
  };
  
  // Filter related sections for the current task
  const filteredRelatedSections = currentStageId && currentTaskId
    ? relatedSections.filter(rs => 
        (rs.sourceStageId === currentStageId && rs.sourceTaskId === currentTaskId) ||
        (rs.relatedStageId === currentStageId && rs.relatedTaskId === currentTaskId)
      )
    : [];
  
  // Get the "other" task in the relationship (not the current one)
  const getOtherTask = (rs: RelatedSection) => {
    if (rs.sourceStageId === currentStageId && rs.sourceTaskId === currentTaskId) {
      return {
        stageId: rs.relatedStageId,
        taskId: rs.relatedTaskId,
        stageName: getStageName(rs.relatedStageId),
        taskName: getTaskName(rs.relatedStageId, rs.relatedTaskId)
      };
    } else {
      return {
        stageId: rs.sourceStageId,
        taskId: rs.sourceTaskId,
        stageName: getStageName(rs.sourceStageId),
        taskName: getTaskName(rs.sourceStageId, rs.sourceTaskId)
      };
    }
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-medium">Related Tasks</h3>
        
        <button
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Related Tasks"
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>
      
      {!currentStageId || !currentTaskId ? (
        <div className="text-center py-8 text-gray-500">
          Select a task to see related tasks
        </div>
      ) : filteredRelatedSections.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No related tasks found
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRelatedSections.map((rs, index) => {
            const otherTask = getOtherTask(rs);
            
            return (
              <div 
                key={index}
                className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer"
                onClick={() => onTaskSelect(otherTask.stageId, otherTask.taskId)}
              >
                <div className="flex items-start">
                  <GitBranch className="mt-1 mr-2 text-blue-500 flex-shrink-0" size={16} />
                  <div>
                    <h4 className="font-medium">{otherTask.taskName}</h4>
                    <p className="text-sm text-gray-500">
                      Stage: {otherTask.stageName}
                    </p>
                    <div className="flex items-center mt-2 text-xs text-blue-600">
                      <span>
                        {rs.relationshipType} 
                        {rs.confidence > 0 && ` (${Math.round(rs.confidence * 100)}% confidence)`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
