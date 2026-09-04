import { PhaseTemplate, Stage, Task, ValidationRule, TimelineRecommendation, Duration } from '@/lib/pov/phase-templates/types';
import { POVTemplate, FormSection, FormField } from '@/lib/pov/phase-templates/types'; // Import from unified types
import { DeepLinkParams } from '@/components/admin/templates/context/TemplateContext'; // Keep DeepLinkParams import
import { validateTemplateSchema, updatePhaseTemplateIds, needsNormalization } from '@/lib/utils/template-schema-validator';
import { logger } from '@/lib/logger';
import { ensureObject } from '@/lib/utils/ensure-object';

 // Define a unified structure for internal use if needed, or rely on existing types
 // For now, we'll work with the existing PhaseTemplate and POVTemplate types and focus on the service methods.
 
 /**
  * Unified service for handling template data across the application.
  * This service will centralize logic for fetching, normalizing, validating, and caching template data.
  */
 export class TemplateService {
   // Placeholder for caching mechanism (e.g., Map, or a dedicated caching library)
   // Cache can store single templates or lists of templates
   private templateCache: Map<string, PhaseTemplate | POVTemplate | (PhaseTemplate | POVTemplate)[]> = new Map();
 
   constructor() {
     // Initialize caching or other service setup here
   }
 
   /**
    * Fetches a template by its ID and type.
    * @param id The ID of the template.
    * @param type The type of the template ('phase' or 'pov').
    * @param forceRefresh Whether to bypass the cache and fetch directly from the source.
    * @returns The fetched and normalized template data.
    */
   public async getTemplate(id: string, type: 'phase' | 'pov', forceRefresh = false): Promise<PhaseTemplate | POVTemplate | null> {
     const cacheKey = `${type}-${id}`;
 
     const cachedValue = this.templateCache.get(cacheKey);
     // If not forcing refresh, and a value exists in cache, and it's NOT an array (meaning it's a single template)
     if (!forceRefresh && cachedValue !== undefined && !Array.isArray(cachedValue)) {
       return cachedValue as PhaseTemplate | POVTemplate;
     }
     try {
       const endpoint = type === 'phase' ? `/api/phase-templates/${id}` : `/api/pov-templates/${id}`;
       const response = await fetch(endpoint);
 
       if (!response.ok) {
         // BC20 FIX: consume body to release TCP connection
         await response.body?.cancel();
         // Handle specific API errors (e.g., not found)
         if (response.status === 404) {
           logger.warn({ cacheKey }, 'Template not found');
           return null;
         }
         throw new Error(`Failed to fetch ${type} template with ID ${id}: ${response.statusText}`);
       }
 
       const data = await response.json();
       // Assuming the API returns the template data directly or within a 'template' property
       const rawTemplate = data.template || data;
 
       // Normalize the fetched data
       const normalizedTemplate = this.normalizeTemplate(rawTemplate, type);
 
       // Cache the normalized data
       this.templateCache.set(cacheKey, normalizedTemplate);
 
       return normalizedTemplate;
 
     } catch (error) {
       logger.error({ err: error, cacheKey }, 'Failed to fetch template');
       throw error;
     }
   }
 
   /**
    * Fetches a list of templates by type.
    * @param type The type of templates to fetch ('phase' or 'pov').
    * @param forceRefresh Whether to bypass the cache and fetch directly from the source.
    * @returns An array of fetched and normalized template data.
    */
   public async listTemplates(type: 'phase' | 'pov', forceRefresh = false): Promise<(PhaseTemplate | POVTemplate)[]> {
     const cacheKey = `${type}-list`;
 
     // For lists, caching might be more complex (e.g., needing to know when list changes)
     // Simple cache check for now, more sophisticated caching can be added later.
     const cachedValue = this.templateCache.get(cacheKey);
     if (!forceRefresh && cachedValue !== undefined && Array.isArray(cachedValue)) {
        return cachedValue as (PhaseTemplate | POVTemplate)[];
     }
     try {
       const endpoint = type === 'phase' ? `/api/phase-templates` : `/api/pov-templates`;
       const response = await fetch(endpoint);
 
       if (!response.ok) {
         await response.body?.cancel(); // BC20 FIX
         throw new Error(`Failed to fetch ${type} templates list: ${response.statusText}`);
       }
 
       const data = await response.json();
       // Assuming the API returns an array of templates directly or within a 'templates' property
       const rawTemplates = Array.isArray(data) ? data : (data.templates || []);
 
       // Normalize each template in the list
       const normalizedTemplates = rawTemplates.map((template: any) => this.normalizeTemplate(template, type));
 
       // Cache the normalized list
       this.templateCache.set(cacheKey, normalizedTemplates);
 
       return normalizedTemplates;
 
     } catch (error) {
       logger.error({ err: error, cacheKey }, 'Failed to fetch template list');
       throw error;
     }
   }
 
 
   /**
    * Normalizes template data to a consistent structure.
    * This is where transformations from potentially inconsistent API responses
    * to the defined consistent structures (`PhaseTemplate`, `POVTemplate`) occur.
    * @param rawData The raw template data from the API.
    * @param type The type of the template ('phase' or 'pov').
    * @returns The normalized template data.
    */
   private normalizeTemplate(rawData: any, type: 'phase' | 'pov'): PhaseTemplate | POVTemplate {
     // Implement normalization logic based on the defined structures in
     // cline_docs/template-data-structures.md and existing types.
     // This is where transformations from potentially inconsistent API responses
     // to the defined consistent structures (`PhaseTemplate`, `POVTemplate`) occur.
     // It involves mapping rawData properties to the target interface properties,
     // handling missing fields, default values, and potentially transforming nested data.
 
     if (type === 'phase') {
       // Check if stages are directly on the template or under workflow.stages
       let stages = [];
       if (Array.isArray(rawData.stages)) {
         stages = rawData.stages;
       } else if (rawData.workflow && Array.isArray(rawData.workflow.stages)) {
         stages = rawData.workflow.stages;
       }
       
       // Normalize PhaseTemplate data based on cline_docs/template-data-structures.md
       const normalized: PhaseTemplate = {
         id: rawData.id || '', // Ensure ID exists
         name: rawData.name || 'Unnamed Phase Template', // Provide default name
         description: rawData.description || '',
         type: rawData.type || 'PLANNING', // Provide default type
         version: rawData.version,
         isDefault: rawData.isDefault || false, // Provide default for isDefault
         stages: stages.map(this.normalizeStage.bind(this)), // Normalize stages
         validationRules: Array.isArray(rawData.validationRules) ? rawData.validationRules.map(this.normalizeValidationRule.bind(this)) : [], // Normalize validation rules
         timelineRecommendations: rawData.timelineRecommendations ? this.normalizeTimelineRecommendation(rawData.timelineRecommendations) : undefined, // Normalize timeline recommendations
         metadata: rawData.metadata || {}, // Ensure metadata is an object
         createdAt: rawData.createdAt ? new Date(rawData.createdAt) : undefined, // Normalize createdAt
         updatedAt: rawData.updatedAt ? new Date(rawData.updatedAt) : undefined, // Normalize updatedAt
       };
       return normalized;
     } else { // type === 'pov'
       // Normalize POVTemplate data based on cline_docs/template-data-structures.md
       const normalized: POVTemplate = {
         id: rawData.id || '', // Ensure ID exists
         name: rawData.name || 'Unnamed POV Template', // Provide default name
         description: rawData.description || '',
         status: rawData.status,
         version: rawData.version,
         isDefault: rawData.isDefault || false, // Provide default for isDefault
         sections: Array.isArray(rawData.sections) ? rawData.sections.map(this.normalizeFormSection.bind(this)) : [], // Normalize sections
         fields: rawData.fields || {}, // Ensure fields is an object
         metadata: rawData.metadata || {}, // Ensure metadata is an object
       };
       
       // Standardize phase templates storage
       // First, extract phase templates from all possible locations
       let phaseTemplateIds: string[] = [];
       
       // Check top-level metadata
       if (normalized.metadata && Array.isArray(normalized.metadata.phaseTemplates)) {
         phaseTemplateIds = [...normalized.metadata.phaseTemplates];
       }
       
       // Check schema.metadata if available
       if (rawData.schema) {
         // BC2 defense: ensureObject handles string→object coercion safely (no crash on malformed JSON)
         const schema = ensureObject(rawData.schema, {}, 'POVTemplate schema (normalizeTemplate)') as Record<string, any>;
         
         if (schema.metadata && Array.isArray(schema.metadata.phaseTemplates)) {
           // Merge with existing IDs, removing duplicates
           const schemaIds = schema.metadata.phaseTemplates;
           schemaIds.forEach((id: string) => {
             if (!phaseTemplateIds.includes(id)) {
               phaseTemplateIds.push(id);
             }
           });
         }
       }
       
       // Use the schema validator to ensure proper schema structure for metadata
       if (needsNormalization(normalized.metadata)) {
         logger.debug({ templateId: normalized.id }, 'Normalizing POV template metadata');
         normalized.metadata = validateTemplateSchema(normalized.metadata).metadata;
       }
       
       // Set the standardized phase templates in the metadata
       // We've already ensured metadata exists with the default value above, but TypeScript doesn't know that
       if (normalized.metadata) {
         normalized.metadata.phaseTemplates = phaseTemplateIds;
       }
       return normalized;
     }
   }
 
   /**
    * Normalizes a raw Stage object.
    * @param rawStage The raw stage data.
    * @returns The normalized Stage object.
    */
   private normalizeStage(rawStage: any): Stage {
       return {
           name: rawStage.name || 'Unnamed Stage',
           description: rawStage.description || '',
           status: rawStage.status, // Assuming status is already correct or handled elsewhere
           order: rawStage.order,
           dependencies: Array.isArray(rawStage.dependencies) ? rawStage.dependencies : [], // Ensure dependencies is an array
           tasks: Array.isArray(rawStage.tasks) ? rawStage.tasks.map(this.normalizeTask.bind(this)) : [], // Normalize tasks
           metadata: rawStage.metadata || {}, // Ensure metadata is an object
       };
   }
 
    /**
    * Normalizes a raw Task object.
    * @param rawTask The raw task data.
    * @returns The normalized Task object.
    */
   private normalizeTask(rawTask: any): Task {
       // Add deprecation warning when name is used instead of title
       if (rawTask.name && !rawTask.title) {
         logger.warn({ taskName: rawTask.name }, 'Deprecated: task uses "name" instead of "title"');
       }
       
       return {
           id: rawTask.id || rawTask.key || '', // Accept either id or key for backward compatibility
           title: rawTask.title || rawTask.name || 'Unnamed Task', // Prioritize title, fallback to name for backward compatibility
           description: rawTask.description || '',
           required: rawTask.required || false,
           priority: rawTask.priority, // Assuming priority is already correct or handled elsewhere
           dependencies: Array.isArray(rawTask.dependencies) ? rawTask.dependencies : [], // Ensure dependencies is an array
           estimatedDuration: rawTask.estimatedDuration ? this.normalizeDuration(rawTask.estimatedDuration) : undefined, // Normalize duration
           metadata: rawTask.metadata || {}, // Ensure metadata is an object
           type: rawTask.type, // Add the type property
       };
   }
 
   /**
    * Normalizes a raw Duration object.
    * @param rawDuration The raw duration data.
    * @returns The normalized Duration object.
    */
   private normalizeDuration(rawDuration: any): Duration {
       return {
           value: rawDuration.value || 0,
           unit: rawDuration.unit || 'DAYS', // Provide default unit
       };
   }
 
   /**
    * Normalizes a raw ValidationRule object.
    * @param rawRule The raw validation rule data.
    * @returns The normalized ValidationRule object.
    */
   private normalizeValidationRule(rawRule: any): ValidationRule {
       return {
           type: rawRule.type, // Assuming type is already correct or handled elsewhere
           condition: rawRule.condition || '', // Ensure condition exists
           errorMessage: rawRule.errorMessage,
       };
   }
 
   /**
    * Normalizes a raw TimelineRecommendation object.
    * @param rawRecommendation The raw timeline recommendation data.
    * @returns The normalized TimelineRecommendation object.
    */
   private normalizeTimelineRecommendation(rawRecommendation: any): TimelineRecommendation {
       return {
           minimumDuration: rawRecommendation.minimumDuration ? this.normalizeDuration(rawRecommendation.minimumDuration) : undefined,
           maximumDuration: rawRecommendation.maximumDuration ? this.normalizeDuration(rawRecommendation.maximumDuration) : undefined,
           stageDurations: rawRecommendation.stageDurations || {}, // Ensure stageDurations is an object
       };
   }
 
   /**
    * Normalizes a raw FormSection object.
    * @param rawSection The raw form section data.
    * @returns The normalized FormSection object.
    */
   private normalizeFormSection(rawSection: any): FormSection {
       return {
           id: rawSection.id || '', // Ensure ID exists
           title: rawSection.title || 'Unnamed Section',
           description: rawSection.description || '',
           fields: Array.isArray(rawSection.fields) ? rawSection.fields.map(this.normalizeFormField.bind(this)) : [], // Normalize fields
       };
   }
 
   /**
    * Normalizes a raw FormField object.
    * @param rawField The raw form field data.
    * @returns The normalized FormField object.
    */
   private normalizeFormField(rawField: any): FormField {
       return {
           id: rawField.id || '', // Ensure ID exists
           type: rawField.type || 'text', // Provide default type
           label: rawField.label || rawField.id || 'Unnamed Field', // Provide default label
           placeholder: rawField.placeholder,
           required: rawField.required || false,
           options: Array.isArray(rawField.options) ? rawField.options : [], // Ensure options is an array
       };
   }
 
 
    /**
     * Resolves IDs within template data (e.g., task dependencies, associated phase templates)
     * to human-readable names. This might require fetching additional data.
     * @param template The template data to process.
     * @returns The template data with IDs resolved to names where applicable.
     *
     * NOTE: This is a placeholder implementation. The actual ID resolution logic
     * will be implemented in a later sprint.
     */
    public async resolveIdsToNames(template: PhaseTemplate | POVTemplate): Promise<PhaseTemplate | POVTemplate> {
      // In a real implementation, fetch related entities and replace IDs with names.
      return template; // Return original for now
    }
 
    /**
     * Validates template data against defined schemas and rules.
     * @param template The template data to validate.
     * @param type The type of the template ('phase' or 'pov').
     * @returns True if the template is valid, false otherwise.
     *
     * Basic structural guard for template IMPORT (via processRawTemplateForImport →
     * /api/phase-templates/import): rejects imported JSON missing required fields. Intentionally
     * minimal by design (2026-07-02) — the admin UI builder runs its own detailed local validation,
     * and there is deliberately no richer server-side template validation. NOT a placeholder
     * awaiting implementation.
     */
    public validateTemplate(template: PhaseTemplate | POVTemplate, type: 'phase' | 'pov'): boolean {
      // Required-field checks for imported template JSON (name/description + type-specific fields).
 
      // For new templates, id can be empty, but name and description are still required
      if (!template.name || !template.description) {
        logger.error({ templateId: template.id }, 'Template validation failed: missing name or description');
        return false;
      }
 
      if (type === 'phase') {
        const phaseTemplate = template as PhaseTemplate;
        if (!phaseTemplate.type || !phaseTemplate.stages) {
           logger.error({ templateId: template.id }, 'Phase template validation failed: missing type or stages');
           return false;
        }
        // Add more specific phase template validation here
      } else { // type === 'pov'
        const povTemplate = template as POVTemplate;
        if (!povTemplate.sections || !povTemplate.fields) {
           logger.error({ templateId: template.id }, 'POV template validation failed: missing sections or fields');
           return false;
        }
        // Add more specific POV template validation here
      }
      return true;
    }
 
    /**
     * Adds template data to the cache.
     * @param template The template data to cache.
     * @param type The type of the template ('phase' or 'pov').
     */
    private cacheTemplateData(template: PhaseTemplate | POVTemplate, type: 'phase' | 'pov'): void {
       const cacheKey = `${type}-${template.id}`;
       this.templateCache.set(cacheKey, template);
    }
 
    /**
     * Clears the entire template cache.
     */
    public clearCache(): void {
      this.templateCache.clear();
    }
 
    // Add other utility methods as needed, e.g., for fetching related entities for ID resolution
    // private async getTaskNamesByIds(taskIds: string[]): Promise<string[]> { ... }
    // private async getPhaseTemplateNamesByIds(templateIds: string[]): Promise<string[]> { ... }
    /**
     * Processes raw template data for import, including normalization and validation.
     * This method is intended for use by API routes handling template import.
     * @param rawData The raw template data from the import request.
     * @param type The type of the template ('phase' or 'pov').
     * @returns The normalized and validated template data.
     * @throws Error if validation fails.
     */
    public processRawTemplateForImport(rawData: any, type: 'phase' | 'pov'): PhaseTemplate | POVTemplate {
        // Normalize the raw data
        const normalizedTemplate = this.normalizeTemplate(rawData, type);
 
        // Guard the imported JSON: reject anything missing required structural fields (basic by design).
        const isValid = this.validateTemplate(normalizedTemplate, type);

        if (!isValid) {
            throw new Error('Template validation failed: imported template is missing required fields');
        }
 
        return normalizedTemplate;
    }

    /**
     * Processes and validates dependencies within a PhaseTemplate for import.
     * Ensures dependencies refer to valid task keys within the same template.
     * @param template The PhaseTemplate data to process.
     * @returns The processed PhaseTemplate data and a list of dependency errors.
     */
    public processDependenciesForImport(template: PhaseTemplate): { processedTemplate: PhaseTemplate; errors: string[] } {
      const errors: string[] = [];
      const taskKeys = new Set<string>();

      // Collect all task keys in the template
      for (const stage of template.stages) {
        for (const task of stage.tasks) {
          if (task.id) {
            taskKeys.add(task.id);
          }
        }
      }

      // Validate dependencies
      const processedStages = template.stages.map(stage => {
        const processedTasks = stage.tasks.map(task => {
          if (task.dependencies && Array.isArray(task.dependencies)) {
            const validDependencies: string[] = [];
            for (const depKey of task.dependencies) {
              if (taskKeys.has(depKey)) {
                validDependencies.push(depKey);
              } else {
                errors.push(`Task "${task.title}" (id: ${task.id}) has a dependency on unknown task id: "${depKey}"`);
              }
            }
            return { ...task, dependencies: validDependencies };
          }
          return task;
        });
        return { ...stage, tasks: processedTasks };
      });

      const processedTemplate = { ...template, stages: processedStages };

      // TODO: Add circular dependency detection here
      // This would require a graph traversal algorithm.
      // For now, we focus on validating existence of dependency keys.

      return { processedTemplate, errors };
    }
  }
 
  // Export an instance of the service for use throughout the application
  export const templateService = new TemplateService();
