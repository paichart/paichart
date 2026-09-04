"use client";

// External libraries
import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { TaskType } from '@prisma/client';

// UI components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Label } from '@/components/ui/Label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Plus, Save, AlertCircle } from 'lucide-react';

// Local imports
import { PhaseTemplateBuilderProps, BuilderPhaseTemplate, Stage, Task } from './types';
import { cn } from '@/lib/utils';
import { useStageManagement } from './hooks/useStageManagement';
import { useTaskManagement } from './hooks/useTaskManagement';
import { DraggableStage } from './components/DraggableStage';
import { StageEditor } from './components/StageEditor';
import { TaskEditor } from './components/TaskEditor';
import { TemplatePreview } from './components/TemplatePreview';
import { getTaskTypeIcon } from './utils/iconHelpers';
import { validateTemplate as localValidateTemplate, ValidationError } from './utils/validation';
import { ValidationErrors } from './components/ValidationErrors';
// Removed import for taskNormalizationService
// import { taskNormalizationService } from '@/lib/services/task-normalization-service';

// Dynamically import DndProvider and HTML5Backend
const DndProviderWithNoSSR = dynamic(
  async () => {
    const { DndProvider } = await import('react-dnd');
    const Component = ({ children, ...props }: any) => {
      const { HTML5Backend } = require('react-dnd-html5-backend');
      return (
        <DndProvider backend={HTML5Backend} {...props}>
          {children}
        </DndProvider>
      );
    };
    Component.displayName = 'DndProviderWithNoSSR';
    return Component;
  },
  { ssr: false }
);

