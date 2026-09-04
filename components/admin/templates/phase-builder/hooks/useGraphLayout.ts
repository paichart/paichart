import { useMemo } from 'react';
import { Stage } from '../types';
import { TaskNodeData, GraphDimensions } from '../components/graph/types';

export function useGraphLayout(stages: Stage[]) {
  // Calculate the positions of the nodes using useMemo for better performance
  const { calculatedNodes, calculatedDimensions } = useMemo(() => {
    if (!stages.length) return { calculatedNodes: [], calculatedDimensions: { width: 800, height: 600 } };
    
    const taskNodes: TaskNodeData[] = [];
    const stageGap = 40;
    const taskGap = 20;
    const taskWidth = 180;
    const taskHeight = 40;
    
    let maxStageHeight = 0;
    let totalWidth = 0;
    
    // First pass: calculate dimensions
    stages.forEach(stage => {
      const stageHeight = stage.tasks.length * (taskHeight + taskGap) - taskGap;
      if (stageHeight > maxStageHeight) {
        maxStageHeight = stageHeight;
      }
      totalWidth += taskWidth + stageGap;
    });
    
    // Calculate SVG dimensions
    const dimensions: GraphDimensions = {
      width: Math.max(800, totalWidth),
      height: Math.max(600, maxStageHeight + 100)
    };
    
    // Second pass: create nodes with positions
    let xOffset = 50;
    
    stages.forEach(stage => {
      const stageHeight = stage.tasks.length * (taskHeight + taskGap) - taskGap;
      let yOffset = (dimensions.height - stageHeight) / 2;
      
      stage.tasks.forEach(task => {
        taskNodes.push({
          id: task.id, // Changed from key to id
          title: task.title, // Changed from name to title
          stageId: stage.name,
          stageName: stage.name,
          type: task.type,
          dependencies: task.dependencies || [],
          x: xOffset,
          y: yOffset,
          width: taskWidth,
          height: taskHeight
        });
        
        yOffset += taskHeight + taskGap;
      });
      
      xOffset += taskWidth + stageGap;
    });
    
    return { calculatedNodes: taskNodes, calculatedDimensions: dimensions };
  }, [stages]); // Only recalculate when stages change
  
  // Generate the SVG path for a dependency arrow
  const generatePath = (sourceNode: TaskNodeData, targetNode: TaskNodeData) => {
    const sourceX = sourceNode.x + sourceNode.width;
    const sourceY = sourceNode.y + sourceNode.height / 2;
    const targetX = targetNode.x;
    const targetY = targetNode.y + targetNode.height / 2;
    
    // Calculate control points for the curve
    const controlPointX = (sourceX + targetX) / 2;
    
    // Create the path
    return `
      M ${sourceX} ${sourceY}
      C ${controlPointX} ${sourceY}, ${controlPointX} ${targetY}, ${targetX} ${targetY}
    `;
  };
  
  return {
    calculatedNodes,
    calculatedDimensions,
    generatePath
  };
}
