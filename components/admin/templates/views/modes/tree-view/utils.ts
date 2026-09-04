import { TreeNodeData, INDENT_SIZE, NODE_HEIGHT, STAGE_NODE_HEIGHT } from './types';
import { Template } from '../../types';
import { TaskType } from '@prisma/client';

/**
 * Flattens a tree structure into a list of nodes with position information
 */
export const flattenNodes = (
  nodes: TreeNodeData[], 
  result: TreeNodeData[] = [], 
  level = 0, 
  parentExpanded = true
): TreeNodeData[] => {
  nodes.forEach(node => {
    const isVisible = parentExpanded;
    if (isVisible) {
      const nodeWithLevel = {
        ...node,
        position: {
          x: level * INDENT_SIZE,
          y: result.length * (node.isStage ? STAGE_NODE_HEIGHT : NODE_HEIGHT),
          width: 200 - level * INDENT_SIZE,
          height: node.isStage ? STAGE_NODE_HEIGHT : NODE_HEIGHT
        }
      };
      result.push(nodeWithLevel);
      
      if (node.children && node.isExpanded) {
        flattenNodes(node.children, result, level + 1, isVisible);
      }
    }
  });
  
  return result;
};

/**
 * Converts a template to tree data structure
 */
export const convertTemplateToTreeData = (template: Template): TreeNodeData[] => {
  return template.stages.map(stage => ({
    id: stage.id,
    name: stage.name,
    isStage: true,
    isExpanded: true,
    children: stage.tasks.map(task => ({
      id: task.id,
      name: task.title || task.name || '', // Use title with fallback to name
      type: task.type,
      isStage: false,
      parentId: stage.id
    }))
  }));
};

/**
 * Finds a node in the tree by ID
 */
export const findNodeById = (nodes: TreeNodeData[], id: string): TreeNodeData | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Removes a node from the tree and returns the new tree and the removed node
 */
export const removeNode = (
  nodes: TreeNodeData[], 
  id: string
): [TreeNodeData[], TreeNodeData | null] => {
  let removedNode: TreeNodeData | null = null;
  
  const newNodes = nodes.filter(node => {
    if (node.id === id) {
      removedNode = node;
      return false;
    }
    return true;
  });
  
  if (removedNode) return [newNodes, removedNode];
  
  return nodes.map(node => {
    if (node.children) {
      const [newChildren, removed] = removeNode(node.children, id);
      if (removed) {
        removedNode = removed;
        return { ...node, children: newChildren };
      }
    }
    return node;
  }) as [TreeNodeData[], TreeNodeData | null];
};

/**
 * Inserts a node into the tree at the specified position
 */
export const insertNode = (
  nodes: TreeNodeData[], 
  targetId: string, 
  nodeToInsert: TreeNodeData, 
  position: 'before' | 'after' | 'inside'
): TreeNodeData[] => {
  return nodes.map(node => {
    if (node.id === targetId) {
      if (position === 'before') {
        return [nodeToInsert, node];
      } else if (position === 'after') {
        return [node, nodeToInsert];
      } else if (position === 'inside' && node.isStage) {
        return {
          ...node,
          children: [...(node.children || []), { ...nodeToInsert, parentId: node.id }]
        };
      }
    }
    
    if (node.children) {
      return {
        ...node,
        children: insertNode(node.children, targetId, nodeToInsert, position)
      };
    }
    
    return node;
  }).flat();
};

/**
 * Expands all nodes in the tree
 */
export const expandAllNodes = (nodes: TreeNodeData[]): TreeNodeData[] => {
  return nodes.map(node => ({
    ...node,
    isExpanded: true,
    children: node.children ? expandAllNodes(node.children) : undefined
  }));
};

/**
 * Collapses all nodes in the tree
 */
export const collapseAllNodes = (nodes: TreeNodeData[]): TreeNodeData[] => {
  return nodes.map(node => ({
    ...node,
    isExpanded: false,
    children: node.children ? collapseAllNodes(node.children) : undefined
  }));
};

/**
 * Toggles the expansion state of a node
 */
export const toggleNodeExpansion = (nodes: TreeNodeData[], id: string): TreeNodeData[] => {
  return nodes.map(node => {
    if (node.id === id) {
      return { ...node, isExpanded: !node.isExpanded };
    } else if (node.children) {
      return {
        ...node,
        children: toggleNodeExpansion(node.children, id)
      };
    }
    return node;
  });
};

/**
 * Converts tree data back to template format
 */
export const convertTreeDataToTemplate = (
  treeData: TreeNodeData[], 
  template: Template
): Template => {
  const stages = treeData
    .filter(node => node.isStage)
    .map(stageNode => {
      const tasks = (stageNode.children || [])
        .filter(node => !node.isStage)
        .map(taskNode => {
          // Default to ACTION type
          let taskType: TaskType = TaskType.ACTION;
          
          // If taskNode.type exists, try to convert it
          if (taskNode.type !== undefined) {
            if (typeof taskNode.type === 'string') {
              // Map string task types to TaskType enum
              switch (taskNode.type.toLowerCase()) {
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
              taskType = taskNode.type as TaskType;
            }
          }
          
          return {
            id: taskNode.id,
            title: taskNode.name, // Use title instead of name
            type: taskType,
            description: '',
            dependencies: []
          };
        });
      
      return {
        id: stageNode.id,
        name: stageNode.name,
        description: '',
        tasks
      };
    });
  
  return {
    ...template,
    stages
  };
};
