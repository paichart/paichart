import { produce } from 'immer';
import { TemplateAction } from '../types/TemplateActions';
import { TemplateEditorState } from '../types/TemplateEditorState';

/**
 * Template editor reducer using Immer for immutable updates
 */
export function templateEditorReducer(
  state: TemplateEditorState,
  action: TemplateAction
): TemplateEditorState {
  return produce(state, (draft) => {
    switch (action.type) {

      // Field management
      case 'SET_FIELD': {
        const { path, value } = action;
        let current: any = draft.data;
        for (let i = 0; i < path.length - 1; i++) {
          if (!current[path[i]]) {
            current[path[i]] = {};
          }
          current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
        if (!draft.ui.dirtyFields.includes(path.join('.'))) {
          draft.ui.dirtyFields.push(path.join('.'));
        }
        draft.meta.isDirty = true;
        break;
      }

      case 'UPDATE_FIELD':
        if (draft.data.fields) {
          draft.data.fields[action.fieldId] = {
            ...draft.data.fields[action.fieldId],
            ...action.field,
          };
          if (!draft.ui.dirtyFields.includes(`fields.${action.fieldId}`)) {
            draft.ui.dirtyFields.push(`fields.${action.fieldId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'ADD_FIELD':
        if (!draft.data.fields) {
          draft.data.fields = {};
        }
        draft.data.fields[action.fieldId] = action.field;
        if (!draft.ui.dirtyFields.includes(`fields.${action.fieldId}`)) {
          draft.ui.dirtyFields.push(`fields.${action.fieldId}`);
        }
        draft.meta.isDirty = true;
        break;

      case 'REMOVE_FIELD':
        if (draft.data.fields) {
          delete draft.data.fields[action.fieldId];
          if (!draft.ui.dirtyFields.includes(`fields.${action.fieldId}`)) {
            draft.ui.dirtyFields.push(`fields.${action.fieldId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      // Section management
      case 'UPDATE_SECTION':
        if (draft.data.sections && draft.data.sections[action.sectionIndex]) {
          draft.data.sections[action.sectionIndex] = {
            ...draft.data.sections[action.sectionIndex],
            ...action.section,
          };
          if (!draft.ui.dirtyFields.includes(`sections.${action.sectionIndex}`)) {
            draft.ui.dirtyFields.push(`sections.${action.sectionIndex}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'ADD_SECTION':
        if (!draft.data.sections) {
          draft.data.sections = [];
        }
        draft.data.sections.push(action.section);
        if (!draft.ui.dirtyFields.includes('sections')) {
          draft.ui.dirtyFields.push('sections');
        }
        draft.meta.isDirty = true;
        break;

      case 'REMOVE_SECTION':
        if (draft.data.sections) {
          draft.data.sections.splice(action.sectionIndex, 1);
          if (!draft.ui.dirtyFields.includes('sections')) {
            draft.ui.dirtyFields.push('sections');
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REORDER_SECTIONS':
        if (draft.data.sections) {
          const [removed] = draft.data.sections.splice(action.fromIndex, 1);
          draft.data.sections.splice(action.toIndex, 0, removed);
          if (!draft.ui.dirtyFields.includes('sections')) {
            draft.ui.dirtyFields.push('sections');
          }
          draft.meta.isDirty = true;
        }
        break;

      // Phase management
      case 'ADD_PHASE':
        if (!draft.data.phases) {
          draft.data.phases = {};
        }
        draft.data.phases[action.phase.id] = action.phase;
        if (!draft.relationships) {
          draft.relationships = {
            phaseOrder: [],
            phaseToStages: {},
            stageToTasks: {},
          };
        }
        draft.relationships.phaseOrder.push(action.phase.id);
        if (!draft.ui.dirtyFields.includes(`phases.${action.phase.id}`)) {
          draft.ui.dirtyFields.push(`phases.${action.phase.id}`);
        }
        draft.meta.isDirty = true;
        break;

      case 'UPDATE_PHASE':
        if (draft.data.phases && draft.data.phases[action.phaseId]) {
          draft.data.phases[action.phaseId] = {
            ...draft.data.phases[action.phaseId],
            ...action.updates,
          };
          if (!draft.ui.dirtyFields.includes(`phases.${action.phaseId}`)) {
            draft.ui.dirtyFields.push(`phases.${action.phaseId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REMOVE_PHASE':
        if (draft.data.phases) {
          delete draft.data.phases[action.phaseId];
          if (draft.relationships) {
            draft.relationships.phaseOrder = draft.relationships.phaseOrder.filter(
              id => id !== action.phaseId
            );
            delete draft.relationships.phaseToStages[action.phaseId];
          }
          if (!draft.ui.dirtyFields.includes(`phases.${action.phaseId}`)) {
            draft.ui.dirtyFields.push(`phases.${action.phaseId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REORDER_PHASES':
        if (draft.relationships) {
          draft.relationships.phaseOrder = action.phaseIds;
          if (!draft.ui.dirtyFields.includes('phases')) {
            draft.ui.dirtyFields.push('phases');
          }
          draft.meta.isDirty = true;
        }
        break;

      // Stage management
      case 'ADD_STAGE':
        if (!draft.data.stages) {
          draft.data.stages = {};
        }
        draft.data.stages[action.stage.id] = action.stage;
        if (!draft.relationships) {
          draft.relationships = {
            phaseOrder: [],
            phaseToStages: {},
            stageToTasks: {},
          };
        }
        if (!draft.relationships.phaseToStages[action.stage.phaseId]) {
          draft.relationships.phaseToStages[action.stage.phaseId] = [];
        }
        draft.relationships.phaseToStages[action.stage.phaseId].push(action.stage.id);
        if (!draft.ui.dirtyFields.includes(`stages.${action.stage.id}`)) {
          draft.ui.dirtyFields.push(`stages.${action.stage.id}`);
        }
        draft.meta.isDirty = true;
        break;

      case 'UPDATE_STAGE':
        if (draft.data.stages && draft.data.stages[action.stageId]) {
          draft.data.stages[action.stageId] = {
            ...draft.data.stages[action.stageId],
            ...action.updates,
          };
          if (!draft.ui.dirtyFields.includes(`stages.${action.stageId}`)) {
            draft.ui.dirtyFields.push(`stages.${action.stageId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REMOVE_STAGE':
        if (draft.data.stages) {
          const stage = draft.data.stages[action.stageId];
          delete draft.data.stages[action.stageId];
          if (draft.relationships && stage) {
            const phaseStages = draft.relationships.phaseToStages[stage.phaseId];
            if (phaseStages) {
              draft.relationships.phaseToStages[stage.phaseId] = phaseStages.filter(
                id => id !== action.stageId
              );
            }
            delete draft.relationships.stageToTasks[action.stageId];
          }
          if (!draft.ui.dirtyFields.includes(`stages.${action.stageId}`)) {
            draft.ui.dirtyFields.push(`stages.${action.stageId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REORDER_STAGES':
        if (draft.relationships) {
          draft.relationships.phaseToStages[action.phaseId] = action.stageIds;
          if (!draft.ui.dirtyFields.includes(`stages.${action.phaseId}`)) {
            draft.ui.dirtyFields.push(`stages.${action.phaseId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      // Task management
      case 'ADD_TASK':
        if (!draft.data.tasks) {
          draft.data.tasks = {};
        }
        draft.data.tasks[action.task.id] = action.task;
        if (!draft.relationships) {
          draft.relationships = {
            phaseOrder: [],
            phaseToStages: {},
            stageToTasks: {},
          };
        }
        if (!draft.relationships.stageToTasks[action.task.stageId]) {
          draft.relationships.stageToTasks[action.task.stageId] = [];
        }
        draft.relationships.stageToTasks[action.task.stageId].push(action.task.id);
        if (!draft.ui.dirtyFields.includes(`tasks.${action.task.id}`)) {
          draft.ui.dirtyFields.push(`tasks.${action.task.id}`);
        }
        draft.meta.isDirty = true;
        break;

      case 'UPDATE_TASK':
        if (draft.data.tasks && draft.data.tasks[action.taskId]) {
          draft.data.tasks[action.taskId] = {
            ...draft.data.tasks[action.taskId],
            ...action.updates,
          };
          if (!draft.ui.dirtyFields.includes(`tasks.${action.taskId}`)) {
            draft.ui.dirtyFields.push(`tasks.${action.taskId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REMOVE_TASK':
        if (draft.data.tasks) {
          const task = draft.data.tasks[action.taskId];
          delete draft.data.tasks[action.taskId];
          if (draft.relationships && task) {
            const stageTasks = draft.relationships.stageToTasks[task.stageId];
            if (stageTasks) {
              draft.relationships.stageToTasks[task.stageId] = stageTasks.filter(
                id => id !== action.taskId
              );
            }
          }
          if (!draft.ui.dirtyFields.includes(`tasks.${action.taskId}`)) {
            draft.ui.dirtyFields.push(`tasks.${action.taskId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      case 'REORDER_TASKS':
        if (draft.relationships) {
          draft.relationships.stageToTasks[action.stageId] = action.taskIds;
          if (!draft.ui.dirtyFields.includes(`tasks.${action.stageId}`)) {
            draft.ui.dirtyFields.push(`tasks.${action.stageId}`);
          }
          draft.meta.isDirty = true;
        }
        break;

      // UI state management
      case 'SET_ACTIVE_TAB':
        draft.ui.activeTab = action.tab;
        break;

      case 'SET_SELECTED_PHASE':
        draft.ui.selectedPhaseId = action.phaseId;
        break;

      case 'SET_SELECTED_STAGE':
        draft.ui.selectedStageId = action.stageId;
        break;

      case 'SET_SELECTED_TASK':
        draft.ui.selectedTaskId = action.taskId;
        break;

      case 'SET_PREVIEW_MODE':
        draft.ui.showPreview = action.showPreview;
        break;

      case 'SET_DESIGN_MODE':
        draft.ui.designMode = action.designMode;
        break;

      // Validation and error management
      case 'SET_VALIDATION_ERRORS':
        draft.ui.validationErrors = action.errors;
        draft.meta.isValid = Object.keys(action.errors).length === 0;
        break;

      case 'CLEAR_VALIDATION_ERRORS':
        draft.ui.validationErrors = {};
        draft.meta.isValid = true;
        break;

      case 'ADD_VALIDATION_ERROR':
        if (!draft.ui.validationErrors[action.field]) {
          draft.ui.validationErrors[action.field] = [];
        }
        draft.ui.validationErrors[action.field].push(action.error);
        draft.meta.isValid = false;
        break;

      case 'REMOVE_VALIDATION_ERROR':
        delete draft.ui.validationErrors[action.field];
        draft.meta.isValid = Object.keys(draft.ui.validationErrors).length === 0;
        break;

      // State management
      case 'MARK_DIRTY':
        draft.meta.isDirty = true;
        if (action.fieldPaths) {
          action.fieldPaths.forEach(path => {
            if (!draft.ui.dirtyFields.includes(path)) {
              draft.ui.dirtyFields.push(path);
            }
          });
        }
        break;

      case 'MARK_CLEAN':
        draft.meta.isDirty = false;
        draft.ui.dirtyFields = []; // Create new empty array
        draft.meta.saveCount += 1;
        draft.meta.lastSaved = new Date().toISOString();
        break;

      case 'SET_SUBMITTING':
        draft.ui.isSubmitting = action.isSubmitting;
        break;

      case 'SET_VALID':
        draft.meta.isValid = action.isValid;
        break;

      // Template lifecycle
      case 'INITIALIZE_TEMPLATE':
        // Safely merge template data without overwriting the entire draft
        if (action.template.data) {
          Object.assign(draft.data, action.template.data);
        }
        if (action.template.ui) {
          Object.assign(draft.ui, action.template.ui);
        }
        if (action.template.relationships) {
          draft.relationships = action.template.relationships;
        }
        if (action.template.meta) {
          Object.assign(draft.meta, action.template.meta);
        }
        
        // Ensure clean state after initialization
        draft.meta.isDirty = false;
        draft.ui.dirtyFields = []; // Create new empty array
        break;

      case 'RESET_TEMPLATE':
        // Reset to initial state while preserving template type
        const templateType = draft.ui.templateType;
        Object.assign(draft, {
          data: {
            name: '',
            description: '',
            type: templateType,
            fields: templateType === 'pov' ? {} : undefined,
            sections: templateType === 'pov' ? [] : undefined,
            phases: templateType === 'phase' ? {} : undefined,
            stages: templateType === 'phase' ? {} : undefined,
            tasks: templateType === 'phase' ? {} : undefined,
          },
          ui: {
            ...draft.ui,
            dirtyFields: [],
            validationErrors: {},
            isSubmitting: false,
          },
          relationships: templateType === 'phase' ? {
            phaseOrder: [],
            phaseToStages: {},
            stageToTasks: {},
          } : undefined,
          meta: {
            lastSaved: null,
            isDirty: false,
            isValid: true,
            saveCount: 0,
          },
        });
        break;

      case 'DUPLICATE_TEMPLATE':
        Object.assign(draft, action.sourceTemplate);
        draft.data.id = undefined;
        draft.data.name = `${draft.data.name} (Copy)`;
        draft.meta.isDirty = true;
        draft.meta.lastSaved = null;
        draft.meta.saveCount = 0;
        break;

      // Bulk operations
      case 'BULK_UPDATE_FIELDS':
        draft.data.fields = action.fields;
        if (!draft.ui.dirtyFields.includes('fields')) {
          draft.ui.dirtyFields.push('fields');
        }
        draft.meta.isDirty = true;
        break;

      case 'BULK_UPDATE_SECTIONS':
        draft.data.sections = action.sections;
        if (!draft.ui.dirtyFields.includes('sections')) {
          draft.ui.dirtyFields.push('sections');
        }
        draft.meta.isDirty = true;
        break;

      case 'BULK_UPDATE_PHASES':
        draft.data.phases = action.phases;
        if (!draft.ui.dirtyFields.includes('phases')) {
          draft.ui.dirtyFields.push('phases');
        }
        draft.meta.isDirty = true;
        break;

      // Import/Export operations
      case 'IMPORT_TEMPLATE_DATA':
        Object.assign(draft.data, action.data);
        draft.meta.isDirty = true;
        if (!draft.ui.dirtyFields.includes('imported')) {
          draft.ui.dirtyFields.push('imported');
        }
        break;

      case 'EXPORT_TEMPLATE_DATA':
        // This is handled in the action creator, no state change needed
        break;

      default:
        // TypeScript will ensure all cases are handled
        break;
    }
  });
}
