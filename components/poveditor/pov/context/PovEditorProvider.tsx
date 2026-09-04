"use client";

import { ReactNode, useReducer, useCallback, useMemo, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EditorContext, EditorContextType } from './EditorContext';
import { editorReducer, initialState } from './reducer';
import { useEditorActions } from './hooks';
import { fetchPovData, savePovData, normalizeApiData, denormalizeStateForApi, validateEditorState } from './utils';
import { useUserGeoPreferences } from './hooks/useUserGeoPreferences';
import { fetchTemplateById } from './utils/templateApi';

/**
 * Props for the PovEditorProvider component
 */
interface PovEditorProviderProps {
  children: ReactNode;
  povId?: string;
  mode?: 'create' | 'edit' | 'view' | 'template-based' | 'staging' | 'project';
  templateId?: string;
}

/**
 * Provider component for the editor context
 * @param props Component props
 * @returns Provider component
 */
export function PovEditorProvider({ children, povId, mode = 'create', templateId }: PovEditorProviderProps) {
  // Get user geographical preferences
  const { preferences: geoPreferences, loading: geoLoading } = useUserGeoPreferences();
  
  // Initialize state
  const [state, dispatch] = useReducer(editorReducer, initialState);
  
  // Query client for cache invalidation
  const queryClient = useQueryClient();
  
  // Get action creators
  const actions = useEditorActions(dispatch);
  
  // Apply user geographical preferences to new POVs
  useEffect(() => {
    // Only apply preferences if:
    // 1. We're creating a new POV (not editing)
    // 2. Geo preferences are loaded
    // 3. We're in a POV editing mode
    if (!povId && !geoLoading && geoPreferences) {
      // Apply sales theatre if available
      if (geoPreferences.preferredSalesTheatre) {
        dispatch({
          type: 'SET_FIELD',
          path: ['data', 'salesTheatre'],
          value: geoPreferences.preferredSalesTheatre
        });
      }
      
      // Apply country if available
      if (geoPreferences.preferredCountryId) {
        dispatch({
          type: 'SET_FIELD',
          path: ['data', 'countryId'],
          value: geoPreferences.preferredCountryId
        });
      }
      
      // Apply region if available
      if (geoPreferences.preferredRegionId) {
        dispatch({
          type: 'SET_FIELD',
          path: ['data', 'regionId'],
          value: geoPreferences.preferredRegionId
        });
      }
    }
  }, [povId, geoPreferences, geoLoading, mode]);
  
  // Fetch data if editing existing POV
  const { isLoading, data: povData, error: povError } = useQuery({
    queryKey: ['pov', povId],
    queryFn: () => fetchPovData(povId!),
    enabled: !!povId,
  });

  // Fetch template data if in template-based mode
  const { isLoading: isTemplateLoading, data: templateData, error: templateError } = useQuery({
    queryKey: ['pov-template', templateId],
    queryFn: () => fetchTemplateById(templateId!),
    enabled: !!templateId && mode === 'template-based',
  });

  // Handle successful POV data fetch
  useEffect(() => {
    if (povData) {
      // Transform API data to normalized state structure
      const normalizedData = normalizeApiData(povData);
      dispatch({ type: 'INITIALIZE_STATE', state: normalizedData });

      // Set Analytics tab as default for view mode
      if (mode === 'view') {
        dispatch({ type: 'SET_ACTIVE_TAB', tab: 'analytics' });
      }
    }
  }, [povData, mode]);

  // Handle successful template data fetch
  useEffect(() => {
    if (templateData && mode === 'template-based') {
      // Initialize state with template data
      dispatch({ 
        type: 'SET_FIELD', 
        path: ['data', 'templateId'], 
        value: templateId 
      });
      
      dispatch({ 
        type: 'SET_FIELD', 
        path: ['data', 'templateData'], 
        value: templateData 
      });
      
      // Pre-populate basic info from template
      const template = templateData as any;
      if (template.data?.title) {
        dispatch({ 
          type: 'SET_FIELD', 
          path: ['data', 'title'], 
          value: `${template.data.title} - POV` 
        });
      }
      
      if (template.data?.description) {
        dispatch({ 
          type: 'SET_FIELD', 
          path: ['data', 'description'], 
          value: template.data.description 
        });
      }
      
      // Set phase template IDs if available
      if (template.data?.phaseTemplates && template.data.phaseTemplates.length > 0) {
        const phaseTemplateIds = template.data.phaseTemplates.map((pt: any) => pt.id);
        dispatch({ 
          type: 'SET_FIELD', 
          path: ['data', 'phaseTemplateIds'], 
          value: phaseTemplateIds 
        });
      }
    }
  }, [templateData, mode, templateId]);

  // Handle POV error
  useEffect(() => {
    if (povError) {
      // Error loading POV - could show toast notification
    }
  }, [povError]);

  // Handle template error
  useEffect(() => {
    if (templateError) {
      // Error loading template - could show toast notification
    }
  }, [templateError]);
  
  // Initialize state with mode
  useEffect(() => {
    dispatch({
      type: 'SET_FIELD',
      path: ['ui', 'mode'],
      value: mode
    });
  }, [mode]);
  
  // Save mutation
  const { mutate, isPending: isSaving } = useMutation({
    mutationFn: (data: any) => savePovData(povId, data),
    onMutate: async (data) => {
      // Store the dirty fields and their values before saving
      const dirtyFields = Array.from(state.ui.dirtyFields)
        .filter(path => path.startsWith('data.'))
        .map(path => path.replace('data.', ''));
      
      const dirtyFieldValues: Record<string, any> = {};
      dirtyFields.forEach(field => {
        dirtyFieldValues[field] = (state.data as any)[field];
      });
      
      // Store the dirty field values in the state for reference
      dispatch({ 
        type: 'SET_FIELD', 
        path: ['meta', 'dirtyFieldValues'], 
        value: dirtyFieldValues 
      });
      
      // Optimistic update logic
      await queryClient.cancelQueries({ queryKey: ['pov', povId] });
      const previousData = queryClient.getQueryData(['pov', povId]);
      
      if (povId) {
        queryClient.setQueryData(['pov', povId], data);
      }
      
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });
      
      return { previousData, dirtyFieldValues };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (povId && context?.previousData) {
        queryClient.setQueryData(['pov', povId], context.previousData);
      }

      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    },
    onSuccess: (responseData: { id?: string } | null) => {
      let redirectTo: string | null = null;
      let redirectDelay = 0;

      // Handle new POV creation - redirect to edit page
      if (!povId && responseData && responseData.id) {
        redirectTo = `/pov/edit/${responseData.id}`;
        redirectDelay = 500; // Short delay for new POV creation
      }
      // Handle existing POV update
      else if (povId && responseData && Object.keys(responseData).length > 0) {
        queryClient.setQueryData(['pov', povId], responseData);
      }
      // Fallback for existing POV if responseData is empty but povId exists
      else if (povId) {
         queryClient.invalidateQueries({ queryKey: ['pov', povId] }); // Keep invalidation as a safety net
      }

      // Invalidate the list of POVs
      queryClient.invalidateQueries({ queryKey: ['povs-list'] });

      // Clear selected phase template IDs from state after successful save & processing
      if (state.data.phaseTemplateIds && state.data.phaseTemplateIds.length > 0) {
          dispatch({ type: 'SET_FIELD', path: ['data', 'phaseTemplateIds'], value: [] });

          // Also clear relevant localStorage cache used by PhaseTemplateSelectionSection
          try {
            const cacheKeyForTemplates = povId || (responseData?.id) || 'current';
            localStorage.removeItem(`phaseTemplates_${cacheKeyForTemplates}`);
          } catch {
            // Could not clear phase template localStorage cache
          }
      }

      dispatch({ type: 'MARK_CLEAN' });
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });

      // Perform redirection if specified
      if (redirectTo && typeof window !== 'undefined') {
        setTimeout(() => {
          window.location.href = redirectTo;
        }, redirectDelay);
      }
    },
    onSettled: () => {
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
    }
  });
  
  // Validate state before saving
  const validateState = useCallback(() => {
    const errors = validateEditorState(state);
    dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
    return Object.keys(errors).length === 0;
  }, [state, dispatch]);
  
  // Save data
  const saveData = useCallback(async (): Promise<any> => {
    const isValid = validateState();

    if (!isValid) {
      // Validation failed - could show toast notification
      return;
    }

    // Transform normalized state to API format for POV
    const apiData = denormalizeStateForApi(state);

    // Ensure phase template IDs are included in the request
    // This is a backup in case the denormalizeStateForApi function doesn't include them
    if (state.data.phaseTemplateIds && state.data.phaseTemplateIds.length > 0) {
      // Initialize metadata if it doesn't exist
      if (!(apiData as any).metadata) {
        (apiData as any).metadata = {};
      }

      // Add phaseTemplates to metadata
      (apiData as any).metadata.phaseTemplates = state.data.phaseTemplateIds;
    }

    // Execute mutation and return the result
    return new Promise((resolve, reject) => {
      mutate(apiData, {
        onSuccess: (data) => {
          resolve(data);
        },
        onError: (error) => {
          reject(error);
        }
      });
    });
  }, [state, mutate, validateState]);
  
  // Check if there are validation errors
  const hasErrors = useMemo(() => {
    return Object.keys(state.ui.validationErrors).length > 0;
  }, [state.ui.validationErrors]);
  
  // Calculate combined loading state
  const combinedIsLoading = isLoading || (mode === 'template-based' && isTemplateLoading);
  
  // No initial validation to prevent loops
  
  // Create context value
  const contextValue = useMemo<EditorContextType>(() => ({
    state,
    dispatch,
    updateField: actions.updateField,
    addEntity: actions.addEntity,
    updateEntity: actions.updateEntity,
    removeEntity: actions.removeEntity,
    reorderRelationship: actions.reorderRelationship,
    saveData,
    setActiveTab: actions.setActiveTab,
    isLoading: combinedIsLoading,
    isSaving,
    hasErrors,
  }), [
    state,
    dispatch,
    actions,
    saveData,
    combinedIsLoading,
    isSaving,
    hasErrors
  ]);
  
  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}
