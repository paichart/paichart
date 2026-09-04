import React, { createContext, useContext, useState, useCallback } from 'react';
import { POVTemplate, FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';
import { createSamplePOVTemplate } from '../../adapters/TemplateEditorAdapter';

/**
 * POVTemplateContextType interface
 * Defines the shape of the context value
 */
export interface POVTemplateContextType {
  template: POVTemplate;
  updateTemplate: (updates: Partial<POVTemplate>) => void;
  updateField: (fieldId: string, updates: Partial<FieldDefinition>) => void;
  addField: (field: FieldDefinition) => string;
  removeField: (fieldId: string) => void;
  updateSection: (sectionId: string, updates: Partial<SectionDefinition>) => void;
  addSection: (section: SectionDefinition) => void;
  removeSection: (sectionId: string) => void;
  saveTemplate: () => Promise<{ isValid: boolean; errors: any[] }>;
  isReadOnly: boolean;
}

// Create the context
const POVTemplateContext = createContext<POVTemplateContextType | undefined>(undefined);

// Props for the provider
interface POVTemplateProviderProps {
  children: React.ReactNode;
  initialTemplate?: POVTemplate;
  onSave?: (template: POVTemplate) => void;
  readOnly?: boolean;
}

/**
 * Provider component for the POV template context
 */
export const POVTemplateProvider: React.FC<POVTemplateProviderProps> = ({
  children,
  initialTemplate,
  onSave,
  readOnly = false,
}) => {
  // State for the template
  const [template, setTemplate] = useState<POVTemplate>(
    initialTemplate || createSamplePOVTemplate()
  );
  
  // Initialize with provided template or create a new one
  
  // Update template with partial data
  const updateTemplate = useCallback((updates: Partial<POVTemplate>) => {
    setTemplate(prev => ({
      ...prev,
      ...updates
    }));
  }, []);
  
  // Update a field
  const updateField = useCallback((fieldId: string, updates: Partial<FieldDefinition>) => {
    setTemplate(prev => {
      if (!prev.fields[fieldId]) return prev;
      
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: {
            ...prev.fields[fieldId],
            ...updates
          }
        }
      };
    });
  }, []);
  
  // Add a new field
  const addField = useCallback((field: FieldDefinition): string => {
    const fieldId = `field-${Date.now()}`;
    
    setTemplate(prev => ({
      ...prev,
      fields: {
        ...prev.fields,
        [fieldId]: field
      }
    }));
    
    return fieldId;
  }, []);
  
  // Remove a field
  const removeField = useCallback((fieldId: string) => {
    setTemplate(prev => {
      const { [fieldId]: removedField, ...remainingFields } = prev.fields;
      
      // Also remove the field from any sections that reference it
      const updatedSections = prev.sections.map(section => ({
        ...section,
        fields: section.fields.filter(id => id !== fieldId)
      }));
      
      return {
        ...prev,
        fields: remainingFields,
        sections: updatedSections
      };
    });
  }, []);
  
  // Update a section
  const updateSection = useCallback((sectionId: string, updates: Partial<SectionDefinition>) => {
    setTemplate(prev => {
      const sectionIndex = prev.sections.findIndex(s => s.id === sectionId);
      if (sectionIndex === -1) return prev;
      
      const updatedSections = [...prev.sections];
      updatedSections[sectionIndex] = {
        ...updatedSections[sectionIndex],
        ...updates
      };
      
      return {
        ...prev,
        sections: updatedSections
      };
    });
  }, []);
  
  // Add a new section
  const addSection = useCallback((section: SectionDefinition) => {
    setTemplate(prev => ({
      ...prev,
      sections: [...prev.sections, section]
    }));
  }, []);
  
  // Remove a section
  const removeSection = useCallback((sectionId: string) => {
    setTemplate(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== sectionId)
    }));
  }, []);
  
  // Save the template
  const saveTemplate = useCallback(async () => {
    // For now, we'll consider all POV templates valid
    const validationResult = { isValid: true, errors: [] };
    
    // If the template is valid and we have a save callback, call it
    if (validationResult.isValid && onSave) {
      onSave(template);
    }
    
    return validationResult;
  }, [template, onSave]);
  
  // Context value
  const contextValue: POVTemplateContextType = {
    template,
    updateTemplate,
    updateField,
    addField,
    removeField,
    updateSection,
    addSection,
    removeSection,
    saveTemplate,
    isReadOnly: readOnly
  };
  
  return (
    <POVTemplateContext.Provider value={contextValue}>
      {children}
    </POVTemplateContext.Provider>
  );
};

/**
 * Hook to use the POV template context
 */
export const usePOVTemplateContext = (): POVTemplateContextType => {
  const context = useContext(POVTemplateContext);
  
  if (context === undefined) {
    throw new Error('usePOVTemplateContext must be used within a POVTemplateProvider');
  }
  
  return context;
};