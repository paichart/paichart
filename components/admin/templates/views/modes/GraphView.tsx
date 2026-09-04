import React, { useCallback, useRef, useEffect, useState } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  MiniMap,
  useOnViewportChange
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ViewModeProps } from '../types';
import { 
  GraphControls, 
  BirdEyeView,
  useGraphState,
  STAGE_NODE_TYPE
} from './graph-view';

// Import nodeTypes and edgeTypes from separate file
import { nodeTypes, edgeTypes } from './graph-view/node-types';

/**
 * Graph-based view mode component
 */
export const GraphView: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly
}) => {
  return (
    <ReactFlowProvider>
      <GraphViewContent
        template={template}
        onTemplateChange={onTemplateChange}
        onSave={onSave}
        isReadOnly={isReadOnly}
      />
    </ReactFlowProvider>
  );
};

/**
 * Inner content component that uses ReactFlow hooks
 */
const GraphViewContent: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: '100%', height: '600px' });
  
  // Use the graph state hook
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    zoomLevel,
    viewportCenter,
    showMinimap,
    showControls,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleViewportChange,
    handleToggleMinimap,
    handleSave,
    updateViewportCenter
  } = useGraphState(template, onSave);
  
  // Update viewport center when viewport changes
  const onViewportChange = useCallback(() => {
    updateViewportCenter();
  }, [updateViewportCenter]);
  
  // Register viewport change handler
  useOnViewportChange({
    onChange: onViewportChange
  });
  
  // Update viewport center on initial render
  useEffect(() => {
    // Wait for ReactFlow to initialize
    const timer = setTimeout(() => {
      updateViewportCenter();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [updateViewportCenter]);
  
  // Set dimensions on mount and window resize
  useEffect(() => {
    const updateDimensions = () => {
      if (reactFlowWrapper.current) {
        setDimensions({
          width: '100%',
          height: '600px'
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  
  // Render the graph view
  return (
    <div className="h-full flex flex-col" ref={reactFlowWrapper}>
      <div className="mb-4">
        <h2 className="text-xl font-bold">{template.name}</h2>
        <p className="text-muted-foreground text-sm">{template.description}</p>
      </div>
      
      <div className="bg-primary/10 border border-primary/20 rounded-md p-3 mb-4 text-sm text-primary">
        <p className="font-medium mb-1">Graph View</p>
        <p>This view shows the template as a graph with stages and tasks as nodes. You can:</p>
        <ul className="list-disc list-inside ml-2 mt-1">
          <li>Drag nodes to reposition them</li>
          <li>Click on nodes to select them</li>
          <li>Use the controls in the bottom-left to zoom in/out</li>
          <li>Use the bird&apos;s eye view in the top-right for navigation</li>
        </ul>
        <p className="mt-2 text-xs">Debug: {nodes.length} nodes and {edges.length} edges loaded.</p>
      </div>
      
      {nodes.length === 0 ? (
        <div className="flex-1 border rounded-lg overflow-hidden relative bg-muted flex items-center justify-center" style={{ height: '600px', width: '100%' }}>
          <div className="text-center p-8">
            <h3 className="text-lg font-medium mb-2">No nodes to display</h3>
            <p className="text-muted-foreground max-w-md">
              This template doesn&apos;t have any stages or tasks, or there was an error loading the graph data.
              Try switching to another view mode or refreshing the page.
            </p>
          </div>
        </div>
      ) : (
        <div 
          className="flex-1 border rounded-lg overflow-hidden relative" 
          style={{ height: dimensions.height, width: dimensions.width }}
        >
          <div style={{ width: '100%', height: '100%', position: 'absolute' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              attributionPosition="bottom-left"
              minZoom={0.2}
              maxZoom={2}
              defaultEdgeOptions={{
                type: 'smoothstep',
                animated: false
              }}
              proOptions={{ hideAttribution: true }}
              className="bg-muted"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Background pattern */}
              <Background color="var(--muted-foreground)" gap={16} size={1} />
              
              {/* Custom controls */}
              <GraphControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onZoomReset={handleZoomReset}
                onToggleMinimap={handleToggleMinimap}
                showMinimap={showMinimap}
              />
              
              {/* Bird's eye view */}
              <BirdEyeView
                nodes={nodes}
                edges={edges}
                viewportCenter={viewportCenter}
                zoomLevel={zoomLevel}
                onViewportChange={handleViewportChange}
              />
              
              {/* ReactFlow minimap */}
              {showMinimap && (
                <MiniMap
                  nodeStrokeWidth={3}
                  zoomable
                  pannable
                  position="bottom-right"
                  nodeColor={(node) => {
                    return node.type === STAGE_NODE_TYPE ? 'var(--primary)' : 'var(--muted)';
                  }}
                />
              )}
            </ReactFlow>
          </div>
        </div>
      )}
    </div>
  );
};
