import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GraphNodeData } from './types';
import { useTaskTypeIcons } from '../../../phase-builder/hooks/useTaskTypeIcons';

/**
 * Custom node component for task nodes in the graph view
 */
const TaskNode: React.FC<NodeProps<GraphNodeData>> = ({ data, isConnectable }) => {
  const { getTaskTypeIcon } = useTaskTypeIcons();
  
  // Get the icon for the task type
  const getIcon = () => {
    if (!data.taskType) return null;
    
    try {
      const iconName = getTaskTypeIcon(data.taskType);
      
      // Make sure iconName is a string
      if (typeof iconName !== 'string') {
        return null;
      }
      
      // Convert kebab-case to PascalCase for Lucide icons
      const iconKey = iconName
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      
      // Get the icon component from Lucide
      const LucideIcon = require('lucide-react')[iconKey] || require('lucide-react').FileText;
      return <LucideIcon size={16} className="text-gray-600" />;
    } catch {
      return null;
    }
  };
  
  return (
    <div className="px-3 py-2 shadow-md rounded-md bg-gray-50 border-2 border-gray-300 min-w-[180px] hover:bg-white hover:border-gray-400 transition-colors">
      {/* Top handle for connecting from stages or other tasks */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        isConnectable={isConnectable}
        className="w-3 h-3 bg-gray-400"
      />
      
      <div className="flex items-center">
        <div className="mr-2">
          {getIcon()}
        </div>
        <div>
          <div className="text-sm font-medium">{data.label}</div>
          {data.description && (
            <div className="text-xs text-gray-500 truncate max-w-[160px]">
              {data.description}
            </div>
          )}
          {data.taskType && (
            <div className="text-xs text-gray-400">
              {data.taskType}
            </div>
          )}
        </div>
      </div>
      
      {/* Bottom handle for connecting to other tasks */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={isConnectable}
        className="w-3 h-3 bg-gray-400"
      />
    </div>
  );
};

export default memo(TaskNode);
