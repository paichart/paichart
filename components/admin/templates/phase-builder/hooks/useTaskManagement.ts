import { useState } from 'react';
import { Stage, Task } from '../types';
import { TaskType } from '@prisma/client';

export function useTaskManagement(
  stages: Stage[],
  setStages: React.Dispatch<React.SetStateAction<Stage[]>>,
  generateId: (prefix: string) => string
) {
  const [editingTask, setEditingTask] = useState<{stageName: string, taskId: string} | null>(null);
  const [newTask, setNewTask] = useState<Omit<Task, 'id'>>({ // Use 'id' as the identifier
    title: '', // Use 'title' instead of 'name'
    description: '',
    type: TaskType.ACTION, // Add default type
    // Removed assignee, dueDate as they are not in the Task interface
  });
  const [showNewTaskForm, setShowNewTaskForm] = useState<string | null>(null);

  // Add a new task to a stage
  const handleAddTask = (stageName: string, taskData?: Omit<Task, 'id'>) => { // Use stageName and 'id'
    // Use taskData if provided, otherwise use newTask
    const taskToAdd = taskData || newTask;

    if (!taskToAdd.title.trim()) { // Use 'title'
      alert('Task title is required'); // Update message
      return;
    }

    const task: Task = {
      id: generateId('task'), // Use 'id' instead of 'key'
      title: taskToAdd.title, // Use 'title' instead of 'name'
      description: taskToAdd.description,
      type: taskToAdd.type, // Add the type from taskToAdd
      // Removed assignee, dueDate as they are not in the Task interface
      dependencies: taskToAdd.dependencies
    };

    const updatedStages = stages.map(stage => {
      if (stage.name === stageName) { // Use stage.name and stageName
        return {
          ...stage,
          tasks: [...stage.tasks, task]
        };
      }
      return stage;
    });

    setStages(updatedStages);
    setNewTask({
      title: '', // Use 'title'
      description: '',
      type: TaskType.ACTION, // Reset to default type
    });
    setShowNewTaskForm(null);
  };

  // Update an existing task
  const handleUpdateTask = (stageName: string, taskId: string, updates: Partial<Task>) => { // Use stageName and taskId
    const updatedStages = stages.map(stage => {
      if (stage.name === stageName) { // Use stage.name and stageName
        return {
          ...stage,
          tasks: stage.tasks.map(task =>
            task.id === taskId ? { ...task, ...updates } : task // Use task.id and taskId
          )
        };
      }
      return stage;
    });

    setStages(updatedStages);
    setEditingTask(null);
  };

  // Delete a task
  const handleDeleteTask = (stageName: string, taskId: string) => { // Use stageName and taskId
    // Check if this task is a dependency for other tasks
    const dependentTasks: { taskTitle: string, stageName: string }[] = []; // Use taskTitle

    stages.forEach(stage => {
      stage.tasks.forEach(task => {
        if (task.dependencies && task.dependencies.length > 0) {
          // Check if any dependency matches the taskKey being deleted
          let hasDependency = false;

          for (const dep of task.dependencies) {
            // Dependencies are expected to be strings (task ids)
            if (typeof dep === 'string' && dep === taskId) { // Check against taskId
                hasDependency = true;
                break;
            }
            // Removed object dependency handling as dependencies are strings (task keys)
          }

          if (hasDependency) {
            dependentTasks.push({
              taskTitle: task.title, // Use task.title
              stageName: stage.name
            });
          }
        }
      });
    });

    // If there are dependent tasks, show a warning
    if (dependentTasks.length > 0) {
      const dependencyWarning = `This task is a dependency for ${dependentTasks.length} other task(s):\n\n` +
        dependentTasks.map(t => `- "${t.taskTitle}" in stage "${t.stageName}"`).join('\n') + // Use taskTitle
        '\n\nDeleting this task will break these dependencies. Are you sure you want to proceed?';

      if (!confirm(dependencyWarning)) {
        return;
      }
    } else if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    // Update all tasks to remove this task from their dependencies
    const updatedStages = stages.map(stage => {
      return {
        ...stage,
        tasks: stage.tasks.map(task => {
          if (task.dependencies) {
            // Filter out the deleted task from dependencies
            let updatedDependencies = task.dependencies;

            if (Array.isArray(task.dependencies)) {
              updatedDependencies = task.dependencies.filter(dep => {
                // Dependencies are expected to be strings (task ids)
                return typeof dep === 'string' && dep !== taskId; // Check against taskId
                // Removed object dependency handling
              });
            }

            return {
              ...task,
              dependencies: updatedDependencies
            };
          }
          return task;
        }).filter(task => task.id !== (stage.name === stageName ? taskId : null)) // Use task.id, stage.name, stageName, taskId
      };
    });

    setStages(updatedStages);
  };

  // Move a task within a stage
  const moveTask = (stageName: string, dragIndex: number, hoverIndex: number) => { // Use stageName
    const stageIndex = stages.findIndex(s => s.name === stageName); // Use stageName
    if (stageIndex === -1) return;

    const draggedTask = stages[stageIndex].tasks[dragIndex];
    const updatedStages = [...stages];

    updatedStages[stageIndex].tasks.splice(dragIndex, 1);
    updatedStages[stageIndex].tasks.splice(hoverIndex, 0, draggedTask);

    setStages(updatedStages);
  };

  // Move a task between stages
  const moveTaskBetweenStages = (sourceStageName: string, targetStageName: string, taskId: string) => { // Use stageName and taskId
    const sourceStageIndex = stages.findIndex(s => s.name === sourceStageName); // Use sourceStageName
    const targetStageIndex = stages.findIndex(s => s.name === targetStageName); // Use targetStageName

    if (sourceStageIndex === -1 || targetStageIndex === -1) return;

    const taskIndex = stages[sourceStageIndex].tasks.findIndex(t => t.id === taskId); // Use taskId
    if (taskIndex === -1) return;

    const task = stages[sourceStageIndex].tasks[taskIndex];
    const updatedStages = [...stages];

    // Remove from source stage
    updatedStages[sourceStageIndex].tasks.splice(taskIndex, 1);

    // Add to target stage
    updatedStages[targetStageIndex].tasks.push(task);

    setStages(updatedStages);
  };

  // Get all tasks for dependencies
  const getAllTasks = () => {
    const tasks: {
      stageName: string;
      id?: string; // Add id property here
      taskId: string; // Use taskId instead of taskKey
      taskTitle: string; // Use taskTitle to match Task interface
      dependencies?: string[]
    }[] = [];

    stages.forEach(stage => {
      if (!stage.tasks || !Array.isArray(stage.tasks)) {
        return; // Skip this stage
      }

      stage.tasks.forEach(task => {
        // Normalize task properties to handle both id/title and key/name formats
        const taskId = task.id || (task as any).key;
        const taskTitle = task.title || (task as any).name;

        if (!taskId || !taskTitle) {
          return; // Skip this task
        }

        tasks.push({
          stageName: stage.name,
          id: task.id, // Include the original id
          taskId: taskId,
          taskTitle: taskTitle,
          dependencies: task.dependencies
        });
      });
    });

    return tasks;
  };

  return {
    editingTask,
    setEditingTask,
    newTask,
    setNewTask,
    showNewTaskForm,
    setShowNewTaskForm,
    handleAddTask,
    handleUpdateTask,
    handleDeleteTask,
    moveTask,
    moveTaskBetweenStages,
    getAllTasks
  };
}
