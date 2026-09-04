"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/Accordion';
import { Plus, Trash2, Edit, Copy, AlertCircle } from 'lucide-react';
import { FieldDefinition } from '@/lib/pov/templates/types';
import { usePovTemplateOperations, useTemplateValidation } from '../context/TemplateEditorContext';

export default function FieldsSection() {
  const { fields, addField, updateField, removeField } = usePovTemplateOperations();
  const { getFieldErrors, hasFieldError } = useTemplateValidation();
  
  const [editingField, setEditingField] = useState<string | null>(null);
  const [newField, setNewField] = useState<FieldDefinition>({
    type: 'text',
    label: '',
    description: '',
    placeholder: '',
    required: false,
  });
  const [showNewFieldForm, setShowNewFieldForm] = useState(false);
  
  // Field type options
  const fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Text Area' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'select', label: 'Select' },
    { value: 'multiselect', label: 'Multi-Select' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'url', label: 'URL' },
    { value: 'currency', label: 'Currency' },
  ];
  
  // Generate a unique field ID
  const generateFieldId = (label: string): string => {
    const baseId = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let id = baseId;
    let counter = 1;
    
    while (fields[id]) {
      id = `${baseId}_${counter}`;
      counter++;
    }
    
    return id;
  };
  
  // Add a new field
  const handleAddField = () => {
    if (!newField.label.trim()) {
      alert('Field label is required');
      return;
    }
    
    const fieldId = generateFieldId(newField.label);
    addField(fieldId, { ...newField });
    
    setNewField({
      type: 'text',
      label: '',
      description: '',
      placeholder: '',
      required: false,
    });
    setShowNewFieldForm(false);
  };
  
  // Update an existing field
  const handleUpdateField = (fieldId: string, updatedField: FieldDefinition) => {
    updateField(fieldId, updatedField);
    setEditingField(null);
  };
  
  // Delete a field
  const handleDeleteField = (fieldId: string) => {
    if (!confirm(`Are you sure you want to delete the field "${fields[fieldId].label}"?`)) {
      return;
    }
    
    removeField(fieldId);
  };
  
  // Duplicate a field
  const handleDuplicateField = (fieldId: string) => {
    const originalField = fields[fieldId];
    const newLabel = `${originalField.label} (Copy)`;
    const newFieldId = generateFieldId(newLabel);
    
    addField(newFieldId, {
      ...originalField,
      label: newLabel
    });
  };
  
  // Field Editor Component
  const FieldEditor = ({ 
    fieldId, 
    field, 
    isNew = false,
    onCancel,
    onSave
  }: {
    fieldId: string;
    field: FieldDefinition;
    isNew?: boolean;
    onCancel: () => void;
    onSave: (fieldId: string, updatedField: FieldDefinition) => void;
  }) => {
    const [localField, setLocalField] = useState<FieldDefinition>({ ...field });
    const [selectOptions, setSelectOptions] = useState<Array<{ label: string; value: string }>>(
      field.validation?.options || []
    );
    const [newOptionLabel, setNewOptionLabel] = useState('');
    const [newOptionValue, setNewOptionValue] = useState('');
    
    const updateLocalField = (updates: Partial<FieldDefinition>) => {
      setLocalField(prev => ({ ...prev, ...updates }));
    };
    
    const handleAddOption = () => {
      if (!newOptionLabel.trim() || !newOptionValue.trim()) {
        return;
      }
      
      const newOptions = [
        ...(selectOptions || []),
        { label: newOptionLabel, value: newOptionValue }
      ];
      
      setSelectOptions(newOptions);
      updateLocalField({
        validation: {
          ...localField.validation,
          options: newOptions
        }
      });
      
      setNewOptionLabel('');
      setNewOptionValue('');
    };
    
    const handleRemoveOption = (index: number) => {
      const newOptions = [...selectOptions];
      newOptions.splice(index, 1);
      
      setSelectOptions(newOptions);
      updateLocalField({
        validation: {
          ...localField.validation,
          options: newOptions
        }
      });
    };
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{isNew ? 'Add New Field' : `Edit Field: ${field.label}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-label`}>Field Label</Label>
              <Input
                id={`${fieldId}-label`}
                value={localField.label}
                onChange={(e) => updateLocalField({ label: e.target.value })}
                placeholder="Enter field label"
                className={hasFieldError(`fields.${fieldId}.label`) ? 'border-destructive' : ''}
              />
              {hasFieldError(`fields.${fieldId}.label`) && (
                <p className="text-sm text-destructive">
                  {getFieldErrors(`fields.${fieldId}.label`)[0]}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-type`}>Field Type</Label>
              <Select
                value={localField.type}
                onValueChange={(value) => updateLocalField({ type: value as any })}
              >
                <SelectTrigger id={`${fieldId}-type`}>
                  <SelectValue placeholder="Select field type" />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-description`}>Description</Label>
            <Textarea
              id={`${fieldId}-description`}
              value={localField.description || ''}
              onChange={(e) => updateLocalField({ description: e.target.value })}
              placeholder="Enter field description"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-placeholder`}>Placeholder</Label>
            <Input
              id={`${fieldId}-placeholder`}
              value={localField.placeholder || ''}
              onChange={(e) => updateLocalField({ placeholder: e.target.value })}
              placeholder="Provide example values to clarify the expected format or content"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              id={`${fieldId}-required`}
              checked={localField.required || false}
              onCheckedChange={(checked) => updateLocalField({ required: checked })}
            />
            <Label htmlFor={`${fieldId}-required`}>Required field</Label>
          </div>
          
          {(localField.type === 'select' || localField.type === 'multiselect') && (
            <div className="space-y-4 border-t border-border pt-4">
              <h4 className="font-medium text-foreground">Options</h4>
              
              <div className="space-y-2">
                {selectOptions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No options defined. Add at least one option below.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectOptions.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Badge variant="outline">{option.value}</Badge>
                        <span className="flex-1 text-foreground">{option.label}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveOption(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Option Label"
                    value={newOptionLabel}
                    onChange={(e) => setNewOptionLabel(e.target.value)}
                  />
                  <Input
                    placeholder="Option Value"
                    value={newOptionValue}
                    onChange={(e) => setNewOptionValue(e.target.value)}
                  />
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  disabled={!newOptionLabel.trim() || !newOptionValue.trim()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Option
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              onClick={() => onSave(fieldId, localField)}
              disabled={!localField.label.trim()}
            >
              {isNew ? 'Add Field' : 'Update Field'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  // Render field list
  const renderFieldList = () => {
    const fieldIds = Object.keys(fields);
    
    if (fieldIds.length === 0) {
      return (
        <div className="text-center p-8 border border-border rounded-lg bg-muted">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-foreground">No fields defined yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add fields to define the structure of your POV template
          </p>
          <Button 
            className="mt-4"
            onClick={() => setShowNewFieldForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First Field
          </Button>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <Accordion type="multiple" className="w-full">
          {fieldIds.map(fieldId => {
            const field = fields[fieldId];
            
            if (editingField === fieldId) {
              return (
                <FieldEditor 
                  key={fieldId}
                  fieldId={fieldId} 
                  field={field}
                  onCancel={() => setEditingField(null)}
                  onSave={handleUpdateField}
                />
              );
            }
            
            return (
              <AccordionItem key={fieldId} value={fieldId}>
                <AccordionTrigger className="hover:bg-accent hover:text-accent-foreground px-4 rounded-md">
                  <div className="flex items-center space-x-2 text-left">
                    <span className="font-medium text-foreground">{field.label}</span>
                    <Badge variant="outline">{field.type}</Badge>
                    {field.required && (
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {field.description && (
                      <p className="text-sm text-muted-foreground">{field.description}</p>
                    )}
                    
                    {field.placeholder && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Placeholder: </span>
                        <span className="italic text-foreground">{field.placeholder}</span>
                      </div>
                    )}
                    
                    {(field.type === 'select' || field.type === 'multiselect') && field.validation?.options && (
                      <div className="mt-2">
                        <span className="text-sm text-muted-foreground">Options:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {field.validation.options.map((option, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {option.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDuplicateField(fieldId)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingField(fieldId)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteField(fieldId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
        
        <div className="flex justify-center mt-6">
          <Button 
            variant="outline"
            onClick={() => setShowNewFieldForm(true)}
            className="w-full md:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Field
          </Button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Template Fields</h2>
        <p className="text-sm text-muted-foreground">
          Define the custom fields that will be available when creating POVs from this template.
        </p>
      </div>

      {showNewFieldForm ? (
        <FieldEditor 
          fieldId="new" 
          field={newField} 
          isNew={true}
          onCancel={() => setShowNewFieldForm(false)}
          onSave={(_, updatedField) => {
            // Use the updated field directly instead of relying on state update
            if (!updatedField.label.trim()) {
              alert('Field label is required');
              return;
            }
            
            const fieldId = generateFieldId(updatedField.label);
            addField(fieldId, { ...updatedField });
            
            setNewField({
              type: 'text',
              label: '',
              description: '',
              placeholder: '',
              required: false,
            });
            setShowNewFieldForm(false);
          }}
        />
      ) : (
        renderFieldList()
      )}
    </div>
  );
}
