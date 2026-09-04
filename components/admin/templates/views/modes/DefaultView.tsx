import React, { useCallback } from 'react';
import { ViewModeProps } from '../types';
import { PhaseTemplateBuilder } from '../../phase-builder/PhaseTemplateBuilder';
import { POVTemplateBuilder } from '../../pov-builder/POVTemplateBuilder';
import { BuilderPhaseTemplate } from '../../phase-builder/types';
import { Stage, Task, TaskDependency } from '../types';

/**
 * Read-only view component for templates
 */
const ReadOnlyView: React.FC<{ template: ViewModeProps['template'] }> = ({ template }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{template.name}</h2>
      <p className="text-muted-foreground">{template.description}</p>
      
      <div className="space-y-4">
        {template.stages.map((stage) => (
          <div key={stage.id} className="border rounded-lg p-4">
            <h3 className="text-lg font-medium">{stage.name}</h3>
            <p className="text-muted-foreground">{stage.description}</p>
            
            <div className="mt-4 space-y-2">
              {stage.tasks.map((task) => (
                <div key={task.id} className="border rounded-lg p-3">
                  <h4 className="font-medium">{task.title}</h4>
                  <p className="text-muted-foreground">{task.description}</p>
                  <p className="text-sm text-muted-foreground">Type: {task.type}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Default view mode component
 * This is a wrapper around the appropriate template builder component
 * based on the template type (phase or pov)
 */
export const DefaultView: React.FC<ViewModeProps> = ({
  template,
  onTemplateChange,
  onSave,
  isReadOnly,
  activeTab
}) => {
  // Determine if this is a POV template
  const isPOVTemplate = template.metadata?.originalType === 'povTemplate';
  
  // Handle save and convert back to our Template type for phase templates
  const handleSave = useCallback((savedTemplate: BuilderPhaseTemplate) => {
    
    if (onSave) {
      // Convert PhaseTemplate back to our Template type
      const convertedTemplate = {
        id: template.id,
        name: savedTemplate.name,
        description: savedTemplate.description || '',
        stages: savedTemplate.stages.map((stage: BuilderPhaseTemplate['stages'][number]) => {
          // Find the corresponding original stage to get its ID
          const originalStage = template.stages.find(s => s.name === stage.name); // Assuming stage names are unique for mapping
          return {
            id: originalStage?.id || '', // Add the original stage ID
            name: stage.name,
            description: stage.description || '',
            tasks: stage.tasks.map((task: BuilderPhaseTemplate['stages'][number]['tasks'][number]) => {
              // Find the corresponding original task to get its ID
              // Use task.id from builder as it should correspond to the original task ID
              const originalTask = originalStage?.tasks.find(t => t.id === task.id);
              return {
                id: originalTask?.id || '', // Use the original task ID found by key
                title: task.title, // Use task.title from builder as title
                description: task.description || '',
                type: task.type,
                // Convert dependencies back to our format
                dependencies: (task.dependencies || []).map((depId: string) => {
                  // Find the stage that contains this task
                  let stageName = '';
                  for (const s of savedTemplate.stages) {
                    if (s.tasks.some((t: BuilderPhaseTemplate['stages'][number]['tasks'][number]) => t.id === depId)) {
                      stageName = s.name;
                      break;
                    }
                  }
                  return { taskId: depId, stageId: stageName };
                })
              };
            })
          };
        })
      };
      
      
      onSave(convertedTemplate);
    }
  }, [template, onSave]);
  
  // If in read-only mode, we'll need to handle this differently
  if (isReadOnly) {
    return <ReadOnlyView template={template} />;
  }
  
  // For POV templates, use the POVTemplateBuilder
  if (isPOVTemplate) {
    return (
      <POVTemplateBuilder
        initialData={template}
        onSave={onSave}
        isReadOnly={isReadOnly}
        showSaveButton={false} // Hide the save button since we're using the centralized one
        activeTab={activeTab} // Pass the activeTab prop from ViewModeRenderer
        hideTabsAndHeader={true} // Hide tabs and header when used in ViewModeRenderer
      />
    );
  }
  
  // For Phase templates, use the PhaseTemplateBuilder
  // Convert our Template type to PhaseTemplate type
  const phaseTemplate: BuilderPhaseTemplate = {
    id: template.id,
    name: template.name,
    description: template.description,
    type: template.metadata?.type || 'phaseTemplate', // Infer type from metadata or default
    isDefault: template.metadata?.isDefault || false, // Infer isDefault from metadata or default
    stages: template.stages.map((stage: Stage) => ({
      name: stage.name,
      description: stage.description,
      tasks: stage.tasks.map((task: Task) => ({
        id: task.id, // Use task.id from views/types as id
        title: task.title || task.name || '', // Use task.title or fallback to task.name
        type: task.type,
        description: task.description,
        // Convert task dependencies from our format to PhaseTemplate format
        dependencies: task.dependencies?.map((dep: TaskDependency) => dep.taskId) || []
      }))
    }))
  };

  return (
    <PhaseTemplateBuilder
      initialData={phaseTemplate}
      onSave={handleSave}
      showSaveButton={false} // Hide the save button since we're using the centralized one
    />
  );
};
