"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Bot, Search, Filter, Plus, Edit, Trash2, Eye, AlertCircle } from 'lucide-react';
import { AgentTemplateCard } from '@/components/agent-templates/AgentTemplateCard';
// Removed direct service import to avoid Node.js modules in client bundle
// import { AgentTemplateBuilderService } from '@/lib/services/agentTemplateBuilder/agentTemplateBuilderService';

/**
 * Agent Templates Tab Component
 * 
 * Displays real agent templates with management functionality.
 * Replaces "Coming Soon" content with actual template list, search, and CRUD operations.
 */
export function AgentTemplatesTab() {
  const router = useRouter();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const filters = {
        search: searchQuery || undefined,
        category: selectedCategory && selectedCategory !== 'all' ? selectedCategory : undefined,
        status: selectedStatus && selectedStatus !== 'all' ? selectedStatus : undefined,
        includeMetrics: true
      };
      
      // Use API call instead of direct service import
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.category) params.set('category', filters.category);
      if (filters.status) params.set('status', filters.status);
      if (filters.includeMetrics) params.set('includeMetrics', 'true');
      
      const response = await fetch(`/api/agent-templates?${params}`);
      const result = await response.json();
      
      if (result.success) {
        setTemplates(result.data?.templates || []);
      } else {
        setError(result.error || 'Failed to load templates');
      }
    } catch (err) {
      // Could not load templates
      setError('Failed to load templates. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, selectedStatus]);

  // Load templates on component mount and when filters change
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreateAgentTemplate = () => {
    router.push('/admin/templates/agent?action=new');
  };

  const handleEditTemplate = (templateId: string) => {
    router.push(`/admin/templates/agent/${templateId}?action=edit`);
  };

  const handleViewTemplate = (templateId: string) => {
    router.push(`/admin/templates/agent/${templateId}?action=view`);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      // Use API call instead of direct service import
      const response = await fetch(`/api/agent-templates/${templateId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete template');
      }
      
      await loadTemplates(); // Refresh the list
    } catch (err) {
      // Could not delete template
      alert('Failed to delete template. Please try again.');
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedStatus('');
  };

  const categories = [
    { value: 'GENERAL', label: 'General' },
    { value: 'DATA_PROCESSING', label: 'Data Processing' },
    { value: 'COMMUNICATION', label: 'Communication' },
    { value: 'ANALYSIS', label: 'Analysis' },
    { value: 'AUTOMATION', label: 'Automation' }
  ];

  const statuses = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ARCHIVED', label: 'Archived' }
  ];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Agent Templates</h2>
          <p className="text-muted-foreground mt-1">
            Manage AI agent configuration templates for automated tasks
          </p>
        </div>
        <Button onClick={handleCreateAgentTemplate} className="flex items-center">
          <Plus className="h-4 w-4 mr-2" />
          Create Agent Template
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
                  placeholder="Search templates by name or description..."
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

            {/* Status Filter */}
            <div className="w-full md:w-32">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filter Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadTemplates} disabled={loading}>
                <Filter className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              {(searchQuery || selectedCategory || selectedStatus) && (
                <Button variant="ghost" onClick={handleClearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchQuery || selectedCategory || selectedStatus) && (
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
              {selectedStatus && (
                <Badge variant="secondary">
                  Status: {statuses.find(s => s.value === selectedStatus)?.label}
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
              <Button variant="outline" size="sm" onClick={loadTemplates}>
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
            <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
            <p className="text-muted-foreground">Loading templates...</p>
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      {!loading && !error && (
        <>
          {templates.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {template.description || 'No description provided'}
                        </CardDescription>
                      </div>
                      <Badge variant={template.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {template.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {/* Template Info */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Category:</span>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                      
                      {/* Usage Stats */}
                      {template.usageCount !== undefined && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Usage:</span>
                          <span>{template.usageCount} times</span>
                        </div>
                      )}

                      {/* Success Rate */}
                      {template.successRate !== undefined && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Success Rate:</span>
                          <span>{Math.round(template.successRate * 100)}%</span>
                        </div>
                      )}

                      {/* Created Date */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Created:</span>
                        <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewTemplate(template.id)}
                          className="flex-1"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditTemplate(template.id)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteTemplate(template.id)}
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
                <Bot className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No agent templates found</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {searchQuery || selectedCategory || selectedStatus
                    ? "No templates match your current filters. Try adjusting your search criteria."
                    : "Get started by creating your first agent template. Templates help you standardize and reuse agent configurations."
                  }
                </p>
                <div className="space-y-2">
                  <Button onClick={handleCreateAgentTemplate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Agent Template
                  </Button>
                  {(searchQuery || selectedCategory || selectedStatus) && (
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
      {!loading && !error && templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Template Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">{templates.length}</div>
                <div className="text-sm text-muted-foreground">Total Templates</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {templates.filter(t => t.status === 'ACTIVE').length}
                </div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {templates.filter(t => t.status === 'DRAFT').length}
                </div>
                <div className="text-sm text-muted-foreground">Draft</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {templates.reduce((sum, t) => sum + (t.usageCount || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Total Usage</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AgentTemplatesTab;
