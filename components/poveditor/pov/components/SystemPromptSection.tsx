"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { 
  MessageSquare, 
  Library, 
  Edit3, 
  Save, 
  Star, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  Copy,
  Eye,
  Search
} from 'lucide-react';
import { EnhancedPromptEditor } from './EnhancedPromptEditor';

interface PromptLibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  promptText: string;
  variables: Record<string, any>;
  examples: Record<string, any>;
  useCase: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  rating?: number;
  usageCount: number;
  successRate?: number;
  version: string;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
}

interface SystemPromptSectionProps {
  agentRole: string;
  systemPrompt: string;
  useSystemPrompt: boolean;
  onSystemPromptChange: (prompt: string) => void;
  onUseSystemPromptChange: (use: boolean) => void;
  className?: string;
}

export const SystemPromptSection: React.FC<SystemPromptSectionProps> = ({
  agentRole,
  systemPrompt,
  useSystemPrompt,
  onSystemPromptChange,
  onUseSystemPromptChange,
  className
}) => {
  const [activeTab, setActiveTab] = useState('generated');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [customPrompt, setCustomPrompt] = useState(systemPrompt);
  const [libraryPrompts, setLibraryPrompts] = useState<PromptLibraryItem[]>([]);
  const [mcpPrompts, setMcpPrompts] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isLoadingMcp, setIsLoadingMcp] = useState(false);
  const [selectedMcpCategory, setSelectedMcpCategory] = useState<string>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [savePromptName, setSavePromptName] = useState('');
  const [savePromptDescription, setSavePromptDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<PromptLibraryItem | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  // Generate role-based prompt - Use the actual system prompt from your working implementation
  const generateRoleBasedPrompt = useCallback((role: string): string => {
    // Use the actual system prompt that's passed in (the 6160-character template content)
    return systemPrompt || '';
  }, [systemPrompt]);

  // Generate MCP role-based prompt preview
  useEffect(() => {
    if (agentRole && agentRole !== 'custom') {
      setIsGenerating(true);
      // Simulate prompt generation based on agent role
      setTimeout(() => {
        const roleBasedPrompt = generateRoleBasedPrompt(agentRole);
        setGeneratedPrompt(roleBasedPrompt);
        setIsGenerating(false);
      }, 500);
    } else {
      setGeneratedPrompt('');
    }
  }, [agentRole, generateRoleBasedPrompt]);

  // Load MCP prompts from embedded server
  useEffect(() => {
    // MCP prompts loading disabled - routes removed
    // These would come from the MCP server directly in the future
    setMcpPrompts([]);
    setIsLoadingMcp(false);
  }, [selectedMcpCategory]);

  // Load prompt library
  useEffect(() => {
    const loadPromptLibrary = async () => {
      setIsLoadingLibrary(true);
      try {
        const response = await fetch('/api/agent-templates/prompt-library?public=true');
        const result = await response.json();
        
        if (result.success) {
          // Transform the API response to match our interface
          const transformedPrompts: PromptLibraryItem[] = result.data.map((prompt: any) => ({
            id: prompt.id,
            name: prompt.name,
            description: prompt.description,
            category: prompt.category,
            promptText: prompt.promptText,
            variables: prompt.variables || {},
            examples: prompt.examples || {},
            useCase: prompt.useCase || '',
            complexity: prompt.complexity || 'MEDIUM',
            rating: undefined, // Not in our schema yet
            usageCount: prompt.usageCount || 0,
            successRate: undefined, // Not in our schema yet
            version: prompt.version || '1.0.0',
            tags: prompt.tags || [],
            isPublic: prompt.isPublic,
            createdAt: prompt.createdAt
          }));
          
          setLibraryPrompts(transformedPrompts);
        } else {
          // Failed to load prompt library
        }
      } catch (error) {
        // Error loading prompt library
      } finally {
        setIsLoadingLibrary(false);
      }
    };

    loadPromptLibrary();
  }, []);

  // Filter library prompts
  const filteredPrompts = libraryPrompts.filter(prompt => {
    const matchesSearch = !searchTerm || 
      prompt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = !selectedCategory || selectedCategory === 'all' || prompt.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = [...new Set(libraryPrompts.map(p => p.category))];
  const mcpCategories = ['GENERAL', 'ANALYSIS', 'AUTOMATION', 'MONITORING', 'REVIEW', 'DOCUMENTATION'];

  // Handle MCP prompt usage
  const handleUseMcpPrompt = async (prompt: any) => {
    // MCP prompt usage disabled - routes removed
    // This functionality would use the MCP server directly in the future
    // MCP prompt usage is currently disabled
  };

  // Handle prompt selection from library
  const handleSelectLibraryPrompt = (prompt: PromptLibraryItem) => {
    setCustomPrompt(prompt.promptText);
    onSystemPromptChange(prompt.promptText);
    setActiveTab('custom');
  };

  // Handle saving current prompt to library
  const handleSaveToLibrary = () => {
    if (!savePromptName.trim()) return;
    
    // In a real implementation, this would save to the AgentPromptLibrary
    
    setShowSaveDialog(false);
    setSavePromptName('');
    setSavePromptDescription('');
  };

  // Handle using generated prompt
  const handleUseGeneratedPrompt = () => {
    onSystemPromptChange(generatedPrompt);
    setCustomPrompt(generatedPrompt);
  };

  return (
    <div className={className}>
      <div className="space-y-4">
          {/* System Prompt Toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use-system-prompt"
              checked={useSystemPrompt}
              onCheckedChange={onUseSystemPromptChange}
            />
            <Label htmlFor="use-system-prompt">Use System Prompt</Label>
          </div>


          {useSystemPrompt && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="generated" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Generated
                </TabsTrigger>
                <TabsTrigger value="library" className="flex items-center gap-2">
                  <Library className="h-4 w-4" />
                  Library
                </TabsTrigger>
                <TabsTrigger value="custom" className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4" />
                  Custom
                </TabsTrigger>
              </TabsList>

              {/* Generated Prompt Tab */}
              <TabsContent value="generated" className="space-y-4">
                <div className="space-y-6">
                  {/* Role-Based Prompt Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>MCP Role-Based Prompt</Label>
                      {!isGenerating && generatedPrompt && (
                        <div className="flex gap-2">
                          <Button 
                            size="sm"
                            onClick={handleUseGeneratedPrompt}
                            disabled={isGenerating || !generatedPrompt}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Use This Prompt
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowSaveDialog(true)}
                            disabled={isGenerating || !generatedPrompt}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save to Library
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {agentRole && agentRole !== 'custom' ? (
                      <>
                        {isGenerating ? (
                          <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                            Generating prompt for {agentRole}...
                          </div>
                        ) : generatedPrompt ? (
                          <EnhancedPromptEditor
                            value={generatedPrompt}
                            onChange={() => {}} // Read-only, no changes allowed
                            placeholder="Generated system prompt will appear here..."
                            readOnly={true}
                            showToolbar={false}
                            showTemplates={false}
                            title={`Generated System Prompt for ${agentRole}`}
                          />
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No prompt generated yet</p>
                          </div>
                        )}
                        
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            This prompt is automatically generated based on your selected agent role: <strong>{agentRole}</strong>. 
                            It will be used by the MCP execution engine unless you override it with a custom prompt.
                          </AlertDescription>
                        </Alert>
                      </>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Select an agent role to generate a role-based system prompt, or use a custom role.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* MCP Contextual Prompts Section */}
                  <div className="space-y-3 border-t pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label>MCP Contextual Prompts</Label>
                        <Badge variant="secondary" className="text-xs">
                          Database-Driven
                        </Badge>
                      </div>
                      <Select value={selectedMcpCategory} onValueChange={setSelectedMcpCategory}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {mcpCategories.map(category => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {isLoadingMcp ? (
                      <div className="flex items-center justify-center gap-2 text-muted-foreground py-8">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        Loading MCP prompts...
                      </div>
                    ) : mcpPrompts.length > 0 ? (
                      <div className="grid gap-3">
                        {mcpPrompts.slice(0, 5).map((prompt, index) => (
                          <Card key={index} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-sm">{prompt.name}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    {prompt.metadata?.category || 'General'}
                                  </Badge>
                                  {prompt.metadata?.performance && (
                                    <div className="flex items-center gap-1">
                                      <Star className="h-3 w-3 text-yellow-500" />
                                      <span className="text-xs text-muted-foreground">
                                        {prompt.metadata.performance.rating}/5
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{prompt.description}</p>
                                
                                {prompt.metadata?.performance && (
                                  <div className="flex gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <TrendingUp className="h-3 w-3" />
                                      <span>{prompt.metadata.performance.usageCount} uses</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      <span>{prompt.metadata.performance.successRate}% success</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleUseMcpPrompt(prompt)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Use
                              </Button>
                            </div>
                          </Card>
                        ))}
                        
                        {mcpPrompts.length > 5 && (
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm">
                              Showing top 5 prompts. {mcpPrompts.length - 5} more available in the Library tab.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Library className="h-8 w-8 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No MCP prompts available</p>
                        <p className="text-xs">Check your MCP server connection</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Library Tab */}
              <TabsContent value="library" className="space-y-4">
                <div className="space-y-4">
                  {/* Search and Filter */}
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search prompts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Library Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map(category => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedMcpCategory} onValueChange={setSelectedMcpCategory}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="MCP Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All MCP</SelectItem>
                        {mcpCategories.map(category => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* MCP Prompts Section */}
                  {mcpPrompts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Library className="h-4 w-4" />
                        <Label className="font-medium">MCP Database Prompts</Label>
                        <Badge variant="secondary" className="text-xs">
                          {mcpPrompts.length} available
                        </Badge>
                      </div>
                      
                      <div className="grid gap-3 max-h-64 overflow-y-auto">
                        {mcpPrompts.map((prompt, index) => (
                          <Card key={`mcp-${index}`} className="p-3 hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-medium text-sm">{prompt.name}</h4>
                                  <Badge variant="outline" className="text-xs">
                                    {prompt.metadata?.category || 'General'}
                                  </Badge>
                                  {prompt.metadata?.performance && (
                                    <>
                                      <div className="flex items-center gap-1">
                                        <Star className="h-3 w-3 text-yellow-500" />
                                        <span className="text-xs text-muted-foreground">
                                          {prompt.metadata.performance.rating}/5
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3 text-green-500" />
                                        <span className="text-xs text-muted-foreground">
                                          {prompt.metadata.performance.usageCount} uses
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-blue-500" />
                                        <span className="text-xs text-muted-foreground">
                                          {prompt.metadata.performance.successRate}% success
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{prompt.description}</p>
                                
                                {prompt.metadata?.tags && prompt.metadata.tags.length > 0 && (
                                  <div className="flex gap-1 flex-wrap">
                                    {prompt.metadata.tags.slice(0, 3).map((tag: string, tagIndex: number) => (
                                      <Badge key={tagIndex} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1 ml-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleUseMcpPrompt(prompt)}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Use
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => {/* Could implement preview */}}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Library Prompts Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Library className="h-4 w-4" />
                      <Label className="font-medium">User Prompt Library</Label>
                      <Badge variant="secondary" className="text-xs">
                        {filteredPrompts.length} available
                      </Badge>
                    </div>
                  </div>

                  {/* Prompt Library List */}
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {isLoadingLibrary ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                        <span className="ml-2">Loading prompt library...</span>
                      </div>
                    ) : filteredPrompts.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Library className="h-8 w-8 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No prompts found</p>
                      </div>
                    ) : (
                      filteredPrompts.map(prompt => (
                        <div key={prompt.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium">{prompt.name}</h4>
                              <p className="text-sm text-muted-foreground">{prompt.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {prompt.rating && (
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-primary text-primary" />
                                  <span className="text-xs">{prompt.rating}</span>
                                </div>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {prompt.category}
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {prompt.usageCount} uses
                            </div>
                            {prompt.successRate && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {prompt.successRate}% success
                              </div>
                            )}
                            <div>v{prompt.version}</div>
                          </div>

                          <div className="flex flex-wrap gap-1 mb-3">
                            {prompt.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleSelectLibraryPrompt(prompt)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Use Prompt
                            </Button>
                            <div className="flex items-center gap-2">
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setPreviewPrompt(prompt);
                                  setShowPreviewDialog(true);
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Preview
                              </Button>
                              {showPreviewDialog && previewPrompt?.id === prompt.id && (
                                <span className="text-xs text-muted-foreground">
                                  ↓ Preview below
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Custom Tab */}
              <TabsContent value="custom" className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="custom-prompt">Custom System Prompt</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowSaveDialog(true)}
                      disabled={!customPrompt?.trim()}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save to Library
                    </Button>
                  </div>
                  <EnhancedPromptEditor
                    value={customPrompt}
                    onChange={(value) => {
                      setCustomPrompt(value);
                      onSystemPromptChange(value);
                    }}
                    placeholder="Enter your custom system prompt..."
                    readOnly={false}
                    showToolbar={true}
                    showTemplates={true}
                    title="Custom System Prompt"
                  />
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Custom prompts override MCP role-based prompts.</strong> This will be used instead 
                      of the automatically generated prompt for your selected agent role.
                    </AlertDescription>
                  </Alert>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Save to Library Dialog */}
          {showSaveDialog && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-medium mb-3">Save Prompt to Library</h4>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="save-name">Prompt Name</Label>
                  <Input
                    id="save-name"
                    value={savePromptName}
                    onChange={(e) => setSavePromptName(e.target.value)}
                    placeholder="Enter prompt name..."
                  />
                </div>
                <div>
                  <Label htmlFor="save-description">Description</Label>
                  <Input
                    id="save-description"
                    value={savePromptDescription}
                    onChange={(e) => setSavePromptDescription(e.target.value)}
                    placeholder="Brief description of this prompt..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveToLibrary} disabled={!savePromptName.trim()}>
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Preview Dialog */}
          {showPreviewDialog && previewPrompt && (
            <div className="border-2 border-primary rounded-lg p-4 bg-background shadow-lg mt-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-medium">{previewPrompt.name}</h4>
                  <p className="text-sm text-muted-foreground">{previewPrompt.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {previewPrompt.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-primary text-primary" />
                      <span className="text-xs">{previewPrompt.rating}</span>
                    </div>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {previewPrompt.category}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Prompt Text</Label>
                  <div className="bg-background border rounded-lg p-3 mt-1">
                    <p className="text-sm whitespace-pre-wrap">{previewPrompt.promptText}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Use Case</Label>
                    <p className="text-xs">{previewPrompt.useCase}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Complexity</Label>
                    <Badge variant="secondary" className="text-xs">
                      {previewPrompt.complexity}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {previewPrompt.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button 
                    size="sm" 
                    onClick={() => {
                      handleSelectLibraryPrompt(previewPrompt);
                      setShowPreviewDialog(false);
                      setPreviewPrompt(null);
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Use This Prompt
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setShowPreviewDialog(false);
                      setPreviewPrompt(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default SystemPromptSection;
