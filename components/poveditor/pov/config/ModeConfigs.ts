/**
 * Centralized mode configuration for POV Editor tab management
 * 
 * This file defines which tabs appear in each editor mode, replacing the
 * previous mixed approach of hard-coded whitelists and individual hidden functions.
 */

export interface ModeConfig {
  /** Tabs that can appear in this mode */
  allowedTabs: string[];
  
  /** Tabs that must always appear (subset of allowedTabs) */
  requiredTabs: string[];
  
  /** Tabs with dynamic visibility based on editor state */
  conditionalTabs: {
    [tabId: string]: (state: any) => boolean;
  };
  
  /** Custom ordering per mode (overrides tab.order) */
  tabOrder?: {
    [tabId: string]: number;
  };
  
  /** Enable dynamic tab generation (e.g., phase tabs) */
  dynamicTabs?: boolean;
  
  /** Ensure first phase tab is always visible and selected by default (project mode) */
  ensureFirstPhaseTab?: boolean;
}

export interface ModeConfigs {
  [modeName: string]: ModeConfig;
}

/**
 * Mode configuration definitions
 * 
 * Each mode defines exactly which tabs should appear and under what conditions.
 * This eliminates the need for individual tab hidden functions and provides
 * a single source of truth for tab visibility logic.
 */
export const MODE_CONFIGS: ModeConfigs = {
  /**
   * Create Mode - Creating a new POV from scratch
   * URL: /pov/new
   */
  'create': {
    allowedTabs: ['basic-info', 'geographical', 'team', 'phase-templates', 'phases', 'agents'],
    requiredTabs: ['basic-info'],
    conditionalTabs: {},
    tabOrder: {
      'basic-info': 1,
      'geographical': 1.5,
      'team': 2,
      'phase-templates': 3,
      'phases': 4,
      'agents': 5
    }
  },

  /**
   * Edit Mode - Editing an existing POV
   * URL: /pov/edit/[povId]
   */
  'edit': {
    allowedTabs: ['basic-info', 'geographical', 'team', 'phases', 'agents'],
    requiredTabs: ['basic-info'],
    conditionalTabs: {},
    tabOrder: {
      'basic-info': 1,
      'geographical': 1.5,
      'team': 2,
      'phases': 3,
      'agents': 4
    }
  },

  /**
   * Template-Based Mode - Creating a POV from a template
   * URL: /pov/from-template?templateId=123
   */
  'template-based': {
    allowedTabs: ['basic-info', 'geographical', 'team', 'phase-templates', 'template-fields'],
    requiredTabs: ['basic-info', 'geographical', 'phase-templates'],
    conditionalTabs: {
      // Only show template fields if the template has fields defined
      'template-fields': (state) => {
        const templateData = state?.data?.templateData;
        return templateData?.data?.fields && Object.keys(templateData.data.fields).length > 0;
      }
    },
    tabOrder: {
      'basic-info': 1,
      'geographical': 1.5,
      'team': 2,
      'phase-templates': 3,
      'template-fields': 4
    }
  },

  /**
   * View Mode - Read-only viewing of POVs
   * URL: /pov/view/[povId]
   */
  'view': {
    allowedTabs: ['basic-info', 'team', 'phases', 'analytics'],
    requiredTabs: [],
    conditionalTabs: {},
    tabOrder: {
      'basic-info': 1,
      'team': 2,
      'phases': 3,
      'analytics': 4
    }
  },

  /**
   * Project Mode - Kanban board project management with dynamic phase tabs
   * URL: /pov/edit/[povId]?mode=project
   */
  'project': {
    allowedTabs: ['tasks', 'agents'], // Only tasks and agents, no phase-templates
    requiredTabs: [], // Dynamic phase tabs will be required automatically
    conditionalTabs: {
      'tasks': (state) => !!state?.ui?.selectedTaskId,
      'agents': (state) => !!state?.ui?.selectedTaskId
    },
    dynamicTabs: true, // Enable dynamic phase tabs
    // Custom logic: first phase tab should always be visible and selected by default
    ensureFirstPhaseTab: true,
    tabOrder: {
      // Dynamic phase tabs will be ordered 1-99 based on phase order
      // Static tabs come after phases
      'tasks': 100,
      'agents': 101
    }
  },

  /**
   * Staging Mode - Development/testing mode with all tabs
   * URL: /pov/staging
   */
  'staging': {
    allowedTabs: [
      'basic-info',
      'geographical', 
      'phase-templates', 
      'phases', 
      'tasks', 
      'agents', 
      'crm', 
      'kpi', 
      'resources', 
      'launches', 
      'dynamic-tab'
    ],
    requiredTabs: ['basic-info'],
    conditionalTabs: {
      // Always show dynamic tab in staging for testing
      'dynamic-tab': () => true
    },
    tabOrder: {
      'basic-info': 1,
      'geographical': 1.5,
      'phase-templates': 2,
      'phases': 3,
      'tasks': 4,
      'agents': 5,
      'crm': 6,
      'kpi': 7,
      'resources': 8,
      'launches': 9,
      'dynamic-tab': 10
    }
  }
};

/**
 * Get mode configuration for a specific mode
 */
export function getModeConfig(mode: string): ModeConfig | null {
  return MODE_CONFIGS[mode] || null;
}

/**
 * Check if a tab is allowed in a specific mode
 */
export function isTabAllowedInMode(tabId: string, mode: string): boolean {
  const config = getModeConfig(mode);
  return config ? config.allowedTabs.includes(tabId) : false;
}

/**
 * Check if a tab is required in a specific mode
 */
export function isTabRequiredInMode(tabId: string, mode: string): boolean {
  const config = getModeConfig(mode);
  return config ? config.requiredTabs.includes(tabId) : false;
}

/**
 * Get all available modes
 */
export function getAvailableModes(): string[] {
  return Object.keys(MODE_CONFIGS);
}
