import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Hook for managing field assignments in sections
 */
export function useFieldAssignment(
  sections: SectionDefinition[],
  fields: Record<string, FieldDefinition>,
  onUpdate: (sections: SectionDefinition[]) => void
) {
  // Add a field to a section
  const handleAddFieldToSection = (sectionIndex: number, fieldId: string) => {
    const updatedSections = [...sections];
    
    // Check if field is already in this section
    if (updatedSections[sectionIndex].fields.includes(fieldId)) {
      return;
    }
    
    // Add field to section
    updatedSections[sectionIndex].fields.push(fieldId);
    onUpdate(updatedSections);
  };
  
  // Remove a field from a section
  const handleRemoveFieldFromSection = (sectionIndex: number, fieldId: string) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].fields = updatedSections[sectionIndex].fields.filter(
      id => id !== fieldId
    );
    onUpdate(updatedSections);
  };
  
  // Reorder fields within a section
  const handleReorderFields = (sectionIndex: number, fieldIds: string[]) => {
    const updatedSections = [...sections];
    updatedSections[sectionIndex].fields = fieldIds;
    onUpdate(updatedSections);
  };
  
  // Get assigned fields for a section
  const getAssignedFields = (section: SectionDefinition) => {
    return section.fields
      .filter(fieldId => fields[fieldId])
      .map(fieldId => fields[fieldId]);
  };
  
  // Get unassigned fields for a section
  const getUnassignedFields = (section: SectionDefinition) => {
    // Debug logging to help identify issues
    
    const unassignedFields = Object.entries(fields)
      .filter(([fieldId]) => !section.fields.includes(fieldId))
      .map(([fieldId, field]) => ({ id: fieldId, ...field }));
    
    
    return unassignedFields;
  };
  
  // Check if all fields are assigned to at least one section
  const getUnassignedFieldIds = () => {
    return Object.keys(fields).filter(fieldId => 
      !sections.some(section => section.fields.includes(fieldId))
    );
  };
  
  return {
    handleAddFieldToSection,
    handleRemoveFieldFromSection,
    handleReorderFields,
    getAssignedFields,
    getUnassignedFields,
    getUnassignedFieldIds
  };
}