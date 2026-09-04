import { useState, useCallback, useMemo } from 'react';
import { Template, Stage, Task } from '../../../types';
import { TemplateAnalysisResponse } from '@/lib/services/llm/types';

/**
 * Interface for folded section
 */
export interface FoldedSection {
  stageId: string;
  taskIds: string[];
  reason: string;
}

/**
 * Interface for related section
 */
export interface RelatedSection {
  sourceStageId: string;
  sourceTaskId: string;
  relatedStageId: string;
  relatedTaskId: string;
  relationshipType: string;
  confidence: number;
}

/**
 * Interface for suggestion
 */
export interface Suggestion {
  stageId?: string;
  taskId?: string;
  suggestion: string;
  type: 'add' | 'modify' | 'remove' | 'general';
  priority: 'high' | 'medium' | 'low';
}

/**
 * Interface for search result
 */
export interface SearchResult {
  stageId: string;
  taskId: string;
  relevance: number;
  matchedText: string;
}

/**
 * Custom hook for managing smart folding state
 */
export const useSmartFoldingState = (
  template: Template,
  onTemplateChange: (template: Template) => void
) => {
  // Current stage and task
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  
  // AI analysis results
  const [foldedSections, setFoldedSections] = useState<FoldedSection[]>([]);
  const [relatedSections, setRelatedSections] = useState<RelatedSection[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  // Memoize stages
  const stages = useMemo(() => template.stages, [template.stages]);
  
  // Set initial current stage and task if not set
  useMemo(() => {
    if (stages.length > 0 && !currentStageId) {
      setCurrentStageId(stages[0].id);
      
      if (stages[0].tasks.length > 0 && !currentTaskId) {
        setCurrentTaskId(stages[0].tasks[0].id);
      }
    }
  }, [stages, currentStageId, currentTaskId]);
  
  // Update a stage
  const updateStage = useCallback((stageId: string, updatedStage: Partial<Stage>) => {
    const newTemplate = { ...template };
    const stageIndex = newTemplate.stages.findIndex((s: Stage) => s.id === stageId);
    
    if (stageIndex === -1) return;
    
    newTemplate.stages[stageIndex] = {
      ...newTemplate.stages[stageIndex],
      ...updatedStage
    };
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  // Update a task
  const updateTask = useCallback((stageId: string, taskId: string, updatedTask: Partial<Task>) => {
    const newTemplate = { ...template };
    const stageIndex = newTemplate.stages.findIndex((s: Stage) => s.id === stageId);
    
    if (stageIndex === -1) return;
    
    const taskIndex = newTemplate.stages[stageIndex].tasks.findIndex((t: Task) => t.id === taskId);
    
    if (taskIndex === -1) return;
    
    newTemplate.stages[stageIndex].tasks[taskIndex] = {
      ...newTemplate.stages[stageIndex].tasks[taskIndex],
      ...updatedTask
    };
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  // Add a task
  const addTask = useCallback((stageId: string, task: Task) => {
    const newTemplate = { ...template };
    const stageIndex = newTemplate.stages.findIndex((s: Stage) => s.id === stageId);
    
    if (stageIndex === -1) return;
    
    newTemplate.stages[stageIndex].tasks.push(task);
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  // Remove a task
  const removeTask = useCallback((stageId: string, taskId: string) => {
    const newTemplate = { ...template };
    const stageIndex = newTemplate.stages.findIndex((s: Stage) => s.id === stageId);
    
    if (stageIndex === -1) return;
    
    newTemplate.stages[stageIndex].tasks = newTemplate.stages[stageIndex].tasks.filter((t: Task) => t.id !== taskId);
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  // Add a stage
  const addStage = useCallback((stage: Stage) => {
    const newTemplate = { ...template };
    newTemplate.stages.push(stage);
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  // Remove a stage
  const removeStage = useCallback((stageId: string) => {
    const newTemplate = { ...template };
    newTemplate.stages = newTemplate.stages.filter((s: Stage) => s.id !== stageId);
    
    onTemplateChange(newTemplate);
  }, [template, onTemplateChange]);
  
  return {
    // Current state
    currentStageId,
    currentTaskId,
    setCurrentStageId,
    setCurrentTaskId,
    
    // AI analysis results
    foldedSections,
    relatedSections,
    suggestions,
    searchResults,
    setFoldedSections,
    setRelatedSections,
    setSuggestions,
    setSearchResults,
    
    // Template data
    stages,
    
    // Template operations
    updateStage,
    updateTask,
    addTask,
    removeTask,
    addStage,
    removeStage
  };
};
