import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  Template, 
  ViewMode, 
  TemplateViewContextType, 
  UserPreferences,
  ViewModeDefinition
} from '../types';
import { validateTemplate } from '../utils/validationService';
import { createCommandSystem } from '../utils/commandSystem';
import { createHistoryManager } from '../utils/historyManager';

// Default template
const defaultTemplate: Template = {
  name: '',
  description: '',
  stages: [],
};

// Default user preferences
const defaultUserPreferences: UserPreferences = {
  defaultViewMode: ViewMode.DEFAULT,
  viewModePreferences: {
    [ViewMode.DEFAULT]: { isEnabled: true },
    [ViewMode.TREE]: { isEnabled: true },
    [ViewMode.GRAPH]: { isEnabled: true },
    [ViewMode.SPLIT]: { isEnabled: true },
    [ViewMode.CAROUSEL]: { isEnabled: true },
    [ViewMode.SMART_FOLDING]: { isEnabled: true },
    [ViewMode.UNIFIED]: { isEnabled: true },
  },
};

// Create the context
const TemplateViewContext = createContext<TemplateViewContextType | undefined>(undefined);

// Props for the provider
interface TemplateViewProviderProps {
  children: React.ReactNode;
  initialTemplate?: Template;
  onSave?: (template: Template) => void;
  viewModes: ViewModeDefinition[];
  initialViewMode?: ViewMode;
  readOnly?: boolean;
}

/**
 * Provider component for the template view context
 */
export const TemplateViewProvider: React.FC<TemplateViewProviderProps> = ({
  children,
  initialTemplate = defaultTemplate,
  onSave,
  viewModes,
  initialViewMode = ViewMode.DEFAULT,
  readOnly = false,
}) => {
  // State for the template
  const [template, setTemplate] = useState<Template>(initialTemplate);

  // Update internal template state when initialTemplate prop changes
  useEffect(() => {
    setTemplate(initialTemplate);
  }, [initialTemplate]);
  
  // State for the active view mode
  const [activeViewMode, setActiveViewMode] = useState<ViewMode>(initialViewMode);
  
  // State for read-only mode
  const [isReadOnly, setIsReadOnly] = useState<boolean>(readOnly);
  
  // State for user preferences
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(() => {
    // Try to load preferences from localStorage
    try {
      const savedPreferences = localStorage.getItem('templateViewPreferences');
      if (savedPreferences) {
        return JSON.parse(savedPreferences) as UserPreferences;
      }
    } catch (error) {
    }
    
    return defaultUserPreferences;
  });
  
  // Create command system and history manager
  const commandSystem = createCommandSystem();
  const historyManager = createHistoryManager();
  
  // Update template with validation
  const updateTemplate = useCallback((newTemplate: Template) => {
    // Validate the template
    const validationResult = validateTemplate(newTemplate);
    
    // Set the template
    setTemplate(newTemplate);
    
    return validationResult;
  }, []);
  
  // Save the template
  const saveTemplate = useCallback(() => {
    // Check if this is a POV template
    const isPOVTemplate = template.metadata?.originalType === 'povTemplate';
    
    
    // Validate the template (skip validation for POV templates)
    const validationResult = isPOVTemplate ? { isValid: true, errors: [] } : validateTemplate(template);
    
    
    // If the template is valid, save it
    if (validationResult.isValid && onSave) {
      onSave(template);
    }
    
    return validationResult;
  }, [template, onSave]);
  
  // Update user preferences
  const updateUserPreferences = useCallback((preferences: Partial<UserPreferences>) => {
    setUserPreferences((prev) => {
      const newPreferences = { ...prev, ...preferences };
      
      // Save preferences to localStorage
      try {
        localStorage.setItem('templateViewPreferences', JSON.stringify(newPreferences));
      } catch (error) {
      }
      
      return newPreferences;
    });
  }, []);
  
  // Filter available view modes based on user preferences
  const availableViewModes = viewModes.filter(
    (mode) => userPreferences.viewModePreferences[mode.id]?.isEnabled
  );
  
  // Context value
  const contextValue: TemplateViewContextType = {
    activeViewMode,
    setActiveViewMode,
    availableViewModes,
    template,
    updateTemplate,
    saveTemplate,
    isReadOnly,
    setIsReadOnly,
    userPreferences,
    updateUserPreferences,
  };
  
  return (
    <TemplateViewContext.Provider value={contextValue}>
      {children}
    </TemplateViewContext.Provider>
  );
};

/**
 * Hook to use the template view context
 */
export const useTemplateView = (): TemplateViewContextType => {
  const context = useContext(TemplateViewContext);
  
  if (context === undefined) {
    throw new Error('useTemplateView must be used within a TemplateViewProvider');
  }
  
  return context;
};
