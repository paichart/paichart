"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { PhaseTemplate, POVTemplate, FormSection, FormField } from '@/lib/pov/phase-templates/types'; // Import types from unified definition
import { templateService } from '@/lib/services/template-service'; // Import templateService

// Define PhaseType enum to match the Prisma schema
// Removed local PhaseTemplate definition as it's now imported

// Define deep linking parameters interface
export interface DeepLinkParams {
  templateId?: string;
  action?: 'edit' | 'preview' | 'new';
  templateType?: 'pov' | 'phase';
}

// Define the context state interface
interface TemplateContextState {
  // Templates
  phaseTemplates: PhaseTemplate[];
  povTemplates: POVTemplate[];

  // Loading states
  loadingPhaseTemplates: boolean;
  loadingPOVTemplates: boolean;

  // Error states
  phaseTemplatesError: string | null;
  povTemplatesError: string | null;

  // Deep linking
  deepLinkParams: DeepLinkParams;

  // Actions
  fetchPhaseTemplates: (forceRefresh?: boolean) => Promise<void>;
  fetchPOVTemplates: (forceRefresh?: boolean) => Promise<void>;
  updateDeepLinkParams: (params: DeepLinkParams) => void;
  clearErrors: () => void;

  // Toast notifications
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>;
  dismissToast: (id: string) => void;
}

// Create the context
const TemplateContext = createContext<TemplateContextState | undefined>(undefined);

// Provider component
export function TemplateProvider({ children }: { children: ReactNode }) {
  // Templates state
  const [phaseTemplates, setPhaseTemplates] = useState<PhaseTemplate[]>([]);
  const [povTemplates, setPOVTemplates] = useState<POVTemplate[]>([]);

  // Loading states
  const [loadingPhaseTemplates, setLoadingPhaseTemplates] = useState(false);
  const [loadingPOVTemplates, setLoadingPOVTemplates] = useState(false);

  // Error states
  const [phaseTemplatesError, setPhaseTemplatesError] = useState<string | null>(null);
  const [povTemplatesError, setPOVTemplatesError] = useState<string | null>(null);

  // Deep linking state
  const [deepLinkParams, setDeepLinkParams] = useState<DeepLinkParams>({});

  // Toast notifications
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  // Fetch phase templates
  const fetchPhaseTemplates = useCallback(async (forceRefresh = false) => {
    if (loadingPhaseTemplates && !forceRefresh) {
      return;
    }

    setLoadingPhaseTemplates(true);
    setPhaseTemplatesError(null);

    try {
      const templates = await templateService.listTemplates('phase', forceRefresh);
      // The service returns normalized templates, no need for local transformation
      setPhaseTemplates(templates as PhaseTemplate[]);
    } catch (err: any) {
      // Could not fetch phase templates
      setPhaseTemplatesError(err.message || 'Failed to load phase templates. Please try again later.');
    } finally {
      setLoadingPhaseTemplates(false);
    }
  }, [loadingPhaseTemplates]); // Removed phaseTemplatesFetched dependency

  // Fetch POV templates
  const fetchPOVTemplates = useCallback(async (forceRefresh = false) => {
    if (loadingPOVTemplates && !forceRefresh) {
      return;
    }

    setLoadingPOVTemplates(true);
    setPOVTemplatesError(null);

    try {
      const templates = await templateService.listTemplates('pov', forceRefresh);
      // The service returns normalized templates, no need for local transformation
      setPOVTemplates(templates as POVTemplate[]);
    } catch (err: any) {
      // Could not fetch POV templates
      setPOVTemplatesError(err.message || 'Failed to load POV templates. Please try again later.');
    } finally {
      setLoadingPOVTemplates(false);
    }
  }, [loadingPOVTemplates]); // Removed povTemplatesFetched dependency

  // Update deep link parameters
  const updateDeepLinkParams = (params: DeepLinkParams) => {
    // Only update state if parameters have actually changed
    if (JSON.stringify(deepLinkParams) !== JSON.stringify(params)) {
      setDeepLinkParams(params);
    }

    // Update URL without full page reload
    const url = new URL(window.location.href);

    // Set or remove parameters based on their values
    if (params.templateId) {
      url.searchParams.set('templateId', params.templateId);
    } else {
      url.searchParams.delete('templateId');
    }

    if (params.action) {
      url.searchParams.set('action', params.action);
    } else {
      url.searchParams.delete('action');
    }

    if (params.templateType) {
      url.searchParams.set('templateType', params.templateType);
    } else {
      url.searchParams.delete('templateType');
    }

    // Keep the active tab parameter
    const tab = url.searchParams.get('tab');
    if (tab) {
      url.searchParams.set('tab', tab);
    }

    window.history.pushState({ tab, ...params }, '', url);
  };

  // Clear errors
  const clearErrors = () => {
    setPhaseTemplatesError(null);
    setPOVTemplatesError(null);
  };

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setToasts([...toasts, { id, message, type }]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissToast(id);
    }, 5000);
  };

  // Dismiss toast notification
  const dismissToast = (id: string) => {
    setToasts(toasts.filter(toast => toast.id !== id));
  };

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Get deep linking parameters
    const templateId = params.get('templateId') || undefined;
    const action = params.get('action') as 'edit' | 'preview' | 'new' | undefined;
    const templateType = params.get('templateType') as 'pov' | 'phase' | undefined;

    // Set deep linking parameters if they exist
    if (templateId || action || templateType) {
      setDeepLinkParams({
        templateId,
        action,
        templateType
      });
    }
  }, []);

  // Fetch templates on mount - with a flag to prevent multiple fetches
  const initialFetchRef = useRef(false);
  
  useEffect(() => {
    if (!initialFetchRef.current) {
      initialFetchRef.current = true;
      fetchPhaseTemplates();
      fetchPOVTemplates();
    }
  }, [fetchPhaseTemplates, fetchPOVTemplates]);

  // Context value
  const value: TemplateContextState = {
    phaseTemplates,
    povTemplates,
    loadingPhaseTemplates,
    loadingPOVTemplates,
    phaseTemplatesError,
    povTemplatesError,
    deepLinkParams,
    fetchPhaseTemplates,
    fetchPOVTemplates,
    updateDeepLinkParams,
    clearErrors,
    showToast,
    toasts,
    dismissToast
  };

  return (
    <TemplateContext.Provider value={value}>
      {children}
    </TemplateContext.Provider>
  );
}

// Custom hook to use the template context
export function useTemplateContext() {
  const context = useContext(TemplateContext);

  if (context === undefined) {
    throw new Error('useTemplateContext must be used within a TemplateProvider');
  }

  return context;
}