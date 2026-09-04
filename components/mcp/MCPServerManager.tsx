"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { 
  Server, 
  Plus, 
  Settings, 
  Trash2, 
  Activity, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  Info,
  Wrench,
  Database,
  Lightbulb,
  X
} from 'lucide-react';
import { ServerConfigForm } from './ServerConfigForm';
import { ServerStatusIndicator } from './ServerStatusIndicator';
import { BLOOMBERG_HEADER, BLOOMBERG_COLORS } from '@/lib/constants/bloomberg-styles';
import { MetricTooltip } from '@/components/ui/MetricTooltip';

interface MCPServerManagerProps {
  showAdvancedOptions?: boolean;
  allowServerDeletion?: boolean;
  showConnectionLogs?: boolean;
  compact?: boolean;
}

interface ServerListItem {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error' | 'testing';
  transport: {
    type: string;
    displayName: string;
  };
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  health?: {
    responseTime: number;
    uptime: number;
    lastCheck: Date;
  };
  toolCount?: number;
  errorCount?: number;
  config?: any; // Full server configuration
  version?: string;
}

interface HealthData {
  totalServers: number;
  connectedServers: number;
  disconnectedServers: number;
  errorServers: number;
  averageResponseTime: number;
  overallHealth: number;
  totalTools: number;
}

