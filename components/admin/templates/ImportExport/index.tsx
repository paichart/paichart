import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { AlertCircle, Download, Upload, FileDown } from 'lucide-react';
import { Template } from '@/components/admin/templates/views';
import { TaskType } from '@prisma/client';

interface ImportExportProps {
  template: Template;
  onImport: (template: Template) => void;
}

/**
 * Import/Export component for templates
 * 
 * Allows importing templates from JSON files and exporting templates to JSON files
 */
export function ImportExport({ template, onImport }: ImportExportProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /**
   * Handle exporting the template to a JSON file
   */
  const handleExport = () => {
    try {
      // Create a JSON string from the template
      const json = JSON.stringify(template, null, 2);
      
      // Create a blob from the JSON string
      const blob = new Blob([json], { type: 'application/json' });
      
      // Create a URL for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a link element
      const link = document.createElement('a');
      link.href = url;
      link.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}-template.json`;
      
      // Append the link to the body
      document.body.appendChild(link);
      
      // Click the link to download the file
      link.click();
      
      // Remove the link from the body
      document.body.removeChild(link);
      
      // Revoke the URL
      URL.revokeObjectURL(url);
      
      setSuccess('Template exported successfully');
      setError(null);
    } catch (err) {
      // Could not export template
      setError('Failed to export template');
      setSuccess(null);
    }
  };

  /**
   * Handle importing a template from a JSON file
   */
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setError(null);
      setSuccess(null);
      
      const file = event.target.files?.[0];
      if (!file) {
        setError('No file selected');
        return;
      }
      
      // Check if the file is a JSON file
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        setError('File must be a JSON file');
        return;
      }
      
      // Read the file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = e.target?.result as string;
          const importedTemplate = JSON.parse(json);
          
          // Validate the imported template
          if (!validateTemplate(importedTemplate)) {
            setError('Invalid template format');
            return;
          }
          
          // Call the onImport callback
          onImport(importedTemplate);
          
          setSuccess('Template imported successfully');
        } catch (err) {
          // Could not parse JSON
          setError('Failed to parse JSON file');
        }
      };
      
      reader.readAsText(file);
    } catch (err) {
      // Could not import template
      setError('Failed to import template');
    }
  };

  /**
   * Generate a markdown specification from the template
   */
  const handleGenerateMarkdown = () => {
    try {
      // Generate markdown
      const markdown = generateMarkdown(template);
      
      // Create a blob from the markdown
      const blob = new Blob([markdown], { type: 'text/markdown' });
      
      // Create a URL for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a link element
      const link = document.createElement('a');
      link.href = url;
      link.download = `${template.name.replace(/\s+/g, '-').toLowerCase()}-specification.md`;
      
      // Append the link to the body
      document.body.appendChild(link);
      
      // Click the link to download the file
      link.click();
      
      // Remove the link from the body
      document.body.removeChild(link);
      
      // Revoke the URL
      URL.revokeObjectURL(url);
      
      setSuccess('Markdown specification generated successfully');
      setError(null);
    } catch (err) {
      // Could not generate markdown
      setError('Failed to generate markdown specification');
      setSuccess(null);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Import/Export</h3>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {success && (
        <Alert className="bg-green-50 text-green-800 border-green-500">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex flex-col sm:flex-row gap-4">
        <Button 
          variant="outline" 
          onClick={handleExport}
          className="flex items-center"
        >
          <Download className="h-4 w-4 mr-2" />
          Export Template
        </Button>
        
        <div className="relative">
          <Button variant="outline" className="flex items-center">
            <Upload className="h-4 w-4 mr-2" />
            Import Template
            <input
              type="file"
              className="absolute inset-0 opacity-0 cursor-pointer"
              accept="application/json"
              onChange={handleImport}
            />
          </Button>
        </div>
        
        <Button 
          variant="outline" 
          onClick={handleGenerateMarkdown}
          className="flex items-center"
        >
          <FileDown className="h-4 w-4 mr-2" />
          Generate Specification
        </Button>
      </div>
    </div>
  );
}

/**
 * Validate a template
 */
function validateTemplate(template: any): template is Template {
  // Check if the template has the required properties
  if (!template || typeof template !== 'object') {
    return false;
  }
  
  // Check if the template has a name
  if (!template.name || typeof template.name !== 'string') {
    return false;
  }
  
  // Check if the template has stages
  if (!template.stages || !Array.isArray(template.stages)) {
    return false;
  }
  
  // Check if each stage has the required properties
  for (const stage of template.stages) {
    if (!stage.id || typeof stage.id !== 'string') {
      return false;
    }
    
    if (!stage.name || typeof stage.name !== 'string') {
      return false;
    }
    
    if (!stage.tasks || !Array.isArray(stage.tasks)) {
      return false;
    }
    
    // Check if each task has the required properties
    for (const task of stage.tasks) {
      if (!task.id || typeof task.id !== 'string') {
        return false;
      }
      
      if ((!task.title && !task.name) || (typeof task.title !== 'string' && typeof task.name !== 'string')) {
        return false;
      }
      
      // Note: task.type can now be a string or TaskType enum
      if (!task.type) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Generate a markdown specification from a template
 */
function generateMarkdown(template: Template): string {
  let markdown = `# ${template.name}\n\n`;
  markdown += `${template.description || 'No description provided.'}\n\n`;
  
  markdown += '## Stages\n\n';
  
  if (template.stages && template.stages.length > 0) {
    template.stages.forEach((stage, stageIndex) => {
      markdown += `### ${stageIndex + 1}. ${stage.name}\n\n`;
      markdown += `${stage.description || 'No description provided.'}\n\n`;
      
      markdown += '#### Tasks\n\n';
      
      if (stage.tasks && stage.tasks.length > 0) {
        stage.tasks.forEach((task, taskIndex) => {
          markdown += `##### ${stageIndex + 1}.${taskIndex + 1}. ${task.title || task.name || 'Unnamed task'} (${task.type})\n\n`;
          markdown += `${task.description || 'No description provided.'}\n\n`;
          
          if (task.type === TaskType.APPROVAL && task.metadata?.managerName) {
            markdown += `Manager: ${task.metadata.managerName}\n\n`;
          }
          
          if (task.dependencies && task.dependencies.length > 0) {
            markdown += 'Dependencies:\n';
            task.dependencies.forEach(dep => {
              markdown += `- Task ${dep.taskId} in Stage ${dep.stageId}\n`;
            });
            markdown += '\n';
          }
        });
      } else {
        markdown += 'No tasks defined for this stage.\n\n';
      }
    });
  } else {
    markdown += 'No stages defined for this template.\n\n';
  }
  
  return markdown;
}