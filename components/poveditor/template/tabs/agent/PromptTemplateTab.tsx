"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { 
  FileText, 
  Wand2, 
  Eye, 
  Code, 
  Lightbulb,
  Copy,
  RotateCcw,
  Save
} from 'lucide-react';
import { AgentTabProps } from './types';
import { useTemplateData, useTemplateEditorActions } from '../../context/TemplateEditorContext';

/**
 * Prompt Template Tab Component
 * 
 * Provides a comprehensive prompt template editor for agent templates.
 * Includes template suggestions, variables, and preview functionality.
 */
export function PromptTemplateTab({ templateId, isReadOnly = false }: AgentTabProps) {
  const templateData = useTemplateData();
  const { setField } = useTemplateEditorActions();
  
  // Get current prompt template from root level only
  const data = templateData as any;
  const currentPrompt = data.promptTemplate || '';
  
  // State management
  const [activeTab, setActiveTab] = useState('editor');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [previewData, setPreviewData] = useState({
    role: data.defaultRole || 'Assistant',
    task: 'Help the user with their request',
    context: 'General conversation'
  });

  // Update prompt template
  const updatePromptTemplate = (value: string) => {
    setField(['promptTemplate'], value);
  };

  // State for prompt library templates
  const [libraryTemplates, setLibraryTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Load prompt library templates
  useEffect(() => {
    const loadLibraryTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const category = data.category || 'GENERAL';
        const response = await fetch(`/api/agent-templates/prompt-library?category=${category}&public=true`);
        const result = await response.json();
        
        if (result.success) {
          // Transform API response to match expected format
          const transformedTemplates = result.data.map((prompt: any) => ({
            id: prompt.id,
            name: prompt.name,
            description: prompt.description,
            template: prompt.promptText
          }));
          setLibraryTemplates(transformedTemplates);
        } else {
          setLibraryTemplates([]);
        }
      } catch {
        setLibraryTemplates([]);
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    loadLibraryTemplates();
  }, [data.category]);

  // Get prompt templates (now from library only)
  const getPromptTemplates = () => {
    return libraryTemplates;
  };

  // Apply selected template
  const applyTemplate = (templateId: string) => {
    const templates = getPromptTemplates();
    const template = templates.find(t => t.id === templateId);
    if (template) {
      updatePromptTemplate(template.template);
      setSelectedTemplate('');
    }
  };

  // Generate preview with variable substitution
  const generatePreview = () => {
    let preview = currentPrompt;
    
    // Simple variable substitution (basic Handlebars-like syntax)
    preview = preview.replace(/\{\{role\}\}/g, previewData.role);
    preview = preview.replace(/\{\{task\}\}/g, previewData.task);
    preview = preview.replace(/\{\{context\}\}/g, previewData.context);
    
    // Handle capabilities array from root level
    const capabilities = data.capabilities;
    if (capabilities) {
      const capabilitiesList = Object.values(capabilities).flat().join('\n- ');
      preview = preview.replace(/\{\{#each capabilities\}\}\n- \{\{this\}\}\n\{\{\/each\}\}/g, capabilitiesList ? `- ${capabilitiesList}` : '- No capabilities defined');
    }
    
    // Handle constraints array from root level
    const constraints = data.constraints;
    if (constraints) {
      const constraintsList = Object.values(constraints).join('\n- ');
      preview = preview.replace(/\{\{#each constraints\}\}\n- \{\{this\}\}\n\{\{\/each\}\}/g, constraintsList ? `- ${constraintsList}` : '- No constraints defined');
    }
    
    return preview;
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Could not copy to clipboard
    }
  };

  // Reset to default template
  const resetToDefault = () => {
    const defaultTemplate = `You are ${'{{role}}'}, a helpful assistant.

## Your Capabilities:
${'{{#each capabilities}}'}
- ${'{{this}}'}
${'{{/each}}'}

## Guidelines:
${'{{#each constraints}}'}
- ${'{{this}}'}
${'{{/each}}'}

## Current Task:
${'{{task}}'}

## Context:
${'{{context}}'}

Please assist the user with their request.`;
    
    updatePromptTemplate(defaultTemplate);
  };

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="bg-primary/10 border border-primary/20 rounded-md p-4">
        <h3 className="font-medium mb-2">Prompt Template Editor</h3>
        <p className="text-sm text-muted-foreground">
          Design the core prompt template that defines how your agent behaves and responds. 
          Use variables like {`{{role}}`}, {`{{task}}`}, and {`{{context}}`} for dynamic content.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="templates">Library</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        {/* Editor Tab */}
        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Prompt Template
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToDefault}
                  disabled={isReadOnly}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset to Default
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(currentPrompt)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Textarea
                  value={currentPrompt}
                  onChange={(e) => updatePromptTemplate(e.target.value)}
                  placeholder="Enter your prompt template here..."
                  rows={20}
                  className="font-mono text-sm"
                  disabled={isReadOnly}
                />
                
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-2">Available Variables:</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Badge variant="outline">{"{{role}}"}</Badge>
                    <Badge variant="outline">{"{{task}}"}</Badge>
                    <Badge variant="outline">{"{{context}}"}</Badge>
                    <Badge variant="outline">{"{{capabilities}}"}</Badge>
                    <Badge variant="outline">{"{{constraints}}"}</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Template Suggestions
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose from pre-built templates optimized for {data.category || 'general'} agents
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                    <span className="ml-2">Loading prompt library...</span>
                  </div>
                ) : getPromptTemplates().length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wand2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No prompt templates found for {data.category || 'general'} category</p>
                    <p className="text-xs mt-1">Templates will appear here once they are added to the prompt library</p>
                  </div>
                ) : (
                  getPromptTemplates().map((template) => (
                    <div key={template.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{template.name}</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applyTemplate(template.id)}
                          disabled={isReadOnly}
                        >
                          <Wand2 className="h-4 w-4 mr-1" />
                          Use Template
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-primary hover:underline">
                          View Template
                        </summary>
                        <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                          {template.template}
                        </pre>
                      </details>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preview Tab */}
        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Template Preview
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                See how your template will look with actual values
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Preview Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-xs">Role</Label>
                    <Input
                      type="text"
                      value={previewData.role}
                      onChange={(e) => setPreviewData(prev => ({ ...prev, role: e.target.value }))}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Task</Label>
                    <Input
                      type="text"
                      value={previewData.task}
                      onChange={(e) => setPreviewData(prev => ({ ...prev, task: e.target.value }))}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Context</Label>
                    <Input
                      type="text"
                      value={previewData.context}
                      onChange={(e) => setPreviewData(prev => ({ ...prev, context: e.target.value }))}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>

                {/* Preview Output */}
                <div className="border rounded-lg p-4 bg-background">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="font-medium">Generated Prompt</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(generatePreview())}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Preview
                    </Button>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-foreground bg-muted/30 p-3 rounded border">
                    {generatePreview() || 'No template content to preview'}
                  </pre>
                </div>

                {/* Tips */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h5 className="font-medium text-blue-900 mb-1">Template Tips</h5>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Use {`{{role}}`} to insert the agent&apos;s role dynamically</li>
                        <li>• {`{{capabilities}}`} and {`{{constraints}}`} will list configured items</li>
                        <li>• Keep prompts clear and specific for better results</li>
                        <li>• Test different variable values to ensure flexibility</li>
                      </ul>
                    </div>
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
