import { ComponentType } from 'react';
import { TemplateType } from '../context/types/TemplateEditorState';

/**
 * Template tab configuration interface
 */
export interface TemplateTab {
  id: string;
  label: string;
  description: string;
  component: ComponentType<any>;
  icon: string;
  order: number;
  templateTypes: TemplateType[];
  isRequired?: boolean;
  isEnabled?: (templateData: any) => boolean;
  validation?: TemplateTabValidation;
  dependencies?: string[];
}

/**
 * Tab validation configuration
 */
export interface TemplateTabValidation {
  required?: string[];
  fields?: Record<string, FieldValidation>;
  custom?: (templateData: any) => ValidationResult;
}

/**
 * Field validation configuration
 */
export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  message: string;
  custom?: (value: any) => boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
  warnings?: Record<string, string[]>;
}

/**
 * Tab registry interface
 */
export interface TemplateTabRegistry {
  getTabs(templateType: TemplateType): TemplateTab[];
  getTab(tabId: string): TemplateTab | undefined;
  getEnabledTabs(templateType: TemplateType, templateData: any): TemplateTab[];
  validateTab(tabId: string, templateData: any): ValidationResult;
}

/**
 * Tab context interface
 */
export interface TemplateTabContext {
  activeTab: string;
  availableTabs: TemplateTab[];
  setActiveTab: (tabId: string) => void;
  isTabEnabled: (tabId: string) => boolean;
  isTabValid: (tabId: string) => boolean;
  getTabErrors: (tabId: string) => string[];
}
