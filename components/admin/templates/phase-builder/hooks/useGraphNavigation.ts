import { useState, useCallback } from 'react';
import { GraphTransform, GraphDimensions } from '../components/graph/types';

export function useGraphNavigation(
  containerRef: React.RefObject<HTMLDivElement>,
  svgDimensions: GraphDimensions
) {
  const [transform, setTransform] = useState<GraphTransform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  
  // Handle zoom in
  const handleZoomIn = useCallback(() => {
    setTransform(prev => ({
      ...prev,
      scale: Math.min(prev.scale + 0.2, 3) // Limit max zoom to 3x
    }));
  }, []);
  
  // Handle zoom out
  const handleZoomOut = useCallback(() => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(prev.scale - 0.2, 0.5) // Limit min zoom to 0.5x
    }));
  }, []);
  
  // Handle reset view
  const handleResetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);
  
  // Handle mouse down for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    setIsPanning(true);
    setStartPan({ x: e.clientX, y: e.clientY });
  }, []);
  
  // Handle mouse move for panning
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    
    const dx = e.clientX - startPan.x;
    const dy = e.clientY - startPan.y;
    
    setTransform(prev => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy
    }));
    
    setStartPan({ x: e.clientX, y: e.clientY });
  }, [isPanning, startPan]);
  
  // Handle mouse up to end panning
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);
  
  // Handle mouse leave to end panning
  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
  }, []);
  
  // Handle wheel for zooming
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    // Get mouse position relative to SVG
    const svgRect = containerRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;
    
    // Calculate new scale
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.5, Math.min(3, transform.scale + delta));
    
    // Calculate new transform to zoom toward mouse position
    const scaleRatio = newScale / transform.scale;
    const newX = transform.x - (mouseX - transform.x) * (scaleRatio - 1);
    const newY = transform.y - (mouseY - transform.y) * (scaleRatio - 1);
    
    setTransform({
      x: newX,
      y: newY,
      scale: newScale
    });
  }, [containerRef, transform]);
  
  // Center view on a specific point
  const centerViewOn = useCallback((x: number, y: number, width: number, height: number) => {
    const centerX = -(x * transform.scale + width * transform.scale / 2 - svgDimensions.width / 2);
    const centerY = -(y * transform.scale + height * transform.scale / 2 - svgDimensions.height / 2);
    
    setTransform(prev => ({
      ...prev,
      x: centerX,
      y: centerY
    }));
  }, [transform.scale, svgDimensions]);
  
  return {
    transform,
    setTransform,
    isPanning,
    startPan,
    handleZoomIn,
    handleZoomOut,
    handleResetView,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleWheel,
    centerViewOn
  };
}
