import { EditorTab } from '../types/EditorTab';
import { MODE_CONFIGS, getModeConfig } from '../config/ModeConfigs';
import {
  BasicInfoTab,
  CRMTab,
  KPITab,
  ResourcesTab,
  TeamTab,
  WorkflowTab,
  AgentsTab,
  PhaseTemplatesTab,
  PhasesTab,
  LaunchesTab,
  AnalyticsTab,
  TemplateFieldsTab,
  TasksTab,
  DynamicTab
} from '../tabs';
import { generatePhaseTabsForProject, shouldGenerateDynamicTabs } from '../utils/dynamicPhaseTabGenerator';

/**
 * Default tabs to register
 */
const defaultTabs: EditorTab[] = [
  BasicInfoTab,
  CRMTab,
  KPITab,
  ResourcesTab,
  TeamTab,
  WorkflowTab,
  AgentsTab,
  PhaseTemplatesTab,
  PhasesTab,
  LaunchesTab,
  AnalyticsTab,
  TemplateFieldsTab,
  TasksTab,
  DynamicTab
];

/**
 * Registry for managing editor tabs with mode-based filtering
 */
class TabsRegistry {
  /**
   * Map of tab IDs to tab objects
   */
  private tabs: Map<string, EditorTab> = new Map();
  
  /**
   * Set of listeners for tab changes
   */
  private listeners: Set<TabChangeListener> = new Set();
  
  /**
   * Current editor mode
   */
  private currentMode: string = 'create';
  
  /**
   * Current editor state for filtering tabs
   */
  private editorState: any = null;
  
  /**
   * Create a new tabs registry with optional initial tabs
   */
  constructor(initialTabs: EditorTab[] = []) {
    initialTabs.forEach(tab => this.register(tab));
  }
  
  /**
   * Register a tab with the registry
   */
  register(tab: EditorTab): void {
    this.tabs.set(tab.id, tab);
    this.notifyListeners();
  }
  
  /**
   * Unregister a tab from the registry
   */
  unregister(tabId: string): void {
    this.tabs.delete(tabId);
    this.notifyListeners();
  }
  
  /**
   * Set the current editor mode
   */
  setMode(mode: string): void {
    this.currentMode = mode;
    this.notifyListeners();
  }
  
  /**
   * Get the current editor mode
   */
  getMode(): string {
    return this.currentMode;
  }
  
  /**
   * Set the current editor state for filtering tabs
   */
  setEditorState(state: any): void {
    const previousState = this.editorState;
    this.editorState = state;
    
    // In project mode, if we just got phases data and don't have an active tab set,
    // automatically set the first phase tab as active
    if (this.currentMode === 'project' && state && state.entities?.phases) {
      const phaseIds = Object.keys(state.entities.phases);
      const hasPhases = phaseIds.length > 0;
      const currentActiveTab = state.ui?.activeTab;
      
      // If we have phases but no active tab, or the active tab is phase-templates,
      // set the first phase tab as active - handled by PovEditor
    }
    
    this.notifyListeners();
  }
  
  /**
   * Get all registered tabs filtered by current mode, sorted by order
   */
  getAll(): EditorTab[] {
    let allTabs = Array.from(this.tabs.values());

    // Get mode configuration
    const config = getModeConfig(this.currentMode);
    if (!config) {
      return [];
    }

    // Add dynamic tabs if enabled for this mode
    if (config.dynamicTabs && shouldGenerateDynamicTabs(this.currentMode) && this.editorState) {
      const dynamicTabs = generatePhaseTabsForProject(this.editorState);
      allTabs = [...allTabs, ...dynamicTabs];
    }

    // Filter by allowed tabs (but allow dynamic tabs to pass through)
    const allowedTabs = allTabs.filter(tab => {
      // Explicitly exclude phase-templates tab in project mode FIRST
      if (this.currentMode === 'project' && tab.id === 'phase-templates') {
        return false;
      }

      // Dynamic tabs (phase tabs) should always be allowed if dynamic tabs are enabled
      if (config.dynamicTabs && tab.id.startsWith('phase-')) {
        return true;
      }

      return config.allowedTabs.includes(tab.id);
    });

    // Apply conditional logic
    const visibleTabs = allowedTabs.filter(tab => {
      const conditionalCheck = config.conditionalTabs[tab.id];
      if (conditionalCheck) {
        return conditionalCheck(this.editorState);
      }
      return true;
    });

    // Apply custom ordering if specified
    return visibleTabs.sort((a, b) => {
      const orderA = config.tabOrder?.[a.id] ?? a.order ?? 999;
      const orderB = config.tabOrder?.[b.id] ?? b.order ?? 999;
      return orderA - orderB;
    });
  }
  
  /**
   * Get a tab by its ID
   */
  getById(id: string): EditorTab | undefined {
    return this.tabs.get(id);
  }
  
  /**
   * Subscribe to tab changes
   * @returns A function to unsubscribe
   */
  subscribe(listener: TabChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  /**
   * Notify all listeners of tab changes
   */
  private notifyListeners(): void {
    const tabs = this.getAll();
    this.listeners.forEach(listener => listener(tabs));
  }
}

/**
 * Type for tab change listeners
 */
type TabChangeListener = (tabs: EditorTab[]) => void;

/**
 * Create and export a singleton instance of the tabs registry
 */
export const tabsRegistry = new TabsRegistry(defaultTabs);

/**
 * Export the TabsRegistry class for testing or creating additional registries
 */
export { TabsRegistry };
