import { TemplateTab, TemplateTabRegistry, ValidationResult } from './types';
import { TemplateType } from '../context/types/TemplateEditorState';

// Import all tab definitions
import { BasicInfoTab } from './BasicInfoTab';
import { FieldsTab } from './FieldsTab';
import { SectionsTab } from './SectionsTab';
import { PhaseTemplateSelectionTab } from './PhaseTemplateSelectionTab';
import { PhaseDesignTab } from './PhaseDesignTab';
import { PhaseControlsTab } from './PhaseControlsTab';
import { AgentConfigTab } from './AgentConfigTab';
import { ReviewTab } from './ReviewTab';

// Import agent-specific tab definitions
import { AgentTabDefinitions } from './agent';

/**
 * Template Tab Registry Implementation
 * Manages all available tabs and their configurations
 */
class TemplateTabRegistryImpl implements TemplateTabRegistry {
  private tabs: TemplateTab[] = [
    BasicInfoTab,
    FieldsTab,
    SectionsTab,
    PhaseTemplateSelectionTab,
    PhaseDesignTab,
    PhaseControlsTab,
    AgentConfigTab,
    ReviewTab,
    // Add agent-specific tabs
    ...AgentTabDefinitions,
  ];

  /**
   * Get all tabs for a specific template type
   */
  getTabs(templateType: TemplateType): TemplateTab[] {
    return this.tabs
      .filter(tab => tab.templateTypes.includes(templateType))
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get a specific tab by ID
   */
  getTab(tabId: string): TemplateTab | undefined {
    return this.tabs.find(tab => tab.id === tabId);
  }

  /**
   * Get enabled tabs for a template type and data
   */
  getEnabledTabs(templateType: TemplateType, templateData: any): TemplateTab[] {
    const availableTabs = this.getTabs(templateType);
    
    return availableTabs.filter(tab => {
      // Check if tab is enabled based on its condition
      if (tab.isEnabled && !tab.isEnabled(templateData)) {
        return false;
      }
      
      // Check dependencies
      if (tab.dependencies) {
        const dependencyMet = tab.dependencies.every(depId => {
          const depTab = this.getTab(depId);
          if (!depTab) return false;
          
          // Check if dependency tab is valid
          const validation = this.validateTab(depId, templateData);
          return validation.isValid;
        });
        
        if (!dependencyMet) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Validate a specific tab
   */
  validateTab(tabId: string, templateData: any): ValidationResult {
    const tab = this.getTab(tabId);
    if (!tab) {
      return {
        isValid: false,
        errors: { general: ['Tab not found'] }
      };
    }

    const errors: Record<string, string[]> = {};

    // Required field validation
    if (tab.validation?.required) {
      tab.validation.required.forEach(fieldPath => {
        const value = this.getNestedValue(templateData, fieldPath);
        if (!value || (typeof value === 'string' && !value.trim())) {
          if (!errors[fieldPath]) errors[fieldPath] = [];
          errors[fieldPath].push(`${fieldPath} is required`);
        }
      });
    }

    // Field-specific validation
    if (tab.validation?.fields) {
      Object.entries(tab.validation.fields).forEach(([fieldPath, validation]) => {
        const value = this.getNestedValue(templateData, fieldPath);
        
        if (value) {
          // Min length validation
          if (validation.minLength && value.length < validation.minLength) {
            if (!errors[fieldPath]) errors[fieldPath] = [];
            errors[fieldPath].push(validation.message);
          }
          
          // Max length validation
          if (validation.maxLength && value.length > validation.maxLength) {
            if (!errors[fieldPath]) errors[fieldPath] = [];
            errors[fieldPath].push(validation.message);
          }
          
          // Pattern validation
          if (validation.pattern && !validation.pattern.test(value)) {
            if (!errors[fieldPath]) errors[fieldPath] = [];
            errors[fieldPath].push(validation.message);
          }
          
          // Custom validation
          if (validation.custom && !validation.custom(value)) {
            if (!errors[fieldPath]) errors[fieldPath] = [];
            errors[fieldPath].push(validation.message);
          }
        }
      });
    }

    // Custom validation
    if (tab.validation?.custom) {
      const customResult = tab.validation.custom(templateData);
      Object.entries(customResult.errors).forEach(([field, fieldErrors]) => {
        if (!errors[field]) errors[field] = [];
        errors[field].push(...fieldErrors);
      });
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Register a new tab
   */
  registerTab(tab: TemplateTab): void {
    // Remove existing tab with same ID
    this.tabs = this.tabs.filter(t => t.id !== tab.id);
    // Add new tab
    this.tabs.push(tab);
    // Sort by order
    this.tabs.sort((a, b) => a.order - b.order);
  }

  /**
   * Unregister a tab
   */
  unregisterTab(tabId: string): void {
    this.tabs = this.tabs.filter(t => t.id !== tabId);
  }

  /**
   * Get all registered tabs
   */
  getAllTabs(): TemplateTab[] {
    return [...this.tabs];
  }
}

// Export singleton instance
export const templateTabRegistry = new TemplateTabRegistryImpl();

// Export the class for testing
export { TemplateTabRegistryImpl };
