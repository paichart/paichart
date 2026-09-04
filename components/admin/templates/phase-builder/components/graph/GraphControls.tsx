import React from 'react';
import { ZoomIn, ZoomOut, Move, Info, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onExport: () => void;
  onToggleHelp: () => void;
  showKeyboardHelp: boolean;
}

export const GraphControls = React.memo(function GraphControls({
  onZoomIn,
  onZoomOut,
  onResetView,
  onExport,
  onToggleHelp,
  showKeyboardHelp
}: GraphControlsProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-medium">Task Dependency Graph</h3>
      <div className="flex space-x-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onZoomIn}
          title="Zoom In (+)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onZoomOut}
          title="Zoom Out (-)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onResetView}
          title="Reset View (0)"
        >
          <Move className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          title="Export as SVG"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleHelp}
          title="Keyboard Shortcuts (?)"
        >
          <Info className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
