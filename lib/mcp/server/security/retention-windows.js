/**
 * RETENTION_DAYS — SINGLE SOURCE OF TRUTH for every age-based cleanup window.
 *
 * Created 2026-07-08 (Finding B, end-of-session sweep): each window used to be a magic number
 * duplicated across FOUR places — the method default, the scheduled-sweep call-site arg, the
 * JSDoc, and the test's mirror class — kept in sync by hand. It drifted twice before this file
 * existed (cleanupOldExecutions doc said 90 while code said 30; cleanupOldArtifacts the inverse
 * — both fixed d78597fe). Now: methods default from this map, the sweep calls argless, JSDocs
 * reference the key, and scripts/test-compliance-monitor.ts pins each value as the
 * intentional-change ritual.
 *
 * Consumers:
 *   - lib/mcp/server/security/compliance-monitor.js (all cleanup defaults + scheduled sweep)
 *   - lib/services/mcp/resourceManager.ts cleanupArtifactsByAge (MUST equal agentArtifact —
 *     the two artifact-age pruners were manually aligned 2026-07-06; this map makes the
 *     alignment structural)
 *
 * Policy notes live where the policy was made:
 *   - taskActivity 90d: task #86 (2026-04-16) — revisit at compliance review, likely 7+ years
 *     for auth forensics.
 *   - agentArtifact 90d: aligned with resourceManager.cleanupArtifactsByAge (Flip 2 2026-07-06).
 *
 * This file is deliberately dependency-free CJS — it loads in the bare-node MCP server AND in
 * webpack-compiled TS (allowJs) without side effects.
 */
const RETENTION_DAYS = Object.freeze({
  activity: 180,            // Activity audit rows
  taskActivity: 90,         // TaskActivity (task #86 policy — see header)
  notificationRead: 7,      // read notifications
  notificationUnread: 90,   // unread notifications (inactive-user accumulation guard)
  mcpInteraction: 30,       // MCPInteraction
  workflowExecution: 30,    // MCPWorkflowExecution (COMPLETED/FAILED only)
  agentArtifact: 90,        // AgentArtifact — MUST equal resourceManager.cleanupArtifactsByAge
  mcpRecommendation: 90,    // MCPRecommendation (terminal)
  crmSyncHistory: 90,       // CRMSyncHistory
  staleExecutionDays: 7,    // stuck RUNNING workflow executions → FAILED after this many days
});

module.exports = { RETENTION_DAYS };
