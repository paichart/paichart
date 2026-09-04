import { Template, Stage, Task } from '../../types';
import { Node, Edge, Position, NodeProps, EdgeProps } from 'reactflow';
import { TaskType } from '@prisma/client';

// Types for graph view
export interface GraphNodeData {
  id: string;
  label: string;
  type: 'stage' | 'task';
  stageId?: string;
  taskType?: TaskType | string;
  description?: string;
  isSelected?: boolean;
}

// Use the Node type directly from reactflow
export type GraphNode = Node<GraphNodeData>;

// Use the Edge type directly from reactflow
export type GraphEdge = Edge;

export interface GraphViewState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  zoomLevel: number;
  viewportCenter: { x: number; y: number };
  showMinimap: boolean;
  showControls: boolean;
}

export interface GraphNodeProps {
  data: GraphNodeData;
  isConnectable: boolean;
  selected: boolean;
}

export interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleMinimap: () => void;
  showMinimap: boolean;
}

export interface BirdEyeViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewportCenter: { x: number; y: number };
  zoomLevel: number;
  onViewportChange: (center: { x: number; y: number }, zoom: number) => void;
}

// Constants
export const NODE_WIDTH = 180;
export const STAGE_NODE_HEIGHT = 60;
export const TASK_NODE_HEIGHT = 40;
export const GRID_SIZE = 20;
export const STAGE_NODE_TYPE = 'stageNode';
export const TASK_NODE_TYPE = 'taskNode';

// Node position helpers
export const getNodePosition = (
  index: number, 
  type: 'stage' | 'task', 
  parentPosition?: { x: number; y: number }
): { x: number; y: number } => {
  if (type === 'stage') {
    // Position stages in a horizontal line with more spacing
    return {
      x: index * (NODE_WIDTH + 200),
      y: 100
    };
  } else {
    // Position tasks below their parent stage with better spacing
    if (!parentPosition) {
      return { x: 0, y: 0 };
    }
    
    // Arrange tasks in a grid with 2 tasks per row
    const row = Math.floor(index / 2);
    const col = index % 2;
    
    return {
      x: parentPosition.x + col * (NODE_WIDTH + 40) - NODE_WIDTH / 2,
      y: parentPosition.y + 150 + row * (TASK_NODE_HEIGHT + 80)
    };
  }
};

// Convert template to graph nodes and edges
export const convertTemplateToGraph = (template: Template): { nodes: GraphNode[], edges: GraphEdge[] } => {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  
  // Create stage nodes
  template.stages.forEach((stage, stageIndex) => {
    const stagePosition = getNodePosition(stageIndex, 'stage');
    
    // Add stage node
    nodes.push({
      id: `stage-${stage.id}`,
      type: STAGE_NODE_TYPE,
      position: stagePosition,
      data: {
        id: stage.id,
        label: stage.name,
        type: 'stage',
        description: stage.description
      }
    });
    
    // Create task nodes for this stage
    stage.tasks.forEach((task, taskIndex) => {
      const taskPosition = getNodePosition(taskIndex, 'task', stagePosition);
      
      // Add task node
      nodes.push({
        id: `task-${task.id}`,
        type: TASK_NODE_TYPE,
        position: taskPosition,
        data: {
          id: task.id,
          label: task.title || task.name || '', // Use title with fallback to name
          type: 'task',
          stageId: stage.id,
          taskType: task.type,
          description: task.description
        }
      });
      
      // Add edge from stage to task
      edges.push({
        id: `edge-stage-${stage.id}-task-${task.id}`,
        source: `stage-${stage.id}`,
        target: `task-${task.id}`,
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'smoothstep'
      });
      
      // Add edges for task dependencies
      task.dependencies?.forEach(dep => {
        edges.push({
          id: `edge-task-${dep.taskId}-task-${task.id}`,
          source: `task-${dep.taskId}`,
          target: `task-${task.id}`,
          sourceHandle: 'bottom',
          targetHandle: 'top',
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#ff0072' }
        });
      });
    });
  });
  
  return { nodes, edges };
};

// Convert graph back to template
export const convertGraphToTemplate = (
  nodes: GraphNode[], 
  edges: GraphEdge[],
  template: Template
): Template => {
  const stageNodes = nodes.filter(node => node.data.type === 'stage');
  const taskNodes = nodes.filter(node => node.data.type === 'task');
  
  // Create stages
  const stages: Stage[] = stageNodes.map(stageNode => {
    const stageId = stageNode.data.id;
    
    // Find tasks for this stage
    const stageTasks = taskNodes.filter(taskNode => taskNode.data.stageId === stageId);
    
    // Create tasks
    const tasks: Task[] = stageTasks.map(taskNode => {
      const taskId = taskNode.data.id;
      
      // Find dependencies for this task
      const dependencies = edges
        .filter(edge => 
          edge.target === `task-${taskId}` && 
          edge.source.startsWith('task-')
        )
        .map(edge => {
          const sourceTaskId = edge.source.replace('task-', '');
          const sourceTask = taskNodes.find(n => n.data.id === sourceTaskId);
          return { 
            taskId: sourceTaskId, 
            stageId: sourceTask?.data.stageId || '' 
          };
        });
      
      // Convert string task type to TaskType enum if needed
      let taskType: TaskType = TaskType.ACTION; // Default to ACTION
      
      if (taskNode.data.taskType) {
        if (typeof taskNode.data.taskType === 'string') {
          // Map string task types to TaskType enum
          switch (taskNode.data.taskType.toLowerCase()) {
            case 'milestone':
              taskType = TaskType.MILESTONE;
              break;
            case 'approval':
              taskType = TaskType.APPROVAL;
              break;
            case 'decision':
              taskType = TaskType.DECISION;
              break;
            case 'document':
              taskType = TaskType.DOCUMENT;
              break;
            case 'task':
            case 'action':
            default:
              taskType = TaskType.ACTION;
              break;
          }
        } else {
          // It's already a TaskType enum
          taskType = taskNode.data.taskType as TaskType;
        }
      }
      
      return {
        id: taskId,
        title: taskNode.data.label, // Use title instead of name
        type: taskType,
        description: taskNode.data.description || '',
        dependencies
      };
    });
    
    return {
      id: stageId,
      name: stageNode.data.label,
      description: stageNode.data.description || '',
      tasks
    };
  });
  
  return {
    ...template,
    stages
  };
};
