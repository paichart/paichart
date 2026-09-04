/**
 * Agent Template Tabs - Export Module
 *
 * Exports agent-specific tabs for the TemplateEditor.
 * Dead tabs removed in Phase 4: SecurityTab, WorkflowIntegrationTab, TestingTab.
 */

// Export agent-specific tab components
export { MCPToolsTab } from './MCPToolsTab';
export { TokenManagementTab } from './TokenManagementTab';

// Export tab definitions for registration
export {
  AgentTabDefinitions,
  MCPToolsTabDef,
  TokenManagementTabDef,
} from './AgentTabDefinitions';

// Export any shared types or utilities for agent tabs
export type { AgentTabProps } from './types';
