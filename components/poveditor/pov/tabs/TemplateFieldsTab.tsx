"use client";

import React from 'react';
import { EditorTab } from '../types/EditorTab';
import DynamicFieldsWizardSection from '../sections/DynamicFieldsWizardSection';
import { useEditorContext } from '../context';

/**
 * Template Fields component wrapper
 */
const TemplateFieldsComponent = () => {
  const { state, updateField } = useEditorContext();
  
  // Extract fields from template data
  const templateData = (state as any)?.data?.templateData;
  const fields = templateData?.data?.fields ? Object.values(templateData.data.fields) : [];
  
  // Get current form data for template fields
  const formData = (state as any)?.data?.templateFieldValues || {};
  
  // Handle field changes
  const handleFieldChange = (fieldId: string, value: any) => {
    updateField(['data', 'templateFieldValues', fieldId], value);
  };
  
  return (
    <DynamicFieldsWizardSection
      fields={fields as any[]}
      formData={formData}
      onChange={handleFieldChange}
      showProgress={true}
      showSectionGrouping={true}
    />
  );
};

/**
 * Tab definition for the Template Fields section
 * Uses the existing DynamicFieldsWizardSection component to render template-specific fields
 * 
 * Note: Visibility is now controlled by mode configuration in ModeConfigs.ts
 */
export const TemplateFieldsTab: EditorTab = {
  id: 'template-fields',
  label: 'Template Fields',
  component: TemplateFieldsComponent,
  order: 4
};
