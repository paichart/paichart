import React, { useState, useEffect } from 'react';
import { Task, Stage } from '../../types';
import { Save, X, AlertCircle } from 'lucide-react';
import { TaskTypeSelector } from '@/components/admin/templates/TaskTypeSelector';
import { TaskType } from '@prisma/client';

interface TaskEditorProps {
  task: Task | null;
  stage: Stage | null;
  onTaskUpdate: (taskId: string, stageId: string, updatedTask: Partial<Task>) => void;
  isReadOnly: boolean;
  allStages: Stage[];
}

/**
 * Task Editor component for the Split View
 * Displays a form to edit the selected task
 */
export const TaskEditor: React.FC<TaskEditorProps> = ({
  task,
  stage,
  onTaskUpdate,
  isReadOnly,
  allStages
}) => {
  // Form state
  const [formState, setFormState] = useState<Partial<Task>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  
  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setFormState({ ...task });
      setErrors({});
      setIsDirty(false);
    } else {
      setFormState({});
      setErrors({});
      setIsDirty(false);
    }
  }, [task]);
  
  // Handle form input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormState(prev => ({
      ...prev,
      [name]: value
    }));
    
    setIsDirty(true);
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  
  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formState.name?.trim()) {
      newErrors.name = 'Task name is required';
    }
    
    if (!formState.type) {
      newErrors.type = 'Task type is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Handle save
  const handleSave = () => {
    if (!task || !stage) return;
    
    if (validateForm()) {
      onTaskUpdate(task.id, stage.id, formState);
      setIsDirty(false);
    }
  };
  
  // Handle discard changes
  const handleDiscard = () => {
    if (task) {
      setFormState({ ...task });
      setErrors({});
      setIsDirty(false);
    }
  };
  
  if (!task || !stage) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p>Select a task to edit</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b bg-muted flex justify-between items-center">
        <h3 className="font-medium">Task Editor</h3>
        
        {!isReadOnly && isDirty && (
          <div className="flex space-x-2">
            <button
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Discard Changes"
              onClick={handleDiscard}
            >
              <X size={16} />
            </button>
            
            <button
              className="p-1 rounded hover:bg-primary/80 bg-primary text-primary-foreground"
              title="Save Changes"
              onClick={handleSave}
            >
              <Save size={16} />
            </button>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <form className="space-y-4">
          {/* Task Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Task Name
            </label>
            <input
              type="text"
              name="name"
              value={formState.name || ''}
              onChange={handleInputChange}
              disabled={isReadOnly}
              className={`
                w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary
                ${errors.name ? 'border-destructive' : 'border-input'}
                ${isReadOnly ? 'bg-muted cursor-not-allowed' : ''}
              `}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-destructive flex items-center">
                <AlertCircle size={14} className="mr-1" />
                {errors.name}
              </p>
            )}
          </div>
          
          {/* Task Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formState.description || ''}
              onChange={handleInputChange}
              disabled={isReadOnly}
              rows={4}
              className={`
                w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary
                ${errors.description ? 'border-destructive' : 'border-input'}
                ${isReadOnly ? 'bg-muted cursor-not-allowed' : ''}
              `}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-destructive flex items-center">
                <AlertCircle size={14} className="mr-1" />
                {errors.description}
              </p>
            )}
          </div>
          
          {/* Task Type */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Type
            </label>
            <TaskTypeSelector
              value={formState.type || TaskType.ACTION}
              onChange={(value) => {
                setFormState(prev => ({
                  ...prev,
                  type: value,
                  // Clear manager name if not approval
                  ...(value !== TaskType.APPROVAL && prev.metadata?.managerName ? {
                    metadata: undefined
                  } : {})
                }));
                setIsDirty(true);
              }}
              managerName={formState.metadata?.managerName || ''}
              onManagerNameChange={(name) => {
                setFormState(prev => ({
                  ...prev,
                  metadata: {
                    ...prev.metadata,
                    managerName: name
                  }
                }));
                setIsDirty(true);
              }}
            />
            {errors.type && (
              <p className="mt-1 text-sm text-destructive flex items-center">
                <AlertCircle size={14} className="mr-1" />
                {errors.type}
              </p>
            )}
          </div>
          
          {/* Dependencies */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Dependencies
            </label>
            <div className="border rounded-md p-3 bg-muted">
              {task.dependencies && task.dependencies.length > 0 ? (
                <ul className="space-y-2">
                  {task.dependencies.map(dep => {
                    // Find the dependent task and its stage
                    let dependentTask: Task | null = null;
                    let dependentStage: Stage | null = null;
                    
                    for (const s of allStages) {
                      if (s.id === dep.stageId) {
                        dependentStage = s;
                        dependentTask = s.tasks.find(t => t.id === dep.taskId) || null;
                        break;
                      }
                    }
                    
                    return (
                      <li key={`${dep.stageId}-${dep.taskId}`} className="flex items-center">
                        <span className="text-sm">
                          {dependentTask ? dependentTask.name : 'Unknown Task'} 
                          {dependentStage ? ` (${dependentStage.name})` : ''}
                        </span>
                        
                        {!isReadOnly && (
                          <button
                            className="ml-2 text-destructive hover:text-destructive/80"
                            title="Remove Dependency"
                            onClick={() => {
                              // Remove dependency
                              const updatedDependencies = task.dependencies?.filter(
                                d => !(d.taskId === dep.taskId && d.stageId === dep.stageId)
                              ) || [];
                              
                              setFormState(prev => ({
                                ...prev,
                                dependencies: updatedDependencies
                              }));
                              
                              setIsDirty(true);
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No dependencies</p>
              )}
              
              {!isReadOnly && (
                <button
                  type="button"
                  className="mt-3 text-sm text-primary hover:text-primary/80"
                  onClick={() => {
                    // Open dependency selector
                    // This would typically open a modal or dropdown
                    // For simplicity, we're not implementing this fully
                  }}
                >
                  + Add Dependency
                </button>
              )}
            </div>
          </div>
          
          {/* Metadata */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Metadata
            </label>
            <div className="border rounded-md p-3 bg-muted">
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(task.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
