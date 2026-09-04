import { ReactNode } from 'react';

/**
 * Interface defining the structure of an editor tab
 */
export interface EditorTab {
  /**
   * Unique identifier for the tab
   */
  id: string;
  
  /**
   * Display label for the tab
   */
  label: string;
  
  /**
   * The component to render when this tab is active
   */
  component: React.ComponentType<any>;
  
  /**
   * Optional order for sorting tabs (lower numbers appear first)
   */
  order?: number;
  
  /**
   * Optional icon to display alongside the label
   */
  icon?: ReactNode;
  
  /**
   * Whether the tab is disabled
   */
  disabled?: boolean;
  
  /**
   * Whether the tab should be hidden
   * Can be a boolean or a function that takes the editor state and returns a boolean
   */
  hidden?: boolean | ((state: any) => boolean);
  
  /**
   * Optional feature flag name to control tab visibility
   */
  featureFlag?: string;
  
  /**
   * Optional props to pass to the component when rendering
   */
  componentProps?: Record<string, any>;
  
  /**
   * Optional description for the tab
   */
  description?: string;
}
