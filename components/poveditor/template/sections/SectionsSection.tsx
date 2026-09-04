"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { 
  AlertCircle, 
  Check, 
  Plus, 
  Trash2, 
  Edit, 
  ArrowUp, 
  ArrowDown 
} from 'lucide-react';
import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';
import { usePovTemplateOperations, useTemplateValidation } from '../context/TemplateEditorContext';

export default function SectionsSection() {
  const { fields, sections, addSection, updateSection, removeSection, reorderSections } = usePovTemplateOperations();
  const { getFieldErrors, hasFieldError } = useTemplateValidation();
  
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newSection, setNewSection] = useState<SectionDefinition>({
    id: '',
    title: '',
    description: '',
    fields: []
  });
  const [showNewSectionForm, setShowNewSectionForm] = useState(false);
  
  // Generate a unique section ID
  const generateSectionId = (title: string): string => {
    const baseId = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let id = baseId;
    let counter = 1;
    
    while (sections.some(s => s.id === id)) {
      id = `${baseId}_${counter}`;
      counter++;
    }
    
    return id;
  };
  
  // Add a new section
  const handleAddSection = () => {
    if (!newSection.title.trim()) {
      alert('Section title is required');
      return;
    }
    
    const sectionId = generateSectionId(newSection.title);
    const sectionToAdd = {
      ...newSection,
      id: sectionId,
      fields: [] // Ensure fields is initialized as an empty array
    };
    
    addSection(sectionToAdd);
    
    setNewSection({
      id: '',
      title: '',
      description: '',
      fields: []
    });
    setShowNewSectionForm(false);
  };
  
  // Update an existing section
  const handleUpdateSection = (sectionIndex: number, updatedSection: SectionDefinition) => {
    updateSection(sectionIndex, updatedSection);
    setEditingSection(null);
  };
  
  // Delete a section
  const handleDeleteSection = (sectionIndex: number) => {
    if (!confirm(`Are you sure you want to delete the section "${sections[sectionIndex].title}"?`)) {
      return;
    }
    
    removeSection(sectionIndex);
  };
  
  // Move a section up or down
  const handleMoveSection = (sectionIndex: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && sectionIndex === 0) ||
      (direction === 'down' && sectionIndex === sections.length - 1)
    ) {
      return;
    }
    
    const newIndex = direction === 'up' ? sectionIndex - 1 : sectionIndex + 1;
    
    // Use the reorderSections function with fromIndex and toIndex
    reorderSections(sectionIndex, newIndex);
  };
  
  // Add a field to a section
  const handleAddFieldToSection = (sectionIndex: number, fieldId: string) => {
    const section = sections[sectionIndex];
    
    // Ensure fields is an array and make a copy of it
    const sectionFields = Array.isArray(section.fields) 
      ? [...section.fields] 
      : [];
    
    // Add the field to the section if it's not already there
    if (!sectionFields.includes(fieldId)) {
      sectionFields.push(fieldId);
      const updatedSection = {
        ...section,
        fields: sectionFields
      };
      updateSection(sectionIndex, updatedSection);
    }
  };
  
  // Remove a field from a section
  const handleRemoveFieldFromSection = (sectionIndex: number, fieldId: string) => {
    const section = sections[sectionIndex];
    
    // Ensure fields is an array and make a copy of it
    const sectionFields = Array.isArray(section.fields) 
      ? [...section.fields] 
      : [];
    
    // Filter out the field to remove
    const updatedFields = sectionFields.filter(id => id !== fieldId);
    
    // Update the section with the new fields array
    const updatedSection = {
      ...section,
      fields: updatedFields
    };
    
    updateSection(sectionIndex, updatedSection);
  };
  
  // Get unassigned field IDs
  const getUnassignedFieldIds = (): string[] => {
    const assignedFieldIds = new Set<string>();
    
    sections.forEach(section => {
      section.fields.forEach(fieldId => {
        assignedFieldIds.add(fieldId);
      });
    });
    
    return Object.keys(fields).filter(fieldId => !assignedFieldIds.has(fieldId));
  };
  
  // Section Editor Component
  const SectionEditor = ({
    section,
    isNew = false,
    onCancel,
    onSave
  }: {
    section: SectionDefinition;
    isNew?: boolean;
    onCancel: () => void;
    onSave: (updatedSection: SectionDefinition) => void;
  }) => {
    const [localSection, setLocalSection] = useState<SectionDefinition>({ ...section });
    
    const updateLocalSection = (updates: Partial<SectionDefinition>) => {
      setLocalSection(prev => ({ ...prev, ...updates }));
    };
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{isNew ? 'Add New Section' : `Edit Section: ${section.title}`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="section-title">Section Title</Label>
            <Input
              id="section-title"
              value={localSection.title}
              onChange={(e) => updateLocalSection({ title: e.target.value })}
              placeholder="Enter section title"
              className={hasFieldError(`sections.${section.id}.title`) ? 'border-destructive' : ''}
            />
            {hasFieldError(`sections.${section.id}.title`) && (
              <p className="text-sm text-destructive">
                {getFieldErrors(`sections.${section.id}.title`)[0]}
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="section-description">Description</Label>
            <Textarea
              id="section-description"
              value={localSection.description || ''}
              onChange={(e) => updateLocalSection({ description: e.target.value })}
              placeholder="Enter section description"
            />
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              onClick={() => onSave(localSection)}
              disabled={!localSection.title.trim()}
            >
              {isNew ? 'Add Section' : 'Update Section'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  // Draggable Section Component
  const DraggableSection = ({
    section,
    index,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
    onAddField,
    onRemoveField,
    availableFields
  }: {
    section: SectionDefinition;
    index: number;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onAddField: (fieldId: string) => void;
    onRemoveField: (fieldId: string) => void;
    availableFields: Record<string, FieldDefinition>;
  }) => {
    const [showFieldSelector, setShowFieldSelector] = useState(false);
    const unassignedFieldIds = getUnassignedFieldIds();
    
    return (
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{section.title}</CardTitle>
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onMoveUp}
              disabled={index === 0}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onMoveDown}
              disabled={index === sections.length - 1}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {section.description && (
            <p className="text-sm text-muted-foreground mb-4">{section.description}</p>
          )}
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium text-foreground">Fields in this section</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFieldSelector(!showFieldSelector)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Field
              </Button>
            </div>
            
            {section.fields.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 border border-dashed border-border rounded-md text-center">
                No fields assigned to this section
              </div>
            ) : (
              <div className="space-y-2">
                {section.fields.map((fieldId, fieldIndex) => {
                  const field = availableFields[fieldId];
                  if (!field) return null;
                  
                  return (
                    <div
                      key={fieldId}
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-foreground">{field.label}</span>
                        <Badge variant="outline">{field.type}</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveField(fieldId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            
            {showFieldSelector && (
              <div className="mt-4 p-4 border border-border rounded-md">
                <h4 className="text-sm font-medium text-foreground mb-2">Available fields</h4>
                {unassignedFieldIds.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    All fields have been assigned to sections
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {unassignedFieldIds.map(fieldId => {
                      const field = availableFields[fieldId];
                      if (!field) return null;
                      
                      return (
                        <Button
                          key={fieldId}
                          variant="outline"
                          size="sm"
                          className="justify-start"
                          onClick={() => {
                            onAddField(fieldId);
                            setShowFieldSelector(false);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {field.label}
                        </Button>
                      );
                    })}
                  </div>
                )}
                
                <div className="flex justify-end mt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFieldSelector(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };
  
  // Render section list
  const renderSectionList = () => {
    if (sections.length === 0) {
      return (
        <div className="text-center p-8 border border-border rounded-lg bg-muted">
          <Check className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-foreground">No sections defined yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Sections help organize fields in the POV template
          </p>
          <Button 
            onClick={() => setShowNewSectionForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add First Section
          </Button>
        </div>
      );
    }
    
    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium text-foreground">Sections ({sections.length})</h3>
          <Button 
            variant="outline"
            onClick={() => setShowNewSectionForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        </div>
        
        <div className="space-y-2">
          {sections.map((section, index) => (
            <DraggableSection
              key={section.id}
              section={section}
              index={index}
              onEdit={() => setEditingSection(section.id)}
              onDelete={() => handleDeleteSection(index)}
              onMoveUp={() => handleMoveSection(index, 'up')}
              onMoveDown={() => handleMoveSection(index, 'down')}
              onAddField={(fieldId) => handleAddFieldToSection(index, fieldId)}
              onRemoveField={(fieldId) => handleRemoveFieldFromSection(index, fieldId)}
              availableFields={fields}
            />
          ))}
        </div>
      </div>
    );
  };
  
  // Render unassigned fields warning
  const renderUnassignedFieldsWarning = () => {
    const unassignedFieldIds = getUnassignedFieldIds();
    
    if (unassignedFieldIds.length === 0 || sections.length === 0) {
      return null;
    }
    
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-md mb-6">
        <h3 className="font-medium text-yellow-800 dark:text-yellow-200 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          Unassigned Fields
        </h3>
        <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 mb-3">
          The following fields are not assigned to any section:
        </p>
        <div className="flex flex-wrap gap-2">
          {unassignedFieldIds.map((fieldId) => (
            <Badge key={fieldId} variant="outline" className="bg-background">
              {fields[fieldId].label}
            </Badge>
          ))}
        </div>
      </div>
    );
  };
  
  // Check if there are any fields
  const fieldCount = Object.keys(fields).length;
  
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Template Sections</h2>
        <p className="text-sm text-muted-foreground">
          Organize your template fields into logical sections to improve the user experience when creating POVs.
        </p>
      </div>

      {fieldCount === 0 ? (
        <div className="text-center p-8 border border-border rounded-lg bg-muted">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-foreground mb-2">No Fields Available</p>
          <p className="text-sm text-muted-foreground mb-4">
            You need to create fields before you can organize them into sections.
          </p>
          <p className="text-sm text-muted-foreground">
            Go to the <strong>Fields</strong> tab to add fields first.
          </p>
        </div>
      ) : (
        <>
          {renderUnassignedFieldsWarning()}
          
          {showNewSectionForm ? (
            <SectionEditor
              section={newSection}
              isNew={true}
              onCancel={() => setShowNewSectionForm(false)}
              onSave={(updatedSection) => {
                setNewSection(updatedSection);
                handleAddSection();
              }}
            />
          ) : editingSection !== null ? (
            <SectionEditor
              section={sections.find((s) => s.id === editingSection) || newSection}
              onCancel={() => setEditingSection(null)}
              onSave={(updatedSection) => {
                const sectionIndex = sections.findIndex((s) => s.id === editingSection);
                if (sectionIndex !== -1) {
                  handleUpdateSection(sectionIndex, updatedSection);
                }
              }}
            />
          ) : (
            renderSectionList()
          )}
        </>
      )}
    </div>
  );
}
