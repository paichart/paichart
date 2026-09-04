export interface Stage {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  color?: string;
}

export interface Task {
  id: string;
  name?: string; // Optional for backward compatibility
  title: string; // Primary property (replaces name)
  description: string;
  type: 'action' | 'approval' | 'document' | 'meeting' | 'milestone';
  assignee?: string;
  dueDate?: string;
  dependencies?: string[]; // IDs of tasks this task depends on
}

export interface DragItem {
  index: number;
  id: string;
  type: string;
}

export interface PhaseTemplateBuilderProps {
  initialData?: {
    name: string;
    description: string;
    stages: Stage[];
  };
  onSave?: (data: any) => void;
}
