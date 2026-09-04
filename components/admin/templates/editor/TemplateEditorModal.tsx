"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Save } from 'lucide-react';
import { useTemplateContext } from '../context/TemplateContext';
import { BaseTemplate } from './TemplateEditor';

interface TemplateEditorModalProps<T extends BaseTemplate> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  templateType: 'pov' | 'phase';
  templateId?: string;
  initialData?: T;
  onSave: (data: T) => Promise<void>;
  children: React.ReactNode;
}

/**
 * TemplateEditorModal - A modal dialog for editing templates
 * 
 * This component provides a modal dialog for quick edits to templates,
 * without navigating away from the current page.
 */
export function TemplateEditorModal<T extends BaseTemplate>({
  isOpen,
  onClose,
  title,
  description,
  templateType,
  templateId,
  initialData,
  onSave,
  children
}: TemplateEditorModalProps<T>) {
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [formData, setFormData] = useState<T | null>(initialData || null);
  
  // Get context values
  const { showToast } = useTemplateContext();
  
  // Reset form data when modal opens or initialData changes
  useEffect(() => {
    setFormData(initialData || null);
    setHasUnsavedChanges(false);
  }, [initialData, isOpen]);
  
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
      onClose();
    } catch {
      showToast(`Failed to save ${templateType === 'pov' ? 'POV' : 'Phase'} template`, 'error');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle close with unsaved changes
  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        
        {/* Unsaved changes indicator */}
        {hasUnsavedChanges && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded-md mb-4">
            You have unsaved changes
          </div>
        )}
        
        {/* Template-specific form fields */}
        <div className="py-4">
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
          <Button variant="outline" onClick={handleClose}>
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
      </DialogContent>
    </Dialog>
  );
}