import React from 'react';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';

interface GraphOptionsProps {
  showMinimap: boolean;
  setShowMinimap: (show: boolean) => void;
  showTaskDetails: boolean;
  setShowTaskDetails: (show: boolean) => void;
}

export const GraphOptions = React.memo(function GraphOptions({
  showMinimap,
  setShowMinimap,
  showTaskDetails,
  setShowTaskDetails
}: GraphOptionsProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-minimap" 
            checked={showMinimap} 
            onCheckedChange={setShowMinimap}
          />
          <Label htmlFor="show-minimap">Show Minimap</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch 
            id="show-task-details" 
            checked={showTaskDetails} 
            onCheckedChange={setShowTaskDetails}
          />
          <Label htmlFor="show-task-details">Show Task Details</Label>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center space-x-4 text-xs text-gray-600">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-white border border-gray-300 mr-1"></div>
          <span>Task</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-blue-50 border-2 border-blue-500 mr-1"></div>
          <span>Selected</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-blue-50/50 border border-blue-300 mr-1"></div>
          <span>Related</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 flex items-center justify-center mr-1">
            <svg width="12" height="6" viewBox="0 0 12 6">
              <path d="M0,3 L10,3" stroke="#3b82f6" strokeWidth="2" />
              <polygon points="8,1 12,3 8,5" fill="#3b82f6" />
            </svg>
          </div>
          <span>Dependency</span>
        </div>
      </div>
    </div>
  );
});
