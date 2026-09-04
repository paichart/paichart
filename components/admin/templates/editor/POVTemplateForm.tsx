"use client";

import React, { useState, useEffect } from 'react';
import { BaseTemplate } from './TemplateEditor';
import {
  FormSection,
  FormGrid,
  TextInput,
  TextAreaField,
  SelectField,
  SwitchField,
  TagsInput
} from './FormComponents';

// Define the POV template interface
export interface POVTemplateFormData extends BaseTemplate {
  status?: string;
  version?: string;
  isDefault?: boolean;
  sections: any[];
  fields: Record<string, any>;
  metadata?: {
    tags?: string[];
    [key: string]: any;
  };
}

interface POVTemplateFormProps {
  data: POVTemplateFormData | null;
  onChange: (data: POVTemplateFormData) => void;
}

/**
 * POVTemplateForm - Form component for editing POV templates
 * 
 * This component provides the form fields specific to POV templates.
 * It is designed to be used with the TemplateEditor component.
 */
export function POVTemplateForm({ data, onChange }: POVTemplateFormProps) {
  const [formData, setFormData] = useState<POVTemplateFormData>({
    name: '',
    description: '',
    status: 'draft',
    version: '1.0.0',
    sections: [],
    fields: {},
    metadata: {
      tags: []
    },
    ...data
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Update local state when data prop changes
  useEffect(() => {
    if (data) {
      // Create a default template with empty values
      const defaultTemplate: POVTemplateFormData = {
        name: '',
        description: '',
        status: 'draft',
        version: '1.0.0',
        sections: [],
        fields: {},
        metadata: {
          tags: []
        }
      };
      
      // Merge the default template with the provided data
      setFormData({ ...defaultTemplate, ...data });
    }
  }, [data]);
  
  // Handle form field changes
  const handleChange = (field: keyof POVTemplateFormData, value: any) => {
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
    
    if (field === 'version') {
      const versionRegex = /^\d+\.\d+\.\d+$/;
      if (value && !versionRegex.test(value)) {
        newErrors.version = 'Version must be in format x.y.z (e.g., 1.0.0)';
      } else {
        delete newErrors.version;
      }
    }
    
    setErrors(newErrors);
    
    // Update form data
    const updatedData = { ...formData, [field]: value };
    setFormData(updatedData);
    onChange(updatedData);
  };
  
  // Handle metadata changes
  const handleMetadataChange = (field: string, value: any) => {
    const updatedMetadata = { ...formData.metadata, [field]: value };
    const updatedData = { ...formData, metadata: updatedMetadata };
    setFormData(updatedData);
    onChange(updatedData);
  };
  
  // Handle adding a tag
  const handleAddTag = (tag: string) => {
    const currentTags = formData.metadata?.tags || [];
    if (currentTags.includes(tag)) {
      return;
    }
    
    const updatedTags = [...currentTags, tag];
    handleMetadataChange('tags', updatedTags);
  };
  
  // Handle removing a tag
  const handleRemoveTag = (tag: string) => {
    const currentTags = formData.metadata?.tags || [];
    const updatedTags = currentTags.filter(t => t !== tag);
    handleMetadataChange('tags', updatedTags);
  };
  
  return (
    <div className="space-y-6">
      <FormSection 
        title="Basic Information" 
        description="Enter the basic details for this POV template"
      >
        <FormGrid>
          <TextInput
            id="name"
            label="Template Name"
            value={formData.name}
            onChange={(value) => handleChange('name', value)}
            placeholder="Enter template name"
            required
            helpText="A descriptive name for this POV template"
            error={errors.name}
            maxLength={100}
          />
          
          <SelectField
            id="status"
            label="Status"
            value={formData.status || 'draft'}
            onChange={(value) => handleChange('status', value)}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'deprecated', label: 'Deprecated' }
            ]}
            placeholder="Select template status"
            required
            helpText="The current status of this template"
          />
        </FormGrid>
        
        <FormGrid>
          <TextInput
            id="version"
            label="Version"
            value={formData.version || ''}
            onChange={(value) => handleChange('version', value)}
            placeholder="1.0.0"
            helpText="Version number for this template (e.g., 1.0.0)"
            error={errors.version}
          />
          
          <SwitchField
            id="isDefault"
            label="Set as default template"
            checked={formData.isDefault || false}
            onChange={(checked) => handleChange('isDefault', checked)}
            helpText="If enabled, this template will be used as the default for new POVs"
          />
        </FormGrid>
        
        <TextAreaField
          id="description"
          label="Description"
          value={formData.description}
          onChange={(value) => handleChange('description', value)}
          placeholder="Enter template description"
          helpText="A detailed description of what this POV template is used for"
          error={errors.description}
          rows={4}
          maxLength={500}
        />
        
        <TagsInput
          id="tags"
          label="Tags"
          tags={formData.metadata?.tags || []}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          placeholder="Add a tag and press Enter"
          helpText="Tags help categorize and find templates"
        />
      </FormSection>
      
      <FormSection 
        title="Sections" 
        description="The sections editor will be implemented in a future update. Currently, sections can be edited in the dedicated editor page."
      >
        <div className="bg-gray-50 p-4 rounded-md text-center">
          <p className="text-sm text-gray-500">
            Section editor coming soon
          </p>
        </div>
      </FormSection>
      
      <FormSection 
        title="Fields" 
        description="The fields editor will be implemented in a future update. Currently, fields can be edited in the dedicated editor page."
      >
        <div className="bg-gray-50 p-4 rounded-md text-center">
          <p className="text-sm text-gray-500">
            Field editor coming soon
          </p>
        </div>
      </FormSection>
    </div>
  );
}