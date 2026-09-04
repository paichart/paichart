"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { useTemplateContext } from './context/TemplateContext';
import { TemplatePreview } from '@/components/admin/templates/TemplatePreview';
import { TemplateRelationshipGraphWrapper } from '@/components/admin/templates/relationships/TemplateRelationshipGraphWrapper';
import { templateService } from '@/lib/services/template-service';

// Import our new shared components
import {
  TemplateViewToggle,
  TemplateFilters,
  TemplateCard,
  TemplateTable,
  BulkActions
} from './shared';

interface POVTemplatesTabProps {
  onCreateTemplate?: () => void;
}

export function POVTemplatesTab({ onCreateTemplate }: POVTemplatesTabProps) {
  const router = useRouter();
  
  // View and interaction state
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  
  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<'compact' | 'detailed'>('detailed');
  
  // Filtered and sorted templates
  const [filteredTemplates, setFilteredTemplates] = useState<any[]>([]);
  
  // Track if we've already triggered the fetch
  const [fetchTriggered, setFetchTriggered] = useState(false);
  
  // Track if we've already processed deep link params
  const deepLinkProcessedRef = useRef(false);
  
  const { 
    povTemplates, 
    loadingPOVTemplates, 
    povTemplatesError, 
    fetchPOVTemplates,
    updateDeepLinkParams,
    deepLinkParams,
    showToast
  } = useTemplateContext();

  // Define filter options for POV templates
  const filterOptions = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'deprecated', label: 'Deprecated' }
      ]
    }
  ];

  // Filter and sort templates when dependencies change
  useEffect(() => {
    if (povTemplates.length === 0) {
      setFilteredTemplates([]);
      return;
    }
    
    let result = [...povTemplates];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(template => 
        template.name.toLowerCase().includes(query) || 
        template.description.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (activeFilters.status && activeFilters.status !== 'all') {
      result = result.filter(template => template.status === activeFilters.status);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'sections':
          comparison = a.sections.length - b.sections.length;
          break;
        case 'fields':
          comparison = Object.keys(a.fields).length - Object.keys(b.fields).length;
          break;
        case 'updatedAt':
          // Use createdAt or id as fallback since updatedAt might not exist on POVTemplate
          const aDate = (a as any).updatedAt || (a as any).createdAt || a.id;
          const bDate = (b as any).updatedAt || (b as any).createdAt || b.id;
          
          if (typeof aDate === 'string' && typeof bDate === 'string') {
            if (aDate.includes('-') && bDate.includes('-')) {
              // Assume date strings
              comparison = new Date(aDate).getTime() - new Date(bDate).getTime();
            } else {
              // Fallback to string comparison
              comparison = aDate.localeCompare(bDate);
            }
          } else {
            comparison = 0;
          }
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    setFilteredTemplates(result);
  }, [povTemplates, searchQuery, activeFilters, sortField, sortDirection]);

  // Handle create template
  const handleCreateTemplate = useCallback(() => {
    updateDeepLinkParams({
      action: 'new',
      templateType: 'pov'
    });
    
    router.push('/admin/templates/pov?action=new');
  }, [router, updateDeepLinkParams]);
  
  // Handle edit template
  const handleEditTemplate = useCallback((template: any) => {
    updateDeepLinkParams({
      templateId: template.id,
      action: 'edit',
      templateType: 'pov'
    });
    
    router.push(`/admin/templates/pov?action=edit&templateId=${template.id}`);
  }, [router, updateDeepLinkParams]);
  
  // Handle preview template
  const handlePreviewTemplate = useCallback(async (template: any) => {
    try {
      updateDeepLinkParams({
        templateId: template.id,
        action: 'preview',
        templateType: 'pov'
      });
      
      const templateData = await templateService.getTemplate(template.id, 'pov');

      if (!templateData) {
        throw new Error('Failed to fetch template details');
      }

      setPreviewTemplate(templateData);
      setShowPreview(true);
      
      // Update URL without navigation
      const url = new URL(window.location.href);
      url.searchParams.set('templateId', template.id);
      url.searchParams.set('action', 'preview');
      url.searchParams.set('templateType', 'pov');
      window.history.pushState({}, '', url);
    } catch (err) {
      // Could not fetch template details
      showToast('Failed to load template details for preview', 'error');
    }
  }, [updateDeepLinkParams, showToast]);

  // Handle delete template
  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/pov-templates/${templateId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to delete template';
        
        if (response.status === 400 && errorMessage.includes('being used')) {
          throw new Error('This template cannot be deleted because it is being used by one or more POVs.');
        } else {
          throw new Error(errorMessage);
        }
      }
      
      // Remove from selection if selected
      setSelectedTemplateIds(prev => prev.filter(id => id !== templateId));
      
      showToast('Template deleted successfully', 'success');
      fetchPOVTemplates(true);
    } catch (err: any) {
      // Could not delete template
      showToast(err.message || 'Failed to delete template', 'error');
    }
  };

  // Handle bulk export
  const handleBulkExport = async (templateIds: string[]) => {
    try {
      const response = await fetch('/api/pov-templates/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ templateIds })
      });
      
      if (!response.ok) {
        throw new Error('Failed to export templates');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pov-templates-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast('Templates exported successfully', 'success');
    } catch (err) {
      // Could not export templates
      showToast('Failed to export templates', 'error');
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async (templateIds: string[]) => {
    try {
      const deletePromises = templateIds.map(id => 
        fetch(`/api/pov-templates/${id}`, { method: 'DELETE' })
      );
      
      const responses = await Promise.all(deletePromises);
      const failedDeletes = responses.filter(response => !response.ok);
      
      if (failedDeletes.length > 0) {
        throw new Error(`Failed to delete ${failedDeletes.length} template(s)`);
      }
      
      setSelectedTemplateIds([]);
      showToast(`${templateIds.length} template(s) deleted successfully`, 'success');
      fetchPOVTemplates(true);
    } catch (err) {
      // Could not delete templates
      showToast('Failed to delete some templates', 'error');
    }
  };

  // Handle sort change
  const handleSortChange = (field: string, direction: 'asc' | 'desc') => {
    setSortField(field);
    setSortDirection(direction);
  };

  // Process deep linking parameters
  useEffect(() => {
    if (deepLinkProcessedRef.current || !deepLinkParams || !deepLinkParams.action) {
      return;
    }
    
    deepLinkProcessedRef.current = true;
    
    if (!deepLinkParams.templateType || deepLinkParams.templateType === 'pov') {
      if (deepLinkParams.action === 'new') {
        handleCreateTemplate();
      } else if (deepLinkParams.templateId && (deepLinkParams.action === 'preview' || deepLinkParams.action === 'edit')) {
        setTimeout(() => {
          if (povTemplates.length > 0) {
            const template = povTemplates.find(t => t.id === deepLinkParams.templateId);
            if (template) {
              if (deepLinkParams.action === 'preview') {
                handlePreviewTemplate(template);
              } else {
                handleEditTemplate(template);
              }
            }
          }
        }, 500);
      }
    }
  }, [deepLinkParams, povTemplates, handleCreateTemplate, handleEditTemplate, handlePreviewTemplate]);

  // Fetch templates on component mount
  useEffect(() => {
    if (!fetchTriggered) {
      fetchPOVTemplates(false);
      setFetchTriggered(true);
    }
  }, [fetchPOVTemplates, fetchTriggered]);

  if (loadingPOVTemplates && povTemplates.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (povTemplatesError) {
    return (
      <div className="text-center p-8">
        <p className="text-destructive mb-4">{povTemplatesError}</p>
        <Button onClick={() => fetchPOVTemplates(true)}>Retry</Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">POV Templates</h2>
          <Button onClick={handleCreateTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            Create New Template
          </Button>
        </div>
        
        {/* View toggle and filters */}
        <div className="flex justify-between items-start mb-6">
          <TemplateViewToggle
            currentView={viewMode}
            onViewChange={setViewMode}
          />
        </div>

        <TemplateFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          filterOptions={filterOptions}
          activeFilters={activeFilters}
          onFilterChange={setActiveFilters}
          templateType="pov"
        />

        {/* Bulk actions (only show in table view) */}
        {viewMode === 'table' && (
          <BulkActions
            selectedIds={selectedTemplateIds}
            templateType="pov"
            onExport={handleBulkExport}
            onDelete={handleBulkDelete}
            onClearSelection={() => setSelectedTemplateIds([])}
          />
        )}
        
        {/* Templates display */}
        {viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                templateType="pov"
                onPreview={handlePreviewTemplate}
                onEdit={handleEditTemplate}
                onDelete={handleDeleteTemplate}
                showSelection={false}
              />
            ))}
          </div>
        ) : (
          <TemplateTable
            templates={filteredTemplates}
            templateType="pov"
            selectedIds={selectedTemplateIds}
            onSelectionChange={setSelectedTemplateIds}
            onPreview={handlePreviewTemplate}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={(field) => handleSortChange(field, sortField === field && sortDirection === 'asc' ? 'desc' : 'asc')}
          />
        )}

        {filteredTemplates.length === 0 && !loadingPOVTemplates && (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery || Object.keys(activeFilters).length > 0
              ? 'No templates match your search criteria.'
              : 'No POV templates available. Create your first template to get started.'}
          </div>
        )}
      </div>
      
      {/* Preview Template Dialog */}
      <Dialog open={showPreview} onOpenChange={(open) => {
        setShowPreview(open);
        if (!open) {
          updateDeepLinkParams({});
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" aria-describedby="template-preview-description">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription id="template-preview-description">
              Preview the template structure and content
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="details" className="mt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="relationships">Relationships</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details">
              <div className="mb-4 flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  {previewTemplate?.name}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant={previewMode === 'compact' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewMode('compact')}
                  >
                    Compact
                  </Button>
                  <Button
                    variant={previewMode === 'detailed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewMode('detailed')}
                  >
                    Detailed
                  </Button>
                </div>
              </div>
              
              <TemplatePreview
                template={previewTemplate}
                compact={previewMode === 'compact'}
              />
            </TabsContent>
            
            <TabsContent value="relationships">
              <div className="mb-4">
                <h3 className="text-lg font-medium mb-2">Template Relationships</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  This visualization shows how this POV template relates to Phase templates.
                </p>
                
                <TemplateRelationshipGraphWrapper
                  initialFilter={{
                    templateId: previewTemplate?.id,
                    templateType: 'pov'
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default POVTemplatesTab;
