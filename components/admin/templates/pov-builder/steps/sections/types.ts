import { FieldDefinition, SectionDefinition } from '@/lib/pov/templates/types';

/**
 * Interface for drag and drop items
 */
export interface DragItem {
  index: number;
  id: string;
  type: string;
}

/**
 * Props for the DraggableSection component
 */
export interface DraggableSectionProps {
  section: SectionDefinition;
  index: number;
  moveSection: (dragIndex: number, hoverIndex: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddField: (fieldId: string) => void;
  onRemoveField: (fieldId: string) => void;
  onReorderFields: (fieldIds: string[]) => void;
  availableFields: Record<string, FieldDefinition>;
}

/**
 * Props for the DraggableField component
 */
export interface DraggableFieldProps {
  fieldId: string;
  field: FieldDefinition;
  index: number;
  onRemove: () => void;
}

/**
 * Props for the SectionEditor component
 */
export interface SectionEditorProps {
  section: SectionDefinition;
  isNew?: boolean;
  onCancel: () => void;
  onSave: (updatedSection: SectionDefinition) => void;
}

/**
 * Props for the SectionsStep component
 */
export interface SectionsStepProps {
  sections: SectionDefinition[];
  fields: Record<string, FieldDefinition>;
  onUpdate: (sections: SectionDefinition[]) => void;
}