import React from 'react';

interface GraphContainerProps {
  isPanning: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onWheel: (e: React.WheelEvent) => void;
  children: React.ReactNode;
}

export const GraphContainer = React.memo(function GraphContainer({
  isPanning,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  children
}: GraphContainerProps) {
  return (
    <div 
      className="overflow-hidden border rounded relative"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    >
      {children}
    </div>
  );
});
