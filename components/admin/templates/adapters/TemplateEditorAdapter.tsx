import { Template, Stage, Task } from '../views/types';
import { POVTemplate, SectionDefinition, FieldDefinition } from '@/lib/pov/templates/types';
import { TaskType } from '@prisma/client';

/**
 * Adapts a POV template to the Template interface expected by the TemplateViewProvider
 * This allows us to use the same editor components for both template types
 */
export function adaptPOVTemplateToTemplate(povTemplate: POVTemplate): Template {
  // Create a stage for each section in the POV template
  const stages: Stage[] = [];
  
  // Check if sections exist and is an array before mapping
  if (povTemplate.sections && Array.isArray(povTemplate.sections)) {
    povTemplate.sections.forEach(section => {
      // Create a task for each field in the section
      const tasks: Task[] = [];
      
      // Check if fields exist and is an array before mapping
      if (section.fields && Array.isArray(section.fields)) {
        section.fields.forEach(fieldId => {
          // Check if the field exists in the fields object
          if (povTemplate.fields && povTemplate.fields[fieldId]) {
            const field = povTemplate.fields[fieldId];
            tasks.push({
              id: fieldId,
              title: field.label, // Use title instead of name
              description: field.description || '',
              type: TaskType.ACTION, // Default to ACTION type
              metadata: {
                fieldDefinition: field,
                originalType: 'field'
              }
            });
          }
        });
      }
      
      stages.push({
        id: section.id,
        name: section.title,
        description: section.description || '',
        tasks,
        metadata: {
          originalType: 'section',
          sectionDefinition: section
        }
      });
    });
  }

  return {
    id: povTemplate.id,
    name: povTemplate.name,
    description: povTemplate.description,
    stages,
    metadata: {
      originalType: 'povTemplate',
      version: povTemplate.version,
      status: povTemplate.status,
      originalPOVTemplate: povTemplate
    }
  };
}

/**
 * Adapts a Template back to a POVTemplate
 * This is used when saving changes made in the editor
 */
export function adaptTemplateToPOVTemplate(template: Template): POVTemplate {
  // If the template has the original POV template in its metadata, use that as a base
  if (template.metadata?.originalType === 'povTemplate' && template.metadata.originalPOVTemplate) {
    const originalPOVTemplate = template.metadata.originalPOVTemplate as POVTemplate;
    
    // Create a new fields object
    const fields: Record<string, FieldDefinition> = {};
    
    // Create a new sections array
    const sections: SectionDefinition[] = template.stages.map(stage => {
      // Get the original section if available
      const originalSection = stage.metadata?.originalType === 'section' 
        ? stage.metadata.sectionDefinition as SectionDefinition
        : null;
      
      // Get the field IDs from the tasks
      const sectionFieldIds = stage.tasks.map(task => task.id);
      
      // Add the fields to the fields object
      stage.tasks.forEach(task => {
        if (task.metadata?.originalType === 'field') {
          // Use the original field definition if available
          const fieldDefinition = task.metadata.fieldDefinition as FieldDefinition;
          fields[task.id] = {
            ...fieldDefinition,
            label: task.title || '', // Use title, fallback to empty string
            description: task.description
          };
        } else {
          // Create a new field definition
          fields[task.id] = {
            type: 'text', // Default to text
            label: task.title || '', // Use title, fallback to empty string
            description: task.description,
            required: false
          };
        }
      });
      
      // Create the section
      return {
        id: stage.id,
        title: stage.name,
        description: stage.description,
        fields: sectionFieldIds,
        ...(originalSection?.conditional && { conditional: originalSection.conditional }),
        ...(originalSection?.ui && { ui: originalSection.ui })
      };
    });
    
    // Return the updated POV template
    return {
      ...originalPOVTemplate,
      name: template.name,
      description: template.description,
      fields,
      sections,
      ...(template.metadata?.version && { version: template.metadata.version as string }),
      ...(template.metadata?.status && { status: template.metadata.status as 'draft' | 'published' | 'deprecated' })
    };
  }
  
  // If there's no original POV template, create a new one from scratch
  const fields: Record<string, FieldDefinition> = {};
  const sections: SectionDefinition[] = template.stages.map((stage, stageIndex) => {
    const sectionFieldIds = stage.tasks.map((task, taskIndex) => {
      const fieldId = `field-${stageIndex}-${taskIndex}`;
      fields[fieldId] = {
        type: 'text', // Default to text
        label: task.title || '', // Use title, fallback to empty string
        description: task.description,
        required: false
      };
      return fieldId;
    });
    
    return {
      id: stage.id,
      title: stage.name,
      description: stage.description,
      fields: sectionFieldIds
    };
  });
  
  const result: POVTemplate = {
    id: template.id || '',
    name: template.name,
    description: template.description,
    fields,
    sections,
    status: 'draft'
  };

  return result;
}

/**
 * Creates a sample POV template
 */
export function createSamplePOVTemplate(): POVTemplate {
  // Create a unique ID for the section
  const sectionId = `section-${Date.now()}`;

  const template: POVTemplate = {
    id: '',
    name: 'New POV Template', // Set a default name
    description: 'Enter a description for this POV template', // Set a default description
    fields: {},
    sections: [
      {
        id: sectionId,
        title: 'General Information',
        description: 'Basic information about the POV',
        fields: []
      }
    ],
    status: 'draft',
    metadata: {
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };

  return template;
}

/**
 * Creates a sample Phase template
 */
export function createSamplePhaseTemplate(): Template {
  return {
    id: '',
    name: 'New Phase Template',
    description: 'Enter a description for this template',
    stages: [
      {
        id: 'stage-1',
        name: 'New Stage',
        description: 'Enter a description for this stage',
        tasks: [
          {
            id: 'task-1-1',
            title: 'New Task', // Use title instead of name
            description: 'Enter a description for this task',
            type: TaskType.ACTION,
            dependencies: []
          }
        ]
      }
    ]
  };
}

/**
 * Determines the template type based on the template structure
 */
export function determineTemplateType(template: any): 'phase' | 'pov' {
  // Check for POV template specific properties
  if (template.sections && template.fields) {
    return 'pov';
  }
  // Default to phase template
  return 'phase';
}