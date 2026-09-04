"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { ImportExportButtons } from '@/components/admin/templates/phase/ImportExportButtons';
import { FormatDocumentationLink } from '@/components/admin/templates/phase/FormatDocumentationLink';
import { TemplatePreview } from '@/components/admin/templates/TemplatePreview';
import { useTemplateContext } from './context/TemplateContext';
import { templateService } from '@/lib/services/template-service';

// Import our new shared components
import {
  TemplateViewToggle,
  TemplateFilters,
  TemplateCard,
  TemplateTable,
  BulkActions
} from './shared';

/**
 * PhaseTemplatesTab - Displays and manages phase templates with unified UI
 * 
 * Updated to use shared components for consistent look and feel with POV templates.
 * Features: Card/Table view toggle, Search, Filter, Sort, Bulk operations
 */
export function PhaseTemplatesTab() {
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
  
  // Get context values
  const {
    phaseTemplates,
    loadingPhaseTemplates,
    phaseTemplatesError,
    fetchPhaseTemplates,
    deepLinkParams,
    updateDeepLinkParams,
    showToast
  } = useTemplateContext();

  // Define filter options for phase templates
  const filterOptions = [
    {
      key: 'type',
      label: 'Type',
      options: [
        { value: 'PLANNING', label: 'Planning' },
        { value: 'EXECUTION', label: 'Execution' },
        { value: 'REVIEW', label: 'Review' }
      ]
    },
    {
      key: 'isDefault',
      label: 'Status',
      options: [
        { value: 'true', label: 'Default' },
        { value: 'false', label: 'Custom' }
      ]
    }
  ];

  // Filter and sort templates when dependencies change
  useEffect(() => {
    if (phaseTemplates.length === 0) {
      setFilteredTemplates([]);
      return;
    }
    
    let result = [...phaseTemplates];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(template => 
        template.name.toLowerCase().includes(query) || 
        template.description?.toLowerCase().includes(query)
      );
    }
    
    // Apply filters
    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        if (key === 'type') {
          result = result.filter(template => template.type === value);
        } else if (key === 'isDefault') {
          result = result.filter(template => template.isDefault === (value === 'true'));
        }
      }
    });
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'stages':
          comparison = (a.stages?.length || 0) - (b.stages?.length || 0);
          break;
        case 'tasks':
          const aTaskCount = a.stages?.reduce((acc: number, stage: any) => 
            acc + (stage.tasks?.length || 0), 0) || 0;
          const bTaskCount = b.stages?.reduce((acc: number, stage: any) => 
            acc + (stage.tasks?.length || 0), 0) || 0;
          comparison = aTaskCount - bTaskCount;
          break;
        case 'agents':
          const aAgentCount = a.stages?.reduce((acc: number, stage: any) => 
            acc + (stage.tasks?.filter((task: any) => task.agentRole).length || 0), 0) || 0;
          const bAgentCount = b.stages?.reduce((acc: number, stage: any) => 
            acc + (stage.tasks?.filter((task: any) => task.agentRole).length || 0), 0) || 0;
          comparison = aAgentCount - bAgentCount;
          break;
        case 'updatedAt':
          const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          comparison = aDate - bDate;
          break;
        default:
          comparison = 0;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    setFilteredTemplates(result);
  }, [phaseTemplates, searchQuery, activeFilters, sortField, sortDirection]);

  // Handle template editing
  const handleEditTemplate = useCallback((template: any) => {
    updateDeepLinkParams({
      templateId: template.id,
      action: 'edit',
      templateType: 'phase'
    });
    
    router.push(`/admin/templates/phase?action=edit&templateId=${template.id}`);
  }, [updateDeepLinkParams, router]);
  
  // Handle template preview
  const handlePreviewTemplate = useCallback(async (template: any) => {
    try {
      updateDeepLinkParams({
        templateId: template.id,
        action: 'preview',
        templateType: 'phase'
      });
      
      const templateData = await templateService.getTemplate(template.id, 'phase');

      if (!templateData) {
        throw new Error('Failed to fetch template details');
      }

      setPreviewTemplate(templateData);
      setShowPreview(true);
    } catch (err) {
      // Could not fetch template details
      showToast('Failed to load template details for preview', 'error');
    }
  }, [updateDeepLinkParams, showToast]);

  // Handle template deletion
  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/phase-templates/${templateId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to delete phase template';
        
        if (response.status === 400 && errorMessage.includes('used by POVs')) {
          throw new Error('This template cannot be deleted because it is being used by one or more POVs.');
        } else {
          throw new Error(errorMessage);
        }
      }
      
      // Clear deep link parameters if they reference this template
      if (deepLinkParams && deepLinkParams.templateId === templateId) {
        updateDeepLinkParams({});
      }
      
      // Remove from selection if selected
      setSelectedTemplateIds(prev => prev.filter(id => id !== templateId));
      
      showToast('Phase template deleted successfully', 'success');
      fetchPhaseTemplates(true);
    } catch (err: any) {
      // Could not delete phase template
      showToast(err.message || 'Failed to delete phase template', 'error');
    }
  };

  // Handle bulk export
  const handleBulkExport = async (templateIds: string[]) => {
    try {
      const response = await fetch('/api/phase-templates/export', {
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
      a.download = `phase-templates-${new Date().toISOString().split('T')[0]}.json`;
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
        fetch(`/api/phase-templates/${id}`, { method: 'DELETE' })
      );
      
      const responses = await Promise.all(deletePromises);
      const failedDeletes = responses.filter(response => !response.ok);
      
      if (failedDeletes.length > 0) {
        throw new Error(`Failed to delete ${failedDeletes.length} template(s)`);
      }
      
      setSelectedTemplateIds([]);
      showToast(`${templateIds.length} template(s) deleted successfully`, 'success');
      fetchPhaseTemplates(true);
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
    
    if (!deepLinkParams.templateType || deepLinkParams.templateType === 'phase') {
      if (deepLinkParams.action === 'new') {
        router.push('/admin/templates/phase?action=new');
      } else if (deepLinkParams.templateId && (deepLinkParams.action === 'preview' || deepLinkParams.action === 'edit')) {
        setTimeout(() => {
          if (phaseTemplates.length > 0) {
            const template = phaseTemplates.find(t => t.id === deepLinkParams.templateId);
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
  }, [deepLinkParams, phaseTemplates, handleEditTemplate, handlePreviewTemplate, router]);

  // Fetch templates on component mount
  useEffect(() => {
    if (!fetchTriggered) {
      fetchPhaseTemplates(false);
      setFetchTriggered(true);
    }
  }, [fetchPhaseTemplates, fetchTriggered]);
  
  if (loadingPhaseTemplates && phaseTemplates.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }
  
  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Phase Templates</h2>
          <p className="text-muted-foreground">Manage phase templates for POVs</p>
        </div>
        <div className="flex items-center space-x-2">
          <ImportExportButtons 
            selectedTemplateIds={selectedTemplateIds}
            onImportComplete={() => {
              fetchPhaseTemplates(true);
              showToast('Templates imported successfully', 'success');
            }}
          />
          <FormatDocumentationLink />
          <Button onClick={() => router.push('/admin/templates/phase?action=new')}>
            <Plus className="h-4 w-4 mr-2" />
            Create New Template
          </Button>
        </div>
      </div>
      
      {/* Error display */}
      {phaseTemplatesError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6">
          {phaseTemplatesError}
        </div>
      )}

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
        templateType="phase"
      />

      {/* Bulk actions (only show in table view) */}
      {viewMode === 'table' && (
        <BulkActions
          selectedIds={selectedTemplateIds}
          templateType="phase"
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
              templateType="phase"
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
          templateType="phase"
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

      {filteredTemplates.length === 0 && !loadingPhaseTemplates && (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery || Object.keys(activeFilters).length > 0
            ? 'No templates match your search criteria.'
            : 'No phase templates available. Create your first template to get started.'}
        </div>
      )}
      
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
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PhaseTemplatesTab;
