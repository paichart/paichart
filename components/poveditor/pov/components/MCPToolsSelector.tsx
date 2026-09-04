"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Checkbox } from '@/components/ui/Checkbox';
import { Loader2, Search, Server, AlertCircle, CheckCircle, XCircle, Wrench } from 'lucide-react';

interface MCPTool {
  id: string;
  name: string;
  description?: string;
  serverName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'MAINTENANCE';
  capabilities?: string[];
  responseTime?: number;
  successRate?: number;
}

interface MCPServer {
  name: string;
  connected: boolean;
  toolCount: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'MAINTENANCE';
}

interface MCPToolsSelectorProps {
  selectedTools: string[];
  onChange: (tools: string[]) => void;
  className?: string;
}

export const MCPToolsSelector: React.FC<MCPToolsSelectorProps> = ({
  selectedTools,
  onChange,
  className
}) => {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServer, setSelectedServer] = useState<string>('all');

  // Fetch MCP tools and servers
  useEffect(() => {
    const fetchMCPData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch tools from existing API
        const toolsResponse = await fetch('/api/mcp/tools');
        if (!toolsResponse.ok) {
          throw new Error('Failed to fetch MCP tools');
        }
        const toolsData = await toolsResponse.json();
        
        // Also fetch server list to show disconnected servers
        const serversResponse = await fetch('/api/mcp/servers');
        const serversData = serversResponse.ok ? await serversResponse.json() : null;

        // Use the same pattern as MCPToolDashboard
        const transformedTools: MCPTool[] = (toolsData.data?.tools || []).map((tool: any) => ({
          id: tool.id || tool.name || Math.random().toString(36),
          name: tool.name || 'Unknown Tool',
          description: tool.description,
          serverName: tool.serverName || tool.server || 'unknown',
          status: tool.status || 'ACTIVE',
          capabilities: tool.capabilities || [],
          responseTime: tool.performance?.averageExecutionTime,
          successRate: tool.performance?.successRate
        }));

        setTools(transformedTools);

        // Extract server information from tools
        const serverMap = new Map<string, MCPServer>();
        
        // First, get all unique server names from tools
        const serverNames = new Set(transformedTools.map(t => t.serverName));
        
        // Initialize servers based on tools
        transformedTools.forEach(tool => {
          if (!serverMap.has(tool.serverName)) {
            serverMap.set(tool.serverName, {
              name: tool.serverName,
              connected: false,
              toolCount: 0,
              status: 'INACTIVE' as MCPServer['status']
            });
          }
          
          const server = serverMap.get(tool.serverName)!;
          server.toolCount++;
          
          // If we have any tools from this server, consider it ACTIVE
          if (server.toolCount > 0) {
            server.status = 'ACTIVE';
            server.connected = true;
          }
        });
        
        // Add any configured servers that don't have tools yet
        if (serversData?.data?.servers) {
          serversData.data.servers.forEach((server: any) => {
            const existingServer = serverMap.get(server.name);
            if (!existingServer) {
              // Server exists but has no tools (likely disconnected)
              serverMap.set(server.name, {
                name: server.name,
                connected: server.status === 'connected',
                toolCount: 0,
                status: server.status === 'connected' ? 'ACTIVE' : 'INACTIVE'
              });
            } else if (existingServer.toolCount > 0) {
              // If we have tools from this server, override status to ACTIVE
              // This handles cases where server has protocol errors but tools work via static fallback
              existingServer.status = 'ACTIVE';
              existingServer.connected = true;
            }
          });
        }
        
        setServers(Array.from(serverMap.values()));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load MCP tools');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMCPData();
  }, []);

  // Filter tools based on search and server selection
  const filteredTools = tools.filter(tool => {
    const matchesSearch = !searchTerm || 
      tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tool.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesServer = selectedServer === 'all' || tool.serverName === selectedServer;
    
    return matchesSearch && matchesServer;
  });

  // Handle tool selection
  const handleToolToggle = (toolName: string) => {
    const newSelection = selectedTools.includes(toolName)
      ? selectedTools.filter(t => t !== toolName)
      : [...selectedTools, toolName];
    
    onChange(newSelection);
  };

  // Handle select all/none for filtered tools
  const handleSelectAll = () => {
    const filteredToolNames = filteredTools.map(t => t.name);
    const allSelected = filteredToolNames.every(name => selectedTools.includes(name));
    
    if (allSelected) {
      // Deselect all filtered tools
      onChange(selectedTools.filter(name => !filteredToolNames.includes(name)));
    } else {
      // Select all filtered tools
      const newSelection = [...new Set([...selectedTools, ...filteredToolNames])];
      onChange(newSelection);
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'ERROR':
        return <XCircle className="h-3 w-3 text-red-600" />;
      case 'MAINTENANCE':
        return <AlertCircle className="h-3 w-3 text-yellow-600" />;
      default:
        return <XCircle className="h-3 w-3 text-gray-400" />;
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'ERROR':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'MAINTENANCE':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            MCP Tools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2">Loading MCP tools...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            MCP Tools
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          MCP Tools
          {selectedTools.length > 0 && (
            <Badge variant="secondary">
              {selectedTools.length} selected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filter Controls */}
        <div className="flex gap-2">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tools..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <select
            value={selectedServer}
            onChange={(e) => setSelectedServer(e.target.value)}
            className="px-3 py-2 border border-input bg-background rounded-md text-sm"
          >
            <option value="all">All Servers</option>
            {servers.map(server => (
              <option key={server.name} value={server.name}>
                {server.name} ({server.toolCount})
              </option>
            ))}
          </select>
        </div>

        {/* Server Status Summary */}
        {servers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {servers.map(server => (
              <Badge
                key={server.name}
                className={getStatusColor(server.status)}
              >
                <div className="flex items-center gap-1">
                  <Server className="h-3 w-3" />
                  <span>{server.name}</span>
                  {getStatusIcon(server.status)}
                </div>
              </Badge>
            ))}
          </div>
        )}

        {/* Select All/None */}
        {filteredTools.length > 0 && (
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
            >
              {filteredTools.every(tool => selectedTools.includes(tool.name))
                ? 'Deselect All'
                : 'Select All'
              }
            </Button>
            <span className="text-sm text-muted-foreground">
              {filteredTools.length} tool{filteredTools.length !== 1 ? 's' : ''} available
            </span>
          </div>
        )}

        {/* Tools List */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {filteredTools.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || selectedServer !== 'all' 
                ? 'No tools match your filters'
                : 'No MCP tools available'
              }
            </div>
          ) : (
            filteredTools.map(tool => (
              <div
                key={tool.id}
                className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`tool-${tool.id}`}
                  checked={selectedTools.includes(tool.name)}
                  onCheckedChange={() => handleToolToggle(tool.name)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`tool-${tool.id}`}
                      className="font-medium cursor-pointer"
                    >
                      {tool.name}
                    </Label>
                    {getStatusIcon(tool.status)}
                    <Badge variant="outline" className="text-xs">
                      {tool.serverName}
                    </Badge>
                  </div>
                  {tool.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {tool.description}
                    </p>
                  )}
                  {(tool.responseTime || tool.successRate) && (
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {tool.responseTime && (
                        <span>Response: {tool.responseTime}ms</span>
                      )}
                      {tool.successRate && (
                        <span>Success: {tool.successRate}%</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Tools Summary */}
        {selectedTools.length > 0 && (
          <div className="border-t pt-4">
            <Label className="text-sm font-medium">Selected Tools:</Label>
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedTools.map(toolName => (
                <Badge
                  key={toolName}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => handleToolToggle(toolName)}
                >
                  {toolName}
                  <XCircle className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MCPToolsSelector;
