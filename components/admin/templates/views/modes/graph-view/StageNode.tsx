import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GraphNodeData } from './types';

/**
 * Custom node component for stage nodes in the graph view
 */
const StageNode: React.FC<NodeProps<GraphNodeData>> = ({ data, isConnectable }) => {
  return (
    <div className="px-4 py-3 shadow-lg rounded-md bg-blue-50 border-2 border-blue-500 min-w-[180px]">
      <div className="flex items-center">
        <div className="ml-2">
          <div className="text-lg font-bold text-blue-700">{data.label}</div>
          {data.description && (
            <div className="text-xs text-gray-600 mt-1 max-w-[160px]">
              {data.description}
            </div>
          )}
        </div>
      </div>

      {/* Bottom handle for connecting to tasks */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
    </div>
  );
};

export default memo(StageNode);
