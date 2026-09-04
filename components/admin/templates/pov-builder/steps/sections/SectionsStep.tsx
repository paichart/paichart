"use client";

import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AlertCircle, CheckSquare, Plus } from 'lucide-react';
import { SectionsStepProps } from './types';
import { DraggableField } from './components/DraggableField';
import { DraggableSection } from './components/DraggableSection';
import { SectionEditor } from './components/SectionEditor';
import { useFieldAssignment } from './hooks/useFieldAssignment';
import { useSectionManagement } from './hooks/useSectionManagement';
import { SectionDefinition } from '@/lib/pov/templates/types';

/**
 * SectionsStep component for the template wizard
 */
export function SectionsStep({ sections, fields, onUpdate }: SectionsStepProps) {
  // Debug fields being received by modular SectionsStep
  
  // Use the section management hook
  const {
    sections: managedSections,
    editingSection,
    newSection,
    showNewSectionForm,
    setEditingSection,
    setNewSection,
    setShowNewSectionForm,
    handleAddSection,
    handleUpdateSection,
    handleDeleteSection,
    handleMoveSection,
    moveSection
  } = useSectionManagement(sections, onUpdate);
  
  // Use the field assignment hook
  const {
    handleAddFieldToSection,
    handleRemoveFieldFromSection,
    handleReorderFields,
    getUnassignedFieldIds
  } = useFieldAssignment(managedSections, fields, onUpdate);
  
  // Debug fields being passed to useFieldAssignment
  
  // Get unassigned fields
  const unassignedFieldIds = getUnassignedFieldIds();
  
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        {unassignedFieldIds.length > 0 && (
          <div className="bg-warning/10 border border-warning/20 p-4 rounded-md">
            <h3 className="font-medium text-warning-foreground flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              How to use Sections
            </h3>
            <p className="text-sm text-warning-foreground/90 mt-1 mb-3">
              <ol className="list-decimal pl-5 mt-2 space-y-1">
                <li>Click the &quot;Add First Section&quot; button in the middle of the screen</li>
                <li>In the form that appears, enter a section title (e.g., &quot;Security Infrastructure&quot; or &quot;Vendor Information&quot;)</li>
                <li>Optionally add a description for the section</li>
                <li>Click &quot;Add Section&quot; to create the section</li>
                <li>Once the section is created, you&apos;ll see the new field listed under &quot;Available fields&quot;</li>
              </ol>
            </p>
            <div className="flex flex-wrap gap-2">
              {unassignedFieldIds.map((fieldId: string) => (
                <Badge key={fieldId} variant="outline" className="bg-background">
                  {fields[fieldId].label}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {showNewSectionForm ? (
          <SectionEditor
            section={newSection}
            isNew={true}
            onCancel={() => setShowNewSectionForm(false)}
            onSave={(updatedSection: SectionDefinition) => {
              setNewSection(updatedSection);
              handleAddSection();
            }}
          />
        ) : editingSection !== null ? (
          <SectionEditor
            section={managedSections.find((s: SectionDefinition) => s.id === editingSection) || newSection}
            onCancel={() => setEditingSection(null)}
            onSave={(updatedSection: SectionDefinition) => {
              const sectionIndex = managedSections.findIndex((s: SectionDefinition) => s.id === editingSection);
              if (sectionIndex !== -1) {
                handleUpdateSection(sectionIndex, updatedSection);
              }
            }}
          />
        ) : (
          <>
            {managedSections.length === 0 ? (
              <div className="text-center p-8 border rounded-lg bg-muted/50">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <CheckSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No sections defined yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                  Sections help organize fields in the template
                </p>
                <Button 
                  onClick={() => setShowNewSectionForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Section
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Sections ({managedSections.length})</h3>
                  <Button 
                    variant="outline"
                    onClick={() => setShowNewSectionForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Section
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {managedSections.map((section: SectionDefinition, index: number) => (
                    <DraggableSection
                      key={section.id}
                      section={section}
                      index={index}
                      moveSection={moveSection}
                      onEdit={() => setEditingSection(section.id)}
                      onDelete={() => handleDeleteSection(index)}
                      onMoveUp={() => handleMoveSection(index, 'up')}
                      onMoveDown={() => handleMoveSection(index, 'down')}
                      onAddField={(fieldId: string) => handleAddFieldToSection(index, fieldId)}
                      onRemoveField={(fieldId: string) => handleRemoveFieldFromSection(index, fieldId)}
                      onReorderFields={(fieldIds: string[]) => handleReorderFields(index, fieldIds)}
                      availableFields={fields}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DndProvider>
  );
}

export default SectionsStep;