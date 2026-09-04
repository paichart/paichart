"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { MessageSquare, Search, Filter, Plus, Edit, Trash2, Eye, AlertCircle, Tag, Globe, Copy } from 'lucide-react';
import { DomainPromptWizard } from './prompts/DomainPromptWizard';
import { toast } from '@/lib/hooks/useToast';
import { EventSystemStatus } from '@/components/admin/EventSystemStatus';

/**
 * Prompt Library Tab Component
 * 
 * Displays AgentPromptLibrary entries with management functionality.
 * Provides domain-specific prompt management with MCP tagging.
 */
export function PromptLibraryTab() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [mcpOnly, setMcpOnly] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const filters = {
        search: searchQuery || undefined,
        category: selectedCategory && selectedCategory !== 'all' ? selectedCategory : undefined,
        domain: selectedDomain && selectedDomain !== 'all' ? selectedDomain : undefined,
        mcpOnly: mcpOnly,
        includeUsage: true
      };
      
      // Use API call to prompt library endpoint
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.domain) params.set('domain', filters.domain);
      if (filters.mcpOnly) params.set('mcpOnly', 'true');
      if (filters.includeUsage) params.set('includeUsage', 'true');
      
      const response = await fetch(`/api/agent-templates/prompt-library?${params}`, {
        credentials: 'include' // Ensure cookies are sent for authentication
      });
      const result = await response.json();
      
      if (result.success) {
        setPrompts(result.data || []);
      } else {
        setError(result.error || 'Failed to load prompts');
      }
    } catch (err) {
      // Could not load prompts
      setError('Failed to load prompts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedDomain, mcpOnly]);

  // Load prompts on component mount and when filters change
  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleCreatePrompt = () => {
    setWizardOpen(true);
  };

  const handleWizardComplete = async (promptData: any) => {
    try {
      const response = await fetch('/api/agent-templates/prompt-library', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(promptData),
        credentials: 'include' // Ensure cookies are sent for authentication
      });

      const result = await response.json();

      if (result.success) {
        setWizardOpen(false);
        await loadPrompts(); // Refresh the list

        // Show success toast
        toast({
          title: 'Prompt created successfully',
          description: `"${result.data.name}" is now available in the prompt library`,
          variant: 'success',
        });

        // Navigate to the newly created prompt
        router.push(`/admin/templates/prompts/${result.data.id}?action=view`);
      } else {
        // DON'T close wizard on error - let user fix validation issues
        const errorMessage = typeof result.error === 'string'
          ? result.error
          : result.error?.message || 'Validation failed';

        // Failed to create prompt

        // Show error toast
        toast({
          title: 'Failed to create prompt',
          description: errorMessage,
          variant: 'destructive',
        });
        // Wizard stays open, data preserved
      }
    } catch (err) {
      // Failed to create prompt

      // Show error toast for network errors
      toast({
        title: 'Error creating prompt',
        description: err instanceof Error ? err.message : 'Unknown error occurred',
        variant: 'destructive',
      });
      // Wizard stays open on network errors too
    }
  };

  const handleEditPrompt = (promptId: string) => {
    router.push(`/admin/templates/prompts/${promptId}?action=edit`);
  };

  const handleViewPrompt = (promptId: string) => {
    router.push(`/admin/templates/prompts/${promptId}?action=view`);
  };

  const handleClonePrompt = async (promptId: string) => {
    try {
      // Fetch the original prompt
      const response = await fetch(`/api/agent-templates/prompt-library/${promptId}`, {
        credentials: 'include' // Ensure cookies are sent for authentication
      });
      const result = await response.json();

      if (!result.success || !result.data) {
        throw new Error('Failed to fetch prompt for cloning');
      }

      const original = result.data;

      // Create clone with modified name
      const cloneData = {
        name: `${original.name}_copy_${Date.now()}`,
        description: `Clone of: ${original.description}`,
        category: original.category,
        promptText: original.promptText,
        variables: original.variables,
        examples: original.examples,
        useCase: original.useCase,
        complexity: original.complexity,
        estimatedTime: original.estimatedTime,
        tags: original.tags,
        isPublic: original.isPublic,
        status: 'DRAFT' // Clones start as drafts
      };

      const createResponse = await fetch('/api/agent-templates/prompt-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Ensure cookies are sent for authentication
        body: JSON.stringify(cloneData),
      });

      const createResult = await createResponse.json();

      if (createResult.success) {
        toast({
          title: 'Prompt cloned successfully',
          description: `Clone created as "${cloneData.name}". Edit to customize.`,
          variant: 'success',
        });

        await loadPrompts();
        router.push(`/admin/templates/prompts/${createResult.data.id}?action=edit`);
      } else {
        throw new Error(createResult.error || 'Failed to create clone');
      }
    } catch (err) {
      // Failed to clone prompt
      toast({
        title: 'Failed to clone prompt',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) {
      return;
    }

    try {
      const response = await fetch(`/api/agent-templates/prompt-library/${promptId}`, {
        method: 'DELETE',
        credentials: 'include' // Ensure cookies are sent for authentication
      });
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete prompt');
      }

      // Show success toast
      toast({
        title: 'Prompt deleted',
        description: 'The prompt has been removed from the library',
        variant: 'success',
      });

      await loadPrompts(); // Refresh the list
    } catch (err) {
      // Failed to delete prompt

      // Show error toast
      toast({
        title: 'Failed to delete prompt',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedDomain('');
    setMcpOnly(false);
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

  const domains = [
    { value: 'general', label: 'General' },
    { value: 'devops', label: 'DevOps' },
    { value: 'education', label: 'Education' },
    { value: 'medical', label: 'Medical' },
    { value: 'finance', label: 'Finance' },
    { value: 'legal', label: 'Legal' }
  ];

  const extractDomainFromTags = (tags: string[]) => {
    const domainTag = tags?.find(tag => tag.startsWith('domain:'));
    return domainTag ? domainTag.replace('domain:', '') : 'general';
  };

  const isMcpPrompt = (tags: string[]) => {
    return tags?.includes('mcp') || false;
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Prompt Library</h2>
            <EventSystemStatus system="prompt-registry" showLabel={true} />
          </div>
          <p className="text-muted-foreground mt-1">
            Manage domain-specific prompts for MCP integration and workflow guidance
          </p>
        </div>
        <Button onClick={handleCreatePrompt} className="flex items-center">
          <Plus className="h-4 w-4 mr-2" />
          Create Prompt
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search prompts by name, description, or use case..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="w-full md:w-48">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
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
            </div>

            {/* Domain Filter */}
            <div className="w-full md:w-40">
              <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                <SelectTrigger>
                  <SelectValue placeholder="All Domains" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {domains.map((domain) => (
                    <SelectItem key={domain.value} value={domain.value}>
                      {domain.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* MCP Filter */}
            <div className="w-full md:w-32">
              <Select value={mcpOnly.toString()} onValueChange={(value) => setMcpOnly(value === 'true')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">MCP Only</SelectItem>
                  <SelectItem value="false">All Prompts</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filter Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadPrompts} disabled={loading}>
                <Filter className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              {(searchQuery || selectedCategory || selectedDomain || mcpOnly) && (
                <Button variant="ghost" onClick={handleClearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchQuery || selectedCategory || selectedDomain || mcpOnly) && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
              {searchQuery && (
                <Badge variant="secondary">
                  Search: {searchQuery}
                </Badge>
              )}
              {selectedCategory && (
                <Badge variant="secondary">
                  Category: {categories.find(c => c.value === selectedCategory)?.label}
                </Badge>
              )}
              {selectedDomain && (
                <Badge variant="secondary">
                  Domain: {domains.find(d => d.value === selectedDomain)?.label}
                </Badge>
              )}
              {mcpOnly && (
                <Badge variant="secondary">
                  MCP-enabled prompts only
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadPrompts}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
            <p className="text-muted-foreground">Loading prompts...</p>
          </CardContent>
        </Card>
      )}

      {/* Prompts List */}
      {!loading && !error && (
        <>
          {prompts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {prompts.map((prompt) => (
                <Card key={prompt.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{prompt.name}</CardTitle>
                          {isMcpPrompt(prompt.tags) && (
                            <Badge variant="outline" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              MCP
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1">
                          {prompt.description || 'No description provided'}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {/* Category and Domain */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Category:</span>
                        <Badge variant="outline">{prompt.category}</Badge>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Domain:</span>
                        <div className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          <Badge variant="secondary">
                            {extractDomainFromTags(prompt.tags)}
                          </Badge>
                        </div>
                      </div>

                      {/* Use Case */}
                      {prompt.useCase && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Use Case:</span>
                          <p className="text-xs mt-1 text-foreground/80 line-clamp-2">
                            {prompt.useCase}
                          </p>
                        </div>
                      )}
                      
                      {/* Usage Stats */}
                      {prompt.usageCount !== undefined && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Usage:</span>
                          <span>{prompt.usageCount} times</span>
                        </div>
                      )}

                      {/* Rating */}
                      {prompt.rating !== undefined && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Rating:</span>
                          <span>{prompt.rating ? `${prompt.rating.toFixed(1)}/5` : 'No rating'}</span>
                        </div>
                      )}

                      {/* Tags */}
                      {prompt.tags && prompt.tags.length > 0 && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Tags:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {prompt.tags.slice(0, 3).map((tag: string) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {prompt.tags.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{prompt.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPrompt(prompt.id)}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClonePrompt(prompt.id)}
                          className="flex-1"
                          title="Clone this prompt to create a customizable copy"
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          Clone
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditPrompt(prompt.id)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePrompt(prompt.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            /* Empty State */
            <Card>
              <CardContent className="text-center py-12">
                <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No prompts found</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {searchQuery || selectedCategory || selectedDomain || mcpOnly
                    ? "No prompts match your current filters. Try adjusting your search criteria."
                    : "Get started by creating your first domain-specific prompt. Prompts help guide AI workflows and provide standardized responses."
                  }
                </p>
                <div className="space-y-2">
                  <Button onClick={handleCreatePrompt}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Prompt
                  </Button>
                  {(searchQuery || selectedCategory || selectedDomain || mcpOnly) && (
                    <div>
                      <Button variant="outline" onClick={handleClearFilters}>
                        Clear Filters
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Summary Stats */}
      {!loading && !error && prompts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prompt Library Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">{prompts.length}</div>
                <div className="text-sm text-muted-foreground">Total Prompts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {prompts.filter(p => isMcpPrompt(p.tags)).length}
                </div>
                <div className="text-sm text-muted-foreground">MCP Enabled</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {new Set(prompts.map(p => extractDomainFromTags(p.tags))).size}
                </div>
                <div className="text-sm text-muted-foreground">Domains</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {prompts.reduce((sum, p) => sum + (p.usageCount || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Total Usage</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domain Prompt Wizard */}
      <DomainPromptWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={handleWizardComplete}
        domains={domains.map(d => d.value)}
        categories={categories.map(c => c.value)}
      />
    </div>
  );
}

export default PromptLibraryTab;