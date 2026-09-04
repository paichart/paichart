import { ReactNode } from 'react';
import { TaskType } from '@prisma/client';

/**
 * Represents a template with stages and tasks
 */
export interface Template {
  name: string;
  description: string;
  stages: Stage[];
  id?: string;
  metadata?: Record<string, any>;
}

/**
 * Represents a stage in a template
 */
export interface Stage {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  metadata?: Record<string, any>;
}

/**
 * Represents a task in a stage
 */
export interface Task {
  id: string;
  name?: string; // Make name optional for backward compatibility
  title: string; // Make title required as the primary property
  description: string;
  type: TaskType;  // Updated to use TaskType enum
  dependencies?: TaskDependency[];
  metadata?: Record<string, any>;
}

/**
 * Represents a dependency between tasks
 */
export interface TaskDependency {
  taskId: string;
  stageId: string;
}

/**
 * Available view modes for the template editor
 */
export enum ViewMode {
  DEFAULT = 'default',
  TREE = 'tree',
  GRAPH = 'graph',
  SPLIT = 'split',
  CAROUSEL = 'carousel',
  SMART_FOLDING = 'smart-folding',
  UNIFIED = 'unified'
}

/**
 * Properties for a view mode component
 */
export interface ViewModeProps {
  template: Template;
  onTemplateChange: (template: Template) => void;
  onSave: (template: Template) => void;
  isReadOnly?: boolean;
  activeTab?: string;
}

/**
 * Represents a view mode with its component and metadata
 */
export interface ViewModeDefinition {
  id: ViewMode;
  name: string;
  description: string;
  icon: ReactNode;
  component: React.ComponentType<ViewModeProps>;
  bestFor: string[];
}

/**
 * Context for the template view system
 */
export interface TemplateViewContextType {
  activeViewMode: ViewMode;
  setActiveViewMode: (mode: ViewMode) => void;
  availableViewModes: ViewModeDefinition[];
  template: Template;
  updateTemplate: (template: Template) => void;
  saveTemplate: () => void;
  isReadOnly: boolean;
  setIsReadOnly: (isReadOnly: boolean) => void;
  userPreferences: UserPreferences;
  updateUserPreferences: (preferences: Partial<UserPreferences>) => void;
}

/**
 * User preferences for the template view system
 */
export interface UserPreferences {
  defaultViewMode: ViewMode;
  viewModePreferences: Record<ViewMode, ViewModePreference>;
}

/**
 * Preferences for a specific view mode
 */
export interface ViewModePreference {
  isEnabled: boolean;
  customSettings?: Record<string, any>;
}

/**
 * Command for template operations
 */
export interface TemplateCommand {
  type: string;
  payload: any;
  timestamp: number;
  id: string;
}

/**
 * History manager for undo/redo operations
 */
export interface HistoryManager {
  addCommand: (command: TemplateCommand) => void;
  undo: () => Template | null;
  redo: () => Template | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}
