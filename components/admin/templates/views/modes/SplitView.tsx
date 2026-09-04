import React, { useState, useRef, useEffect } from 'react';
import { ViewModeProps } from '../types';
import { StageNavigator } from './split-view/StageNavigator';
import { TaskList } from './split-view/TaskList';
import { TaskEditor } from './split-view/TaskEditor';
import { BreadcrumbNavigation } from './split-view/BreadcrumbNavigation';
import { useSplitViewState } from './split-view/hooks/useSplitViewState';

/**
 * Multi-Panel Split View with Synchronized Navigation
 * 
 * Features:
 * - Three-panel layout: stage navigator, task list, and task editor
 * - Synchronized scrolling between panels
 * - Adjustable panel sizes
 * - Breadcrumb navigation
 * - Context-aware editing tools
 */
export const SplitView: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly
}) => {
  // Use the split view state hook
  const {
    selectedStageId,
    selectedTaskId,
    setSelectedStageId,
    setSelectedTaskId,
    getStageById,
    getTaskById,
    updateStage,
    updateTask,
    stages,
    getTasksForStage
  } = useSplitViewState(template, onTemplateChange);
  
  // Refs for the panels
  const stageNavigatorRef = useRef<HTMLDivElement>(null);
  const taskListRef = useRef<HTMLDivElement>(null);
  const taskEditorRef = useRef<HTMLDivElement>(null);
  
  // State for panel sizes
  const [panelSizes, setPanelSizes] = useState({
    stageNavigator: 25, // 25% of the width
    taskList: 30, // 30% of the width
    taskEditor: 45 // 45% of the width
  });
  
  // State for resizing
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [startX, setStartX] = useState(0);
  const [startSizes, setStartSizes] = useState(panelSizes);
  
  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, panel: string) => {
    setIsResizing(panel);
    setStartX(e.clientX);
    setStartSizes({ ...panelSizes });
    
    // Add event listeners for mouse move and mouse up
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };
  
  // Handle resize move
  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    const containerWidth = document.getElementById('split-view-container')?.clientWidth || 1000;
    const deltaPercent = (deltaX / containerWidth) * 100;
    
    if (isResizing === 'stageNavigator') {
      // Resize stage navigator and task list
      const newStageNavigatorSize = Math.max(15, Math.min(40, startSizes.stageNavigator + deltaPercent));
      const diff = newStageNavigatorSize - startSizes.stageNavigator;
      
      setPanelSizes({
        stageNavigator: newStageNavigatorSize,
        taskList: startSizes.taskList - diff,
        taskEditor: startSizes.taskEditor
      });
    } else if (isResizing === 'taskList') {
      // Resize task list and task editor
      const newTaskListSize = Math.max(20, Math.min(50, startSizes.taskList + deltaPercent));
      const diff = newTaskListSize - startSizes.taskList;
      
      setPanelSizes({
        stageNavigator: startSizes.stageNavigator,
        taskList: newTaskListSize,
        taskEditor: startSizes.taskEditor - diff
      });
    }
  };
  
  // Handle resize end
  const handleResizeEnd = () => {
    setIsResizing(null);

    // Remove event listeners
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  // BC64 FIX: Cleanup resize listeners on unmount (prevents leak if unmounted while resizing)
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  });

  // Handle save
  const handleSave = () => {
    onSave(template);
  };
  
  // Get the selected stage and task
  const selectedStage = selectedStageId ? getStageById(selectedStageId) : null;
  const selectedTask = selectedTaskId ? getTaskById(selectedTaskId) : null;
  
  // Get tasks for the selected stage
  const tasksForSelectedStage = selectedStageId ? getTasksForStage(selectedStageId) : [];
  
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-xl font-bold">{template.name}</h2>
        <p className="text-muted-foreground text-sm">{template.description}</p>
      </div>
      
      <BreadcrumbNavigation
        template={template}
        selectedStageId={selectedStageId}
        selectedTaskId={selectedTaskId}
        onStageSelect={setSelectedStageId}
        onTaskSelect={setSelectedTaskId}
      />
      
      <div 
        id="split-view-container"
        className="flex-1 flex border rounded-lg overflow-hidden"
      >
        {/* Stage Navigator Panel */}
        <div 
          ref={stageNavigatorRef}
          className="border-r relative"
          style={{ width: `${panelSizes.stageNavigator}%` }}
        >
          <StageNavigator
            stages={stages}
            selectedStageId={selectedStageId}
            onStageSelect={setSelectedStageId}
            isReadOnly={isReadOnly || false}
            onStageUpdate={updateStage}
          />
          
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full bg-border cursor-col-resize hover:bg-primary"
            onMouseDown={(e) => handleResizeStart(e, 'stageNavigator')}
          />
        </div>
        
        {/* Task List Panel */}
        <div 
          ref={taskListRef}
          className="border-r relative"
          style={{ width: `${panelSizes.taskList}%` }}
        >
          <TaskList
            tasks={tasksForSelectedStage}
            selectedTaskId={selectedTaskId}
            onTaskSelect={setSelectedTaskId}
            isReadOnly={isReadOnly || false}
            stageName={selectedStage?.name || ''}
          />
          
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full bg-border cursor-col-resize hover:bg-primary"
            onMouseDown={(e) => handleResizeStart(e, 'taskList')}
          />
        </div>
        
        {/* Task Editor Panel */}
        <div 
          ref={taskEditorRef}
          style={{ width: `${panelSizes.taskEditor}%` }}
        >
          <TaskEditor
            task={selectedTask}
            stage={selectedStage}
            onTaskUpdate={updateTask}
            isReadOnly={isReadOnly || false}
            allStages={stages}
          />
        </div>
      </div>
    </div>
  );
};
