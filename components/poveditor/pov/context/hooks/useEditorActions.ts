import { useCallback } from 'react';
import { EditorAction } from '../types';

/**
 * Custom hook for common editor actions
 * @param dispatch The dispatch function from useReducer
 * @returns Object with action creator functions
 */
export function useEditorActions(dispatch: React.Dispatch<EditorAction>) {
  /**
   * Update a field in the editor state
   * @param path Path to the field
   * @param value New value for the field
   */
  const updateField = useCallback((path: string[], value: any) => {
    dispatch({ type: 'SET_FIELD', path, value });
  }, [dispatch]);
  
  /**
   * Add an entity to the editor state
   * @param entityType Type of entity to add
   * @param entity Entity to add
   * @returns ID of the added entity
   */
  const addEntity = useCallback((entityType: string, entity: any) => {
    const id = entity.id || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    dispatch({ type: 'ADD_ENTITY', entityType, entity: { ...entity, id } });
    return id;
  }, [dispatch]);
  
  /**
   * Update an entity in the editor state
   * @param entityType Type of entity to update
   * @param id ID of the entity to update
   * @param updates Updates to apply
   */
  const updateEntity = useCallback((entityType: string, id: string, updates: any) => {
    dispatch({ type: 'UPDATE_ENTITY', entityType, id, updates });
  }, [dispatch]);
  
  /**
   * Remove an entity from the editor state
   * @param entityType Type of entity to remove
   * @param id ID of the entity to remove
   */
  const removeEntity = useCallback((entityType: string, id: string) => {
    dispatch({ type: 'REMOVE_ENTITY', entityType, id });
  }, [dispatch]);
  
  /**
   * Reorder a relationship in the editor state
   * @param relationshipKey Key of the relationship to reorder
   * @param newOrder New order for the relationship
   */
  const reorderRelationship = useCallback((relationshipKey: string, newOrder: string[]) => {
    dispatch({ type: 'REORDER_RELATIONSHIP', relationshipKey, newOrder });
  }, [dispatch]);
  
  /**
   * Set the active tab in the editor
   * @param tab ID of the tab to activate
   */
  const setActiveTab = useCallback((tab: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', tab });
  }, [dispatch]);
  
  /**
   * Mark fields as dirty
   * @param fieldPaths Paths of the fields to mark as dirty
   */
  const markDirty = useCallback((fieldPaths: string[]) => {
    dispatch({ type: 'MARK_DIRTY', fieldPaths });
  }, [dispatch]);
  
  /**
   * Mark the editor state as clean
   */
  const markClean = useCallback(() => {
    dispatch({ type: 'MARK_CLEAN' });
  }, [dispatch]);
  
  /**
   * Set the submitting state of the editor
   * @param isSubmitting Whether the editor is submitting
   */
  const setSubmitting = useCallback((isSubmitting: boolean) => {
    dispatch({ type: 'SET_SUBMITTING', isSubmitting });
  }, [dispatch]);
  
  /**
   * Set validation errors in the editor state
   * @param errors Validation errors to set
   */
  const setValidationErrors = useCallback((errors: Record<string, string[]>) => {
    dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
  }, [dispatch]);
  
  /**
   * Initialize the editor state
   * @param state State to initialize with
   */
  const initializeState = useCallback((state: any) => {
    dispatch({ type: 'INITIALIZE_STATE', state });
  }, [dispatch]);
  
  return {
    updateField,
    addEntity,
    updateEntity,
    removeEntity,
    reorderRelationship,
    setActiveTab,
    markDirty,
    markClean,
    setSubmitting,
    setValidationErrors,
    initializeState,
  };
}
