import React, { useState } from 'react';
import { Template } from './types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { ChevronDown, ChevronRight, Edit, Plus, Trash2 } from 'lucide-react';
import { TaskType } from '@prisma/client';
import { FieldDetailView } from './FieldDetailView';

interface POVTemplateViewProps {
  template: Template;
  onTemplateChange: (template: Template) => void;
  onSave: (template: Template) => void;
  isReadOnly?: boolean;
}

/**
 * POVTemplateView component
 * 
 * A specialized view for POV templates that displays sections and fields
 * in a more intuitive way for POV templates.
 */
export function POVTemplateView({ 
  template, 
  onTemplateChange, 
  onSave,
  isReadOnly = false 
}: POVTemplateViewProps) {
  const [activeTab, setActiveTab] = useState('sections');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  
  // Get metadata from the template
  const metadata = template.metadata || {};
  const originalType = metadata.originalType;
  const isAdaptedPOVTemplate = originalType === 'povTemplate';
  
  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };
  
  // Update template basic info
  const updateBasicInfo = (field: 'name' | 'description', value: string) => {
    if (isReadOnly) return;
    
    onTemplateChange({
      ...template,
      [field]: value
    });
  };
  
  // Update section
  const updateSection = (sectionIndex: number, field: 'name' | 'description', value: string) => {
    if (isReadOnly) return;
    
    const updatedStages = [...template.stages];
    updatedStages[sectionIndex] = {
      ...updatedStages[sectionIndex],
      [field === 'name' ? 'name' : 'description']: value
    };
    
    onTemplateChange({
      ...template,
      stages: updatedStages
    });
  };
  
  // Update field
  const updateField = (
    sectionIndex: number, 
    fieldIndex: number, 
    field: 'name' | 'description' | 'type', 
    value: string
  ) => {
    if (isReadOnly) return;
    
    const updatedStages = [...template.stages];
    const updatedTasks = [...updatedStages[sectionIndex].tasks];
    
    updatedTasks[fieldIndex] = {
      ...updatedTasks[fieldIndex],
      [field]: field === 'type' ? value as TaskType : value
    };
    
    updatedStages[sectionIndex] = {
      ...updatedStages[sectionIndex],
      tasks: updatedTasks
    };
    
    onTemplateChange({
      ...template,
      stages: updatedStages
    });
  };
  
  // Add new section
  const addSection = () => {
    if (isReadOnly) return;
    
    const newSectionId = `section-${Date.now()}`;
    const newSection = {
      id: newSectionId,
      name: 'New Section',
      description: 'Enter a description for this section',
      tasks: []
    };
    
    onTemplateChange({
      ...template,
      stages: [...template.stages, newSection]
    });
    
    // Expand the new section
    setExpandedSections(prev => ({
      ...prev,
      [newSectionId]: true
    }));
  };
  
  // Add new field to section
  const addFieldToSection = (sectionIndex: number) => {
    if (isReadOnly) return;
    
    const updatedStages = [...template.stages];
    const newFieldId = `field-${Date.now()}`;
    const newField = {
      id: newFieldId,
      title: 'New Field',
      description: 'Enter a description for this field',
      type: TaskType.ACTION,
      dependencies: []
    };
    
    updatedStages[sectionIndex] = {
      ...updatedStages[sectionIndex],
      tasks: [...updatedStages[sectionIndex].tasks, newField]
    };
    
    onTemplateChange({
      ...template,
      stages: updatedStages
    });
  };
  
  // Delete section
  const deleteSection = (sectionIndex: number) => {
    if (isReadOnly) return;
    
    const updatedStages = [...template.stages];
    updatedStages.splice(sectionIndex, 1);
    
    onTemplateChange({
      ...template,
      stages: updatedStages
    });
  };
  
  // Delete field
  const deleteField = (sectionIndex: number, fieldIndex: number) => {
    if (isReadOnly) return;
    
    const updatedStages = [...template.stages];
    const updatedTasks = [...updatedStages[sectionIndex].tasks];
    updatedTasks.splice(fieldIndex, 1);
    
    updatedStages[sectionIndex] = {
      ...updatedStages[sectionIndex],
      tasks: updatedTasks
    };
    
    onTemplateChange({
      ...template,
      stages: updatedStages
    });
  };
  
  // Get field type display name
  const getFieldTypeDisplay = (type: TaskType) => {
    // Map TaskType enum values to user-friendly display names
    switch (type) {
      case TaskType.ACTION:
        return 'Text';
      case TaskType.APPROVAL:
        return 'Textarea';
      case TaskType.DECISION:
        return 'Select';
      case TaskType.DOCUMENT:
        return 'File';
      case TaskType.MILESTONE:
        return 'Date';
      default:
        return type;
    }
  };
  
  // Render field type options
  const renderFieldTypeOptions = () => {
    const fieldTypes = [
      { value: TaskType.ACTION, label: 'Text' },
      { value: TaskType.APPROVAL, label: 'Textarea' },
      { value: TaskType.DECISION, label: 'Select' },
      { value: TaskType.DOCUMENT, label: 'File' },
      { value: TaskType.MILESTONE, label: 'Date' }
    ];
    
    return fieldTypes.map(type => (
      <SelectItem key={type.value} value={type.value}>
        {type.label}
      </SelectItem>
    ));
  };
  
  // Render sections tab
  const renderSectionsTab = () => {
    return (
      <div className="space-y-4">
        {template.stages.map((section, sectionIndex) => {
          const isExpanded = expandedSections[section.id] || false;
          
          return (
            <Card key={section.id} className="overflow-hidden">
              <CardHeader className="p-4 bg-gray-50 cursor-pointer" onClick={() => toggleSection(section.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    <CardTitle className="text-lg">{section.name}</CardTitle>
                  </div>
                  
                  {!isReadOnly && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSection(sectionIndex);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`section-${section.id}-name`}>Section Name</Label>
                      <Input 
                        id={`section-${section.id}-name`}
                        value={section.name}
                        onChange={(e) => updateSection(sectionIndex, 'name', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`section-${section.id}-description`}>Section Description</Label>
                      <Textarea 
                        id={`section-${section.id}-description`}
                        value={section.description}
                        onChange={(e) => updateSection(sectionIndex, 'description', e.target.value)}
                        disabled={isReadOnly}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Fields ({section.tasks.length})</Label>
                        {!isReadOnly && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => addFieldToSection(sectionIndex)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Field
                          </Button>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        {section.tasks.map((field, fieldIndex) => (
                          <Card key={field.id} className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center">
                                  <h4 className="font-medium">{field.title || field.name || ''}</h4>
                                  <Badge variant="outline" className="ml-2">
                                    {getFieldTypeDisplay(field.type)}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-500">{field.description}</p>
                              </div>
                              
                              {!isReadOnly && (
                                <div className="flex space-x-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      // Open field editor
                                      // For now, we'll just toggle the expanded state
                                      toggleSection(`field-${field.id}`);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => deleteField(sectionIndex, fieldIndex)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            
                            {expandedSections[`field-${field.id}`] && (
                              <div className="mt-3 pt-3 border-t">
                                <FieldDetailView
                                  field={field}
                                  onFieldChange={(fieldId, fieldKey, value) => {
                                    // Handle field changes
                                    if (fieldKey === 'name' || fieldKey === 'description' || fieldKey === 'type') {
                                      updateField(sectionIndex, fieldIndex, fieldKey, value);
                                    } else if (fieldKey === 'metadata') {
                                      // Update the field's metadata
                                      const updatedStages = [...template.stages];
                                      const updatedTasks = [...updatedStages[sectionIndex].tasks];
                                      
                                      updatedTasks[fieldIndex] = {
                                        ...updatedTasks[fieldIndex],
                                        metadata: value
                                      };
                                      
                                      updatedStages[sectionIndex] = {
                                        ...updatedStages[sectionIndex],
                                        tasks: updatedTasks
                                      };
                                      
                                      onTemplateChange({
                                        ...template,
                                        stages: updatedStages
                                      });
                                    }
                                  }}
                                  isReadOnly={isReadOnly}
                                />
                              </div>
                            )}
                          </Card>
                        ))}
                        
                        {section.tasks.length === 0 && (
                          <div className="text-center p-4 border rounded-md bg-gray-50">
                            <p className="text-gray-500">No fields in this section</p>
                            {!isReadOnly && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => addFieldToSection(sectionIndex)}
                                className="mt-2"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Field
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        
        {template.stages.length === 0 && (
          <div className="text-center p-8 border rounded-md bg-gray-50">
            <p className="text-gray-500">No sections in this template</p>
            {!isReadOnly && (
              <Button 
                variant="outline"
                onClick={addSection}
                className="mt-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Section
              </Button>
            )}
          </div>
        )}
        
        {!isReadOnly && (
          <div className="flex justify-center mt-4">
            <Button 
              variant="outline"
              onClick={addSection}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>
          </div>
        )}
      </div>
    );
  };
  
  // Render fields tab
  const renderFieldsTab = () => {
    // Flatten all fields from all sections
    const allFields = template.stages.flatMap(section => 
      section.tasks.map(task => ({
        ...task,
        sectionId: section.id,
        sectionName: section.name
      }))
    );
    
    return (
      <div className="space-y-4">
        {allFields.map((field) => (
          <Card key={field.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center">
                  <h4 className="font-medium">{field.title || field.name || ''}</h4>
                  <Badge variant="outline" className="ml-2">
                    {getFieldTypeDisplay(field.type)}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">{field.description}</p>
                <div className="text-xs text-gray-400">
                  Section: {field.sectionName}
                </div>
              </div>
            </div>
          </Card>
        ))}
        
        {allFields.length === 0 && (
          <div className="text-center p-8 border rounded-md bg-gray-50">
            <p className="text-gray-500">No fields in this template</p>
          </div>
        )}
      </div>
    );
  };
  
  // Render metadata tab
  const renderMetadataTab = () => {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="font-medium mb-2">Template Metadata</h3>
          <div className="space-y-2">
            {Object.entries(metadata).map(([key, value]) => {
              // Skip the originalPOVTemplate to avoid circular references
              if (key === 'originalPOVTemplate') return null;
              
              return (
                <div key={key} className="flex">
                  <div className="font-medium w-1/3">{key}:</div>
                  <div className="w-2/3">
                    {typeof value === 'object' 
                      ? JSON.stringify(value) 
                      : String(value)
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="template-name">Template Name</Label>
          <Input 
            id="template-name"
            value={template.name}
            onChange={(e) => updateBasicInfo('name', e.target.value)}
            disabled={isReadOnly}
            className="text-lg font-medium"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="template-description">Template Description</Label>
          <Textarea 
            id="template-description"
            value={template.description}
            onChange={(e) => updateBasicInfo('description', e.target.value)}
            disabled={isReadOnly}
          />
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>
        
        <TabsContent value="sections" className="mt-4">
          {renderSectionsTab()}
        </TabsContent>
        
        <TabsContent value="fields" className="mt-4">
          {renderFieldsTab()}
        </TabsContent>
        
        <TabsContent value="metadata" className="mt-4">
          {renderMetadataTab()}
        </TabsContent>
      </Tabs>
      
      {/* Save button removed to unify save functionality in the parent TemplateEditor component */}
    </div>
  );
}

export default POVTemplateView;