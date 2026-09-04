"use client";

import React, { useState, useEffect } from 'react';
import { PhaseType } from '@prisma/client';
import { BaseTemplate } from './TemplateEditor';
import {
  FormSection,
  FormGrid,
  TextInput,
  TextAreaField,
  SelectField,
  SwitchField
} from './FormComponents';

// Define the phase template interface
export interface PhaseTemplateFormData extends BaseTemplate {
  type: PhaseType;
  isDefault?: boolean;
  stages: any[];
}

interface PhaseTemplateFormProps {
  data: PhaseTemplateFormData | null;
  onChange: (data: PhaseTemplateFormData) => void;
}

/**
 * PhaseTemplateForm - Form component for editing Phase templates
 * 
 * This component provides the form fields specific to Phase templates.
 * It is designed to be used with the TemplateEditor component.
 */
export function PhaseTemplateForm({ data, onChange }: PhaseTemplateFormProps) {
  const [formData, setFormData] = useState<PhaseTemplateFormData>({
    name: '',
    description: '',
    type: PhaseType.PLANNING,
    stages: [],
    ...data
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Update local state when data prop changes
  useEffect(() => {
    if (data) {
      // Create a default template with empty values
      const defaultTemplate: PhaseTemplateFormData = {
        name: '',
        description: '',
        type: PhaseType.PLANNING,
        stages: []
      };
      
      // Merge the default template with the provided data
      setFormData({ ...defaultTemplate, ...data });
    }
  }, [data]);
  
  // Handle form field changes
  const handleChange = (field: keyof PhaseTemplateFormData, value: any) => {
    // Validate the field
    let newErrors = { ...errors };
    
    if (field === 'name') {
      if (!value.trim()) {
        newErrors.name = 'Template name is required';
      } else if (value.length > 100) {
        newErrors.name = 'Template name must be less than 100 characters';
      } else {
        delete newErrors.name;
      }
    }
    
    if (field === 'description' && value.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    } else if (field === 'description') {
      delete newErrors.description;
    }
    
    setErrors(newErrors);
    
    // Update form data
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    onChange(updatedData);
  };
  
  return (
    <div className="space-y-6">
      <FormSection 
        title="Basic Information" 
        description="Enter the basic details for this phase template"
      >
        <FormGrid>
          <TextInput
            id="name"
            label="Template Name"
            value={formData.name}
            onChange={(value) => handleChange('name', value)}
            placeholder="Enter template name"
            required
            helpText="A descriptive name for this phase template"
            error={errors.name}
            maxLength={100}
          />
          
          <SelectField
            id="type"
            label="Template Type"
            value={formData.type}
            onChange={(value) => handleChange('type', value)}
            options={[
              { value: PhaseType.PLANNING, label: 'Planning' },
              { value: PhaseType.EXECUTION, label: 'Execution' },
              { value: PhaseType.REVIEW, label: 'Review' }
            ]}
            placeholder="Select template type"
            required
            helpText="The type of phase template"
          />
        </FormGrid>
        
        <TextAreaField
          id="description"
          label="Description"
          value={formData.description}
          onChange={(value) => handleChange('description', value)}
          placeholder="Enter template description"
          helpText="A detailed description of what this phase template is used for"
          error={errors.description}
          rows={4}
          maxLength={500}
        />
        
        <SwitchField
          id="isDefault"
          label="Set as default template"
          checked={formData.isDefault || false}
          onChange={(checked) => handleChange('isDefault', checked)}
          helpText="If enabled, this template will be used as the default for new phases"
        />
      </FormSection>
      
      <FormSection 
        title="Stages" 
        description="The stages editor will be implemented in a future update. Currently, stages can be edited in the dedicated editor page."
      >
        <div className="bg-gray-50 p-4 rounded-md text-center">
          <p className="text-sm text-gray-500">
            Stage editor coming soon
          </p>
        </div>
      </FormSection>
    </div>
  );
}