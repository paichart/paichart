import React, { useRef, useState } from 'react';
import { Stage } from '../types';
import {
  useGraphNavigation,
  useTaskSelection,
  useGraphLayout,
  useKeyboardNavigation,
  useExportGraph,
  useTaskTypeIcons
} from '../hooks';
import {
  TaskNode,
  DependencyArrow,
  ArrowMarker,
  TaskDetailsPanel,
  GraphMinimap,
  GraphControls,
  KeyboardShortcutsHelp,
  GraphOptions,
  GraphContainer
} from './graph';

interface DependencyGraphProps {
  stages: Stage[];
  templateName: string;
}

export function DependencyGraph({ stages, templateName }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // State for UI options
  const [showMinimap, setShowMinimap] = useState(true);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  
  // Custom hooks
  const { getTaskTypeIcon } = useTaskTypeIcons();
  const { calculatedNodes, calculatedDimensions, generatePath } = useGraphLayout(stages);
  
  const {
    transform,
    isPanning,
    handleZoomIn,
    handleZoomOut,
    handleResetView,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleWheel,
    centerViewOn
  } = useGraphNavigation(containerRef, calculatedDimensions);
  
  const {
    selectedTaskId,
    hoveredTask,
    showTaskDetails,
    setHoveredTask,
    setShowTaskDetails,
    isRelatedToSelectedTask,
    handleTaskClick,
    selectFirstTask,
    selectNextTask,
    clearSelection,
    taskNodesMap
  } = useTaskSelection(calculatedNodes, transform, calculatedDimensions, centerViewOn);
  
  // Export SVG functionality
  const handleExportSVG = useExportGraph(svgRef, templateName);
  
  // Keyboard navigation
  useKeyboardNavigation({
    containerRef,
    nodes: calculatedNodes,
    selectedTaskId,
    showMinimap,
    showTaskDetails,
    showKeyboardHelp,
    handleZoomIn,
    handleZoomOut,
    handleResetView,
    setShowMinimap,
    setShowTaskDetails,
    setShowKeyboardHelp,
    selectFirstTask,
    selectNextTask,
    clearSelection,
    setTransform: (transformFn) => {
      const newTransform = transformFn(transform);
      if (newTransform) {
        centerViewOn(
          newTransform.x,
          newTransform.y,
          calculatedDimensions.width,
          calculatedDimensions.height
        );
      }
    }
  });
  
  // No stages or tasks to display
  if (!stages.length || !calculatedNodes.length) {
    return (
      <div className="p-8 text-center bg-muted border rounded-md">
        <p className="text-muted-foreground">No stages or tasks defined yet.</p>
        <p className="text-sm text-muted-foreground/80 mt-2">
          Add stages and tasks to visualize the dependency graph.
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <GraphControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onExport={handleExportSVG}
        onToggleHelp={() => setShowKeyboardHelp(!showKeyboardHelp)}
        showKeyboardHelp={showKeyboardHelp}
      />
      
      <KeyboardShortcutsHelp visible={showKeyboardHelp} />
      
      {selectedTaskId && showTaskDetails && (
        <TaskDetailsPanel
          selectedTaskId={selectedTaskId}
          nodes={calculatedNodes}
          getTaskTypeIcon={getTaskTypeIcon}
        />
      )}
      
      <GraphOptions
        showMinimap={showMinimap}
        setShowMinimap={setShowMinimap}
        showTaskDetails={showTaskDetails}
        setShowTaskDetails={setShowTaskDetails}
      />
      
      <GraphContainer
        isPanning={isPanning}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="600"
          viewBox={`0 0 ${calculatedDimensions.width} ${calculatedDimensions.height}`}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
          tabIndex={0}
          aria-label="Task dependency graph"
          role="application"
        >
          <ArrowMarker />
          
          {/* Stage labels */}
          {stages.map((stage) => {
            const stageNode = calculatedNodes.find(node => node.stageId === stage.name);
            if (!stageNode) return null;
            
            return (
              <text
                key={`stage-${stage.name}`}
                x={stageNode.x + stageNode.width / 2}
                y={20}
                textAnchor="middle"
                fontWeight="bold"
                className="select-none"
              >
                {stage.name}
              </text>
            );
          })}
          
          {/* Dependency arrows */}
          {calculatedNodes.map(node => 
            node.dependencies && node.dependencies.map(depId => {
              const targetNode = taskNodesMap[depId];
              if (!targetNode) return null;
              
              // Highlight dependency arrows related to the selected task
              const isHighlighted = 
                selectedTaskId === node.id || 
                selectedTaskId === depId;
              
              return (
                <DependencyArrow
                  key={`${node.id}-${depId}`}
                  sourceNode={node}
                  targetNode={targetNode}
                  isHighlighted={isHighlighted}
                  generatePath={generatePath}
                />
              );
            })
          )}
          
          {/* Task nodes */}
          {calculatedNodes.map(node => (
            <TaskNode
              key={node.id}
              node={node}
              isSelected={selectedTaskId === node.id}
              isRelated={isRelatedToSelectedTask(node.id)}
              isHovered={hoveredTask === node.id}
              onClick={handleTaskClick}
              onMouseEnter={setHoveredTask}
              onMouseLeave={() => setHoveredTask(null)}
              getTaskTypeIcon={getTaskTypeIcon}
            />
          ))}
        </svg>
        
        {/* Minimap */}
        {showMinimap && (
          <GraphMinimap
            nodes={calculatedNodes}
            stages={stages}
            svgDimensions={calculatedDimensions}
            transform={transform}
            setTransform={(newTransform) => {
              centerViewOn(
                newTransform.x,
                newTransform.y,
                calculatedDimensions.width,
                calculatedDimensions.height
              );
            }}
            selectedTaskId={selectedTaskId}
            isRelatedToSelectedTask={isRelatedToSelectedTask}
            generatePath={generatePath}
            taskNodesMap={taskNodesMap}
          />
        )}
      </GraphContainer>
    </div>
  );
}
