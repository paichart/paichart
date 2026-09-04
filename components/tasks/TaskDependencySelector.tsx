import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Search, AlertCircle, Info, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Task } from '@/lib/tasks/types';
// Remove normalization service import
// import { taskNormalizationService } from '@/lib/services/task-normalization-service';

interface TaskDependencySelectorProps {
  taskId: string;
  povId: string;
  phaseId: string;
  onChange: (dependencyIds: string[]) => void;
  initialDependencies?: string[];
  disabled?: boolean;
  // Add allTasks prop to accept tasks from parent
  allTasks?: {
    stageName: string;
    taskId?: string; // Optional for backward compatibility
    id?: string;     // Primary identifier
    taskTitle?: string; // Optional for backward compatibility
    title?: string;  // Primary title property
    dependencies?: string[];
  }[];
  // Add stageNames prop for displaying stage names
  stageNames?: Record<string, string>;
  // Add currentStageName and currentTaskKey for filtering out the current task
  currentStageName?: string;
  currentTaskId?: string;
  // Add useRelationshipModel prop to determine if we should use the relationship model
  useRelationshipModel?: boolean;
  // Add onValidationError prop to handle validation errors
  onValidationError?: (hasError: boolean, message?: string) => void;
}

export function TaskDependencySelector({
  taskId,
  povId,
  phaseId,
  onChange,
  initialDependencies = [],
  disabled = false,
  allTasks,
  stageNames = {},
  currentStageName,
  currentTaskId,
  useRelationshipModel = false,
  onValidationError,
}: TaskDependencySelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableTasks, setAvailableTasks] = useState<any[]>([]);
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>(
    // Filter out undefined dependencies
    initialDependencies.filter(dep => dep !== undefined)
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch available tasks for dependencies or use the provided allTasks prop
  useEffect(() => {
    const processTasks = (tasks: any[]) => {
      // If using relationship model, don't filter out any tasks
      if (useRelationshipModel) {
        setAvailableTasks(tasks);
        return;
      }

      // Filter out the current task using taskId and stageName if available
      const filteredTasks = tasks.filter(task => {
        // Use id with fallback to taskId
        const taskIdentifier = task.id || task.taskId;
        return !(taskIdentifier === currentTaskId && task.stageName === currentStageName);
      });
      setAvailableTasks(filteredTasks);
    };

    if (allTasks) {
      // If allTasks prop is provided, use it
      processTasks(allTasks);
    } else if (povId && phaseId) {
      // Otherwise, fetch tasks from the API
      const fetchAvailableTasks = async () => {
        try {
          setLoading(true);
          const response = await fetch(`/api/pov/${povId}/phase/${phaseId}/tasks`);

          if (!response.ok) {
            throw new Error('Failed to fetch available tasks');
          }

          const data = await response.json();
          processTasks(data.data);
        } catch {
          // Could not fetch available tasks
        } finally {
          setLoading(false);
        }
      };
      fetchAvailableTasks();
    }
  }, [povId, phaseId, allTasks, currentTaskId, currentStageName, useRelationshipModel]);

  // Fetch initial dependencies
  useEffect(() => {
    const fetchDependencies = async () => {
      // Skip if we have initial dependencies or if we're in template mode
      if (!taskId || initialDependencies.length > 0 ||
          taskId === 'template-mode' || povId === 'template-mode' || phaseId === 'template-mode') {
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/pov/${povId}/phase/${phaseId}/task/${taskId}/dependencies`);

        if (!response.ok) {
          throw new Error('Failed to fetch dependencies');
        }

        const data = await response.json();
        const dependencyIds = data.data.map((dep: any) => dep.dependsOnId);
        setSelectedDependencies(dependencyIds);
        onChange(dependencyIds);
      } catch {
        // Failed to fetch dependencies
      } finally {
        setLoading(false);
      }
    };

    if (taskId) {
      fetchDependencies();
    }
  }, [taskId, povId, phaseId, initialDependencies, onChange]);

  // Filter tasks based on search term and map to a consistent structure for display
  const filteredTasksForDisplay = availableTasks
    .map(task => {
      // Use properties directly without normalization
      return {
        id: task.id || task.taskId, // Use id with fallback to taskId
        taskId: task.id || task.taskId, // Include taskId here
        title: task.title || task.taskTitle, // Use title with fallback to taskTitle
        stageName: task.stageName,
        status: task.status,
      };
    })
    .filter(task => {
      const titleToFilter = task.title || '';
      return titleToFilter.toLowerCase().includes(searchTerm.toLowerCase());
    });

  // Check for circular dependencies
  const checkCircularDependency = async (dependsOnId: string): Promise<boolean> => {
    // If we're in template mode, use a client-side check instead of the API
    if (taskId === 'template-mode' || povId === 'template-mode' || phaseId === 'template-mode') {
      // Simple check: a task can't depend on itself
      return dependsOnId === taskId;
    }

    try {
      const response = await fetch(`/api/pov/check-circular-dependency?taskId=${taskId}&dependsOnId=${dependsOnId}`);

      if (!response.ok) {
        throw new Error('Failed to check circular dependency');
      }

      const data = await response.json();
      return data.hasCircularDependency;
    } catch {
      return false;
    }
  };

  // Handle dependency selection
  const handleDependencyChange = async (dependencyId: string, checked: boolean) => {
    let newDependencies: string[];

    if (checked) {
      // Check for circular dependency
      const hasCircularDependency = await checkCircularDependency(dependencyId);

      if (hasCircularDependency) {
        const errorMessage = 'Circular dependency detected. This would create an infinite loop.';
        setValidationError(errorMessage);
        if (onValidationError) {
          onValidationError(true, errorMessage);
        }
        return;
      }

      newDependencies = [...selectedDependencies, dependencyId];
    } else {
      newDependencies = selectedDependencies.filter(id => id !== dependencyId);
    }

    // Clear validation error
    if (validationError) {
      setValidationError(null);
      if (onValidationError) {
        onValidationError(false);
      }
    }

    setSelectedDependencies(newDependencies);
    onChange(newDependencies);
  };

  // Clear all dependencies
  const clearDependencies = () => {
    setSelectedDependencies([]);
    setValidationError(null);
    if (onValidationError) {
      onValidationError(false);
    }
    onChange([]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Task Dependencies</Label>
        {selectedDependencies.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearDependencies}
            disabled={disabled}
          >
            Clear All
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8"
          disabled={disabled}
        />
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4 mr-2" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      <div className="border rounded-md p-2 max-h-60 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading tasks...</span>
          </div>
        ) : filteredTasksForDisplay.length === 0 ? (
          <p className="text-sm text-muted-foreground p-2">
            {searchTerm ? 'No matching tasks found' : 'No other tasks available for dependencies'}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredTasksForDisplay.map((task, index) => {
              // Use id with fallback to taskId or generate a unique ID
              const taskIdentifier = task.id || task.taskId || `task-${index + 1}`;
              const isSelected = selectedDependencies.includes(taskIdentifier);
              // Ensure unique ID with timestamp
              const checkboxId = `dep-${taskIdentifier}-${index}-${Date.now()}`;

              return (
                <div
                  key={`task-${taskIdentifier}-${index}`}
                  className={`flex items-center p-2 rounded-md ${
                    disabled ? 'opacity-50 bg-muted' :
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                  onClick={(e) => {
                    // Only handle click if it's not on the checkbox itself
                    if ((e.target as HTMLElement).tagName !== 'INPUT' && !disabled) {
                      handleDependencyChange(taskIdentifier, !isSelected);
                    }
                  }}
                  style={{ cursor: disabled ? 'default' : 'pointer' }}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (disabled) return;

                      // Handle all possible values of checked
                      if (checked === true || checked === 'indeterminate') {
                        handleDependencyChange(taskIdentifier, true);
                      } else {
                        handleDependencyChange(taskIdentifier, false);
                      }
                    }}
                    disabled={disabled}
                    className="mr-2"
                  />
                  <Label
                    htmlFor={checkboxId}
                    className={`text-sm flex-1 ${disabled ? '' : 'cursor-pointer'}`}
                    onClick={(e) => e.stopPropagation()} // Prevent double-triggering
                  >
                    {/* Display stage name and task title */}
                    <span className="font-medium">
                      {stageNames?.[task.stageName] ? `${stageNames[task.stageName]} - ` : ''}
                    </span>
                    <span>{task.title}</span>
                  </Label>
                  {task.status && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      task.status === 'COMPLETED' ? 'bg-success/20 text-success' :
                      task.status === 'IN_PROGRESS' ? 'bg-primary/20 text-primary' :
                      task.status === 'BLOCKED' ? 'bg-destructive/20 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedDependencies.length > 0 && (
        <div className="bg-primary/10 p-3 rounded-md flex items-start">
          <Info className="h-4 w-4 text-primary mr-2 mt-0.5" />
          <div className="text-sm text-primary-foreground">
            <p>Selected {selectedDependencies.length} dependencies</p>
            <p className="text-xs mt-1">
              This task will only start after all dependent tasks are completed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}