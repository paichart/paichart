"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Search, Server, Wrench, Plus, Minus, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { AgentTabProps, MCPToolConfig } from './types';
import { useTemplateEditor } from '../../context/TemplateEditorContext';

interface DiscoveredTool {
  toolId: string;
  serverName: string;
  toolName: string;
  description: string;
  category: string;
  inputSchema?: any;
}

interface MCPServer {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  toolCount: number;
}

/**
 * MCP Tools Tab Component
 * 
 * Provides MCP tool discovery, selection, and configuration interface.
 * Allows users to discover available tools, select them for the agent, and configure their usage.
 */
export function MCPToolsTab({ templateId, isReadOnly = false }: AgentTabProps) {
  // Get template context
  const { getFieldValue, setFieldValue } = useTemplateEditor();
  
  // REFACTOR: Initialize MCP tool configuration from metadata instead of agentConfig
  const mcpToolConfiguration = useMemo(() => {
    const config = getFieldValue(['metadata', 'mcpToolConfiguration']);
    return config || {
      selectedTools: [],
      toolUsagePatterns: {
        primary: [],
        secondary: [],
        restricted: []
      },
      toolCoordination: {
        parallelExecution: false,
        toolDependencies: {},
        conflictResolution: 'priority'
      }
    };
  }, [getFieldValue]);
  
  // State management
  const [availableTools, setAvailableTools] = useState<DiscoveredTool[]>([]);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServer, setSelectedServer] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Use context-persisted values
  const selectedTools = mcpToolConfiguration.selectedTools || [];
  const toolUsagePatterns = mcpToolConfiguration.toolUsagePatterns || {
    primary: [],
    secondary: [],
    restricted: []
  };
  const toolCoordination = mcpToolConfiguration.toolCoordination || {
    parallelExecution: false,
    toolDependencies: {},
    conflictResolution: 'priority'
  };
  
  // REFACTOR: Helper function to update MCP configuration in metadata
  const updateMcpConfiguration = useCallback((updates: Partial<typeof mcpToolConfiguration>) => {
    const newConfig = {
      ...mcpToolConfiguration,
      ...updates
    };
    setFieldValue(['metadata', 'mcpToolConfiguration'], newConfig);
  }, [mcpToolConfiguration, setFieldValue]);

  const loadAvailableTools = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        action: 'discover-tools',
        includeDescription: 'true'
      });
      
      if (selectedServer && selectedServer !== 'all') {
        params.set('serverName', selectedServer);
      }
      
      if (selectedCategory && selectedCategory !== 'all') {
        params.set('category', selectedCategory);
      }
      
      const response = await fetch(`/api/agent-templates/builder?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setAvailableTools(result.data.tools || []);
      } else {
        setError(result.error || 'Failed to discover tools');
      }
    } catch {
      setError('Failed to discover tools. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedServer, selectedCategory]);

  // Load data on component mount
  useEffect(() => {
    loadServers();
    loadAvailableTools();
  }, [loadAvailableTools]);

  // Filter tools based on search and filters
  const filteredTools = availableTools.filter(tool => {
    const matchesSearch = !searchQuery || 
      tool.toolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesServer = !selectedServer || selectedServer === 'all' || tool.serverName === selectedServer;
    const matchesCategory = !selectedCategory || selectedCategory === 'all' || tool.category === selectedCategory;
    
    return matchesSearch && matchesServer && matchesCategory;
  });

  const loadServers = async () => {
    try {
      const response = await fetch('/api/agent-templates/builder?action=get-servers');
      const result = await response.json();
      
      if (result.success) {
        setServers(result.data.servers || []);
      }
    } catch {
      // Could not load servers
    }
  };

  const handleToolSelection = (tool: DiscoveredTool, selected: boolean) => {
    if (selected) {
      // Add tool to selected tools
      const newTool = {
        toolId: tool.toolId,
        serverName: tool.serverName,
        toolName: tool.toolName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        configuration: {},
        priority: selectedTools.length + 1
      };
      
      updateMcpConfiguration({
        selectedTools: [...selectedTools, newTool]
      });
    } else {
      // Remove tool from selected tools
      updateMcpConfiguration({
        selectedTools: selectedTools.filter((t: any) => t.toolId !== tool.toolId)
      });
    }
  };

  const handleToolPriorityChange = (toolId: string, newPriority: number) => {
    const updatedTools = selectedTools.map((tool: any) => 
      tool.toolId === toolId 
        ? { ...tool, priority: newPriority }
        : tool
    ).sort((a: any, b: any) => a.priority - b.priority);
    
    updateMcpConfiguration({
      selectedTools: updatedTools
    });
  };

  const handleUsagePatternChange = (toolId: string, pattern: 'primary' | 'secondary' | 'restricted') => {
    const newPatterns = { ...toolUsagePatterns };
    
    // Remove from all patterns first
    Object.keys(newPatterns).forEach(key => {
      newPatterns[key as keyof typeof newPatterns] = newPatterns[key as keyof typeof newPatterns].filter((id: string) => id !== toolId);
    });
    
    // Add to selected pattern
    newPatterns[pattern] = [...newPatterns[pattern], toolId];
    
    updateMcpConfiguration({
      toolUsagePatterns: newPatterns
    });
  };

  const isToolSelected = (toolId: string) => {
    return selectedTools.some((tool: any) => tool.toolId === toolId);
  };

  const getToolUsagePattern = (toolId: string): 'primary' | 'secondary' | 'restricted' | 'none' => {
    if (toolUsagePatterns.primary.includes(toolId)) return 'primary';
    if (toolUsagePatterns.secondary.includes(toolId)) return 'secondary';
    if (toolUsagePatterns.restricted.includes(toolId)) return 'restricted';
    return 'none';
  };

  const categories = [
    { value: 'file', label: 'File Operations' },
    { value: 'web', label: 'Web & HTTP' },
    { value: 'data', label: 'Data Processing' },
    { value: 'communication', label: 'Communication' },
    { value: 'workflow', label: 'Workflow' },
    { value: 'ai', label: 'AI & ML' },
    { value: 'system', label: 'System' },
    { value: 'general', label: 'General' }
  ];

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="bg-primary/10 border border-primary/20 rounded-md p-4">
        <h3 className="font-medium mb-2">MCP Tools Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Select and configure MCP tools that this agent can use during execution. 
          Tools are discovered from connected MCP servers and can be prioritized and configured.
        </p>
      </div>

      <Tabs defaultValue="discovery" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="discovery">Tool Discovery</TabsTrigger>
          <TabsTrigger value="selected">Selected Tools ({selectedTools.length})</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        {/* Tool Discovery Tab */}
        <TabsContent value="discovery" className="space-y-4">
          {/* Server Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Server className="h-5 w-5 mr-2" />
                MCP Servers ({servers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {servers.map((server) => (
                  <div key={server.name} className="flex items-center justify-between p-3 border rounded-md">
                    <div>
                      <div className="font-medium text-sm">{server.name}</div>
                      <div className="text-xs text-muted-foreground">{server.toolCount} tools</div>
                    </div>
                    <Badge variant={server.status === 'connected' ? 'default' : 'destructive'}>
                      {server.status}
                    </Badge>
                  </div>
                ))}
                {servers.length === 0 && (
                  <div className="col-span-full text-center py-4 text-muted-foreground">
                    No MCP servers connected
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search tools by name or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <Select value={selectedServer} onValueChange={setSelectedServer}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="All Servers" />
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Servers</SelectItem>
                  {servers.map((server) => (
                    <SelectItem key={server.name} value={server.name}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
                
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button onClick={loadAvailableTools} disabled={loading}>
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={loadAvailableTools}>
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Available Tools */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wrench className="h-5 w-5 mr-2" />
                Available Tools ({filteredTools.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-muted-foreground mt-2">Discovering tools...</p>
                </div>
              ) : filteredTools.length > 0 ? (
                <div className="space-y-3">
                  {filteredTools.map((tool) => (
                    <div key={tool.toolId} className="flex items-start space-x-3 p-3 border rounded-md">
                      <Checkbox
                        id={tool.toolId}
                        checked={isToolSelected(tool.toolId)}
                        onCheckedChange={(checked) => handleToolSelection(tool, checked as boolean)}
                        disabled={isReadOnly}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <Label htmlFor={tool.toolId} className="font-medium">
                            {tool.toolName}
                          </Label>
                          <Badge variant="outline" className="text-xs">
                            {tool.category}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {tool.serverName}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery || selectedServer || selectedCategory 
                    ? "No tools match your current filters"
                    : "No tools available"
                  }
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Selected Tools Tab */}
        <TabsContent value="selected" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Selected Tools</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage the tools selected for this agent template
              </p>
            </CardHeader>
            <CardContent>
              {selectedTools.length > 0 ? (
                <div className="space-y-3">
                  {selectedTools.map((tool: any, index: number) => (
                    <div key={tool.toolId} className="flex items-center space-x-3 p-3 border rounded-md">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium">#{tool.priority}</span>
                        <Input
                          type="number"
                          value={tool.priority}
                          onChange={(e) => handleToolPriorityChange(tool.toolId, parseInt(e.target.value))}
                          className="w-16 h-8"
                          min={1}
                          max={selectedTools.length}
                          disabled={isReadOnly}
                        />
                      </div>
                      
                      <div className="flex-1">
                        <div className="font-medium">{tool.toolName}</div>
                        <div className="text-sm text-muted-foreground">{tool.serverName}</div>
                      </div>
                      
                      <Select
                        value={getToolUsagePattern(tool.toolId)}
                        onValueChange={(value) => handleUsagePatternChange(tool.toolId, value as any)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">Primary</SelectItem>
                          <SelectItem value="secondary">Secondary</SelectItem>
                          <SelectItem value="restricted">Restricted</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateMcpConfiguration({
                          selectedTools: selectedTools.filter((t: any) => t.toolId !== tool.toolId)
                        })}
                        disabled={isReadOnly}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No tools selected. Go to Tool Discovery to select tools.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Tool Coordination
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="parallelExecution"
                  checked={toolCoordination.parallelExecution}
                  onCheckedChange={(checked) => 
                    updateMcpConfiguration({
                      toolCoordination: { ...toolCoordination, parallelExecution: checked as boolean }
                    })
                  }
                  disabled={isReadOnly}
                />
                <Label htmlFor="parallelExecution">Enable parallel tool execution</Label>
              </div>
              
              <div className="space-y-2">
                <Label>Conflict Resolution Strategy</Label>
                <Select
                  value={toolCoordination.conflictResolution}
                  onValueChange={(value) => 
                    updateMcpConfiguration({
                      toolCoordination: { ...toolCoordination, conflictResolution: value as any }
                    })
                  }
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="priority">Use Priority Order</SelectItem>
                    <SelectItem value="user_choice">Ask User</SelectItem>
                    <SelectItem value="automatic">Automatic Resolution</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Usage Patterns Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Patterns Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-sm mb-2">Primary Tools ({toolUsagePatterns.primary.length})</h4>
                  <div className="space-y-1">
                    {toolUsagePatterns.primary.map((toolId: string) => {
                      const tool = selectedTools.find((t: any) => t.toolId === toolId);
                      return tool ? (
                        <Badge key={toolId} variant="default" className="text-xs">
                          {tool.toolName}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-2">Secondary Tools ({toolUsagePatterns.secondary.length})</h4>
                  <div className="space-y-1">
                    {toolUsagePatterns.secondary.map((toolId: string) => {
                      const tool = selectedTools.find((t: any) => t.toolId === toolId);
                      return tool ? (
                        <Badge key={toolId} variant="secondary" className="text-xs">
                          {tool.toolName}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-2">Restricted Tools ({toolUsagePatterns.restricted.length})</h4>
                  <div className="space-y-1">
                    {toolUsagePatterns.restricted.map((toolId: string) => {
                      const tool = selectedTools.find((t: any) => t.toolId === toolId);
                      return tool ? (
                        <Badge key={toolId} variant="destructive" className="text-xs">
                          {tool.toolName}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