export function PhaseTemplateBuilder({
  initialData,
  onSave,
  showSaveButton = true
}: PhaseTemplateBuilderProps & { showSaveButton?: boolean }) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [activeTab, setActiveTab] = useState('design');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  // New state for task-specific dependency errors
  const [taskDependencyErrors, setTaskDependencyErrors] = useState<Record<string, string | undefined>>({});

  const {
    stages,
    setStages,
    editingStage,
    setEditingStage,
    newStage,
    setNewStage,
    showNewStageForm,
    setShowNewStageForm,
    handleAddStage,
    handleUpdateStage,
    handleDeleteStage,
    moveStage,
    generateId
  } = useStageManagement(initialData?.stages || []); // Pass initial stages

  // Define the type for editingTask state - aligned with useTaskManagement hook
  type EditingTaskState = { stageName: string; taskId: string; } | null;

  // Add this function to standardize task properties:
  const standardizeTask = (task: any) => {
    // Create a new task object with standardized properties
    return {
      ...task,
      id: task.id || task.key || `task-${Math.random().toString(36).substr(2, 9)}`,
      taskId: task.id || task.key || `task-${Math.random().toString(36).substr(2, 9)}`,
      title: task.title || task.name || '',
      name: task.title || task.name || '',
      dependencies: (task.dependencies || []).filter((dep: any) => dep !== undefined)
    };
  };

  // Update stages state when initialData changes (e.g., after import)
  // Normalize initial stages and tasks when initialData changes and generateId is available
  useEffect(() => {
    // Skip if no initialData or no generateId function
    if (!initialData?.stages || !generateId) {
      return;
    }

    // Create a unique identifier for the initialData to detect changes
    const initialDataId = initialData.id || 'new-template';
    const initialStagesSignature = initialData.stages.map(s => s.name).join(',');
    
    // Skip if stages are already standardized for this initialData
    if (stages.length > 0) {
      const currentStagesSignature = stages.map(s => s.name).join(',');
      if (currentStagesSignature === initialStagesSignature &&
          stages[0]?.tasks?.length === initialData.stages[0]?.tasks?.length &&
          stages[0]?.tasks[0]?.id && stages[0]?.tasks[0]?.title) { // Check for standardized properties
        return;
      }
    }

    const standardizedStages = initialData.stages.map(stage => ({
      ...stage,
      tasks: stage.tasks?.map(standardizeTask) || [] // Use the standardizeTask function
    })) || []; // Ensure stages is an array
    
    setStages(standardizedStages);
  }, [initialData, setStages, generateId, stages]); // Include all dependencies to satisfy ESLint

  const {
    editingTask,
    setEditingTask, // Destructure without casting
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
  } = useTaskManagement(stages, setStages, generateId); // Pass stages, setStages, generateId

  // Handler for dependency validation errors from TaskEditor
  const handleDependencyValidationError = useCallback((stageName: string, taskId: string, hasError: boolean, message?: string) => {
    const errorKey = `${stageName}-${taskId}`;
    setTaskDependencyErrors(prevErrors => {
      const newErrors = { ...prevErrors };
      if (hasError) {
        newErrors[errorKey] = message || 'Dependency validation error';
      } else {
        delete newErrors[errorKey];
      }
      return newErrors;
    });
  }, []);


  // Validate the template
  const validateTemplateData = useCallback(() => {
    setIsValidating(true);

    // Construct a BuilderPhaseTemplate object from the current state
    const currentTemplate: BuilderPhaseTemplate = {
      id: initialData?.id || '', // Provide a default empty string for new templates
      name,
      description,
      type: initialData?.type || 'PLANNING', // Use initialData type or default
      version: initialData?.version,
      isDefault: initialData?.isDefault || false,
      stages,
      validationRules: initialData?.validationRules || [], // Ensure validationRules is an array
      timelineRecommendations: initialData?.timelineRecommendations,
      metadata: initialData?.metadata || {}, // Ensure metadata is an object
    };

    // Validation is LOCAL (client-side, detailed errors). The server-side
    // templateService.validateTemplate() was a no-op placeholder stub (removed 2026-07-02 —
    // "we don't need server-side template validation"); local validation is the source of truth.
    // Note: the old stub also checked `type` presence — dropped here; the builder always sets `type`.
    const errors: ValidationError[] = localValidateTemplate(name, description, stages).errors;

    // Include task-specific dependency errors
    Object.entries(taskDependencyErrors).forEach(([key, message]) => {
        if (message) {
            const [stageName, taskId] = key.split('-');
            errors.push({
                message,
                type: 'error', // Assuming dependency errors are 'error' type
                stageName,
                taskId,
            });
        }
    });


    setValidationErrors(errors);
    setIsValidating(false);
    return errors.length === 0 && Object.keys(taskDependencyErrors).length === 0;
  }, [name, description, stages, taskDependencyErrors, initialData?.id, initialData?.type, initialData?.version, initialData?.isDefault, initialData?.validationRules, initialData?.timelineRecommendations, initialData?.metadata]); // Added dependencies for useCallback

  // Track if the form has been interacted with
  const [hasInteracted, setHasInteracted] = useState(false);

  // Handle form interaction
  const handleInteraction = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  }, [hasInteracted]);

  // Run validation when template data changes, but only after user interaction
  useEffect(() => {
    // Don't validate on initial render, when editing, or if the user hasn't interacted with the form
    if (!hasInteracted || editingStage !== null || editingTask !== null || showNewStageForm || showNewTaskForm) {
      return;
    }

    // Debounce validation to avoid excessive validation during typing
    const timer = setTimeout(() => {
      validateTemplateData();
    }, 1500); // Increased from 500ms to 1500ms

    return () => clearTimeout(timer);
  }, [name, description, stages, editingStage, editingTask, showNewStageForm, showNewTaskForm, validateTemplateData, hasInteracted]);

  // Navigate to an error
  const handleNavigateToError = (error: ValidationError) => {
    // Switch to design tab
    setActiveTab('design');

    // If it's a stage error, open the stage editor
    if (error.stageName && error.taskId === undefined) { // Check for stage error
      setEditingStage(error.stageName); // Use stageName
    }

    // If it's a task error, open the task editor
    if (error.stageName && error.taskId !== undefined) { // Check for task error
      setEditingTask({ stageName: error.stageName, taskId: error.taskId }); // Use stageName and taskId
    }
  };

  // Save the template
  const handleSave = () => {
    // Validate the template
    const isValid = validateTemplateData();

    if (!isValid) {
      // Show validation errors
      return;
    }

    // Construct the template object to save, including required fields
    const template: BuilderPhaseTemplate = {
      id: initialData?.id, // Include ID if it exists (for updates)
      name,
      description,
      type: initialData?.type || 'PLANNING', // Include type, default if necessary
      version: initialData?.version, // Include version
      isDefault: initialData?.isDefault || false, // Include isDefault
      stages,
      validationRules: initialData?.validationRules || [], // Include validationRules
      timelineRecommendations: initialData?.timelineRecommendations, // Include timelineRecommendations
      metadata: initialData?.metadata || {}, // Include metadata
    };

    if (onSave) {
      onSave(template); // Save the standardized template directly
    } else {
      alert('Template saved successfully!');
    }
  };

  // Get stage names for task dependencies
  const getStageNames = () => {
    const stageNames: Record<string, string> = {};
    stages.forEach(stage => {
      // Use stage name as the identifier for display purposes
      stageNames[stage.name] = stage.name;
    });
    return stageNames;
  };

  return (
    <DndProviderWithNoSSR>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className={cn("flex", showSaveButton ? "justify-between w-full" : "")}>
            <div>
              <h2 className="text-2xl font-bold">Phase Template Builder</h2>
              <p className="text-muted-foreground">Create and manage phase templates with stages and tasks</p>
            </div>

            {showSaveButton && (
              <Button onClick={() => {
                handleInteraction();
                handleSave();
              }}>
                <Save className="h-4 w-4 mr-2" />
                Save Template
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="design" className="flex items-center">Design</TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="space-y-6 pt-4">
            {validationErrors.length > 0 && (
              <ValidationErrors
                errors={validationErrors}
                onNavigateToError={handleNavigateToError}
              />
            )}

            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Template Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Template Name</Label>
                    <Input
                      id="template-name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        handleInteraction();
                      }}
                      // Removed onFocus handler to prevent premature validation
                      placeholder="Enter template name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-description">Description</Label>
                    <Textarea
                      id="template-description"
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        handleInteraction();
                      }}
                      // Removed onFocus handler to prevent premature validation
                      placeholder="Enter template description"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Stages</h3>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNewStageForm(true);
                      handleInteraction();
                    }}
                    disabled={showNewStageForm}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </Button>
                </div>

                {showNewStageForm && (
                  <StageEditor
                    stage={newStage}
                    isNew={true}
                    onCancel={() => setShowNewStageForm(false)}
                    onSave={handleAddStage}
                    onInteraction={handleInteraction}
                  />
                )}

                {editingStage !== null && (
                  <StageEditor
                    // Find stage by its name (assuming names are unique within a template for editing)
                    stage={stages.find(s => s.name === editingStage) || { name: '', description: '' }}
                    onCancel={() => setEditingStage(null)}
                    // Pass the stage name to handleUpdateStage
                    onSave={(updates) => handleUpdateStage(editingStage, updates)}
                    onInteraction={handleInteraction}
                  />
                )}

                {editingTask !== null && (
                  <>
                    {/* Find the task by id or key */}
                    {(() => {
                      const stage = stages.find(s => s.name === editingTask?.stageName);
                      const task = stage?.tasks.find(t =>
                        t.id === editingTask?.taskId ||
                        (t as any).key === editingTask?.taskId
                      );

                      // Standardize task properties before passing to TaskEditor
                      const standardizedTask = task ? standardizeTask(task) : {
                        title: '',
                        dependencies: [],
                        type: TaskType.ACTION
                      };

                      return (
                        <TaskEditor
                          task={standardizedTask}
                          taskId={editingTask?.taskId || ''} // Use optional chaining and provide default
                          stageName={editingTask?.stageName || ''} // Use optional chaining and provide default
                          // Filter out the current task when providing allTasks for dependency selection
                          allTasks={getAllTasks().filter(t => (t.id || t.taskId) !== editingTask?.taskId)} // Use optional chaining and check both id and taskId
                      stageNames={getStageNames()}
                      // Pass dependencies directly from the task object
                      initialDependencies={stages.find(s => s.name === editingTask?.stageName)?.tasks.find(t => t.id === editingTask?.taskId)?.dependencies || []} // Use optional chaining
                      onCancel={() => setEditingTask(null)}
                      // Pass stage name and task id to handleUpdateTask
                      onSave={(updates) => handleUpdateTask(editingTask?.stageName || '', editingTask?.taskId || '', updates)} // Use optional chaining and provide defaults
                      onInteraction={handleInteraction}
                      onDependencyValidationError={handleDependencyValidationError} // Pass the new handler
                    />
                      );
                    })()}
                  </>
                )}

                {showNewTaskForm !== null && (
                  <>
                    {(() => {
                      // Standardize new task properties
                      const standardizedNewTask = standardizeTask(newTask);

                      return (
                        <TaskEditor
                          task={standardizedNewTask}
                          taskId="new-task" // Use taskId
                          isNew={true}
                          stageName={showNewTaskForm} // Use stageName
                          allTasks={getAllTasks()}
                          stageNames={getStageNames()}
                          onCancel={() => {
                            setShowNewTaskForm(null);
                            handleInteraction();
                          }}
                          onSave={(taskData) => handleAddTask(showNewTaskForm, taskData)}
                          onInteraction={handleInteraction}
                          onDependencyValidationError={handleDependencyValidationError} // Pass the new handler
                        />
                      );
                    })()}
                  </>
                )}

                {stages.length === 0 ? (
                  <div className="text-center p-8 border rounded-lg bg-muted">
                    <p className="text-muted-foreground">No stages defined yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Add stages to define the workflow for this phase template
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {stages.map((stage, index) => (
                      <DraggableStage
                        // Use stage name as the key for rendering
                        key={stage.name}
                        stage={stage}
                        index={index}
                        allStages={stages}
                        moveStage={moveStage}
                        // Pass stage name to handlers
                        onEdit={() => setEditingStage(stage.name)}
                        onDelete={() => handleDeleteStage(stage.name)}
                        onAddTask={() => setShowNewTaskForm(stage.name)}
                        // Pass stage name and task id to task handlers
                        onEditTask={(taskId) => setEditingTask({ stageName: stage.name, taskId })}
                        onDeleteTask={(taskId) => handleDeleteTask(stage.name, taskId)}
                        // Pass stage name to moveTask
                        onMoveTask={(dragIndex, hoverIndex) => moveTask(stage.name, dragIndex, hoverIndex)}
                        moveTaskBetweenStages={moveTaskBetweenStages}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="pt-4">
            <TemplatePreview
              name={name}
              description={description}
              stages={stages}
              getTaskTypeIcon={getTaskTypeIcon}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DndProviderWithNoSSR>
  );
}
