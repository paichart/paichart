"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTemplateContext } from '../context/TemplateContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Search, Filter, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

// Define the relationship node interface
interface RelationshipNode {
  id: string;
  type: 'pov' | 'phase';
  name: string;
  description?: string;
  status?: string;
  usageCount?: number;
}

// Define the relationship edge interface
interface RelationshipEdge {
  source: string;
  target: string;
  type: 'uses' | 'references';
}

// Define the relationship graph interface
interface RelationshipGraph {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
}

interface TemplateRelationshipGraphProps {
  initialFilter?: {
    templateId?: string;
    templateType?: 'pov' | 'phase';
  };
}

/**
 * TemplateRelationshipGraph - Visualizes relationships between templates
 * 
 * This component displays a graph of relationships between POV templates and Phase templates.
 */
export function TemplateRelationshipGraph({ initialFilter }: TemplateRelationshipGraphProps) {
  const { phaseTemplates, povTemplates, loadingPhaseTemplates, loadingPOVTemplates } = useTemplateContext();
  
  const [graph, setGraph] = useState<RelationshipGraph>({ nodes: [], edges: [] });
  const [filteredGraph, setFilteredGraph] = useState<RelationshipGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [templateTypeFilter, setTemplateTypeFilter] = useState<'all' | 'pov' | 'phase'>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialFilter?.templateId || null);
  
  // Visualization state
  const [zoomLevel, setZoomLevel] = useState(1);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  
  // Apply filters to the graph
  const applyFilters = useCallback((
    sourceGraph: RelationshipGraph,
    query: string,
    typeFilter: 'all' | 'pov' | 'phase',
    templateId: string | null
  ) => {
    let filteredNodes = [...sourceGraph.nodes];
    
    // Apply search filter
    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredNodes = filteredNodes.filter(node => 
        node.name.toLowerCase().includes(lowerQuery) || 
        (node.description && node.description.toLowerCase().includes(lowerQuery))
      );
    }
    
    // Apply type filter
    if (typeFilter !== 'all') {
      filteredNodes = filteredNodes.filter(node => node.type === typeFilter);
    }
    
    // Apply template selection filter
    if (templateId) {
      // Find the selected node
      const selectedNode = sourceGraph.nodes.find(node => node.id === templateId);
      if (selectedNode) {
        // Find all connected nodes
        const connectedNodeIds = new Set<string>([templateId]);
        
        sourceGraph.edges.forEach(edge => {
          if (edge.source === templateId) {
            connectedNodeIds.add(edge.target);
          } else if (edge.target === templateId) {
            connectedNodeIds.add(edge.source);
          }
        });
        
        // Filter nodes to only include the selected node and its connections
        filteredNodes = filteredNodes.filter(node => connectedNodeIds.has(node.id));
      }
    }
    
    // Filter edges to only include those between filtered nodes
    const nodeIds = new Set(filteredNodes.map(node => node.id));
    const filteredEdges = sourceGraph.edges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
    
    setFilteredGraph({ nodes: filteredNodes, edges: filteredEdges });
  }, []);
  
  // Fetch relationship data
  const fetchRelationships = useCallback(async () => {
    try {
      setLoading(true);
      
      // In a real implementation, we would fetch this data from an API
      // For now, we'll simulate it based on the templates we have
      
      // Create nodes for all templates
      const nodes: RelationshipNode[] = [
        ...povTemplates.map(template => ({
          id: template.id,
          type: 'pov' as const,
          name: template.name,
          description: template.description,
          status: template.status,
          usageCount: 0
        })),
        ...phaseTemplates.map(template => ({
          id: template.id,
          type: 'phase' as const,
          name: template.name,
          description: template.description,
          status: undefined,
        }))
      ];
      
      // Create edges between templates
      // In a real implementation, this would come from the API
      // For now, we'll create some sample relationships
      const edges: RelationshipEdge[] = [];
      
      // Simulate POV templates using Phase templates
      if (povTemplates.length > 0 && phaseTemplates.length > 0) {
        // Each POV template uses 1-3 Phase templates
        povTemplates.forEach(povTemplate => {
          const numPhases = Math.floor(Math.random() * 3) + 1;
          const usedPhases = new Set<string>();
          
          for (let i = 0; i < numPhases && i < phaseTemplates.length; i++) {
            const randomIndex = Math.floor(Math.random() * phaseTemplates.length);
            const phaseTemplate = phaseTemplates[randomIndex];
            
            if (!usedPhases.has(phaseTemplate.id)) {
              edges.push({
                source: povTemplate.id,
                target: phaseTemplate.id,
                type: 'uses'
              });
              
              usedPhases.add(phaseTemplate.id);
            }
          }
        });
      }
      
      const newGraph = { nodes, edges };
      setGraph(newGraph);
      applyFilters(newGraph, searchQuery, templateTypeFilter, selectedTemplateId);
    } catch {
      setError('Failed to load template relationships');
    } finally {
      setLoading(false);
    }
  }, [phaseTemplates, povTemplates, searchQuery, templateTypeFilter, selectedTemplateId, applyFilters]);
  
  // Handle filter changes
  const handleFilterChange = useCallback(() => {
    applyFilters(graph, searchQuery, templateTypeFilter, selectedTemplateId);
  }, [graph, searchQuery, templateTypeFilter, selectedTemplateId, applyFilters]);
  
  // Handle zoom in
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.1, 2));
  };
  
  // Handle zoom out
  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
  };
  
  // Handle reset zoom
  const handleResetZoom = () => {
    setZoomLevel(1);
  };
  
  // Handle refresh
  const handleRefresh = () => {
    fetchRelationships();
  };
  
  // Initialize with data from context
  useEffect(() => {
    if (!loadingPhaseTemplates && !loadingPOVTemplates) {
      fetchRelationships();
    }
  }, [phaseTemplates, povTemplates, loadingPhaseTemplates, loadingPOVTemplates, fetchRelationships]);
  
  // Update filters when initialFilter changes
  useEffect(() => {
    if (initialFilter?.templateId) {
      setSelectedTemplateId(initialFilter.templateId);
      setTemplateTypeFilter(initialFilter.templateType || 'all');
    }
  }, [initialFilter]);
  
  // Apply filters when filter state changes
  useEffect(() => {
    handleFilterChange();
  }, [searchQuery, templateTypeFilter, selectedTemplateId, handleFilterChange]);
  
  if (loading && (!filteredGraph.nodes.length || !filteredGraph.edges.length)) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Template Relationships</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <Input
              placeholder="Search templates..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2">
            <Select
              value={templateTypeFilter}
              onValueChange={(value: 'all' | 'pov' | 'phase') => setTemplateTypeFilter(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Templates</SelectItem>
                <SelectItem value="pov">POV Templates</SelectItem>
                <SelectItem value="phase">Phase Templates</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="icon" onClick={handleRefresh} title="Refresh">
              <RefreshCw size={16} />
            </Button>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        
        {/* Graph visualization */}
        <div className="relative border rounded-md p-4 min-h-[500px] overflow-hidden">
          {/* Zoom controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <Button variant="outline" size="icon" onClick={handleZoomIn} title="Zoom In">
              <ZoomIn size={16} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut size={16} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleResetZoom} title="Reset Zoom">
              <span className="text-xs font-bold">1:1</span>
            </Button>
          </div>
          
          {/* Graph container */}
          <div 
            ref={graphContainerRef}
            className="w-full h-full"
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
          >
            {filteredGraph.nodes.length === 0 ? (
              <div className="flex justify-center items-center h-[500px]">
                <p className="text-gray-500">No templates match your filters</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                {/* Simple visualization for now */}
                <div className="mb-8">
                  <h3 className="text-lg font-medium mb-2">POV Templates</h3>
                  <div className="flex flex-wrap gap-4">
                    {filteredGraph.nodes
                      .filter(node => node.type === 'pov')
                      .map(node => (
                        <div 
                          key={node.id}
                          className="border rounded-md p-3 bg-blue-50 w-64"
                          onClick={() => setSelectedTemplateId(selectedTemplateId === node.id ? null : node.id)}
                        >
                          <h4 className="font-medium">{node.name}</h4>
                          <p className="text-sm text-gray-500 truncate">{node.description}</p>
                          {node.status && (
                            <Badge variant="outline" className="mt-2">
                              {node.status}
                            </Badge>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
                
                {/* Connections */}
                <div className="border-l-2 border-dashed h-16 border-gray-300"></div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Phase Templates</h3>
                  <div className="flex flex-wrap gap-4">
                    {filteredGraph.nodes
                      .filter(node => node.type === 'phase')
                      .map(node => (
                        <div 
                          key={node.id}
                          className="border rounded-md p-3 bg-green-50 w-64"
                          onClick={() => setSelectedTemplateId(selectedTemplateId === node.id ? null : node.id)}
                        >
                          <h4 className="font-medium">{node.name}</h4>
                          <p className="text-sm text-gray-500 truncate">{node.description}</p>
                          <div className="mt-2">
                            <Badge variant="outline">
                              {node.usageCount || 0} POVs
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Relationship details */}
        {selectedTemplateId && (
          <div className="mt-4 border rounded-md p-4">
            <h3 className="text-lg font-medium mb-2">Relationship Details</h3>
            
            {/* Selected template */}
            {(() => {
              const selectedNode = filteredGraph.nodes.find(node => node.id === selectedTemplateId);
              if (!selectedNode) return null;
              
              return (
                <div className="mb-4">
                  <h4 className="font-medium">Selected Template</h4>
                  <p className="text-sm">{selectedNode.name}</p>
                  <p className="text-xs text-gray-500">{selectedNode.type === 'pov' ? 'POV Template' : 'Phase Template'}</p>
                </div>
              );
            })()}
            
            {/* Related templates */}
            <div>
              <h4 className="font-medium">Related Templates</h4>
              <div className="mt-2 space-y-2">
                {(() => {
                  const relatedEdges = filteredGraph.edges.filter(
                    edge => edge.source === selectedTemplateId || edge.target === selectedTemplateId
                  );
                  
                  if (relatedEdges.length === 0) {
                    return <p className="text-sm text-gray-500">No related templates</p>;
                  }
                  
                  return relatedEdges.map(edge => {
                    const relatedNodeId = edge.source === selectedTemplateId ? edge.target : edge.source;
                    const relatedNode = filteredGraph.nodes.find(node => node.id === relatedNodeId);
                    const relationship = edge.source === selectedTemplateId ? 'uses' : 'is used by';
                    
                    if (!relatedNode) return null;
                    
                    return (
                      <div key={relatedNodeId} className="flex items-center justify-between border-b pb-2">
                        <div>
                          <p className="text-sm">{relatedNode.name}</p>
                          <p className="text-xs text-gray-500">{relatedNode.type === 'pov' ? 'POV Template' : 'Phase Template'}</p>
                        </div>
                        <Badge variant="outline">{relationship}</Badge>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}