import { useState, useCallback, useMemo } from 'react';
import { useReactFlow, Node, Edge, useNodesState, useEdgesState, Connection, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import { Template } from '../../../types';
import { GraphNode, GraphEdge, convertTemplateToGraph, convertGraphToTemplate } from '../types';

/**
 * Hook for managing the graph state
 */
export function useGraphState(template: Template, onSave: (template: Template) => void) {
  // Convert template to graph nodes and edges
  const initialGraph = useMemo(() => {
    return convertTemplateToGraph(template);
  }, [template]);
  
  // State for nodes and edges
  const [nodes, setNodes] = useNodesState<GraphNode['data']>(initialGraph.nodes);
  const [edges, setEdges] = useEdgesState(initialGraph.edges);
  
  // State for viewport
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportCenter, setViewportCenter] = useState({ x: 0, y: 0 });
  
  // State for UI controls
  const [showMinimap, setShowMinimap] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Get the ReactFlow instance
  const reactFlowInstance = useReactFlow();
  
  // Handle node changes
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nodes => applyNodeChanges(changes, nodes));
    
    // Update selected node
    const selectChange = changes.find(change => change.type === 'select');
    if (selectChange && 'id' in selectChange) {
      setSelectedNodeId(selectChange.selected ? selectChange.id : null);
    }
  }, [setNodes]);
  
  // Handle edge changes
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(edges => applyEdgeChanges(changes, edges));
  }, [setEdges]);
  
  // Handle connecting nodes
  const onConnect = useCallback((connection: Connection) => {
    // Create a new edge
    const newEdge: GraphEdge = {
      id: `edge-${connection.source}-${connection.target}`,
      source: connection.source || '',
      target: connection.target || '',
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      type: 'smoothstep'
    };
    
    // Add the new edge
    setEdges(edges => [...edges, newEdge]);
  }, [setEdges]);
  
  // Handle zoom in
  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn();
    setZoomLevel(prev => Math.min(prev * 1.2, 2));
  }, [reactFlowInstance]);
  
  // Handle zoom out
  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut();
    setZoomLevel(prev => Math.max(prev / 1.2, 0.5));
  }, [reactFlowInstance]);
  
  // Handle zoom reset
  const handleZoomReset = useCallback(() => {
    reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
    setZoomLevel(1);
  }, [reactFlowInstance]);
  
  // Handle viewport change from bird's eye view
  const handleViewportChange = useCallback((center: { x: number; y: number }, zoom: number) => {
    reactFlowInstance.setViewport({ x: -center.x + window.innerWidth / 2, y: -center.y + window.innerHeight / 2, zoom });
    setViewportCenter(center);
    setZoomLevel(zoom);
  }, [reactFlowInstance]);
  
  // Handle toggle minimap
  const handleToggleMinimap = useCallback(() => {
    setShowMinimap(prev => !prev);
  }, []);
  
  // Handle save
  const handleSave = useCallback(() => {
    const updatedTemplate = convertGraphToTemplate(nodes, edges, template);
    onSave(updatedTemplate);
  }, [nodes, edges, template, onSave]);
  
  // Update viewport center when nodes change
  const updateViewportCenter = useCallback(() => {
    const { x, y, zoom } = reactFlowInstance.getViewport();
    setViewportCenter({ 
      x: -x / zoom + window.innerWidth / (2 * zoom),
      y: -y / zoom + window.innerHeight / (2 * zoom)
    });
    setZoomLevel(zoom);
  }, [reactFlowInstance]);
  
  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    zoomLevel,
    viewportCenter,
    showMinimap,
    showControls,
    selectedNodeId,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleViewportChange,
    handleToggleMinimap,
    handleSave,
    updateViewportCenter
  };
}
