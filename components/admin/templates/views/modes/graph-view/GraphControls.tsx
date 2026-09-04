import React from 'react';
import { Button } from '@/components/ui/Button';
import { ZoomIn, ZoomOut, RefreshCw, Map } from 'lucide-react';
import { GraphControlsProps } from './types';

/**
 * Custom controls for the graph view
 */
const GraphControls: React.FC<GraphControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToggleMinimap,
  showMinimap
}) => {
  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-2 bg-white p-2 rounded-md shadow-md border border-gray-200">
      <Button
        variant="outline"
        size="icon"
        onClick={onZoomIn}
        title="Zoom in"
        className="h-8 w-8"
      >
        <ZoomIn size={16} />
      </Button>
      
      <Button
        variant="outline"
        size="icon"
        onClick={onZoomOut}
        title="Zoom out"
        className="h-8 w-8"
      >
        <ZoomOut size={16} />
      </Button>
      
      <Button
        variant="outline"
        size="icon"
        onClick={onZoomReset}
        title="Reset zoom"
        className="h-8 w-8"
      >
        <RefreshCw size={16} />
      </Button>
      
      <div className="w-full h-px bg-gray-200 my-1" />
      
      <Button
        variant={showMinimap ? "default" : "outline"}
        size="icon"
        onClick={onToggleMinimap}
        title={showMinimap ? "Hide minimap" : "Show minimap"}
        className="h-8 w-8"
      >
        <Map size={16} />
      </Button>
    </div>
  );
};

export default GraphControls;
