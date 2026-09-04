import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { TaskType } from '@prisma/client';

interface FieldDetailViewProps {
  field: {
    id: string;
    title?: string;
    name?: string;  // Keep for backward compatibility
    description: string;
    type: string;
    metadata?: any;
  };
  onFieldChange: (fieldId: string, field: string, value: any) => void;
  isReadOnly?: boolean;
}

/**
 * FieldDetailView component
 * 
 * A specialized view for displaying and editing field details
 * Used within the POVTemplateView to provide better visualization of field properties
 */
export function FieldDetailView({ field, onFieldChange, isReadOnly = false }: FieldDetailViewProps) {
  // Get field type display name
  const getFieldTypeDisplay = (type: string) => {
    const typeMap: Record<string, string> = {
      [TaskType.ACTION]: 'Text',
      [TaskType.APPROVAL]: 'Textarea',
      [TaskType.DECISION]: 'Select',
      [TaskType.DOCUMENT]: 'Number',
      [TaskType.MILESTONE]: 'Checkbox'
    };
    
    return typeMap[type] || type;
  };

  // Get field metadata
  const fieldMetadata = field.metadata || {};
  const fieldDefinition = fieldMetadata.fieldDefinition || {};
  const isRequired = fieldDefinition.required || false;
  const validationOptions = fieldDefinition.validation?.options || [];

  // Render field type options
  const renderFieldTypeOptions = () => {
    const fieldTypes = [
      { value: TaskType.ACTION, label: 'Text' },
      { value: TaskType.APPROVAL, label: 'Textarea' },
      { value: TaskType.DECISION, label: 'Select' },
      { value: TaskType.DOCUMENT, label: 'Number' },
      { value: TaskType.MILESTONE, label: 'Checkbox' }
    ];
    
    return fieldTypes.map(type => (
      <SelectItem key={type.value} value={type.value}>
        {type.label}
      </SelectItem>
    ));
  };

  // Handle required toggle
  const handleRequiredToggle = (checked: boolean) => {
    if (isReadOnly) return;
    
    // Update the field metadata
    const updatedMetadata = {
      ...fieldMetadata,
      fieldDefinition: {
        ...fieldDefinition,
        required: checked
      }
    };
    
    onFieldChange(field.id, 'metadata', updatedMetadata);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="font-medium">{field.title || field.name || ''}</h3>
            <Badge variant="outline">{getFieldTypeDisplay(field.type)}</Badge>
          </div>
          
          {field.type === TaskType.DECISION && (
            <Badge variant="secondary">
              {validationOptions.length} Options
            </Badge>
          )}
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`field-${field.id}-name`}>Field Name</Label>
            <Input
              id={`field-${field.id}-name`}
              value={field.title || field.name || ''}
              onChange={(e) => onFieldChange(field.id, 'title', e.target.value)}
              disabled={isReadOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`field-${field.id}-description`}>Field Description</Label>
            <Textarea 
              id={`field-${field.id}-description`}
              value={field.description}
              onChange={(e) => onFieldChange(field.id, 'description', e.target.value)}
              disabled={isReadOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor={`field-${field.id}-type`}>Field Type</Label>
            <Select 
              value={field.type}
              onValueChange={(value) => onFieldChange(field.id, 'type', value)}
              disabled={isReadOnly}
            >
              <SelectTrigger id={`field-${field.id}-type`}>
                <SelectValue placeholder="Select field type" />
              </SelectTrigger>
              <SelectContent>
                {renderFieldTypeOptions()}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch 
              id={`field-${field.id}-required`}
              checked={isRequired}
              onCheckedChange={handleRequiredToggle}
              disabled={isReadOnly}
            />
            <Label htmlFor={`field-${field.id}-required`}>Required Field</Label>
          </div>
          
          {field.type === TaskType.DECISION && (
            <div className="space-y-2 border-t pt-4 mt-4">
              <Label>Select Options</Label>
              <div className="space-y-2">
                {validationOptions.length > 0 ? (
                  validationOptions.map((option: any, index: number) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input 
                        value={option.label}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          
                          const updatedOptions = [...validationOptions];
                          updatedOptions[index] = {
                            ...updatedOptions[index],
                            label: e.target.value,
                            value: e.target.value.toLowerCase().replace(/\s+/g, '_')
                          };
                          
                          const updatedMetadata = {
                            ...fieldMetadata,
                            fieldDefinition: {
                              ...fieldDefinition,
                              validation: {
                                ...fieldDefinition.validation,
                                options: updatedOptions
                              }
                            }
                          };
                          
                          onFieldChange(field.id, 'metadata', updatedMetadata);
                        }}
                        disabled={isReadOnly}
                        className="flex-1"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">
                    No options defined for this select field.
                  </div>
                )}
                
                {!isReadOnly && (
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:text-blue-800"
                    onClick={() => {
                      const newOption = {
                        label: `Option ${validationOptions.length + 1}`,
                        value: `option_${validationOptions.length + 1}`
                      };
                      
                      const updatedOptions = [...validationOptions, newOption];
                      
                      const updatedMetadata = {
                        ...fieldMetadata,
                        fieldDefinition: {
                          ...fieldDefinition,
                          validation: {
                            ...fieldDefinition.validation,
                            options: updatedOptions
                          }
                        }
                      };
                      
                      onFieldChange(field.id, 'metadata', updatedMetadata);
                    }}
                  >
                    + Add Option
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default FieldDetailView;