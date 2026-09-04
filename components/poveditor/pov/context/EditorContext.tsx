"use client";

import { createContext, useContext } from 'react';
import { EditorState, EditorAction } from './types';

/**
 * Interface for the editor context
 */
export interface EditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  updateField: (path: string[], value: any) => void;
  addEntity: (entityType: string, entity: any) => string;
  updateEntity: (entityType: string, id: string, updates: any) => void;
  removeEntity: (entityType: string, id: string) => void;
  reorderRelationship: (relationshipKey: string, newOrder: string[]) => void;
  saveData: () => Promise<any>;
  setActiveTab: (tab: string) => void;
  isLoading: boolean;
  isSaving: boolean;
  hasErrors: boolean;
}

/**
 * Create the editor context
 */
export const EditorContext = createContext<EditorContextType | null>(null);

/**
 * Custom hook for using the editor context
 * @returns The editor context
 * @throws Error if used outside of a PovEditorProvider
 */
export function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within a PovEditorProvider');
  }
  return context;
}
