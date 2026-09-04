import React from 'react';
import { Stage } from '../../types';
import { ChevronRight, Edit, Plus } from 'lucide-react';

interface StageNavigatorProps {
  stages: Stage[];
  selectedStageId: string | null;
  onStageSelect: (stageId: string) => void;
  isReadOnly: boolean;
  onStageUpdate: (stageId: string, updatedStage: Partial<Stage>) => void;
}

/**
 * Stage Navigator component for the Split View
 * Displays a list of stages and allows selecting one
 */
export const StageNavigator: React.FC<StageNavigatorProps> = ({
  stages,
  selectedStageId,
  onStageSelect,
  isReadOnly,
  onStageUpdate
}) => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b bg-muted flex justify-between items-center">
        <h3 className="font-medium">Stages</h3>
        {!isReadOnly && (
          <button
            className="p-1 rounded hover:bg-accent"
            title="Add Stage"
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {stages.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No stages found
          </div>
        ) : (
          <ul className="divide-y">
            {stages.map(stage => (
              <li 
                key={stage.id}
                className={`
                  p-3 cursor-pointer hover:bg-accent/50
                  ${selectedStageId === stage.id ? 'bg-primary/10 border-l-4 border-primary' : ''}
                `}
                onClick={() => onStageSelect(stage.id)}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <ChevronRight 
                      size={16} 
                      className={`mr-2 transition-transform ${selectedStageId === stage.id ? 'transform rotate-90' : ''}`} 
                    />
                    <span className="font-medium">{stage.name}</span>
                  </div>
                  
                  {!isReadOnly && (
                    <button
                      className="p-1 rounded hover:bg-accent"
                      title="Edit Stage"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open stage edit dialog or inline edit
                      }}
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>
                
                {stage.description && (
                  <p className="text-sm text-muted-foreground mt-1 ml-6">
                    {stage.description}
                  </p>
                )}
                
                <div className="text-xs text-muted-foreground/70 mt-1 ml-6">
                  {stage.tasks.length} {stage.tasks.length === 1 ? 'task' : 'tasks'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
