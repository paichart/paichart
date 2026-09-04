import { produce, enableMapSet } from 'immer';
import { EditorState, EditorAction } from '../types';
import { initialState } from './initialState';
import { handleAddEntity, handleUpdateEntity, handleRemoveEntity } from './entityReducers';

// Enable the MapSet plugin for Immer
enableMapSet();

/**
 * Reducer function for the editor state
 * @param state The current state
 * @param action The action to apply
 * @returns The new state
 */
export function editorReducer(state: EditorState = initialState, action: EditorAction): EditorState {
  return produce(state, (draft) => {
    switch (action.type) {
      case 'SET_FIELD': {
        let current: any = draft;
        for (let i = 0; i < action.path.length - 1; i++) {
          if (current[action.path[i]] === undefined) {
            current[action.path[i]] = {};
          }
          current = current[action.path[i]];
        }
        current[action.path[action.path.length - 1]] = action.value;

        // Clear validation error optimistically when field is updated
        const fieldPath = action.path.join('.');
        if (draft.ui.validationErrors[fieldPath]) {
          delete draft.ui.validationErrors[fieldPath];
        }

        // Clear cross-field validation errors when parent fields change
        // POV dates affect phase dates which affect task dates
        if (fieldPath === 'data.startDate' || fieldPath === 'data.endDate') {
          // Clear all phase date errors (they may now be valid)
          Object.keys(draft.ui.validationErrors).forEach(errorKey => {
            if (errorKey.includes('.phases.') && (errorKey.includes('.startDate') || errorKey.includes('.endDate'))) {
              delete draft.ui.validationErrors[errorKey];
            }
          });
        }

        // When phase dates change, clear related task date errors
        const phaseEndDateMatch = fieldPath.match(/^entities\.phases\.([^.]+)\.endDate$/);
        if (phaseEndDateMatch) {
          const phaseId = phaseEndDateMatch[1];
          // Clear task due date errors for this phase
          Object.keys(draft.ui.validationErrors).forEach(errorKey => {
            if (errorKey.includes(`.tasks.`) && errorKey.includes('.dueDate')) {
              // Check if task belongs to this phase (would need to verify in entities)
              delete draft.ui.validationErrors[errorKey];
            }
          });
        }

        draft.meta.isDirty = true;
        draft.ui.dirtyFields.add(fieldPath);
        break;
      }
      
      case 'ADD_ENTITY': {
        handleAddEntity(draft, action.entityType, action.entity);
        break;
      }
      
      case 'UPDATE_ENTITY': {
        handleUpdateEntity(draft, action.entityType, action.id, action.updates);
        break;
      }
      
      case 'REMOVE_ENTITY': {
        handleRemoveEntity(draft, action.entityType, action.id);
        break;
      }
      
      case 'REORDER_RELATIONSHIP': {
        if ((draft.relationships as any)[action.relationshipKey]) {
          (draft.relationships as any)[action.relationshipKey] = action.newOrder;
          draft.meta.isDirty = true;
        }
        break;
      }
      
      case 'SET_VALIDATION_ERRORS': {
        draft.ui.validationErrors = action.errors;
        break;
      }
      
      case 'MARK_DIRTY': {
        action.fieldPaths.forEach(path => {
          draft.ui.dirtyFields.add(path);
        });
        draft.meta.isDirty = true;
        break;
      }
      
      case 'MARK_CLEAN': {
        draft.ui.dirtyFields = new Set();
        draft.meta.isDirty = false;
        draft.meta.lastSaved = new Date().toISOString();
        break;
      }
      
      case 'SET_SUBMITTING': {
        draft.meta.isSubmitting = action.isSubmitting;
        break;
      }
      
      case 'SET_ACTIVE_TAB': {
        draft.ui.activeTab = action.tab;
        break;
      }
      
      case 'INITIALIZE_STATE': {
        // Carefully merge the new state with existing state
        if (action.state.data) {
          draft.data = { ...draft.data, ...action.state.data };
        }

        if (action.state.entities) {
          Object.keys(action.state.entities).forEach(entityType => {
            if ((action.state.entities as any)[entityType]) {
              // Complete replacement instead of merge - removes temp entities when server data arrives
              // This prevents duplicate phases/tasks/stages with both temp and real IDs
              (draft.entities as any)[entityType] = (action.state.entities as any)[entityType];
            }
          });
        }

        if (action.state.relationships) {
          Object.keys(action.state.relationships).forEach(relationshipKey => {
            if ((action.state.relationships as any)[relationshipKey]) {
              (draft.relationships as any)[relationshipKey] = (action.state.relationships as any)[relationshipKey];
            }
          });
        }

        draft.meta.isDirty = false;
        draft.ui.dirtyFields = new Set();
        break;
      }
    }
  });
}
