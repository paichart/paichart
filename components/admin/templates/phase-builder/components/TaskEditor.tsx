import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Task } from '../types';
// Removed import for getTaskTypes as it's not used with the updated Task structure
import { TaskDependencySelector } from '@/components/tasks/TaskDependencySelector';
// Removed imports for taskTypeLabels and getTaskTypeColorClass as task type is not a core Task property
// import {
//   taskTypeLabels,
//   getTaskTypeColorClass
// } from '@/lib/utils/taskTypes';

import { TaskType } from '@prisma/client'; // Import TaskType
// Removed import for taskNormalizationService
// import { taskNormalizationService } from '@/lib/services/task-normalization-service';

// Removed TaskType enum and const object as task type is not a core Task property
// type TaskType = 'ACTION' | 'DECISION' | 'MILESTONE' | 'APPROVAL' | 'DOCUMENT';
// const TaskType = {
//   ACTION: 'ACTION' as TaskType,
//   DECISION: 'DECISION' as TaskType,
//   MILESTONE: 'MILESTONE' as TaskType,
//   APPROVAL: 'APPROVAL' as TaskType,
//   DOCUMENT: 'DOCUMENT' as TaskType
// };

interface TaskEditorProps {
  task: Omit<Task, 'id'>; // Use 'id' as the identifier
  taskId?: string; // Use 'taskId' as the identifier
  isNew?: boolean;
  stageName: string; // Use 'stageName' instead of 'stageId'
  allTasks: { // Update allTasks type to match useTaskManagement hook
    stageName: string;
    id?: string; // Add id property here
    taskId: string; // Use taskId instead of taskKey
    taskTitle: string;
    dependencies?: string[]
  }[];
  // New prop to pass initial dependencies separately
  initialDependencies?: string[];
  onCancel: () => void;
  onSave: (task: Omit<Task, 'id'>) => void; // Use 'id' as the identifier
  stageNames?: Record<string, string>; // Map of stageName to stage name (already correct)
  onInteraction?: () => void; // Optional callback for when the user interacts with the form
  // New prop to propagate dependency validation errors
  onDependencyValidationError?: (stageName: string, taskId: string, hasError: boolean, message?: string) => void;
}

export function TaskEditor({
  task,
  taskId, // Use taskId instead of taskKey
  isNew = false,
  stageName, // Use stageName
  allTasks,
  initialDependencies, // Include the new prop in the signature
  onCancel,
  onSave,
  stageNames = {},
  onInteraction,
  onDependencyValidationError // Include the new prop in the signature
}: TaskEditorProps) {
  // Ensure task has both id and title properties
  if (task) {
    if ((task as any).id && !(task as any).taskId) (task as any).taskId = (task as any).id;
    if ((task as any).taskId && !(task as any).id) (task as any).id = (task as any).taskId;
    if ((task as any).title && !(task as any).name) (task as any).name = (task as any).title;
    if ((task as any).name && !(task as any).title) (task as any).title = (task as any).name;
  }

  // Ensure initialDependencies is an array of strings and filter out undefined
  const validDependencies = Array.isArray(initialDependencies)
    ? initialDependencies.filter((dep): dep is string => typeof dep === 'string' && dep !== undefined)
    : [];

  // Initialize state with a direct reference to validDependencies
  const [localTask, setLocalTask] = useState<Omit<Task, 'id'>>(() => { // Use 'id' instead of 'key'
    // Handle both title and name for backward compatibility
    const taskTitle = (task as any).title || (task as any).name || '';

    return {
      title: taskTitle, // Use either title or name
      description: (task as any).description,
      type: (task as any).type || TaskType.ACTION, // Add type with a default value, casting task to any temporarily
      // Removed assignee, dueDate as they are not in the Task interface
      dependencies: [...validDependencies] // Create a new array to avoid reference issues
    };
  });

  const updateLocalTask = (updates: Partial<Omit<Task, 'id'>>) => { // Use 'id' instead of 'key'
    setLocalTask(prev => ({ ...prev, ...updates }));
    if (onInteraction) {
      onInteraction();
    }
  };

  // Removed getTaskTypes as task type is not a core Task property
  // const taskTypeOptions = getTaskTypes();

  // We're removing the useEffect that was overriding user selections
  // This allows users to unselect dependencies as needed

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>{isNew ? 'Add New Task' : `Edit Task: ${localTask.title || 'Unnamed Task'}`}</CardTitle> {/* Use localTask.title */}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="task-title">Task Title</Label> {/* Use task-title */}
          <Input
            id="task-title" // Use task-title
            value={localTask.title} // Use localTask.title
            onChange={(e) => updateLocalTask({ title: e.target.value })} // Use title
            placeholder="Enter task title" // Update placeholder
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            value={localTask.description}
            onChange={(e) => updateLocalTask({ description: e.target.value })}
            placeholder="Enter task description"
          />
        </div>

        {/* Removed Task Type, Assignee, and Due Date fields as they are not in the core Task interface */}
        {/*
        <div className="space-y-2">
          <Label htmlFor="task-type">Task Type</Label>
          <select
            id="task-type"
            value={localTask.type}
            onChange={(e) => updateLocalTask({ type: e.target.value as TaskType })}
            className="w-full p-2 border rounded-md"
          >
            {Object.values(TaskType).map(type => (
              <option key={type} value={type}>
                {taskTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-assignee">Assignee Role (Optional)</Label>
          <Input
            id="task-assignee"
            value={localTask.assignee || ''}
            onChange={(e) => updateLocalTask({ assignee: e.target.value })}
            placeholder="e.g., Project Manager, Developer, etc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-due-date">Due Date Offset (Optional)</Label>
          <Input
            id="task-due-date"
            value={localTask.dueDate || ''}
            onChange={(e) => updateLocalTask({ dueDate: e.target.value })}
            placeholder="e.g., +7d (7 days after phase start)"
          />
          <p className="text-xs text-gray-500">
            Use relative dates like +7d (7 days), +2w (2 weeks), +1m (1 month)
          </p>
        </div>
        */}

        <TaskDependencySelector
          allTasks={allTasks} // Pass allTasks directly
          initialDependencies={localTask.dependencies || []} // Use the dependencies from localTask state with fallback
          stageNames={stageNames}
          currentStageName={stageName} // Use stageName
          currentTaskId={taskId || 'new-task'} // Use currentTaskId instead of currentTaskKey
          onChange={(dependencies) => {
            updateLocalTask({ dependencies: [...dependencies] }); // Create a new array to avoid reference issues
          }}
          onValidationError={(hasError, message) => {
            // Propagate the validation error up to the parent component
            if (onDependencyValidationError) {
               const currentTaskIdentifier = taskId || 'new-task'; // Use taskId if available, otherwise a placeholder
               onDependencyValidationError(stageName, currentTaskIdentifier, hasError, message);
            }
          }}
          useRelationshipModel={true} // Use the new relationship model
          // Add dummy values for required props that aren't used in template mode
          taskId="template-mode"
          povId="template-mode"
          phaseId="template-mode"
        />


        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Save the local task directly (standardization is handled in PhaseTemplateBuilder)
              onSave(localTask);
            }}
            disabled={!localTask.title || !localTask.title.trim()} // Check if title exists and is not empty
          >
            {isNew ? 'Add Task' : 'Update Task'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
