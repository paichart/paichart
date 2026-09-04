import { useState } from 'react';
import { Stage } from '../types';

export function useStageManagement(initialStages: Stage[] = []) {
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [editingStage, setEditingStage] = useState<string | null>(null);
  const [newStage, setNewStage] = useState<Omit<Stage, 'id' | 'tasks'>>({
    name: '',
    description: '',
  });
  const [showNewStageForm, setShowNewStageForm] = useState(false);

  // Generate unique IDs
  const generateId = (prefix: string) => {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  };
  
  // Add a new stage
  const handleAddStage = (stageData: Omit<Stage, 'id' | 'tasks'>) => {
    if (!stageData.name.trim()) {
      alert('Stage name is required');
      return;
    }
    
    const stage: Stage = {
      name: stageData.name,
      description: stageData.description,
      tasks: []
    };
    
    setStages([...stages, stage]);
    setNewStage({
      name: '',
      description: '',
    });
    setShowNewStageForm(false);
  };
  
  // Update an existing stage
  const handleUpdateStage = (stageId: string, updates: Partial<Stage>) => {
    const updatedStages = stages.map(stage => 
      stage.name === stageId ? { ...stage, ...updates } : stage
    );
    setStages(updatedStages);
    setEditingStage(null);
  };
  
  // Delete a stage
  const handleDeleteStage = (stageId: string) => {
    if (!confirm('Are you sure you want to delete this stage? All tasks within this stage will also be deleted.')) {
      return;
    }
    
    const updatedStages = stages.filter(stage => stage.name !== stageId);
    setStages(updatedStages);
  };
  
  // Move a stage via drag and drop
  const moveStage = (dragIndex: number, hoverIndex: number) => {
    const draggedStage = stages[dragIndex];
    const updatedStages = [...stages];
    
    updatedStages.splice(dragIndex, 1);
    updatedStages.splice(hoverIndex, 0, draggedStage);
    
    setStages(updatedStages);
  };

  return {
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
  };
}
