"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ArrowLeft, Save } from 'lucide-react';
import { useTemplateContext } from '../context/TemplateContext';

// Define the common template interface
export interface BaseTemplate {
  id?: string;
  name: string;
  description: string;
}

// Define the template editor props
interface TemplateEditorProps<T extends BaseTemplate> {
  templateType: 'pov' | 'phase';
  templateId?: string;
  initialData?: T;
  onSave: (data: T) => Promise<void>;
  onCancel: () => void;
  children: React.ReactNode;
  isLoading?: boolean;
}

/**
 * TemplateEditor - A unified editor component for both POV and Phase templates
 * 
 * This component provides a consistent layout and behavior for editing templates,
 * while allowing for template-specific form fields to be passed as children.
 */
export function TemplateEditor<T extends BaseTemplate>({
  templateType,
  templateId,
  initialData,
  onSave,
  onCancel,
  children,
  isLoading = false
}: TemplateEditorProps<T>) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [formData, setFormData] = useState<T | null>(initialData || null);
  
  // Get context values
  const { showToast } = useTemplateContext();
  
  // Handle form data changes
  const handleFormDataChange = (data: T) => {
    setFormData(data);
    setHasUnsavedChanges(true);
  };
  
  // Handle save
  const handleSave = async () => {
    if (!formData) return;
    
    try {
      setIsSaving(true);
      await onSave(formData);
      setHasUnsavedChanges(false);
      showToast(`${templateType === 'pov' ? 'POV' : 'Phase'} template saved successfully`, 'success');
    } catch {
      showToast(`Failed to save ${templateType === 'pov' ? 'POV' : 'Phase'} template`, 'error');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle cancel
  const handleCancel = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to cancel?')) {
        onCancel();
      }
    } else {
      onCancel();
    }
  };
  
  // Warn before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <Button variant="ghost" onClick={handleCancel} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">
            {templateId ? 'Edit' : 'Create'} {templateType === 'pov' ? 'POV' : 'Phase'} Template
          </h1>
          <p className="text-gray-500">
            {templateId 
              ? `Edit the ${templateType === 'pov' ? 'POV' : 'Phase'} template details` 
              : `Create a new ${templateType === 'pov' ? 'POV' : 'Phase'} template`}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? <Spinner size="sm" className="mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>
      
      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-md">
          You have unsaved changes
        </div>
      )}
      
      {/* Template-specific form fields */}
      <div className="bg-white border rounded-md p-6">
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              data: formData,
              onChange: handleFormDataChange
            });
          }
          return child;
        })}
      </div>
      
      {/* Footer actions */}
      <div className="flex justify-end space-x-2 pt-4 border-t">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          disabled={isSaving || !hasUnsavedChanges}
        >
          {isSaving ? <Spinner size="sm" className="mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>
    </div>
  );
}