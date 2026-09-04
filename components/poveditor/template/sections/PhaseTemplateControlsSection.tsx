"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Input } from '@/components/ui/Input';
import { 
  Copy, 
  Download, 
  Upload,
  FileDown,
  FileUp 
} from 'lucide-react';
import { usePhaseTemplateOperations, useTemplateSave, useTemplateData, useTemplateEditorActions } from '../context/TemplateEditorContext';
import { importPhaseTemplate, exportPhaseTemplate, validatePhaseTemplate, fetchPhaseTemplates } from '../context/utils/api';
import { normalizeApiToEditorState } from '../context/utils/normalizer';

/**
 * Phase template controls section for importing, exporting, and managing templates
 */
export default function PhaseTemplateControlsSection() {
  const { phases, stages, tasks } = usePhaseTemplateOperations();
  const { saveTemplate, isSubmitting } = useTemplateSave();
  const templateData = useTemplateData();
  const actions = useTemplateEditorActions();
  
  const [includeStages, setIncludeStages] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // Load imported template into editor
  const loadImportedTemplate = async (importResult: any) => {
    try {
      // The import API doesn't return the template data directly,
      // so we need to fetch the latest templates and find the one that was just imported
      const templatesResult = await fetchPhaseTemplates();
      
      if (templatesResult.success && templatesResult.data && templatesResult.data.length > 0) {
        // Get the most recently created template (assuming it's the one we just imported)
        const sortedTemplates = templatesResult.data.sort((a: any, b: any) => 
          new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()
        );
        
        const latestTemplate = sortedTemplates[0];
        
        if (latestTemplate) {
          // Normalize the template data for the editor
          const normalizedState = normalizeApiToEditorState(latestTemplate, 'phase', latestTemplate.id);
          
          // Load the template into the editor
          actions.initializeTemplate(normalizedState);
          
          // Switch to the basic info tab to show the loaded template
          actions.setActiveTab('basic-info');
          
          alert(`Template "${latestTemplate.name}" loaded successfully! You can now edit it in the template editor.`);
        } else {
          alert('Template imported successfully, but could not load it for editing. Please refresh the page and try again.');
        }
      } else {
        alert('Template imported successfully, but could not load it for editing. Please refresh the page and try again.');
      }
    } catch {
      alert('Template imported successfully, but could not load it for editing. Please refresh the page and try again.');
    }
  };
  
  // Handle export template
  const handleExportTemplate = async () => {
    setIsExporting(true);
    
    try {
      // Prepare export data
      const exportData = {
        name: templateData.name,
        description: templateData.description,
        type: 'phase',
        phases: includeMetadata ? phases : Object.fromEntries(
          Object.entries(phases).map(([id, phase]) => [id, {
            id: phase.id,
            name: phase.name,
            description: phase.description,
            type: phase.type,
            order: phase.order
          }])
        ),
        stages: includeStages ? stages : {},
        tasks: includeTasks ? tasks : {},
        metadata: includeMetadata ? {
          version: templateData.version,
          tags: templateData.tags,
          createdAt: new Date().toISOString()
        } : undefined
      };
      
      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${templateData.name || 'phase-template'}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch {
      alert('Failed to export template. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  
  // Handle import template
  const handleImportTemplate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      setIsImporting(true);
      
      try {
        // Use the actual import API (it will handle validation)
        const result = await importPhaseTemplate(file);
        
        if (result.success) {
          // Check if we have valid template data to load
          if (result.data && result.data.valid && result.data.valid > 0) {
            // Try to load the first imported template into the editor
            await loadImportedTemplate(result.data);
          } else {
            alert('Template imported successfully!');
          }
        } else {
          throw new Error(result.error || 'Import failed');
        }
        
      } catch (error) {
        alert(`Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsImporting(false);
      }
    };
    
    input.click();
  };
  
  // Handle duplicate template
  const handleDuplicateTemplate = async () => {
    // TODO: Implement actual duplication logic
    alert('Duplicate functionality will be implemented in the next phase.');
  };
  
  // Get template statistics
  const getTemplateStats = () => {
    const phaseCount = Object.keys(phases).length;
    const stageCount = Object.keys(stages).length;
    const taskCount = Object.keys(tasks).length;
    
    return { phaseCount, stageCount, taskCount };
  };
  
  const stats = getTemplateStats();
  
  return (
    <div className="space-y-6">

      {/* Template Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Template Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-primary/10 rounded-lg">
              <div className="text-2xl font-bold text-primary">{stats.phaseCount}</div>
              <div className="text-sm text-primary">Phases</div>
            </div>
            <div className="p-4 bg-green-500/10 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.stageCount}</div>
              <div className="text-sm text-green-600 dark:text-green-400">Stages</div>
            </div>
            <div className="p-4 bg-purple-500/10 rounded-lg">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.taskCount}</div>
              <div className="text-sm text-purple-600 dark:text-purple-400">Tasks</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="include-stages" className="text-sm">Include Stages</Label>
              <Switch
                id="include-stages"
                checked={includeStages}
                onCheckedChange={setIncludeStages}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="include-tasks" className="text-sm">Include Tasks</Label>
              <Switch
                id="include-tasks"
                checked={includeTasks}
                onCheckedChange={setIncludeTasks}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="include-metadata" className="text-sm">Include Metadata</Label>
              <Switch
                id="include-metadata"
                checked={includeMetadata}
                onCheckedChange={setIncludeMetadata}
              />
            </div>
          </div>
          
          <Button
            variant="outline"
            onClick={handleExportTemplate}
            disabled={isExporting || stats.phaseCount === 0}
            className="w-full"
          >
            <FileDown className="h-4 w-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export Template'}
          </Button>
          
          {stats.phaseCount === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Add at least one phase to export the template.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Import and Management */}
      <Card>
        <CardHeader>
          <CardTitle>Template Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            onClick={handleImportTemplate}
            disabled={isImporting}
            className="w-full justify-start"
          >
            <FileUp className="h-4 w-4 mr-2" />
            {isImporting ? 'Importing...' : 'Import Template'}
          </Button>
          
          <Button
            variant="outline"
            onClick={handleDuplicateTemplate}
            disabled={stats.phaseCount === 0}
            className="w-full justify-start"
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicate Template
          </Button>
          
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const result = await validatePhaseTemplate({
                  name: templateData.name,
                  description: templateData.description,
                  phases,
                  stages,
                  tasks
                });
                
                if (result.success) {
                  alert('Template validation passed!');
                } else {
                  alert(`Validation failed: ${result.error}`);
                }
              } catch (error) {
                alert(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }}
            disabled={stats.phaseCount === 0}
            className="w-full justify-start"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Validate Template
          </Button>
          
          {stats.phaseCount === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Add phases to enable duplication.
            </p>
          )}
        </CardContent>
      </Card>

      {/* API Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Template Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect to the template library to share and discover phase templates.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="justify-start"
              disabled
            >
              <Upload className="h-4 w-4 mr-2" />
              Publish to Library
            </Button>
            
            <Button
              variant="outline"
              className="justify-start"
              disabled
            >
              <Download className="h-4 w-4 mr-2" />
              Browse Library
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Library features will be available in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
