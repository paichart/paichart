import { useState } from 'react';
import { SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Hook for managing sections in the template wizard
 */
export function useSectionManagement(
  initialSections: SectionDefinition[],
  onUpdate: (sections: SectionDefinition[]) => void
) {
  const [sections, setSections] = useState<SectionDefinition[]>(initialSections);
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
    
    while (sections.some(section => section.id === id)) {
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
    const updatedSection = {
      ...newSection,
      id: sectionId
    };
    
    const updatedSections = [...sections, updatedSection];
    setSections(updatedSections);
    onUpdate(updatedSections);
    
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
    const updatedSections = [...sections];
    updatedSections[sectionIndex] = updatedSection;
    setSections(updatedSections);
    onUpdate(updatedSections);
    setEditingSection(null);
  };
  
  // Delete a section
  const handleDeleteSection = (sectionIndex: number) => {
    if (!confirm(`Are you sure you want to delete the section "${sections[sectionIndex].title}"?`)) {
      return;
    }
    
    const updatedSections = [...sections];
    updatedSections.splice(sectionIndex, 1);
    setSections(updatedSections);
    onUpdate(updatedSections);
  };
  
  // Move a section up or down
  const handleMoveSection = (sectionIndex: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && sectionIndex === 0) ||
      (direction === 'down' && sectionIndex === sections.length - 1)
    ) {
      return;
    }
    
    const updatedSections = [...sections];
    const targetIndex = direction === 'up' ? sectionIndex - 1 : sectionIndex + 1;
    
    [updatedSections[sectionIndex], updatedSections[targetIndex]] = 
      [updatedSections[targetIndex], updatedSections[sectionIndex]];
    
    setSections(updatedSections);
    onUpdate(updatedSections);
  };
  
  // Move a section via drag and drop
  const moveSection = (dragIndex: number, hoverIndex: number) => {
    const updatedSections = [...sections];
    const draggedSection = updatedSections[dragIndex];
    
    updatedSections.splice(dragIndex, 1);
    updatedSections.splice(hoverIndex, 0, draggedSection);
    
    setSections(updatedSections);
    onUpdate(updatedSections);
  };
  
  return {
    sections,
    editingSection,
    newSection,
    showNewSectionForm,
    setEditingSection,
    setNewSection,
    setShowNewSectionForm,
    generateSectionId,
    handleAddSection,
    handleUpdateSection,
    handleDeleteSection,
    handleMoveSection,
    moveSection
  };
}