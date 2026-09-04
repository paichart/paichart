import React, { useEffect, useRef } from 'react';
import { usePOVTemplateContext } from './context/POVTemplateContext';
import { useTemplateView } from '../views/context/TemplateViewContext';
import { adaptPOVTemplateToTemplate } from '../adapters/TemplateEditorAdapter';

/**
 * POVTemplateContextSync component
 *
 * This component synchronizes the POVTemplateContext with the TemplateViewProvider context.
 * It listens for changes in the POVTemplateContext and updates the TemplateViewProvider context accordingly.
 * This ensures that changes made in the POVTemplateBuilder are reflected in the TemplateEditor.
 *
 * Enhanced version with improved synchronization and debugging.
 */
export function POVTemplateContextSync() {
  // Get the template and update function from the POVTemplateContext
  const { template: povTemplate } = usePOVTemplateContext();
  
  // Get the template and update function from the TemplateViewProvider context
  const { template: viewTemplate, updateTemplate: updateViewTemplate } = useTemplateView();
  
  // Keep track of previous field IDs for debugging
  const prevFieldIdsRef = useRef<string[]>([]);
  
  // Use a ref to track if we're currently updating to prevent infinite loops
  const isUpdatingRef = useRef(false);
  
  // Synchronize the contexts when the POV template changes
  useEffect(() => {
    // Skip if we're already updating from the other direction
    if (isUpdatingRef.current) return;
    
    if (povTemplate) {
      // Track field changes for debugging
      const currentFieldIds = Object.keys(povTemplate.fields || {});
      const prevFieldIds = prevFieldIdsRef.current;
      
      // Update ref for next comparison
      prevFieldIdsRef.current = currentFieldIds;
      
      try {
        // Set the updating flag to prevent infinite loops
        isUpdatingRef.current = true;
        
        // Convert the POV template to a Template
        const template = adaptPOVTemplateToTemplate(povTemplate);
        
        // Preserve phase template relationships from the view template if they exist
        if (viewTemplate?.metadata?.phaseTemplates &&
            (!template.metadata?.phaseTemplates || template.metadata.phaseTemplates.length === 0)) {
          if (!template.metadata) template.metadata = {};
          template.metadata.phaseTemplates = viewTemplate.metadata.phaseTemplates;
        }
        
        // Update the TemplateViewProvider context
        updateViewTemplate(template);
      } finally {
        // Reset the updating flag
        isUpdatingRef.current = false;
      }
    }
  }, [povTemplate, updateViewTemplate, viewTemplate?.metadata?.phaseTemplates]);
  
  // This component doesn't render anything
  return null;
}

export default POVTemplateContextSync;