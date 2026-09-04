import { EditorState } from './EditorState';

/**
 * Union type for all editor actions
 */
export type EditorAction = 
  | { type: 'SET_FIELD', path: string[], value: any }
  | { type: 'ADD_ENTITY', entityType: string, entity: any }
  | { type: 'UPDATE_ENTITY', entityType: string, id: string, updates: any }
  | { type: 'REMOVE_ENTITY', entityType: string, id: string }
  | { type: 'REORDER_RELATIONSHIP', relationshipKey: string, newOrder: string[] }
  | { type: 'SET_VALIDATION_ERRORS', errors: Record<string, string[]> }
  | { type: 'MARK_DIRTY', fieldPaths: string[] }
  | { type: 'MARK_CLEAN' }
  | { type: 'SET_SUBMITTING', isSubmitting: boolean }
  | { type: 'SET_ACTIVE_TAB', tab: string }
  | { type: 'INITIALIZE_STATE', state: Partial<EditorState> };

/**
 * Type guard for SET_FIELD action
 */
export function isSetFieldAction(action: EditorAction): action is { type: 'SET_FIELD', path: string[], value: any } {
  return action.type === 'SET_FIELD';
}

/**
 * Type guard for ADD_ENTITY action
 */
export function isAddEntityAction(action: EditorAction): action is { type: 'ADD_ENTITY', entityType: string, entity: any } {
  return action.type === 'ADD_ENTITY';
}

/**
 * Type guard for UPDATE_ENTITY action
 */
export function isUpdateEntityAction(action: EditorAction): action is { type: 'UPDATE_ENTITY', entityType: string, id: string, updates: any } {
  return action.type === 'UPDATE_ENTITY';
}

/**
 * Type guard for REMOVE_ENTITY action
 */
export function isRemoveEntityAction(action: EditorAction): action is { type: 'REMOVE_ENTITY', entityType: string, id: string } {
  return action.type === 'REMOVE_ENTITY';
}

/**
 * Type guard for REORDER_RELATIONSHIP action
 */
export function isReorderRelationshipAction(action: EditorAction): action is { type: 'REORDER_RELATIONSHIP', relationshipKey: string, newOrder: string[] } {
  return action.type === 'REORDER_RELATIONSHIP';
}

/**
 * Type guard for SET_VALIDATION_ERRORS action
 */
export function isSetValidationErrorsAction(action: EditorAction): action is { type: 'SET_VALIDATION_ERRORS', errors: Record<string, string[]> } {
  return action.type === 'SET_VALIDATION_ERRORS';
}

/**
 * Type guard for MARK_DIRTY action
 */
export function isMarkDirtyAction(action: EditorAction): action is { type: 'MARK_DIRTY', fieldPaths: string[] } {
  return action.type === 'MARK_DIRTY';
}

/**
 * Type guard for MARK_CLEAN action
 */
export function isMarkCleanAction(action: EditorAction): action is { type: 'MARK_CLEAN' } {
  return action.type === 'MARK_CLEAN';
}

/**
 * Type guard for SET_SUBMITTING action
 */
export function isSetSubmittingAction(action: EditorAction): action is { type: 'SET_SUBMITTING', isSubmitting: boolean } {
  return action.type === 'SET_SUBMITTING';
}

/**
 * Type guard for SET_ACTIVE_TAB action
 */
export function isSetActiveTabAction(action: EditorAction): action is { type: 'SET_ACTIVE_TAB', tab: string } {
  return action.type === 'SET_ACTIVE_TAB';
}

/**
 * Type guard for INITIALIZE_STATE action
 */
export function isInitializeStateAction(action: EditorAction): action is { type: 'INITIALIZE_STATE', state: Partial<EditorState> } {
  return action.type === 'INITIALIZE_STATE';
}
