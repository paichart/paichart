"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Activity, Loader2, AlertTriangle } from 'lucide-react';

interface ServerConfigFormProps {
  initialData?: any;
  onSubmit: (config: any) => void;
  onCancel: () => void;
  showAdvancedOptions?: boolean;
}

export function ServerConfigForm({
  initialData,
  onSubmit,
  onCancel,
  showAdvancedOptions = true
}: ServerConfigFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    version: initialData?.version || '1.0.0',
    transport: {
      type: initialData?.transport?.type || 'stdio',
      command: initialData?.transport?.command || '',
      args: initialData?.transport?.args || [],
      url: initialData?.transport?.url || '',
      env: initialData?.transport?.env || {}
    },
    capabilities: {
      tools: initialData?.capabilities?.tools ?? true,
      resources: initialData?.capabilities?.resources ?? false,
      logging: initialData?.capabilities?.logging ?? true,
      prompts: initialData?.capabilities?.prompts ?? false
    },
    authentication: {
      type: initialData?.authentication?.type || 'none',
      token: initialData?.authentication?.token || '',
      apiKey: initialData?.authentication?.apiKey || ''
    }
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  
  // Check if this is the embedded server (read-only)
  const isEmbeddedServer = formData.name === 'paichart-embedded-mcp' || initialData?.name === 'paichart-embedded-mcp';

  const updateFormData = (path: string, value: any) => {
    setFormData(prev => {
      const keys = path.split('.');
      const newData = { ...prev };
      let current: any = newData;
      
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newData;
    });

    // Clear error for this field
    if (errors[path]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[path];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Server name is required';
    }

    if (!formData.transport.type) {
      newErrors['transport.type'] = 'Transport type is required';
    }

    // Transport-specific validation
    switch (formData.transport.type) {
      case 'stdio':
        if (!formData.transport.command.trim()) {
          newErrors['transport.command'] = 'Command is required for STDIO transport';
        }
        break;
      case 'websocket':
      case 'sse':
      case 'streamable-http':
        if (!formData.transport.url.trim()) {
          newErrors['transport.url'] = 'URL is required for WebSocket/SSE/Streamable HTTP transport';
        } else {
          try {
            new URL(formData.transport.url);
          } catch {
            newErrors['transport.url'] = 'Invalid URL format';
          }
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      // Process args string to array for stdio
      const processedData = { ...formData };
      if (formData.transport.type === 'stdio' && typeof formData.transport.args === 'string') {
        processedData.transport.args = (formData.transport.args as string)
          .split(' ')
          .filter(arg => arg.trim().length > 0);
      }

      onSubmit(processedData);
    }
  };

  const testConnection = async () => {
    if (!validateForm()) return;

    // Handle embedded server differently
    if (formData.name === 'paichart-embedded-mcp' || initialData?.name === 'paichart-embedded-mcp') {
      alert('✅ Embedded server is always available and running!\n\nThis built-in server provides core pAIchart functionality and doesn\'t require connection testing.');
      return;
    }

    setIsTestingConnection(true);
    try {
      // For new servers that haven't been saved yet, just validate the config
      if (!initialData) {
        // Mock test for unsaved servers
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert('⚠️ Configuration looks valid!\n\nSave the server first to test the actual connection.');
        return;
      }

      // Test real connection for existing servers
      const response = await fetch(`/api/mcp/servers/${initialData.name}/test`, {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data.status === 'connected') {
          alert(`✅ Connection successful!\n\nResponse time: ${result.data.responseTime}ms`);
        } else {
          alert(`❌ Connection failed!\n\n${result.data.error || 'Unknown error'}`);
        }
      } else {
        throw new Error('Test request failed');
      }
    } catch (error) {
      alert(`❌ Connection test failed!\n\n${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const renderTransportConfig = () => {
    switch (formData.transport.type) {
      case 'stdio':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="command">Command *</Label>
              <Input
                id="command"
                value={formData.transport.command}
                onChange={(e) => updateFormData('transport.command', e.target.value)}
                placeholder="node"
                className={errors['transport.command'] ? 'border-red-500' : ''}
              />
              {errors['transport.command'] && (
                <p className="text-sm text-red-500 mt-1">{errors['transport.command']}</p>
              )}
            </div>
            <div>
              <Label htmlFor="args">Arguments</Label>
              <Input
                id="args"
                value={Array.isArray(formData.transport.args) 
                  ? formData.transport.args.join(' ') 
                  : formData.transport.args}
                onChange={(e) => updateFormData('transport.args', e.target.value)}
                placeholder="./mcp-server.js"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Space-separated arguments
              </p>
            </div>
          </div>
        );

      case 'websocket':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="url">WebSocket URL *</Label>
              <Input
                id="url"
                type="url"
                value={formData.transport.url}
                onChange={(e) => updateFormData('transport.url', e.target.value)}
                placeholder="ws://localhost:3001"
                className={errors['transport.url'] ? 'border-red-500' : ''}
              />
              {errors['transport.url'] && (
                <p className="text-sm text-red-500 mt-1">{errors['transport.url']}</p>
              )}
            </div>
          </div>
        );

      case 'streamable-http':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="url">Streamable HTTP URL *</Label>
              <Input
                id="url"
                type="url"
                value={formData.transport.url}
                onChange={(e) => updateFormData('transport.url', e.target.value)}
                placeholder="http://localhost:3001/events"
                className={errors['transport.url'] ? 'border-red-500' : ''}
              />
              {errors['transport.url'] && (
                <p className="text-sm text-red-500 mt-1">{errors['transport.url']}</p>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Server Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateFormData('name', e.target.value)}
              placeholder="My MCP Server"
              className={errors.name ? 'border-red-500' : ''}
              disabled={isEmbeddedServer}
              title={isEmbeddedServer ? 'Embedded server name cannot be changed' : ''}
            />
            {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={formData.version}
              onChange={(e) => updateFormData('version', e.target.value)}
              placeholder="1.0.0"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => updateFormData('description', e.target.value)}
            placeholder="Server description"
            rows={2}
          />
        </div>
      </div>

      {/* Transport Configuration */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Transport Configuration</h3>
        <div>
          <Label>Transport Type *</Label>
          <Select
            value={formData.transport.type}
            onValueChange={(value) => updateFormData('transport.type', value)}
            disabled={isEmbeddedServer}
          >
            <SelectTrigger 
              className={errors['transport.type'] ? 'border-red-500' : ''}
              title={isEmbeddedServer ? 'Embedded server transport cannot be changed' : ''}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">STDIO (Local Process)</SelectItem>
              <SelectItem value="websocket">WebSocket (Real-time)</SelectItem>
              <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
            </SelectContent>
          </Select>
          {errors['transport.type'] && (
            <p className="text-sm text-red-500 mt-1">{errors['transport.type']}</p>
          )}
        </div>
        {renderTransportConfig()}
      </div>

      {/* Capabilities */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Capabilities</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="tools"
              checked={formData.capabilities.tools}
              onCheckedChange={(checked) => updateFormData('capabilities.tools', checked)}
            />
            <Label htmlFor="tools">Tools</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="resources"
              checked={formData.capabilities.resources}
              onCheckedChange={(checked) => updateFormData('capabilities.resources', checked)}
            />
            <Label htmlFor="resources">Resources</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="logging"
              checked={formData.capabilities.logging}
              onCheckedChange={(checked) => updateFormData('capabilities.logging', checked)}
            />
            <Label htmlFor="logging">Logging</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="prompts"
              checked={formData.capabilities.prompts}
              onCheckedChange={(checked) => updateFormData('capabilities.prompts', checked)}
            />
            <Label htmlFor="prompts">Prompts</Label>
          </div>
        </div>
      </div>

      {/* Authentication (Advanced) */}
      {showAdvancedOptions && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Authentication</h3>
          <div>
            <Label>Authentication Type</Label>
            <Select
              value={formData.authentication.type}
              onValueChange={(value) => updateFormData('authentication.type', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {formData.authentication.type === 'bearer' && (
            <div>
              <Label htmlFor="token">Bearer Token</Label>
              <Input
                id="token"
                type="password"
                value={formData.authentication.token}
                onChange={(e) => updateFormData('authentication.token', e.target.value)}
                placeholder="Enter bearer token"
              />
            </div>
          )}
          
          {formData.authentication.type === 'api_key' && (
            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={formData.authentication.apiKey}
                onChange={(e) => updateFormData('authentication.apiKey', e.target.value)}
                placeholder="Enter API key"
              />
            </div>
          )}
        </div>
      )}

      {/* Error Summary */}
      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please fix the errors above before submitting.
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={testConnection}
          disabled={isTestingConnection || Object.keys(errors).length > 0}
        >
          {isTestingConnection ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Activity className="h-4 w-4 mr-2" />
          )}
          Test Connection
        </Button>
        <div className="space-x-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            {initialData ? 'Update Server' : 'Add Server'}
          </Button>
        </div>
      </div>
    </form>
  );
}
