import { NodeTypes, EdgeTypes } from 'reactflow';
import { StageNode, TaskNode, STAGE_NODE_TYPE, TASK_NODE_TYPE } from '../graph-view';

// Define nodeTypes and edgeTypes outside of any component to prevent recreation on each render
export const nodeTypes: NodeTypes = {
  [STAGE_NODE_TYPE]: StageNode,
  [TASK_NODE_TYPE]: TaskNode
};

// Empty edgeTypes object
export const edgeTypes: EdgeTypes = {};
