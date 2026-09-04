import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Template as SimplifiedTemplate, Stage as SimplifiedStage, Task as SimplifiedTask } from '@/components/admin/templates/views'; // Rename simplified types
import { CheckCircle2, Flag, ClipboardCheck, CheckSquare, GitBranch, FileText } from 'lucide-react';
import { TaskType } from '@prisma/client'; // Import TaskType enum
import { useQuery } from '@tanstack/react-query'; // Import useQuery
import { templateService } from '@/lib/services/template-service'; // Import templateService
import { PhaseTemplate as FullPhaseTemplate, Stage as FullStage, Task as FullTask } from '@/lib/pov/phase-templates/types'; // Import the full types
// Removed import for taskNormalizationService
// import { taskNormalizationService } from '@/lib/services/task-normalization-service';

interface TemplatePreviewProps {
  template: SimplifiedTemplate; // This is likely a simplified type, we'll fetch the full one
  compact?: boolean;
}

/**
 * Template Preview Component
 *
 * Displays a preview of a template with stages and tasks
 * Can be displayed in compact or detailed mode
 */
export function TemplatePreview({ template, compact = false }: TemplatePreviewProps) {
  // Fetch the full template data using the service
  const { data: fullTemplate, isLoading, error } = useQuery<FullPhaseTemplate | null>({
    queryKey: ['fullPhaseTemplate', template?.id], // Query key includes template ID
    queryFn: async () => {
      if (!template?.id) return null;
      // Use the template service to fetch the full template data
      const fetchedTemplate = await templateService.getTemplate(template.id, 'phase');
      // The service returns PhaseTemplate | POVTemplate | null, cast to the expected type
      const typedTemplate = fetchedTemplate as FullPhaseTemplate | null;
      
      // Standardize the template if it exists instead of normalizing
      if (typedTemplate) {
        return standardizeTemplate(typedTemplate);
      }
      
      return typedTemplate;
    },
    enabled: !!template?.id, // Only run the query if template.id exists
  });

  // Function to standardize template properties
  function standardizeTemplate(template: any) {
    if (!template) return template;
    
    // Create a new template object with standardized properties
    const standardized = {
      ...template,
      stages: template.stages?.map((stage: any) => ({
        ...stage,
        tasks: stage.tasks?.map((task: any) => ({
          ...task,
          id: task.id || task.key || `task-${Math.random().toString(36).substr(2, 9)}`,
          title: task.title || task.name || '',
          dependencies: (task.dependencies || []).filter((dep: any) => dep !== undefined)
        })) || []
      })) || []
    };
    
    return standardized;
  }

  if (!template) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center text-muted-foreground">
          No template selected
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center text-muted-foreground">
          Loading template preview...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="p-6 text-center text-muted-foreground">
          Error loading template preview: {error.message}
        </CardContent>
      </Card>
    );
  }

  // Use the fullTemplate data if available, otherwise standardize and use the simplified template prop
  const templateToDisplay = fullTemplate || standardizeTemplate(template);

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex justify-between items-center">
          <span>{templateToDisplay.name}</span>
          {/* Use the actual stages count from fullTemplate if available */}
          <Badge variant="outline">{fullTemplate?.stages?.length || templateToDisplay.stages?.length || 0} stages</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{templateToDisplay.description}</p>
      </CardHeader>
      <CardContent>
        {compact ? (
          <CompactView template={templateToDisplay} />
        ) : (
          // Pass the full template data to DetailedView
          <DetailedView template={templateToDisplay as FullPhaseTemplate} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Compact View Component
 *
 * Displays a compact view of a template with stages and task counts
 */
function CompactView({ template }: { template: SimplifiedTemplate | FullPhaseTemplate }) {
  // Use the stages from the template object, which could be simplified or full
  const stagesToDisplay = template.stages || [];

  return (
    <div className="space-y-2">
      {stagesToDisplay.map((stage, index) => (
        // Use stage.name or index for key as FullStage does not have id
        <div key={(stage as FullStage).name || index} className="border rounded-md p-2">
          <div className="flex justify-between items-center">
            <div className="font-medium">
              {index + 1}. {stage.name}
            </div>
            {/* If template is FullPhaseTemplate, stages will have tasks array */}
            {/* If template is simplified, stages might just be a count */}
            {Array.isArray((stage as FullStage).tasks) && (
              <Badge variant="outline">{(stage as FullStage).tasks.length || 0} tasks</Badge>
            )}
          </div>
          {/* Only show task type counts if tasks array is available */}
          {Array.isArray((stage as FullStage).tasks) && (
            <div className="mt-1 flex space-x-1">
              {/* Cast tasks to FullTask[] */}
              {getTaskTypeCounts((stage as FullStage).tasks as FullTask[]).map(({ type, count }) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {getTaskTypeIcon(type as any, 'h-3 w-3 mr-1')}
                  {count} {type}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Detailed View Component
 *
 * Displays a detailed view of a template with stages and tasks
 */
function DetailedView({ template }: { template: FullPhaseTemplate }) {
  // Create a map of task keys to task titles for easy lookup
  const taskMap = new Map<string, string>();
  
  // Check if template.stages exists before trying to iterate over it
  if (template && template.stages && Array.isArray(template.stages)) {
    template.stages.forEach(stage => {
      if (stage.tasks && Array.isArray(stage.tasks)) {
        stage.tasks.forEach(task => {
          // Use id as the primary identifier
          const taskId = task.id;
          if (taskId && task.title) {
            taskMap.set(taskId, task.title);
          }
        });
      }
    });
  }

  // Check if this is a POV template (no stages) and show POV template information
  if (!template.stages || !Array.isArray(template.stages) || template.stages.length === 0) {
    return (
      <POVTemplatePreview template={template as any} />
    );
  }

  return (
    <div className="space-y-4">
      {template.stages.map((stage: FullStage, stageIndex: number) => ( // Explicitly type stage and stageIndex
        // Use stage.name or stageIndex for key as FullStage does not have id
        <div key={stage.name || stageIndex} className="border rounded-md p-3">
          <div className="font-medium text-lg mb-2">
            {stageIndex + 1}. {stage.name}
          </div>
          <div className="pl-4 space-y-2">
            {stage.tasks?.map((task: FullTask, taskIndex: number) => ( // Explicitly type task and taskIndex
              // Use task.id for key
              <div key={task.id || taskIndex} className="border-l-2 border-border pl-3 py-1">
                <div className="flex items-center">
                  {/* Use task.type directly */}
                  {getTaskTypeIcon(task.type, 'h-4 w-4 mr-2')}
                  <span className="font-medium">
                    {stageIndex + 1}.{taskIndex + 1} {task.title} {/* Use task.title */}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                )}
                {/* Use task.type directly and compare with TaskType enum */}
                {task.type === TaskType.APPROVAL && task.metadata?.managerName && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Manager: {task.metadata.managerName}
                  </div>
                )}
                {task.dependencies && task.dependencies.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Dependencies: {task.dependencies.map(depId => {
                      const depName = taskMap.get(depId);
                      return depName ? depName : `${depId} (Unresolved)`; // Display name or fallback
                    }).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Get task type counts
 *
 * Returns an array of task types and their counts
 */
function getTaskTypeCounts(tasks: FullTask[] = []) { // Expect FullTask[]
  const counts: Record<string, number> = {};

  tasks.forEach((task: FullTask) => { // Explicitly type task
    // Use task.type directly
    counts[task.type] = (counts[task.type] || 0) + 1;
  });

  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

/**
 * Get task type icon
 *
 * Returns the appropriate icon for a task type
 */
function getTaskTypeIcon(type: TaskType, className: string) { // Expect TaskType enum from @prisma/client
  switch (type) {
    case TaskType.MILESTONE:
      return <Flag className={className} />;
    case TaskType.APPROVAL:
      return <ClipboardCheck className={className} />;
    case TaskType.DECISION:
      return <GitBranch className={className} />;
    case TaskType.DOCUMENT:
      return <FileText className={className} />;
    case TaskType.ACTION:
    default:
      return <CheckCircle2 className={className} />;
  }
}

/**
 * POV Template Preview Component
 *
 * Displays a preview of a POV template with fields and sections
 */
function POVTemplatePreview({ template }: { template: any }) {
  // Extract fields and sections from the template
  const fields = template.fields || {};
  const sections = template.sections || [];
  const metadata = template.metadata || {};
  
  return (
    <div className="space-y-4">
      {/* Basic Information */}
      <div className="border rounded-md p-4">
        <h3 className="font-medium text-lg mb-2">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Name</p>
            <p>{template.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            <p>{template.status || 'Draft'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Version</p>
            <p>{template.version || '1.0.0'}</p>
          </div>
          {metadata.createdAt && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p>{new Date(metadata.createdAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Fields */}
      {Object.keys(fields).length > 0 && (
        <div className="border rounded-md p-4">
          <h3 className="font-medium text-lg mb-2">Fields</h3>
          <div className="space-y-2">
            {Object.entries(fields).map(([key, value]: [string, any]) => (
              <div key={key} className="border-l-2 border-border pl-3 py-1">
                <p className="font-medium">{value.label || key}</p>
                <p className="text-sm text-muted-foreground">
                  Type: {value.type || 'text'}
                  {value.required && <span className="text-destructive ml-2">Required</span>}
                </p>
                {value.description && (
                  <p className="text-sm text-muted-foreground">{value.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Sections */}
      {sections.length > 0 && (
        <div className="border rounded-md p-4">
          <h3 className="font-medium text-lg mb-2">Sections</h3>
          <div className="space-y-3">
            {sections.map((section: any, index: number) => (
              <div key={section.id || index} className="border rounded-md p-3">
                <p className="font-medium">{section.title || `Section ${index + 1}`}</p>
                {section.description && (
                  <p className="text-sm text-muted-foreground mb-2">{section.description}</p>
                )}
                
                {section.fields && section.fields.length > 0 && (
                  <div className="pl-3 space-y-2 mt-2">
                    {section.fields.map((field: any, fieldIndex: number) => (
                      <div key={field.id || fieldIndex} className="border-l-2 border-border pl-3 py-1">
                        <p className="font-medium">{field.label || `Field ${fieldIndex + 1}`}</p>
                        <p className="text-sm text-muted-foreground">
                          Type: {field.type || 'text'}
                          {field.required && <span className="text-destructive ml-2">Required</span>}
                        </p>
                        {field.placeholder && (
                          <p className="text-sm text-muted-foreground">Placeholder: {field.placeholder}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Phase Templates */}
      {metadata.phaseTemplates && metadata.phaseTemplates.length > 0 && (
        <div className="border rounded-md p-4">
          <h3 className="font-medium text-lg mb-2">Associated Phase Templates</h3>
          <p className="text-sm text-muted-foreground mb-2">
            This POV template is associated with {metadata.phaseTemplates.length} phase template(s).
            View the Relationships tab for details.
          </p>
          <div className="pl-3">
            {metadata.phaseTemplates.map((id: string, index: number) => (
              <div key={id} className="border-l-2 border-border pl-3 py-1">
                <p className="font-medium">Phase Template ID: {id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* If no fields, sections, or phase templates */}
      {Object.keys(fields).length === 0 && sections.length === 0 &&
       (!metadata.phaseTemplates || metadata.phaseTemplates.length === 0) && (
        <div className="p-4 border rounded-md bg-muted text-center">
          <p className="text-muted-foreground">This POV template doesn&apos;t have any fields, sections, or associated phase templates yet.</p>
          <p className="text-muted-foreground mt-2">You can add these elements in the template editor.</p>
        </div>
      )}
    </div>
  );
}