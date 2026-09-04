"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { 
  Plus, 
  AlertCircle, 
  Check 
} from 'lucide-react';
import { PhaseType } from '@prisma/client';
import { usePhaseTemplateOperations, useTemplateValidation } from '../context/TemplateEditorContext';

/**
 * Phase template design section for creating and editing phase templates
 */
export default function PhaseTemplateDesignSection() {
  const { 
    phases, 
    stages, 
    tasks, 
    addPhase, 
    updatePhase, 
    removePhase,
    addStage,
    updateStage,
    removeStage,
    addTask,
    updateTask,
    removeTask,
    selectedPhaseId,
    selectedStageId,
    selectedTaskId,
    setSelectedPhase,
    setSelectedStage,
    setSelectedTask
  } = usePhaseTemplateOperations();
  
  const { getFieldErrors, hasFieldError } = useTemplateValidation();
  
  const [activeTab, setActiveTab] = useState('details');
  
  // Get phases as array sorted by order
  const phasesArray = Object.values(phases).sort((a, b) => 
    (a.order || 0) - (b.order || 0)
  );
  
  // Get selected entities
  const selectedPhase = selectedPhaseId ? phases[selectedPhaseId] : null;
  const selectedStage = selectedStageId ? stages[selectedStageId] : null;
  const selectedTask = selectedTaskId ? tasks[selectedTaskId] : null;
  
  // Get stages for selected phase
  const phaseStages = selectedPhaseId 
    ? Object.values(stages).filter(stage => stage.phaseId === selectedPhaseId)
    : [];
  
  // Get tasks for selected stage
  const stageTasks = selectedStageId
    ? Object.values(tasks).filter(task => task.stageId === selectedStageId)
    : [];
  
  // Handle add phase
  const handleAddPhase = () => {
    const newPhaseId = `phase-${Date.now()}`;
    const newPhase = {
      id: newPhaseId,
      name: 'New Phase',
      description: '',
      type: 'PLANNING' as PhaseType,
      order: phasesArray.length
    };
    
    addPhase(newPhase);
    setSelectedPhase(newPhaseId);
  };
  
  // Handle update phase
  const handleUpdatePhase = (field: string, value: any) => {
    if (!selectedPhase) return;
    
    updatePhase(selectedPhase.id, {
      [field]: value
    });
  };
  
  // Handle add stage
  const handleAddStage = () => {
    if (!selectedPhaseId) return;
    
    const newStageId = `stage-${Date.now()}`;
    const newStage = {
      id: newStageId,
      name: 'New Stage',
      description: '',
      phaseId: selectedPhaseId,
      order: phaseStages.length
    };
    
    addStage(newStage);
    setSelectedStage(newStageId);
  };
  
  // Handle update stage
  const handleUpdateStage = (field: string, value: any) => {
    if (!selectedStage) return;
    
    updateStage(selectedStage.id, {
      [field]: value
    });
  };
  
  // Handle add task
  const handleAddTask = () => {
    if (!selectedStageId) return;
    
    const newTaskId = `task-${Date.now()}`;
    const newTask = {
      id: newTaskId,
      title: 'New Task',
      description: '',
      priority: 'MEDIUM' as any,
      type: 'DEVELOPMENT' as any,
      stageId: selectedStageId
    };
    
    addTask(newTask);
    setSelectedTask(newTaskId);
  };
  
  // Handle update task
  const handleUpdateTask = (field: string, value: any) => {
    if (!selectedTask) return;
    
    updateTask(selectedTask.id, {
      [field]: value
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Phase List */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Phases</Label>
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="bg-muted p-2 border-b border-border flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Phase List</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddPhase}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="sr-only">Add Phase</span>
                    </Button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {phasesArray.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No phases defined. Click the + button to add a phase.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {phasesArray.map((phase) => (
                          <div
                            key={phase.id}
                            className={`p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                              selectedPhaseId === phase.id ? 'bg-primary/10 border-l-2 border-primary text-primary' : ''
                            }`}
                            onClick={() => setSelectedPhase(phase.id)}
                          >
                            <div className="font-medium">{phase.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {phase.type}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content Area */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              {!selectedPhase ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Phase Selected</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Select a phase from the list or create a new one to configure it.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleAddPhase}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Phase
                  </Button>
                </div>
              ) : (
                <Tabs defaultValue="details" value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details">Phase Details</TabsTrigger>
                    <TabsTrigger value="stages">Stages ({phaseStages.length})</TabsTrigger>
                    <TabsTrigger value="tasks">Tasks ({stageTasks.length})</TabsTrigger>
                  </TabsList>
                  
                  {/* Phase Details Tab */}
                  <TabsContent value="details" className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="phase-name">Phase Name</Label>
                      <Input
                        id="phase-name"
                        value={selectedPhase.name}
                        onChange={(e) => handleUpdatePhase('name', e.target.value)}
                        placeholder="Enter phase name"
                        className={hasFieldError(`phases.${selectedPhase.id}.name`) ? 'border-destructive' : ''}
                      />
                      {hasFieldError(`phases.${selectedPhase.id}.name`) && (
                        <p className="text-sm text-destructive">
                          {getFieldErrors(`phases.${selectedPhase.id}.name`)[0]}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="phase-description">Description</Label>
                      <Textarea
                        id="phase-description"
                        value={selectedPhase.description || ''}
                        onChange={(e) => handleUpdatePhase('description', e.target.value)}
                        placeholder="Enter phase description"
                        rows={3}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phase-type">Phase Type</Label>
                        <Select
                          value={selectedPhase.type}
                          onValueChange={(value) => handleUpdatePhase('type', value)}
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
                      
                      <div className="space-y-2">
                        <Label htmlFor="phase-order">Order</Label>
                        <Input
                          id="phase-order"
                          type="number"
                          value={selectedPhase.order || 0}
                          onChange={(e) => handleUpdatePhase('order', parseInt(e.target.value) || 0)}
                          placeholder="Enter phase order"
                          min="0"
                        />
                      </div>
                    </div>
                    
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        This is a template. Actual start and end dates will be calculated when the template is applied to a POV.
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                  
                  {/* Stages Tab */}
                  <TabsContent value="stages" className="pt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">Stages in {selectedPhase.name}</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddStage}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Stage
                        </Button>
                      </div>
                      
                      {phaseStages.length === 0 ? (
                        <div className="text-center p-8 border border-border rounded-md bg-muted">
                          <p className="text-sm text-muted-foreground mb-4">
                            No stages defined for this phase.
                          </p>
                          <Button
                            variant="outline"
                            onClick={handleAddStage}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add First Stage
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {phaseStages.map((stage) => (
                            <div
                              key={stage.id}
                              className={`border border-border rounded-md p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                                selectedStageId === stage.id ? 'bg-primary/10 border-primary' : ''
                              }`}
                              onClick={() => setSelectedStage(stage.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-medium text-foreground">{stage.name}</h5>
                                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Order: {stage.order}
                                  </p>
                                </div>
                                <div className="flex space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStage(stage.id);
                                      setActiveTab('tasks');
                                    }}
                                  >
                                    View Tasks
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  
                  {/* Tasks Tab */}
                  <TabsContent value="tasks" className="pt-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">
                          Tasks {selectedStage ? `in ${selectedStage.name}` : ''}
                        </h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddTask}
                          disabled={!selectedStageId}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Task
                        </Button>
                      </div>
                      
                      {!selectedStageId ? (
                        <div className="text-center p-8 border border-border rounded-md bg-muted">
                          <p className="text-sm text-muted-foreground">
                            Select a stage to view and manage its tasks.
                          </p>
                        </div>
                      ) : stageTasks.length === 0 ? (
                        <div className="text-center p-8 border border-border rounded-md bg-muted">
                          <p className="text-sm text-muted-foreground mb-4">
                            No tasks defined for this stage.
                          </p>
                          <Button
                            variant="outline"
                            onClick={handleAddTask}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add First Task
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {stageTasks.map((task) => (
                            <div
                              key={task.id}
                              className={`border border-border rounded-md p-4 cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                                selectedTaskId === task.id ? 'bg-primary/10 border-primary' : ''
                              }`}
                              onClick={() => setSelectedTask(task.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-medium text-foreground">{task.title}</h5>
                                  <p className="text-sm text-muted-foreground">{task.description}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Priority: {task.priority} • Type: {task.type}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