export function MCPServerManager({
  showAdvancedOptions = true,
  allowServerDeletion = true,
  showConnectionLogs = true,
  compact = false
}: MCPServerManagerProps) {
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<ServerListItem | null>(null);
  const [showAddServer, setShowAddServer] = useState(false);
  const [testingServers, setTestingServers] = useState<Set<string>>(new Set());

  // Helper function to get transport display name
  const getTransportDisplayName = useCallback((type: string) => {
    switch (type) {
      case 'stdio':
        return 'STDIO (Local Process)';
      case 'websocket':
        return 'WebSocket (Real-time)';
      case 'sse':
        return 'SSE (Server-Sent Events)';
      case 'streamable-http':
        return 'Streamable HTTP';
      case 'embedded':
        return 'Embedded (Native)';
      default:
        return 'Unknown';
    }
  }, []);

  // Fetch servers and health data
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      
      const [serversResponse, healthResponse] = await Promise.all([
        fetch('/api/mcp/servers'),
        fetch('/api/mcp/servers/health')
      ]);

      if (!serversResponse.ok || !healthResponse.ok) {
        throw new Error('Failed to fetch server data');
      }

      const serversData = await serversResponse.json();
      const healthData = await healthResponse.json();

      if (serversData.success && healthData.success) {
        // Transform server data for display
        const transformedServers = (serversData.data.servers || []).map((server: any) => {
          return {
            id: server.name,
            name: server.name,
            description: server.description || server.config?.description || (server.name === 'paichart-embedded-mcp' ? '🏠 Built-in MCP server providing core pAIchart tools and capabilities' : 'No description available'),
            status: server.status,
            transport: {
              type: server.config?.transport?.type || (server.name === 'paichart-embedded-mcp' ? 'embedded' : 'unknown'),
              displayName: getTransportDisplayName(server.config?.transport?.type || (server.name === 'paichart-embedded-mcp' ? 'embedded' : 'unknown'))
            },
            capabilities: server.capabilities || server.config?.capabilities || {},
            toolCount: server.toolCount || 0,
            errorCount: server.errorCount || 0,
            health: {
              responseTime: server.responseTime || 0,
              uptime: server.uptime || 0,
              lastCheck: new Date()
            },
            // Preserve full config for editing
            config: {
              name: server.name,
              description: server.config?.description || server.description || '',
              version: server.version || server.config?.version || '1.0.0',
              transport: server.transport || server.config?.transport,
              capabilities: server.capabilities || server.config?.capabilities,
              authentication: server.authentication || server.config?.authentication
            },
            version: server.version
          };
        });

        setServers(transformedServers);
        setHealthData(healthData.data);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load server data');
    } finally {
      setIsLoading(false);
    }
  }, [getTransportDisplayName]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  // Test server connection
  const testConnection = async (serverId: string) => {
    setTestingServers(prev => new Set(prev).add(serverId));
    
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}/test`, {
        method: 'POST'
      });

      if (response.ok) {
        // Refresh data to get updated status
        await fetchData();
      } else {
        throw new Error('Connection test failed');
      }
    } catch {
      setError(`Connection test failed for ${serverId}`);
    } finally {
      setTestingServers(prev => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  // Edit server
  const editServer = (server: ServerListItem) => {
    setSelectedServer(server);
  };

  // Delete server
  const deleteServer = async (serverId: string) => {
    if (!confirm('Are you sure you want to delete this server?')) {
      return;
    }

    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchData(); // Refresh data
      } else {
        throw new Error('Failed to delete server');
      }
    } catch {
      setError(`Failed to delete server: ${serverId}`);
    }
  };

  // Handle server form submission
  const handleServerSave = async (serverConfig: any) => {
    try {
      const url = selectedServer 
        ? `/api/mcp/servers/${selectedServer.id}`
        : '/api/mcp/servers';
      
      const method = selectedServer ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(serverConfig)
      });

      if (response.ok) {
        setSelectedServer(null);
        setShowAddServer(false);
        await fetchData(); // Refresh data
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save server');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save server');
    }
  };

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading server management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-0 font-mono">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Bloomberg Header Bar */}
      {healthData && !compact && (
        <div className={BLOOMBERG_HEADER.container + " flex items-center gap-4"}>
          <span className={BLOOMBERG_HEADER.title}>MCP SERVERS</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>TOTAL:</span>
          <span className={BLOOMBERG_COLORS.info}>{healthData.totalServers}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>CONNECTED:</span>
          <span className={BLOOMBERG_COLORS.success}>{healthData.connectedServers}</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>AVG RESPONSE:</span>
          <span className={BLOOMBERG_COLORS.warning}>{healthData.averageResponseTime}ms</span>
          <span className={BLOOMBERG_HEADER.separator}>|</span>
          <span className={BLOOMBERG_HEADER.metric}>HEALTH:</span>
          <span className={`font-bold ${healthData.overallHealth >= 80 ? BLOOMBERG_COLORS.success : healthData.overallHealth >= 60 ? BLOOMBERG_COLORS.warning : BLOOMBERG_COLORS.error}`}>
            {healthData.overallHealth}%
          </span>
          <div className="flex-1"></div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={isLoading}
            className="text-amber-400 hover:text-amber-300 h-6 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-4">
        <Button onClick={() => setShowAddServer(true)} size="sm" className="h-7 px-3 text-xs">
          <Plus className="h-3 w-3 mr-1" />
          Add Server
        </Button>
      </div>

      {/* Server List */}
      <div className="space-y-4">
        {servers.map(server => (
          <Card key={server.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <ServerStatusIndicator 
                    status={testingServers.has(server.id) ? 'testing' : server.status} 
                  />
                  <div>
                    <h3 className="font-semibold">{server.name}</h3>
                    <p className="text-sm text-muted-foreground">{server.description}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <Badge variant="outline">{server.transport.displayName}</Badge>
                      
                      {/* Capability badges with detailed descriptions */}
                      <div className="flex items-center space-x-1">
                        {server.capabilities?.tools && (
                          <MetricTooltip explainer={server.id === 'paichart-embedded-mcp' ?
                            'Tools (5): project, perform, analytics, template, services' :
                            'Tools: Functions Claude can execute'
                          }>
                            <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-400">
                              🔧 Tools
                            </Badge>
                          </MetricTooltip>
                        )}
                        {server.capabilities?.resources && (
                          <MetricTooltip explainer={server.id === 'paichart-embedded-mcp' ?
                            'Resources (6): pov-database (POV project data), task-database (task management), agent-templates (AI configs), team-performance (analytics), system-logs (audit trails), ai-recommendations (insights)' :
                            'Resources: Live data sources Claude can access'
                          }>
                            <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-400">
                              📊 Resources
                            </Badge>
                          </MetricTooltip>
                        )}
                        {server.capabilities?.prompts && (
                          <MetricTooltip explainer={server.id === 'paichart-embedded-mcp' ?
                            'Prompts (5): project-status-overview (comprehensive project analysis), task-performance-analysis (bottleneck identification), agent-optimization-recommendations (AI tuning), system-health-check (system monitoring), project-planning-assistant (project setup)' :
                            'Prompts: Pre-configured analysis workflows'
                          }>
                            <Badge variant="secondary" className="text-xs bg-purple-500/10 text-purple-400">
                              💡 Prompts
                            </Badge>
                          </MetricTooltip>
                        )}
                        {server.capabilities?.logging && (
                          <MetricTooltip explainer="Logging: Debug and monitoring capabilities">
                            <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-400">
                              📝 Logging
                            </Badge>
                          </MetricTooltip>
                        )}
                      </div>
                      
                      {server.toolCount !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {server.toolCount} tools
                        </span>
                      )}
                      {server.errorCount !== undefined && server.errorCount > 0 && (
                        <span className="text-xs text-red-500">
                          {server.errorCount} errors
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection(server.id)}
                    disabled={testingServers.has(server.id) || server.id === 'paichart-embedded-mcp'}
                    title={server.id === 'paichart-embedded-mcp' ? 'Embedded server is always available' : 'Test server connection'}
                  >
                    {testingServers.has(server.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : server.id === 'paichart-embedded-mcp' ? (
                      <CheckCircle className={`h-4 w-4 ${BLOOMBERG_COLORS.success}`} />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                    {server.id === 'paichart-embedded-mcp' ? 'Built-in' : 'Test'}
                  </Button>
                  
                  {/* Only show Edit/Delete for external servers */}
                  {server.id !== 'paichart-embedded-mcp' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editServer(server)}
                      >
                        <Settings className="h-4 w-4" />
                        Edit
                      </Button>
                      {allowServerDeletion && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteServer(server.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      )}
                    </>
                  )}
                  
                  {/* Show info button for embedded server instead */}
                  {server.id === 'paichart-embedded-mcp' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      title="This is the built-in server providing core pAIchart functionality"
                    >
                      <Info className="h-4 w-4" />
                      System
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {servers.length === 0 && !isLoading && (
        <Card>
          <CardContent className="text-center py-8">
            <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No servers configured</h3>
            <p className="text-muted-foreground mb-4">
              Add your first MCP server to start managing tools and resources.
            </p>
            <Button onClick={() => setShowAddServer(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Server
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Server Dialog */}
      <Dialog open={showAddServer} onOpenChange={setShowAddServer}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Server</DialogTitle>
            <DialogDescription>
              Configure a new MCP server to extend your application with additional tools and resources.
            </DialogDescription>
          </DialogHeader>
          <ServerConfigForm
            onSubmit={handleServerSave}
            onCancel={() => setShowAddServer(false)}
            showAdvancedOptions={showAdvancedOptions}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Server Dialog */}
      <Dialog open={!!selectedServer} onOpenChange={(open) => !open && setSelectedServer(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Server</DialogTitle>
            <DialogDescription>
              Modify the configuration settings for this MCP server.
            </DialogDescription>
          </DialogHeader>
          {selectedServer && (
            <ServerConfigForm
              initialData={{
                name: selectedServer.name,
                description: selectedServer.config?.description || selectedServer.description || '',
                version: selectedServer.config?.version || selectedServer.version || '1.0.0',
                transport: selectedServer.config?.transport || { type: selectedServer.transport.type as any },
                capabilities: selectedServer.config?.capabilities || selectedServer.capabilities || { tools: true, resources: false, logging: true },
                authentication: selectedServer.config?.authentication || { type: 'none' }
              }}
              onSubmit={handleServerSave}
              onCancel={() => setSelectedServer(null)}
              showAdvancedOptions={showAdvancedOptions}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
