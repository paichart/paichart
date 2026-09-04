"use client";

import { ReactNode } from 'react';
import { EditorTab } from '../types/EditorTab';
import { useTabRegistration } from '../hooks/useTabRegistration';

/**
 * Props for the TabProvider component
 */
interface TabProviderProps {
  /**
   * The tab to register
   */
  tab: EditorTab;
  
  /**
   * Optional children
   */
  children?: ReactNode;
}

/**
 * Provider component for registering a tab with the registry
 */
export function TabProvider({ tab, children }: TabProviderProps) {
  // Register the tab
  useTabRegistration(tab);
  
  // Render children
  return <>{children}</>;
}
