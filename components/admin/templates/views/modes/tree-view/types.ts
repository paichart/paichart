import { Template, Stage, Task } from '../../types';

// Types for tree view
export interface TreeNodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeNodeData {
  id: string;
  name: string;
  type?: string;
  isStage: boolean;
  parentId?: string;
  children?: TreeNodeData[];
  isExpanded?: boolean;
  position?: TreeNodePosition;
}

export interface MinimapProps {
  nodes: TreeNodeData[];
  containerRef: React.RefObject<HTMLDivElement>;
  viewportRef: React.RefObject<HTMLDivElement>;
  focusedStageId: string | null;
  selectedNodeId: string | null;
}

export interface DragItem {
  id: string;
  type: 'TREE_NODE';
  index: number;
  parentId?: string;
}

export interface TreeNodeProps {
  node: TreeNodeData;
  index: number;
  parentId?: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (dragId: string, hoverId: string, position: 'before' | 'after' | 'inside') => void;
  selectedNodeId: string | null;
  focusedStageId: string | null;
  getTaskTypeIcon: (type: string) => string;
  level: number;
}

export interface KeyboardShortcutsHelpProps {
  visible: boolean;
}

export interface TreeViewState {
  treeData: TreeNodeData[];
  selectedNodeId: string | null;
  focusedStageId: string | null;
  showMinimap: boolean;
  showKeyboardHelp: boolean;
}

// Constants
export const NODE_HEIGHT = 36;
export const INDENT_SIZE = 24;
export const STAGE_NODE_HEIGHT = 40;

// Drag and drop types
export const ItemTypes = {
  TREE_NODE: 'tree_node'
};
