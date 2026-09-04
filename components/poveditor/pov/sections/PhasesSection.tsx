"use client";

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useEditorContext } from '../context';
import { useSelectedTask } from '../hooks/useSelectedTask';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { PlusCircle } from 'lucide-react';
import { HierarchicalPhaseView } from '../components/HierarchicalPhaseView';
import { TaskEditDialog } from '../components/TaskEditDialog';
import { toast } from '@/lib/hooks/useToast';
import { toLocalYmd, fromLocalYmd } from '@/lib/utils/local-date';

// Phase types
type PhaseType = 'PLANNING' | 'EXECUTION' | 'REVIEW';

// Phase interface
interface Phase {
  id: string;
  name: string;
  description: string;
  type: PhaseType;
  startDate?: string;
  endDate?: string;
  order: number;
}

export default function PhasesSection() {
  const { state, addEntity, updateEntity, removeEntity, reorderRelationship, saveData } = useEditorContext();
  const { selectedTaskId, updateSelectedTask } = useSelectedTask();
  const queryClient = useQueryClient();
  
  // Local state for phase management
  const [showForm, setShowForm] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseName, setPhaseName] = useState('');
  const [phaseDescription, setPhaseDescription] = useState('');
  const [phaseType, setPhaseType] = useState<PhaseType>('PLANNING');
  const [phaseStartDate, setPhaseStartDate] = useState('');
  const [phaseEndDate, setPhaseEndDate] = useState('');
  const [phaseOrder, setPhaseOrder] = useState(0);  // Order field (1000 increment pattern)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  
  // Local state for stage management
  const [showStageForm, setShowStageForm] = useState(false);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [stagePhaseId, setStagePhaseId] = useState<string | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageDescription, setStageDescription] = useState('');
  const [stageOrder, setStageOrder] = useState(0);  // Order field (1000 increment pattern)

  // State for task edit dialog
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  // Ref to track pending save operations (phases now use main Save button)
  const pendingStageRef = useRef<string | null>(null);
  // REMOVED: pendingTaskRef - TaskEditDialog now handles complete task creation flow
  
  // NOTE: Removed phase auto-save useEffect - phases now use main Save button like other form fields
  
  // Effect to handle saving stages after state updates
  useEffect(() => {
    if (pendingStageRef.current && state.entities.stages[pendingStageRef.current]) {
      const stageId = pendingStageRef.current;
      pendingStageRef.current = null; // Clear immediately to prevent infinite loop
      
      
      const performSave = async () => {
        try {
          await saveData();
          resetStageForm();
        } catch {
          // Error saving stage
        }
      };
      
      performSave();
    }
  }, [state.entities.stages, saveData]);
  
  // REMOVED: Task auto-save useEffect - TaskEditDialog now handles complete task creation flow
  
  // Reset form
  const resetForm = () => {
    setPhaseName('');
    setPhaseDescription('');
    setPhaseType('PLANNING');
    setPhaseStartDate('');
    setPhaseEndDate('');
    setEditingPhaseId(null);
    setShowForm(false);
  };
  
  // Reset stage form
  const resetStageForm = () => {
    setStageName('');
    setStageDescription('');
    setEditingStageId(null);
    setStagePhaseId(null);
    setShowStageForm(false);
  };
  
  // Handle form submission - Jan Marshal's approach: Simple local state update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use phaseOrder from state (either loaded from existing phase or set by user)
    const phaseData = {
      name: phaseName,
      description: phaseDescription,
      type: phaseType,
      startDate: phaseStartDate ? new Date(phaseStartDate).toISOString() : undefined,
      endDate: phaseEndDate ? new Date(phaseEndDate).toISOString() : undefined,
      order: phaseOrder,  // From state (user can override via input field)
    };
    
    try {
      if (editingPhaseId) {
        // Update existing phase in local state only
        updateEntity('phases', editingPhaseId, phaseData);
      } else {
        // Add new phase to local state only - NO automatic save
        const newPhaseId = addEntity('phases', phaseData);

        // Update phase order
        const newPhaseOrder = [...state.relationships.phaseOrder, newPhaseId];
        reorderRelationship('phaseOrder', newPhaseOrder);
      }

      // Reset form immediately - no delayed operations
      resetForm();

    } catch {
      // Error adding phase to local state
    }
  };
  
  // Edit phase
  const handleEditPhase = (phaseId: string) => {
    const phase = state.entities.phases[phaseId];
    if (phase) {
      setEditingPhaseId(phaseId);
      setPhaseName(phase.name);
      setPhaseDescription(phase.description);
      setPhaseType(phase.type as PhaseType);
      setPhaseStartDate(phase.startDate ? new Date(phase.startDate).toISOString().split('T')[0] : '');
      setPhaseEndDate(phase.endDate ? new Date(phase.endDate).toISOString().split('T')[0] : '');
      setPhaseOrder(phase.order ?? 0);  // Load existing order value
      setShowForm(true);
    }
  };
  
  // Delete phase
  const handleDeletePhase = (phaseId: string) => {
    removeEntity('phases', phaseId);
    
    // Update phase order
    const newPhaseOrder = state.relationships.phaseOrder.filter(id => id !== phaseId);
    reorderRelationship('phaseOrder', newPhaseOrder);
  };
  
  // Add stage - show form instead of creating with default values
  const handleAddStage = (phaseId: string) => {
    setStagePhaseId(phaseId);
    setStageName('');
    setStageDescription('');
    setEditingStageId(null);
    // Calculate order for new stage (1000 increment pattern)
    const phaseStages = Object.values(state.entities.stages).filter(s => s.phaseId === phaseId);
    const maxOrder = phaseStages.length > 0 ? Math.max(...phaseStages.map(s => s.order)) : 0;
    setStageOrder(maxOrder + 1000);
    setShowStageForm(true);
  };

  // Edit stage - populate form with existing stage data
  const handleEditStage = (stageId: string) => {
    const stage = state.entities.stages[stageId];
    if (stage) {
      setEditingStageId(stageId);
      setStagePhaseId(stage.phaseId || null);
      setStageName(stage.name || '');
      setStageDescription(stage.description || '');
      setStageOrder(stage.order ?? 0);  // Load existing order value
      setShowStageForm(true);
    }
  };
  
  // Handle stage form submission
  const handleStageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stagePhaseId) return;

    // Use stageOrder from state (initialized in handleAddStage/handleEditStage, user can override via input)
    const stageData = {
      name: stageName,
      description: stageDescription,
      status: 'PENDING',
      order: stageOrder,  // From state (user can override via input field)
      phaseId: stagePhaseId
    };
    
    try {
      if (editingStageId) {
        // Update existing stage
        const stage = state.entities.stages[editingStageId];
        if (!stage) {
          return;
        }

        // Get POV ID from state
        const povId = state.data?.id;
        if (!povId) {
          return;
        }

        // For temporary stages (not yet saved), just update local state
        if (editingStageId.startsWith('temp-')) {
          updateEntity('stages', editingStageId, stageData);
          resetStageForm();
          return;
        }

        // For real stages, call the API to update in database
        const response = await fetch(`/api/pov/${povId}/phase/${stage.phaseId}/stage?stageId=${editingStageId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: stageName,
            description: stageDescription,
            order: stageData.order,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update stage');
        }

        const updatedStage = await response.json();
        
        // Update local state and invalidate cache
        updateEntity('stages', editingStageId, updatedStage);
        queryClient.invalidateQueries({ queryKey: ['pov', povId] });
        
        resetStageForm();
      } else {
        // Add new stage - use the same delayed save pattern as phases
        const newStageId = addEntity('stages', stageData);
        
        // Set up delayed save via useEffect - wait for stage to appear in state
        pendingStageRef.current = newStageId;
      }
    } catch (error) {
      toast({
        title: 'Failed to save stage',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };
  
  // Delete stage
  const handleDeleteStage = async (stageId: string) => {
    try {
      const stage = state.entities.stages[stageId];
      if (!stage) {
        return;
      }

      // Get POV ID from state
      const povId = state.data?.id;
      if (!povId) {
        return;
      }

      // For temporary stages (not yet saved), just remove from local state
      if (stageId.startsWith('temp-')) {
        removeEntity('stages', stageId);
        return;
      }

      // For real stages, call the API to delete from database
      const response = await fetch(
        `/api/pov/${povId}/phase/${stage.phaseId}/stage?stageId=${stageId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete stage');
      }

      // Remove from local state after successful API call
      removeEntity('stages', stageId);
    } catch (error) {
      toast({
        title: 'Failed to delete stage',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };
  
  // Add task - Only create task when dialog saves, not when opened
  const handleAddTask = (stageId: string) => {
    const stage = state.entities.stages[stageId];
    if (stage) {
      // Don't create the task yet - just open dialog with stage info
      // The TaskEditDialog will handle creation when user saves
      const taskId = `new-task-for-stage-${stageId}`;
      setEditingTaskId(taskId);
    }
  };
  
  // Edit task
  const handleEditTask = (taskId: string) => {
    setEditingTaskId(taskId);
  };
  
  // Close task edit dialog
  const handleCloseTaskDialog = () => {
    setEditingTaskId(null);
  };
  
  // Handle task save from dialog - TaskEditDialog handles everything now
  const handleTaskSave = (_taskId: string) => {
    // TaskEditDialog now handles the complete task creation and save flow
    // No need for pendingTaskRef or additional save logic here
  };
  
  // Delete task - Properly delete from database
  const handleDeleteTask = async (taskId: string) => {
    try {
      const task = state.entities.tasks[taskId];
      if (!task) {
        return;
      }

      // For temporary tasks (not yet saved), just remove from local state
      if (taskId.startsWith('temp-')) {
        removeEntity('tasks', taskId);
        return;
      }

      // For real tasks, call the API to delete from database
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete task');
      }

      // Remove from local state after successful API call
      removeEntity('tasks', taskId);
    } catch (error) {
      toast({
        title: 'Failed to delete task',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };
  
  // Toggle phase expansion
  const handleTogglePhase = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId);
    } else {
      newExpanded.add(phaseId);
    }
    setExpandedPhases(newExpanded);
  };
  
  // Handle task selection
  const handleSelectTask = (taskId: string) => {
    updateSelectedTask(taskId);
  };
  
  return (
    <Card>
      {showForm && (
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">
              {editingPhaseId ? 'Edit Phase' : 'Add New Phase'}
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-6">
        {/* Phase Form */}
        {showForm && (
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">
                {editingPhaseId ? 'Edit Phase' : 'Add New Phase'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phase-name">Phase Name</Label>
                  <Input
                    id="phase-name"
                    value={phaseName}
                    onChange={(e) => setPhaseName(e.target.value)}
                    placeholder="Enter phase name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phase-description">Description</Label>
                  <Textarea
                    id="phase-description"
                    value={phaseDescription}
                    onChange={(e) => setPhaseDescription(e.target.value)}
                    placeholder="Enter phase description"
                    rows={3}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phase-type">Phase Type</Label>
                  <Select
                    value={phaseType}
                    onValueChange={(value) => setPhaseType(value as PhaseType)}
                  >
                    <SelectTrigger id="phase-type">
                      <SelectValue placeholder="Select phase type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLANNING">Planning</SelectItem>
                      <SelectItem value="EXECUTION">Execution</SelectItem>
                      <SelectItem value="REVIEW">Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phase-start-date">Start Date</Label>
                    <DatePicker
                      value={phaseStartDate ? fromLocalYmd(phaseStartDate) : null}
                      onChange={(date) => setPhaseStartDate(date ? toLocalYmd(date) : '')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phase-end-date">End Date</Label>
                    <DatePicker
                      value={phaseEndDate ? fromLocalYmd(phaseEndDate) : null}
                      onChange={(date) => setPhaseEndDate(date ? toLocalYmd(date) : '')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phase-order">Order (1000 increment pattern)</Label>
                  <Input
                    id="phase-order"
                    type="number"
                    value={phaseOrder}
                    onChange={(e) => setPhaseOrder(parseInt(e.target.value) || 0)}
                    placeholder="1000, 2000, 3000..."
                    min="0"
                    max="1000000"
                    step="1000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use multiples of 1000 (e.g., 1000, 2000, 2500) for flexible reordering
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingPhaseId ? 'Update Phase' : 'Add Phase'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* Stage Form */}
        {showStageForm && (
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">
                {editingStageId ? 'Edit Stage' : 'Add New Stage'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStageSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stage-name">Stage Name</Label>
                  <Input
                    id="stage-name"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    placeholder="Enter stage name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="stage-description">Description</Label>
                  <Textarea
                    id="stage-description"
                    value={stageDescription}
                    onChange={(e) => setStageDescription(e.target.value)}
                    placeholder="Enter stage description"
                    rows={3}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stage-order">Order (1000 increment pattern)</Label>
                  <Input
                    id="stage-order"
                    type="number"
                    value={stageOrder}
                    onChange={(e) => setStageOrder(parseInt(e.target.value) || 0)}
                    placeholder="1000, 2000, 3000..."
                    min="0"
                    max="1000000"
                    step="1000"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use multiples of 1000 (e.g., 1000, 2000, 2500) for flexible reordering
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetStageForm}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingStageId ? 'Update Stage' : 'Add Stage'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* Hierarchical Phase View */}
        <HierarchicalPhaseView
          phases={(() => {
            const allPhases = Object.entries(state.entities.phases);
            
            // FIXED: Don't filter out temp IDs - show all valid phases including new ones
            const filteredPhases = allPhases.filter(([id, phase]) => {
              // Only filter out truly invalid IDs
              return id !== 'undefined' && id && id.trim() !== '';
            });
            
            return filteredPhases.reduce((acc, [id, phase]) => {
              // Get stages for this phase with deduplication
              const allPhaseStages = Object.values(state.entities.stages)
                .filter(stage => {
                  // Show stages that belong to this phase
                  // Filter out only undefined or empty IDs
                  return stage.phaseId === id && 
                         stage.id !== 'undefined' && 
                         stage.id && 
                         stage.id.trim() !== '';
                });
              
              // 🔧 SMART DEDUPLICATION: Remove duplicates for display but preserve all IDs for deletion
              const stageMap = new Map();
              const allValidStages = allPhaseStages.filter(stage => {
                // Only filter out truly invalid stages
                return stage.id !== 'undefined' && 
                       stage.id && 
                       stage.id.trim() !== '' &&
                       stage.name && 
                       stage.name.trim() !== '';
              });
              
              // Store ALL valid stages for deletion access (including duplicates)
              const allStagesForDeletion = [...allValidStages];
              
              // Deduplicate for display only
              allValidStages.forEach(stage => {
                const key = `${stage.name}-${stage.phaseId}`;
                const existing = stageMap.get(key);
                
                if (!existing) {
                  // No existing stage with this name+phase, add it
                  stageMap.set(key, stage);
                } else {
                  // There's already a stage with this name+phase
                  // Prefer real ID over temporary ID for display
                  const isExistingTemp = existing.id.startsWith('temp-');
                  const isCurrentTemp = stage.id.startsWith('temp-');
                  
                  if (isExistingTemp && !isCurrentTemp) {
                    // Replace temporary with real for display
                    stageMap.set(key, stage);
                  } else if (!isExistingTemp && isCurrentTemp) {
                    // Keep real, ignore temporary for display
                    // Do nothing
                  } else {
                    // Both are same type, keep the first one for display
                    // Do nothing
                  }
                }
              });
              
              const phaseStages = Array.from(stageMap.values())
                .sort((a, b) => a.order - b.order);
              
              const finalPhaseStages = phaseStages
                .map(stage => {
                  // Get tasks for this stage with deduplication
                  const allStageTasks = Object.values(state.entities.tasks)
                    .filter(task => {
                      // Show tasks that belong to this stage
                      return task.stageId === stage.id && 
                             task.id !== 'undefined' && 
                             task.id && 
                             task.id.trim() !== '';
                    });
                  
                  // Deduplicate tasks: if there are tasks with the same title and stage,
                  // prefer the one with a real ID over temporary ID
                  const taskMap = new Map();
                  allStageTasks.forEach(task => {
                    const key = `${task.title}-${task.stageId}`;
                    const existing = taskMap.get(key);
                    
                    if (!existing) {
                      // No existing task with this title, add it
                      taskMap.set(key, task);
                    } else {
                      // There's already a task with this title
                      // Prefer real ID over temporary ID
                      const isExistingTemp = existing.id.startsWith('temp-');
                      const isCurrentTemp = task.id.startsWith('temp-');
                      
                      if (isExistingTemp && !isCurrentTemp) {
                        // Replace temporary with real
                        taskMap.set(key, task);
                      } else if (!isExistingTemp && isCurrentTemp) {
                        // Keep real, ignore temporary
                        // Do nothing
                      } else {
                        // Both are same type, keep the first one
                        // Do nothing
                      }
                    }
                  });
                  
                  const stageTasks = Array.from(taskMap.values())
                    .sort((a, b) => a.order - b.order);
                  
                  return {
                    ...stage,
                    tasks: stageTasks
                  };
                });
              
              // Return the phase with its stages
              return {
                ...acc,
                [id]: {
                  ...phase,
                  stages: finalPhaseStages
                }
              };
            }, {});
          })()}
          selectedTaskId={selectedTaskId}
          onSelectTask={handleSelectTask}
          expandedPhases={expandedPhases}
          onTogglePhase={handleTogglePhase}
          onAddPhase={() => {
            // Calculate order for new phase (1000 increment pattern)
            const existingPhases = Object.values(state.entities.phases);
            const maxOrder = existingPhases.length > 0
              ? Math.max(...existingPhases.map(p => p.order))
              : 0;
            setPhaseOrder(maxOrder + 1000);
            setShowForm(true);
          }}
          onEditPhase={handleEditPhase}
          onDeletePhase={handleDeletePhase}
          onAddStage={handleAddStage}
          onEditStage={handleEditStage}
          onDeleteStage={handleDeleteStage}
          onAddTask={handleAddTask}
          onEditTask={handleEditTask}
          onDeleteTask={handleDeleteTask}
          isEditable={state.ui.mode !== 'view'}
        />
      </CardContent>
      
      {/* Task Edit Dialog */}
      <TaskEditDialog
        taskId={editingTaskId}
        isOpen={!!editingTaskId}
        onClose={handleCloseTaskDialog}
        onSave={handleTaskSave}
      />
    </Card>
  );
}
