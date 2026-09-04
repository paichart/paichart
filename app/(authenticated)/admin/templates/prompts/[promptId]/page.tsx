"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { 
  ArrowLeft, 
  Save, 
  Edit3, 
  Eye, 
  MessageSquare, 
  Globe, 
  Tag, 
  AlertCircle,
  Copy,
  Trash2,
  Plus
} from 'lucide-react';
import { EnhancedPromptEditor } from '@/components/poveditor/pov/components/EnhancedPromptEditor';

interface PromptData {
  id: string;
  name: string;
  description: string;
  category: string;
  promptText: string;
  useCase: string;
  tags: string[];
  variables: any;
  examples: any;
  complexity: string;
  estimatedTime: number;
  isPublic: boolean;
  status: string;
  usageCount: number;
  rating?: number;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export default function PromptDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const promptId = params?.promptId as string;
  const action = searchParams?.get('action') || 'view';
  
  const [prompt, setPrompt] = useState<PromptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variablesJsonError, setVariablesJsonError] = useState<string | null>(null);
  const [examplesJsonError, setExamplesJsonError] = useState<string | null>(null);

  const isEditing = action === 'edit';
  const isCreating = action === 'new';
  const pageTitle = isCreating ? 'Create New Prompt' : isEditing ? 'Edit Prompt' : 'View Prompt';

  const loadPrompt = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/agent-templates/prompt-library/${promptId}`, {
        credentials: 'include' // Ensure cookies are sent for authentication
      });
      const result = await response.json();
      
      if (result.success) {
        setPrompt(result.data);
      } else {
        setError(result.error || 'Failed to load prompt');
      }
    } catch (err) {
      console.error('Failed to load prompt:', err);
      setError('Failed to load prompt. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [promptId]);

  // Load prompt data
  useEffect(() => {
    if (isCreating) {
      setPrompt({
        id: '',
        name: '',
        description: '',
        category: 'GENERAL',
        promptText: '',
        useCase: '',
        tags: [],
        variables: {},
        examples: {},
        complexity: 'MEDIUM',
        estimatedTime: 300,
        isPublic: true,
        status: 'ACTIVE',
        usageCount: 0,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setLoading(false);
    } else if (promptId) {
      loadPrompt();
    }
  }, [promptId, isCreating, loadPrompt]);

  const handleSave = async () => {
    if (!prompt) return;

    try {
      setSaving(true);
      setError(null);

      const url = isCreating 
        ? '/api/agent-templates/prompt-library'
        : `/api/agent-templates/prompt-library/${promptId}`;
      
      const method = isCreating ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prompt),
        credentials: 'include' // Ensure cookies are sent for authentication
      });

      const result = await response.json();
      
      if (result.success) {
        if (isCreating) {
          router.push(`/admin/templates/prompts/${result.data.id}?action=view`);
        } else {
          setPrompt(result.data);
          router.push(`/admin/templates/prompts/${promptId}?action=view`);
        }
      } else {
        setError(result.error || 'Failed to save prompt');
      }
    } catch (err) {
      console.error('Failed to save prompt:', err);
      setError('Failed to save prompt. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!prompt || !promptId) return;
    
    if (!confirm('Are you sure you want to delete this prompt? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/agent-templates/prompt-library/${promptId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      
      if (result.success) {
        router.push('/admin/templates?tab=prompt-library');
      } else {
        setError(result.error || 'Failed to delete prompt');
      }
    } catch (err) {
      console.error('Failed to delete prompt:', err);
      setError('Failed to delete prompt. Please try again.');
    }
  };

  const updatePrompt = (updates: Partial<PromptData>) => {
    setPrompt(prev => prev ? { ...prev, ...updates } : null);
  };

  const validateAndUpdateVariables = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      setVariablesJsonError(null);
      updatePrompt({ variables: parsed });
    } catch (error) {
      setVariablesJsonError(error instanceof Error ? error.message : 'Invalid JSON');
      updatePrompt({ variables: value });
    }
  };

  const validateAndUpdateExamples = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      setExamplesJsonError(null);
      updatePrompt({ examples: parsed });
    } catch (error) {
      setExamplesJsonError(error instanceof Error ? error.message : 'Invalid JSON');
      updatePrompt({ examples: value });
    }
  };

  const formatJson = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  const generateSampleData = () => {
    if (!prompt?.variables || typeof prompt.variables === 'string') return {};
    
    const sampleData: any = {};
    const variables = typeof prompt.variables === 'object' ? prompt.variables : {};
    
    Object.entries(variables).forEach(([key, config]: [string, any]) => {
      if (config.default) {
        sampleData[key] = config.default;
      } else if (config.type === 'string') {
        sampleData[key] = `sample_${key}`;
      } else if (config.type === 'enum' && config.values) {
        sampleData[key] = config.values[0];
      } else if (config.type === 'number') {
        sampleData[key] = 42;
      } else if (config.type === 'boolean') {
        sampleData[key] = true;
      } else {
        sampleData[key] = `{{${key}}}`;
      }
    });
    
    return sampleData;
  };

  const renderPromptPreview = () => {
    if (!prompt?.promptText) return 'No prompt text available';
    
    const sampleData = generateSampleData();
    let previewText = prompt.promptText;
    
    // Replace variables with sample data
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      previewText = previewText.replace(regex, String(value));
    });
    
    return previewText;
  };

  const insertVariableTemplate = (template: any) => {
    try {
      const currentVariables = typeof prompt?.variables === 'object' ? prompt.variables : {};
      const updatedVariables = { ...currentVariables, ...template };
      updatePrompt({ variables: updatedVariables });
      setVariablesJsonError(null);
    } catch (error) {
      console.error('Failed to insert template:', error);
    }
  };

  const variableTemplates = [
    {
      name: 'Customer Name',
      template: {
        customer_name: {
          type: 'string',
          required: true,
          minLength: 2,
          maxLength: 100,
          description: 'Customer organization name'
        }
      }
    },
    {
      name: 'Priority Level',
      template: {
        priority: {
          type: 'enum',
          values: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
          required: false,
          default: 'MEDIUM',
          description: 'Task priority level'
        }
      }
    },
    {
      name: 'Project Type',
      template: {
        project_type: {
          type: 'enum',
          values: ['web', 'mobile', 'api', 'desktop'],
          required: true,
          description: 'Type of project or application'
        }
      }
    },
    {
      name: 'Timeline',
      template: {
        timeline: {
          type: 'string',
          required: false,
          default: '2 weeks',
          description: 'Expected completion timeline'
        }
      }
    },
    {
      name: 'Description',
      template: {
        description: {
          type: 'string',
          required: true,
          minLength: 10,
          maxLength: 1000,
          description: 'Detailed description or requirements'
        }
      }
    },
    {
      name: 'Enable/Disable',
      template: {
        enabled: {
          type: 'boolean',
          required: false,
          default: true,
          description: 'Whether this feature is enabled'
        }
      }
    }
  ];

  const extractDomainFromTags = (tags: string[]) => {
    const domainTag = tags?.find(tag => tag.startsWith('domain:'));
    return domainTag ? domainTag.replace('domain:', '') : 'general';
  };

  const categories = [
    { value: 'GENERAL', label: 'General' },
    { value: 'DEVELOPMENT', label: 'Development' },
    { value: 'TESTING', label: 'Testing' },
    { value: 'DOCUMENTATION', label: 'Documentation' },
    { value: 'ANALYSIS', label: 'Analysis' },
    { value: 'AUTOMATION', label: 'Automation' },
    { value: 'REVIEW', label: 'Review' },
    { value: 'DEPLOYMENT', label: 'Deployment' },
    { value: 'MONITORING', label: 'Monitoring' },
    { value: 'SECURITY', label: 'Security' }
  ];

  const complexityOptions = [
    { value: 'SIMPLE', label: 'Simple' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'COMPLEX', label: 'Complex' },
    { value: 'EXPERT', label: 'Expert' }
  ];

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <MessageSquare className="h-12 w-12 animate-pulse text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error && !prompt) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Prompt not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{pageTitle}</h1>
            {!isCreating && (
              <p className="text-muted-foreground">ID: {promptId}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isCreating && !isEditing && (
            <>
              <Button variant="outline" onClick={() => router.push(`/admin/templates/prompts/${promptId}?action=edit`)}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          )}
          
          {(isEditing || isCreating) && (
            <>
              <Button variant="outline" onClick={() => isCreating ? router.back() : router.push(`/admin/templates/prompts/${promptId}?action=view`)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Essential prompt details and categorization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Name *</label>
                {isEditing || isCreating ? (
                  <Input
                    value={prompt.name}
                    onChange={(e) => updatePrompt({ name: e.target.value })}
                    placeholder="Enter prompt name..."
                  />
                ) : (
                  <p className="p-2 bg-muted rounded">{prompt.name}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description *</label>
                {isEditing || isCreating ? (
                  <Textarea
                    value={prompt.description}
                    onChange={(e) => updatePrompt({ description: e.target.value })}
                    placeholder="Describe what this prompt does..."
                    rows={3}
                  />
                ) : (
                  <p className="p-2 bg-muted rounded whitespace-pre-wrap">{prompt.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Category *</label>
                  {isEditing || isCreating ? (
                    <Select value={prompt.category} onValueChange={(value) => updatePrompt({ category: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="p-2 bg-muted rounded">
                      {categories.find(c => c.value === prompt.category)?.label || prompt.category}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Complexity</label>
                  {isEditing || isCreating ? (
                    <Select value={prompt.complexity} onValueChange={(value) => updatePrompt({ complexity: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {complexityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="p-2 bg-muted rounded">{prompt.complexity}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Use Case *</label>
                {isEditing || isCreating ? (
                  <Textarea
                    value={prompt.useCase}
                    onChange={(e) => updatePrompt({ useCase: e.target.value })}
                    placeholder="Describe when and how this prompt should be used..."
                    rows={2}
                  />
                ) : (
                  <p className="p-2 bg-muted rounded whitespace-pre-wrap">{prompt.useCase}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Prompt Content */}
          <Card>
            <CardHeader>
              <CardTitle>Prompt Content</CardTitle>
              <CardDescription>The main prompt text and instructions</CardDescription>
            </CardHeader>
            <CardContent>
              <EnhancedPromptEditor
                value={prompt.promptText}
                onChange={(value) => updatePrompt({ promptText: value })}
                readOnly={!isEditing && !isCreating}
                mcpTagging={isEditing || isCreating}
                selectedTags={prompt.tags}
                onTagsChange={(tags) => updatePrompt({ tags })}
                availableTags={['workflow', 'configuration', 'analysis', 'automation', 'troubleshooting', 'mcp']}
                domainSelection={['general', 'devops', 'education', 'medical', 'finance', 'legal']}
                selectedDomain={extractDomainFromTags(prompt.tags)}
                onDomainChange={(domain) => {
                  const newTags = prompt.tags.filter(tag => !tag.startsWith('domain:'));
                  newTags.push(`domain:${domain}`);
                  updatePrompt({ tags: newTags });
                }}
              />
            </CardContent>
          </Card>

          {/* Variables Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Variables Configuration</CardTitle>
              <CardDescription>
                Define variable placeholders used in your prompt (e.g., {`{{customer_name}}`}, {`{{priority}}`})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing || isCreating ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Variables (JSON Format)</label>
                      <div className="flex items-center gap-2">
                        {variablesJsonError && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Invalid JSON
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentValue = typeof prompt.variables === 'string' ? prompt.variables : JSON.stringify(prompt.variables || {}, null, 2);
                            const formatted = formatJson(currentValue);
                            updatePrompt({ variables: formatted });
                            setVariablesJsonError(null);
                          }}
                          className="text-xs h-7"
                        >
                          Format JSON
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={typeof prompt.variables === 'string' ? prompt.variables : JSON.stringify(prompt.variables || {}, null, 2)}
                      onChange={(e) => validateAndUpdateVariables(e.target.value)}
                      className={`font-mono text-sm ${variablesJsonError ? 'border-destructive' : ''}`}
                      placeholder={`{
  "variable_name": {
    "type": "string",
    "required": true,
    "description": "Description of this variable"
  },
  "priority": {
    "type": "enum",
    "values": ["LOW", "MEDIUM", "HIGH"],
    "required": false,
    "default": "MEDIUM",
    "description": "Task priority level"
  }
}`}
                      rows={12}
                    />
                    {variablesJsonError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          <strong>JSON Error:</strong> {variablesJsonError}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Variable Format:</strong> Use JSON to define variables. Each variable should have:
                      <br />• <code>type</code>: &quot;string&quot;, &quot;number&quot;, &quot;boolean&quot;, &quot;enum&quot;, or &quot;object&quot;
                      <br />• <code>required</code>: true or false
                      <br />• <code>description</code>: Human-readable explanation
                      <br />• For enums: <code>values</code> array and optional <code>default</code>
                    </AlertDescription>
                  </Alert>

                  {/* Quick Variable Templates */}
                  <Card className="mt-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">🚀 Quick Variable Templates</CardTitle>
                      <CardDescription className="text-xs">
                        Click to add common variable types to your JSON
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        {variableTemplates.map((template, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => insertVariableTemplate(template.template)}
                            className="text-xs h-8 justify-start"
                          >
                            <Plus className="h-3 w-3 mr-2" />
                            {template.name}
                          </Button>
                        ))}
                      </div>
                      <Alert className="mt-3">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          These templates will be merged with your existing variables. You can customize them after insertion.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>

                  {/* Detailed Reference Section */}
                  <Card className="mt-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">📖 Variables & Examples Reference Guide</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium text-sm mb-2">Complete Variables Example:</h4>
                        <pre className="text-xs bg-muted p-3 rounded overflow-auto">
{`{
  "component_name": {
    "type": "string",
    "required": true,
    "description": "Name of the component to review"
  },
  "project_type": {
    "type": "enum",
    "values": ["web", "mobile", "api", "desktop"],
    "required": true,
    "description": "Type of project"
  },
  "review_areas": {
    "type": "string",
    "required": false,
    "default": "security, performance, maintainability",
    "description": "Specific areas to focus on"
  },
  "detail_level": {
    "type": "enum",
    "values": ["brief", "detailed", "comprehensive"],
    "required": false,
    "default": "detailed",
    "description": "Level of detail in feedback"
  }
}`}
                        </pre>
                      </div>

                      <div className="border-t pt-3">
                        <h4 className="font-medium text-sm mb-2">Variables vs Examples:</h4>
                        <div className="text-xs space-y-1">
                          <p><strong>• Variables:</strong> Define the structure and validation rules for your prompt placeholders</p>
                          <p><strong>• Examples:</strong> Show sample input/output pairs to help users understand usage</p>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <h4 className="font-medium text-sm mb-2">Examples Section Format:</h4>
                        <pre className="text-xs bg-muted p-3 rounded overflow-auto">
{`{
  "example_1": {
    "input": {
      "component_name": "UserAuthentication",
      "project_type": "web",
      "review_areas": "security, error handling"
    },
    "output": "Comprehensive security analysis with specific recommendations"
  },
  "example_2": {
    "input": {
      "component_name": "PaymentProcessor", 
      "project_type": "api",
      "detail_level": "comprehensive"
    },
    "output": "Detailed API security review with compliance recommendations"
  }
}`}
                        </pre>
                      </div>

                      <div className="border-t pt-3">
                        <h4 className="font-medium text-sm mb-2">Variable Types Reference:</h4>
                        <div className="text-xs space-y-1">
                          <p><code>&quot;string&quot;</code> - Text input (use minLength/maxLength for validation)</p>
                          <p><code>&quot;enum&quot;</code> - Dropdown selection (requires &quot;values&quot; array)</p>
                          <p><code>&quot;number&quot;</code> - Numeric input (use min/max for validation)</p>
                          <p><code>&quot;boolean&quot;</code> - True/false checkbox</p>
                          <p><code>&quot;object&quot;</code> - Complex nested data structure</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div>
                  {prompt.variables && Object.keys(prompt.variables).length > 0 ? (
                    <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                      {JSON.stringify(prompt.variables, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground italic">No variables defined</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Examples Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Examples</CardTitle>
              <CardDescription>
                Provide example inputs and expected outputs to help users understand how to use this prompt
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing || isCreating ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Examples (JSON Format)</label>
                      <div className="flex items-center gap-2">
                        {examplesJsonError && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Invalid JSON
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentValue = typeof prompt.examples === 'string' ? prompt.examples : JSON.stringify(prompt.examples || {}, null, 2);
                            const formatted = formatJson(currentValue);
                            updatePrompt({ examples: formatted });
                            setExamplesJsonError(null);
                          }}
                          className="text-xs h-7"
                        >
                          Format JSON
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={typeof prompt.examples === 'string' ? prompt.examples : JSON.stringify(prompt.examples || {}, null, 2)}
                      onChange={(e) => validateAndUpdateExamples(e.target.value)}
                      className={`font-mono text-sm ${examplesJsonError ? 'border-destructive' : ''}`}
                      placeholder={`{
  "example_1": {
    "input": {
      "customer_name": "Acme Corp",
      "priority": "HIGH",
      "task_description": "Security audit for payment system"
    },
    "output": "Comprehensive security analysis with specific recommendations and timeline"
  },
  "example_2": {
    "input": {
      "customer_name": "TechStart Inc",
      "priority": "MEDIUM",
      "task_description": "Code review for user authentication"
    },
    "output": "Detailed code review with security best practices and improvement suggestions"
  }
}`}
                      rows={16}
                    />
                    {examplesJsonError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          <strong>JSON Error:</strong> {examplesJsonError}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Examples Format:</strong> Use JSON to provide sample usage scenarios.
                      <br />• Each example should have <code>input</code> (variable values) and <code>output</code> (expected result)
                      <br />• This helps users understand how to use your prompt effectively
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div>
                  {prompt.examples && Object.keys(prompt.examples).length > 0 ? (
                    <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                      {JSON.stringify(prompt.examples, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground italic">No examples defined</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={prompt.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {prompt.status}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Domain:</span>
                <Badge variant="outline">
                  <Globe className="h-3 w-3 mr-1" />
                  {extractDomainFromTags(prompt.tags)}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Usage Count:</span>
                <span>{prompt.usageCount}</span>
              </div>

              {prompt.rating && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rating:</span>
                  <span>{prompt.rating.toFixed(1)}/5</span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated Time:</span>
                <span>{Math.round(prompt.estimatedTime / 60)}min</span>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          {prompt.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {prompt.tags.map((tag) => (
                    <Badge key={tag} variant={tag === 'mcp' ? 'default' : 'secondary'}>
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variable Preview */}
          {prompt.variables && Object.keys(prompt.variables).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Variable Preview</CardTitle>
                <CardDescription className="text-xs">
                  How the prompt looks with sample data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h5 className="text-xs font-medium mb-2">Sample Values:</h5>
                    <div className="text-xs bg-muted p-2 rounded space-y-1">
                      {Object.entries(generateSampleData()).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="font-mono text-blue-600">{`{{${key}}}`}</span>
                          <span className="text-green-600">→ {String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h5 className="text-xs font-medium mb-2">Preview:</h5>
                    <div className="text-xs bg-muted p-3 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                      {renderPromptPreview()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variables JSON */}
          {(prompt.variables && Object.keys(prompt.variables).length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Variables</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(prompt.variables, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}