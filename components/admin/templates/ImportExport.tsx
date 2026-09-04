import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Download, Upload, AlertCircle } from 'lucide-react';
import { Template } from './views/types';
import { POVTemplate } from '@/lib/pov/templates/types';
import { TemplateType } from './TemplateEditor';

interface ImportExportProps {
  template: Template | POVTemplate;
  onImport: (template: Template | POVTemplate) => void;
  templateType?: TemplateType;
}

/**
 * ImportExport component for importing and exporting templates
 * Supports both POV and Phase templates
 */
export function ImportExport({ template, onImport, templateType = 'phase' }: ImportExportProps) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Handle export
  const handleExport = () => {
    try {
      // Create a JSON string from the template
      const jsonString = JSON.stringify(template, null, 2);
      
      // Create a blob from the JSON string
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Create a URL for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a link element
      const link = document.createElement('a');
      link.href = url;
      
      // Set the filename based on template type and name
      const templateName = 'name' in template ? template.name : 'template';
      const sanitizedName = templateName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.download = `${templateType}_${sanitizedName}.json`;
      
      // Append the link to the document
      document.body.appendChild(link);
      
      // Click the link to trigger the download
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export template. Please try again.');
    }
  };
  
  // Handle import button click
  const handleImportClick = () => {
    // Click the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setError(null);
    
    try {
      // Read the file as text
      const text = await file.text();

      // Parse the JSON
      const importedTemplate = JSON.parse(text);

      // Validate the template based on its type
      if (templateType === 'pov') {
        validatePOVTemplate(importedTemplate);
      } else {
        validatePhaseTemplate(importedTemplate);
      }

      // Call the onImport callback
      onImport(importedTemplate);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to import template. Please check the file format.');
    } finally {
      setImporting(false);
    }
  };
  
  // Validate POV template
  const validatePOVTemplate = (template: any) => {
    // Check required fields
    if (!template.name) throw new Error('Template name is required');
    if (!template.description) throw new Error('Template description is required');
    if (!template.fields || typeof template.fields !== 'object') throw new Error('Template fields are required');
    if (!Array.isArray(template.sections)) throw new Error('Template sections are required');
    
    // Check sections
    for (const section of template.sections) {
      if (!section.id) throw new Error('Section ID is required');
      if (!section.title) throw new Error('Section title is required');
      if (!Array.isArray(section.fields)) throw new Error('Section fields are required');
    }
  };
  
  // Validate Phase template
  const validatePhaseTemplate = (template: any) => {
    // Check required fields
    if (!template.name) {
      throw new Error('Template name is required');
    }
    if (!template.description) {
      throw new Error('Template description is required');
    }

    // Check for stages directly or in workflow
    const stages = template.stages || (template.workflow && template.workflow.stages);

    if (!stages || !Array.isArray(stages)) {
      throw new Error('Template stages are required (either as stages or workflow.stages)');
    }

    // Check stages
    for (const stage of stages) {
      if (!stage.name) throw new Error('Stage name is required');
      if (!stage.description) throw new Error('Stage description is required');
      if (!Array.isArray(stage.tasks)) throw new Error('Stage tasks are required');

      // Check tasks
      for (const task of stage.tasks) {
        // Accept either key or id for task identifier
        if (!task.key && !task.id) throw new Error('Task key or id is required');
        // Accept either title or name for task title
        if (!task.title && !task.name) throw new Error('Task title or name is required');
        if (!task.description) throw new Error('Task description is required');
        if (!task.type) throw new Error('Task type is required');

        // Normalize task properties
        if (!task.id && task.key) {
          task.id = task.key;
        }
        if (!task.title && task.name) {
          task.title = task.name;
        }
      }
    }

    // If the template has workflow.stages but not stages, normalize it
    if (template.workflow && template.workflow.stages && !template.stages) {
      template.stages = template.workflow.stages;
    }
  };
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Import/Export</h3>
      <p className="text-sm text-muted-foreground">
        Import or export your {templateType === 'pov' ? 'POV' : 'Phase'} template.
      </p>
      
      <div className="flex space-x-4">
        <Button 
          variant="outline" 
          onClick={handleImportClick}
          disabled={importing}
        >
          {importing ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Import Template
            </>
          )}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={handleExport}
          disabled={importing}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Template
        </Button>
        
        {/* Hidden file input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept=".json" 
          className="hidden" 
        />
      </div>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4 mr-2" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default ImportExport;