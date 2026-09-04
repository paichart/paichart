import React, { useRef, useEffect, useCallback } from 'react';
import { BirdEyeViewProps } from './types';

/**
 * Bird&apos;s eye view component for the graph view
 * Provides a high-level overview of the entire graph with a viewport indicator
 */
const BirdEyeView: React.FC<BirdEyeViewProps> = ({
  nodes,
  edges,
  viewportCenter,
  zoomLevel,
  onViewportChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  
  // Constants
  const width = 200;
  const height = 150;
  const padding = 20;
  
  // Calculate the bounds of all nodes
  const getBounds = useCallback(() => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    nodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + 180); // Assuming node width
      maxY = Math.max(maxY, node.position.y + 60);  // Assuming node height
    });
    
    // Add padding
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    return { minX, minY, maxX, maxY };
  }, [nodes, padding]);
  
  // Draw the bird&apos;s eye view
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get bounds
    const bounds = getBounds();
    const graphWidth = bounds.maxX - bounds.minX;
    const graphHeight = bounds.maxY - bounds.minY;
    
    // Calculate scale
    const scaleX = width / graphWidth;
    const scaleY = height / graphHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Draw edges
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode) {
        const sourceX = (sourceNode.position.x - bounds.minX) * scale;
        const sourceY = (sourceNode.position.y - bounds.minY) * scale;
        const targetX = (targetNode.position.x - bounds.minX) * scale;
        const targetY = (targetNode.position.y - bounds.minY) * scale;
        
        ctx.moveTo(sourceX, sourceY);
        ctx.lineTo(targetX, targetY);
      }
    });
    
    ctx.stroke();
    
    // Draw nodes
    nodes.forEach(node => {
      const x = (node.position.x - bounds.minX) * scale;
      const y = (node.position.y - bounds.minY) * scale;
      const nodeWidth = 10;
      const nodeHeight = node.type === 'stageNode' ? 6 : 4;
      
      ctx.fillStyle = node.type === 'stageNode' ? '#3b82f6' : '#f3f4f6';
      ctx.strokeStyle = node.type === 'stageNode' ? '#2563eb' : '#d1d5db';
      ctx.lineWidth = 0.5;
      
      ctx.fillRect(x, y, nodeWidth, nodeHeight);
      ctx.strokeRect(x, y, nodeWidth, nodeHeight);
    });
    
    // Draw viewport
    const viewportWidth = width / zoomLevel;
    const viewportHeight = height / zoomLevel;
    const viewportX = ((viewportCenter.x - bounds.minX) * scale) - (viewportWidth / 2);
    const viewportY = ((viewportCenter.y - bounds.minY) * scale) - (viewportHeight / 2);
    
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    
  }, [nodes, edges, viewportCenter, zoomLevel, getBounds]);
  
  // Handle mouse events for viewport navigation
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    handleMouseMove(e);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Get bounds
    const bounds = getBounds();
    const graphWidth = bounds.maxX - bounds.minX;
    const graphHeight = bounds.maxY - bounds.minY;
    
    // Calculate scale
    const scaleX = width / graphWidth;
    const scaleY = height / graphHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Convert to graph coordinates
    const graphX = (x / scale) + bounds.minX;
    const graphY = (y / scale) + bounds.minY;
    
    // Update viewport
    onViewportChange({ x: graphX, y: graphY }, zoomLevel);
  };
  
  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };
  
  const handleMouseLeave = () => {
    isDraggingRef.current = false;
  };
  
  return (
    <div 
      ref={containerRef}
      className="absolute top-4 right-4 border border-gray-300 bg-white rounded shadow-md"
    >
      <div className="p-1 bg-gray-100 border-b flex justify-between items-center">
        <span className="text-xs font-medium">Bird&apos;s Eye View</span>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
};

export default BirdEyeView;
