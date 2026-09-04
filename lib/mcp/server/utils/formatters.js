/**
 * Response Formatters for MCP Server
 * Standardized formatting for tool responses
 */

const { stderr, createAdapter } = require('../mcp-logger');
// Analytics pilot Phase 3 sec-ops HIGH-1 (2026-05-22): formatRecommendations
// echoed rec.title + rec.description from MCPRecommendation DB rows that
// embed user-controlled pov.title + kpi.name. BC71 sweep continuation —
// this formatter was outside Phase 2.10's site list.
const { sanitizeForResponse } = require('../tools/response-sanitizer');

class ResponseFormatter {
  constructor() {
    this.logger = this.createLogger();
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'formatters' }));
  }

  /**
   * Create a successful tool response
   */
  createSuccessResponse(text, metadata = null) {
    const response = {
      content: [
        {
          type: 'text',
          text: text
        }
      ]
    };

    // Add simple metadata if provided (Jan Marshal approved - basic info only)
    if (metadata) {
      response.metadata = metadata;
    }

    return response;
  }

  /**
   * Create response with simple metadata (Jan Marshal's simple approach)
   */
  createResponseWithMetadata(text, toolName, data) {
    const metadata = {
      toolName,
      timestamp: Date.now(),
      dataType: Array.isArray(data) ? 'array' : typeof data,
      count: Array.isArray(data) ? data.length : 1
    };

    return this.createSuccessResponse(text, metadata);
  }

  /**
   * Simple follow-up suggestions (Jan Marshal approved - no complex analysis)
   */
  getSimpleFollowUpSuggestions(toolName, data) {
    const suggestions = [];
    
    switch (toolName) {
      case 'project':
        if (Array.isArray(data) && data.length > 0) {
          suggestions.push("Use project(action: 'pov.details') to analyze specific POVs");
          suggestions.push("Use analytics(action: 'team.performance') to see team metrics");
          suggestions.push("Use project(action: 'task.context') for detailed task analysis");
        }
        break;
      case 'analytics':
        suggestions.push("Use analytics(action: 'recommendations.get') for improvement suggestions");
        suggestions.push('Use perform to implement recommendations');
        break;
      case 'perform':
        suggestions.push("Use project(action: 'pov.list') to see updated data");
        break;
    }
    
    return suggestions;
  }

  /**
   * Create an error tool response
   */
  createErrorResponse(error, toolName) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.debug(`Error in tool ${toolName}:`, errorMessage);
    
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${toolName}: ${errorMessage}`
        }
      ],
      isError: true
    };
  }

  /**
   * Format POV list
   * @param {Array} povs - POV data array
   * @param {Object} metadata - Pagination and access metadata
   * @param {boolean} includeAccessReason - Show access badges and permissions
   */
  formatPOVList(povs, metadata = null, includeAccessReason = false) {
    if (!povs || povs.length === 0) {
      return 'No POVs found.';
    }

    // MCP Exposure Fix: Add completeness header if metadata available
    let output = '';
    if (metadata?.pagination) {
      const pagination = metadata.pagination;
      output = `Found ${pagination.returned} of ${pagination.total} total POVs`;

      // Add access summary if available
      if (includeAccessReason && metadata?.accessSummary) {
        const summary = metadata.accessSummary;
        output += '\n\n**Your Access**:';
        if (summary.owner > 0) output += `\n• ${summary.owner} as Owner`;
        if (summary.admin > 0) output += `\n• ${summary.admin} as Admin`;
        if (summary.team > 0) output += `\n• ${summary.team} as Team Member`;
      }

      if (pagination.totalPages > 1) {
        output += ` (page ${pagination.currentPage} of ${pagination.totalPages})`;
      }

      if (pagination.hasMore) {
        output += `\n📄 More results available - increase limit (max 200) or add filters to narrow`;
      } else if (!includeAccessReason) {
        output += ` (complete results)`;
      }

      output += '\n\n';
    }

    output += povs.map(pov => {
      // Add access badge if includeAccessReason
      let accessBadge = '';
      if (includeAccessReason && pov._access) {
        const { accessReason, teamRole } = pov._access;
        accessBadge = accessReason === 'owner' ? ' [OWNER]'
                    : accessReason === 'admin' ? ' [ADMIN]'
                    : teamRole ? ` [TEAM-${teamRole}]` : ' [TEAM]';
      }

      // 2026-07-25 (smoke test finding): the list query does NOT fetch phases, so
      // `pov.phases?.length || 0` printed "Phases: 0" for every POV — including ones with 4.
      // A false zero is worse than silence: it is a fact-shaped claim that is simply wrong, and
      // pov.details right next to it says otherwise. Distinguish NOT-FETCHED (undefined → omit
      // the line) from GENUINELY-EMPTY (array → print the real count). If a future list query
      // includes phases, the line reappears automatically with a correct number.
      const phaseCountLine = Array.isArray(pov.phases) ? `\n  Phases: ${pov.phases.length}` : '';
      let formatted = `• ${pov.title}${accessBadge} (ID: ${pov.id})\n  Status: ${pov.status}\n  Owner: ${pov.owner?.name || 'Unassigned'}${phaseCountLine}\n  Created: ${new Date(pov.createdAt).toLocaleDateString()}`;

      // Add permissions if includeAccessReason
      if (includeAccessReason && pov._access?.permissions) {
        formatted += `\n  Permissions: ${pov._access.permissions.join(', ')}`;
      }

      // Add forecast date if available
      if (pov.forecastDate) {
        formatted += `\n  Forecast Date: ${new Date(pov.forecastDate).toLocaleDateString()}`;
      }

      // Add revenue if available
      if (pov.revenue) {
        formatted += `\n  Revenue: $${Number(pov.revenue).toLocaleString()}`;
      }

      return formatted;
    }).join('\n\n');

    return output;
  }

  /**
   * Format POV details
   */
  formatPOVDetails(pov, context) {
    let details = `Name: ${pov.title}
ID: ${pov.id}
Status: ${pov.status}
Priority: ${pov.priority || 'Not specified'}
Description: ${pov.description || 'No description'}
Objective: ${pov.objective || 'No objective defined'}
Owner: ${pov.owner?.name || 'Unassigned'} (${pov.owner?.email || ''}) [ID: ${pov.owner?.id || 'N/A'}]
Customer: ${pov.customerName || 'Not specified'}
Created: ${new Date(pov.createdAt).toLocaleDateString()}
Start Date: ${new Date(pov.startDate).toLocaleDateString()}
End Date: ${new Date(pov.endDate).toLocaleDateString()}`;

    // Add forecast date if available
    if (pov.forecastDate) {
      details += `\nForecast Date: ${new Date(pov.forecastDate).toLocaleDateString()}`;
    }

    // Add financial information if available
    if (pov.revenue) {
      details += `\nRevenue: $${Number(pov.revenue).toLocaleString()}`;
    }
    
    if (pov.estimatedBudget) {
      details += `\nEstimated Budget: $${Number(pov.estimatedBudget).toLocaleString()}`;
    }

    // Add opportunity information if available
    if (pov.opportunityName) {
      details += `\nOpportunity: ${pov.opportunityName}`;
    }

    // Add geographical information
    if (pov.country) {
      details += `\nCountry: ${pov.country.name}`;
    }
    
    if (pov.region) {
      details += `\nRegion: ${pov.region.name}`;
    }

    // Add team information
    if (pov.team) {
      details += `\n\nTeam: ${pov.team.name}`;
      
      if (pov.team.members && pov.team.members.length > 0) {
        details += `\nTeam Members (${pov.team.members.length}):`;
        pov.team.members.forEach(member => {
          const user = member.user || member;
          const role = member.role || 'MEMBER';
          details += `\n• ${user.name} (${user.email}) - ${role} [ID: ${user.id}]`;
        });
      } else {
        details += `\nTeam Members: No members assigned`;
      }
    } else {
      details += `\n\nTeam: No team assigned`;
    }

    if (pov.phases && pov.phases.length > 0) {
      details += `\n\nPhases (${pov.phases.length}):`;
      pov.phases.forEach(phase => {
        details += `\n• ${phase.name} (${phase.type}) - ID: ${phase.id}`;
        
        // Add stages within each phase
        if (phase.stages && phase.stages.length > 0) {
          details += `\n  Stages (${phase.stages.length}):`;
          phase.stages.forEach(stage => {
            const taskCount = stage.tasks ? stage.tasks.length : 0;
            details += `\n    - ${stage.name} (${taskCount} tasks) - ID: ${stage.id}`;
          });
        } else {
          details += `\n  Stages: No stages created`;
        }
      });
    }

    if (context && context.pov && context.pov.analytics) {
      const analytics = context.pov.analytics;
      details += `\n\nAnalytics:
• Total Tasks: ${analytics.totalTasks}
• Completed: ${analytics.completedTasks}
• Completion Rate: ${analytics.completionRate.toFixed(1)}%
• Overdue Tasks: ${analytics.overdueTasks}`;
    }

    return details;
  }

  /**
   * Format task list - organized by stage and order for better navigation
   * MCP Exposure Fix: Now accepts metadata parameter to show completeness info
   */
  formatTaskList(tasks, context = {}, metadata = null) {
    if (!tasks || tasks.length === 0) {
      // GS9 implementation rule: content.text must mirror _meta.nextSteps for
      // empty/error states. Without this, MCP clients that don't surface _meta
      // see a dead-end message and the AI client can't recover on the same turn.
      let text = 'No tasks found.';

      // Prefer the handler's structured nextSteps if available (GS4 state-aware)
      if (metadata?.nextSteps && Array.isArray(metadata.nextSteps) && metadata.nextSteps.length > 0) {
        text += '\n\n💡 Suggestions:\n' + metadata.nextSteps.map(s => `  • ${s}`).join('\n');
      } else if (context.povId) {
        // Fallback hints when metadata.nextSteps not provided
        text += '\n\n💡 Suggestions:\n' +
          `  • Verify the POV exists: project(action: "pov.details", povId: "${context.povId}")\n` +
          `  • Try without status filter: project(action: "task.list", povId: "${context.povId}")\n` +
          `  • Create a task: perform(action: "task.create", povId: "${context.povId}", title: "...")`;
      } else {
        text += '\n\n💡 Suggestions:\n' +
          '  • List POVs to find one with tasks: project(action: "pov.list")\n' +
          '  • Or broaden filters and try again';
      }

      return text;
    }

    // Debug: Check if tasks have phase/stage data
    this.logger.debug('First task phase:', tasks[0]?.phase);
    this.logger.debug('First task stage:', tasks[0]?.stage);
    this.logger.debug('Context:', context);

    // MCP Exposure Fix: Add completeness header if metadata available
    let output = '';
    if (metadata?.pagination) {
      const pagination = metadata.pagination;
      output = `Found ${pagination.returned} of ${pagination.total} total tasks`;

      if (pagination.totalPages > 1) {
        output += ` (page ${pagination.currentPage} of ${pagination.totalPages})`;
      }

      if (pagination.hasMore) {
        output += `\n📄 More results available - increase limit (max 200) or add filters to narrow`;
      } else {
        output += ` (complete results)`;
      }

      output += '\n\n';
    }

    // When there's a POV context, ALWAYS use hierarchical phase/stage view
    // This matches the original behavior users expect
    let tasksFormatted = '';
    if (context.povId) {
      tasksFormatted = this.formatTasksByStage(tasks, context);
    } else {
      // For non-POV queries (general task lists), use simple list format
      tasksFormatted = tasks.map(task => {
        // Wave B BC71 fix (2026-05-23): sanitize user-controlled echoes —
        // title/description/assignee.name flow from user input to LLM response.
        let taskInfo = `• ${sanitizeForResponse(task.title)} (ID: ${task.id})\n`;
        if (task.description) {
          taskInfo += `  Description: ${sanitizeForResponse(task.description)}\n`;
        }
        taskInfo += `  Status: ${task.status}\n`;
        taskInfo += `  Priority: ${task.priority}\n`;
        taskInfo += `  Assignee: ${task.assignee?.name ? sanitizeForResponse(task.assignee.name) : 'Unassigned'}\n`;
        taskInfo += `  Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}`;
        // Display comment and activity counts
        if (task.comments?.length > 0) {
          taskInfo += `\n  💬 Comments: ${task.comments.length}`;
        }
        if (task.activities?.length > 0) {
          taskInfo += `\n  🔔 Activity: ${task.activities.length} recent actions`;
        }
        return taskInfo;
      }).join('\n\n');
    }

    output += tasksFormatted;

    // MCP Exposure Fix: Add performance footer if available
    if (metadata?.performance && metadata.performance.queryTimeMs) {
      output += `\n\n⚡ Query completed in ${metadata.performance.queryTimeMs}ms`;
      if (metadata.performance.optimized) {
        output += ' (optimized';
        if (metadata.performance.queriesUsed) {
          output += `, ${metadata.performance.queriesUsed} queries`;
        }
        output += ')';
      }
    }

    return output;
  }

  /**
   * Format tasks organized by stage and order - shows the workflow structure
   */
  formatTasksByStage(tasks, context) {
    // Group tasks by phase and stage
    const tasksByPhaseAndStage = {};
    
    tasks.forEach(task => {
      const phaseName = task.phase?.name || 'No Phase';
      const stageName = task.stage?.name || 'No Stage';
      
      if (!tasksByPhaseAndStage[phaseName]) {
        tasksByPhaseAndStage[phaseName] = {};
      }
      
      if (!tasksByPhaseAndStage[phaseName][stageName]) {
        tasksByPhaseAndStage[phaseName][stageName] = [];
      }
      
      tasksByPhaseAndStage[phaseName][stageName].push(task);
    });
    
    // Sort tasks within each stage by order
    Object.keys(tasksByPhaseAndStage).forEach(phaseName => {
      Object.keys(tasksByPhaseAndStage[phaseName]).forEach(stageName => {
        tasksByPhaseAndStage[phaseName][stageName].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    });
    
    let formatted = `TASKS ORGANIZED BY STAGE (WORKFLOW VIEW):\n\n`;
    
    // Format each phase and its stages
    Object.entries(tasksByPhaseAndStage).forEach(([phaseName, stages]) => {
      // Wave B BC71 fix: phase/stage names come from user-controlled DB rows.
      formatted += `📋 PHASE: ${sanitizeForResponse(phaseName).toUpperCase()}\n`;

      Object.entries(stages).forEach(([stageName, stageTasks]) => {
        formatted += `\n  🎯 Stage: ${sanitizeForResponse(stageName)} (${stageTasks.length} tasks)\n`;

        if (stageTasks.length === 0) {
          formatted += `    No tasks in this stage\n`;
        } else {
          stageTasks.forEach((task, index) => {
            const orderDisplay = task.order ? `[${task.order}]` : `[${index + 1}]`;
            formatted += `    ${orderDisplay} ${sanitizeForResponse(task.title)}\n`;
            if (task.description) {
              formatted += `        Description: ${sanitizeForResponse(task.description)}\n`;
            }
            formatted += `        Status: ${task.status} | Priority: ${task.priority}\n`;
            formatted += `        Assignee: ${task.assignee?.name ? sanitizeForResponse(task.assignee.name) : 'Unassigned'}\n`;
            if (task.dueDate) {
              formatted += `        Due: ${new Date(task.dueDate).toLocaleDateString()}\n`;
            }
            formatted += `        ID: ${task.id}\n`;
          });
        }
      });
      formatted += '\n';
    });
    
    // Add summary
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : '0';
    
    formatted += `WORKFLOW SUMMARY:\n`;
    formatted += `• Total Tasks: ${totalTasks}\n`;
    formatted += `• Completed: ${completedTasks}\n`;
    formatted += `• Completion Rate: ${completionRate}%\n`;
    formatted += `• Phases: ${Object.keys(tasksByPhaseAndStage).length}\n`;
    
    const totalStages = Object.values(tasksByPhaseAndStage).reduce((sum, stages) => sum + Object.keys(stages).length, 0);
    formatted += `• Stages: ${totalStages}\n`;
    
    // Add helpful navigation suggestions
    if (context.povId) {
      formatted += `\nNAVIGATION SUGGESTIONS:\n`;
      formatted += `• To see tasks by status: "list tasks with status [OPEN|IN_PROGRESS|COMPLETED|BLOCKED]"\n`;
      formatted += `• To get detailed task context: "get task context for POV ${context.povId}"\n`;
      formatted += `• To see POV structure: "get pov details for ${context.povId}"\n`;
    }
    
    return formatted;
  }

  /**
   * Format tasks organized by status (Kanban-style) - matches the UI organization
   */
  formatTasksByStatus(tasks, context) {
    // Group tasks by status (kanban-style grouping, matching the GUI phase-kanban view)
    const tasksByStatus = {
      OPEN: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      BLOCKED: []
    };
    
    tasks.forEach(task => {
      if (tasksByStatus[task.status]) {
        tasksByStatus[task.status].push(task);
      }
    });
    
    // Sort tasks within each status by order (matching the GUI phase-kanban view)
    Object.keys(tasksByStatus).forEach(status => {
      tasksByStatus[status].sort((a, b) => (a.order || 0) - (b.order || 0));
    });
    
    let formatted = `TASKS ORGANIZED BY STATUS (KANBAN VIEW):\n\n`;
    
    // Status column definitions (matching the GUI phase-kanban view)
    const statusColumns = [
      { id: 'OPEN', title: 'Open', icon: '⏰' },
      { id: 'IN_PROGRESS', title: 'In Progress', icon: '🔄' },
      { id: 'COMPLETED', title: 'Completed', icon: '✅' },
      { id: 'BLOCKED', title: 'Blocked', icon: '🚫' }
    ];
    
    // Format each status column
    statusColumns.forEach(column => {
      const columnTasks = tasksByStatus[column.id];
      formatted += `${column.icon} ${column.title.toUpperCase()} (${columnTasks.length} tasks)\n`;
      
      if (columnTasks.length === 0) {
        formatted += `  No ${column.title.toLowerCase()} tasks\n\n`;
      } else {
        // Smart display limit (modern PM tool approach)
        const DISPLAY_LIMIT = 50;
        const displayTasks = columnTasks.slice(0, DISPLAY_LIMIT);
        
        displayTasks.forEach((task, index) => {
          // Wave B BC71 fix: sanitize user-controlled task/phase fields.
          formatted += `  ${index + 1}. ${sanitizeForResponse(task.title)}\n`;
          if (task.description) {
            formatted += `     Description: ${sanitizeForResponse(task.description)}\n`;
          }
          formatted += `     Priority: ${task.priority} | Assignee: ${task.assignee?.name ? sanitizeForResponse(task.assignee.name) : 'Unassigned'}\n`;
          if (task.dueDate) {
            formatted += `     Due: ${new Date(task.dueDate).toLocaleDateString()}\n`;
          }
          if (task.phase) {
            formatted += `     Phase: ${sanitizeForResponse(task.phase.name)}\n`;
          }
          formatted += `     ID: ${task.id}\n`;
        });
        
        // Show pagination info and filtering suggestions for large lists
        if (columnTasks.length > DISPLAY_LIMIT) {
          const remaining = columnTasks.length - DISPLAY_LIMIT;
          formatted += `  ... and ${remaining} more ${column.title.toLowerCase()} tasks\n`;
          formatted += `  💡 TIP: Use filters to narrow results:\n`;
          formatted += `     • Filter by phase: "list tasks for phase [phase-name]"\n`;
          formatted += `     • Filter by assignee: "list tasks assigned to [user-name]"\n`;
          formatted += `     • Filter by priority: "list tasks with priority HIGH"\n`;
        }
        formatted += '\n';
      }
    });
    
    // Add summary
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? ((tasksByStatus.COMPLETED.length / totalTasks) * 100).toFixed(1) : '0';
    
    formatted += `SUMMARY:\n`;
    formatted += `• Total Tasks: ${totalTasks}\n`;
    formatted += `• Completion Rate: ${completionRate}%\n`;
    formatted += `• In Progress: ${tasksByStatus.IN_PROGRESS.length}\n`;
    formatted += `• Blocked: ${tasksByStatus.BLOCKED.length}\n`;
    
    // Add helpful suggestions for navigation
    if (context.povId) {
      formatted += `\nNAVIGATION SUGGESTIONS:\n`;
      formatted += `• To see tasks by status: "list tasks with status [OPEN|IN_PROGRESS|COMPLETED|BLOCKED]"\n`;
      formatted += `• To see tasks for a specific phase: "list tasks for phase [phase-id]"\n`;
      formatted += `• To get detailed task context: "get task context for POV ${context.povId}"\n`;
      
      // Suggest specific phase IDs if available
      const phaseIds = [...new Set(tasks.filter(t => t.phase).map(t => t.phase.id))];
      if (phaseIds.length > 0) {
        formatted += `• Available phase IDs: ${phaseIds.slice(0, 3).join(', ')}${phaseIds.length > 3 ? '...' : ''}\n`;
      }
    }
    
    return formatted;
  }

  /**
   * Format task context
   */
  formatTaskContext(context) {
    let formatted = `Context Analysis (Request ID: ${context.requestId})\n`;
    formatted += `Timestamp: ${context.timestamp}\n`;
    formatted += `Context Depth: ${context.contextDepth}\n\n`;

    if (context.task) {
      const task = context.task;
      formatted += `TASK DETAILS:\n`;
      formatted += `• Task ID: ${task.core.id}\n`;
      formatted += `• Title: ${task.core.title}\n`;
      if (task.core.description) {
        formatted += `• Description: ${task.core.description}\n`;
      }
      formatted += `• Status: ${task.core.status}\n`;
      formatted += `• Priority: ${task.core.priority}\n`;
      formatted += `• Type: ${task.core.type}\n`;
      formatted += `• Assignee: ${task.context.assignee?.name || 'Unassigned'}\n`;
      formatted += `• POV: ${task.context.pov?.title || 'No POV'}\n`;
      formatted += `• Phase: ${task.context.phase?.name || 'No Phase'}\n`;
      if (task.context.stage?.name) {
        formatted += `• Stage: ${task.context.stage.name} (ID: ${task.context.stage.id})\n`;
      }

      // Surface completion outcome (task.complete summary + confidence) in a
      // readable section — these live in metadata but are easy to miss in the
      // raw "Other keys" dump below. completionSummary is user-controlled text:
      // sanitizeForResponse it (L4 output defense). confidenceScore is a clamped
      // Number (handler) → rendered directly. Label matches the pipeline harness
      // renderer (render-pipeline-context.ts) for cross-surface consistency.
      if (task.core.metadata && typeof task.core.metadata === 'object') {
        const cmeta = task.core.metadata;
        if (cmeta.completionSummary || cmeta.confidenceScore != null) {
          formatted += `\nCOMPLETION:\n`;
          if (cmeta.completionSummary) {
            formatted += `• Summary: ${sanitizeForResponse(cmeta.completionSummary)}\n`;
          }
          if (cmeta.confidenceScore != null) {
            formatted += `• Confidence Score: ${cmeta.confidenceScore}/100\n`;
          }
        }
      }

      // Surface metadata so agents can read orchestration state they
      // wrote earlier (e.g., Pipeline Harness mode detection reads
      // metadata.pipelineStageId). Shows Pipeline Stage ID prominently if
      // set; renders full metadata as JSON for other keys.
      if (task.core.metadata && typeof task.core.metadata === 'object') {
        const meta = task.core.metadata;
        const keys = Object.keys(meta);
        if (keys.length > 0) {
          formatted += `\nTASK METADATA:\n`;
          if (typeof meta.pipelineStageId === 'string') {
            formatted += `• Pipeline Stage ID: ${meta.pipelineStageId}\n`;
          }
          // Render remaining keys as compact JSON (skip huge model params)
          const compactKeys = keys.filter(k =>
            k !== 'pipelineStageId' && k !== 'modelParameters' &&
            k !== 'completionSummary' && k !== 'confidenceScore');
          if (compactKeys.length > 0) {
            const compact = {};
            for (const k of compactKeys) compact[k] = meta[k];
            try {
              formatted += `• Other keys: ${JSON.stringify(compact)}\n`;
            } catch {
              formatted += `• Other keys: [unserializable]\n`;
            }
          }
          if (meta.modelParameters) {
            formatted += `• Model Parameters: present (not rendered — use agent.configure to inspect)\n`;
          }
        }
      }

      if (task.relationships) {
        formatted += `\nRELATIONSHIPS:\n`;
        formatted += `• Dependencies: ${task.relationships.dependencies?.length || 0}\n`;
        formatted += `• Dependents: ${task.relationships.dependents?.length || 0}\n`;
        formatted += `• Blocked by: ${task.relationships.blockedBy?.length || 0}\n`;
        formatted += `• Blocking: ${task.relationships.blocking?.length || 0}\n`;
      }

      // Display comments
      if (task.comments && task.comments.length > 0) {
        formatted += `\nCOMMENTS (${task.comments.length}):\n`;
        task.comments.slice(0, 5).forEach((comment, index) => {
          const commentDate = new Date(comment.createdAt).toLocaleString();
          formatted += `${index + 1}. [${commentDate}] ${comment.user?.name || 'Unknown'}:\n`;
          formatted += `   ${comment.text}\n`;
        });
        if (task.comments.length > 5) {
          formatted += `... and ${task.comments.length - 5} more comments\n`;
        }
      }

      // Display recent activities
      if (task.activities && task.activities.length > 0) {
        formatted += `\nRECENT ACTIVITY:\n`;
        task.activities.forEach((activity, index) => {
          const activityDate = new Date(activity.timestamp).toLocaleString();
          formatted += `${index + 1}. [${activityDate}] ${activity.user?.name || 'System'}\n`;
          formatted += `   ${activity.action}\n`;
        });
      }

      if (task.agent) {
        formatted += `\nAGENT CONFIGURATION:\n`;
        formatted += `• Role: ${task.agent.role || 'Not configured'}\n`;
        formatted += `• Execution Status: ${task.agent.executionStatus || 'Not executed'}\n`;
        
        // Enhanced agent configuration display
        if (task.agent.template) {
          formatted += `• Template: ${task.agent.template.name} (ID: ${task.agent.template.id})\n`;
        } else if (task.agent.templateId) {
          formatted += `• Template ID: ${task.agent.templateId}\n`;
        } else {
          formatted += `• Template: Not assigned\n`;
        }
        
        // Show validation and metrics
        if (task.agent.validation) {
          const validation = task.agent.validation;
          formatted += `• Configuration Score: ${validation.configurationScore}/100`;
          
          if (validation.isConfigured) {
            formatted += ` ✓\n`;
          } else {
            formatted += ` ⚠\n`;
          }
          
          // Show metrics if available
          if (task.agent.metrics) {
            const metrics = task.agent.metrics;
            if (metrics.agentPromptWords > 0) {
              formatted += `• Agent Prompt: ${metrics.agentPromptWords} words\n`;
            }
            if (metrics.systemPromptWords > 0) {
              formatted += `• System Prompt: ${metrics.systemPromptWords} words ✓\n`;
            }
          }
          
          // Show validation status
          const statusItems = [];
          if (validation.hasTemplate) statusItems.push('Template ✓');
          if (validation.hasAgentPrompt) statusItems.push('Agent Prompt ✓');
          if (validation.hasSystemPrompt) statusItems.push('System Prompt ✓');
          
          if (statusItems.length > 0) {
            formatted += `• Status: ${statusItems.join(', ')}\n`;
          }
          
          // Show issues if any
          if (validation.issues && validation.issues.length > 0) {
            formatted += `• Issues: ${validation.issues.join(', ')}\n`;
          }
          
          // Show suggestions if any
          if (validation.suggestions && validation.suggestions.length > 0) {
            formatted += `\nSUGGESTIONS:\n`;
            validation.suggestions.forEach((suggestion, index) => {
              formatted += `${index + 1}. ${suggestion.description}\n`;
              formatted += `   Action: ${suggestion.action} with ${suggestion.parameter}\n`;
            });
          }
        } else {
          // Fallback for old format
          formatted += `• MCP Tool ID: ${task.agent.mcpToolId || 'None'}\n`;
        }
      }

      if (task.analytics) {
        formatted += `\nANALYTICS:\n`;
        formatted += `• Performance Score: ${task.analytics.performanceScore || 'N/A'}\n`;
        formatted += `• Completion Trend: ${task.analytics.completionTrend || 'N/A'}\n`;
      }
    }

    if (context.pov) {
      const pov = context.pov;
      formatted += `\nPOV OVERVIEW:\n`;
      formatted += `• Title: ${pov.core.title}\n`;
      formatted += `• Status: ${pov.core.status}\n`;
      // Same false-zero shape as formatPOVList (2026-07-25): only claim a count we actually have.
      if (Array.isArray(pov.structure.phases)) {
        formatted += `• Phases: ${pov.structure.phases.length}\n`;
      }
      
      if (pov.analytics) {
        formatted += `• Total Tasks: ${pov.analytics.totalTasks}\n`;
        formatted += `• Completion Rate: ${pov.analytics.completionRate.toFixed(1)}%\n`;
      }
    }

    if (context.recommendations && context.recommendations.length > 0) {
      formatted += `\nAI RECOMMENDATIONS:\n`;
      context.recommendations.forEach((rec, index) => {
        // BUG-ANALYTICS-001 fix (2026-05-22): use shared _formatConfidencePercent
        // helper (defined below) to defend against mixed decimal/integer sources.
        formatted += `${index + 1}. ${rec.title} (${this._formatConfidencePercent(rec.confidence)} confidence)\n`;
        formatted += `   Impact: ${rec.impact} | Type: ${rec.type}\n`;
      });
    }

    return formatted;
  }

  /**
   * Enhanced formatActionResult method for agent.results
   * Presents artifacts as downloadable/copyable content
   */
  formatActionResult(result) {
    let formatted = `Action: ${result.action}\n`;
    formatted += `Status: ${result.status}\n`;
    formatted += `Action ID: ${result.actionId}\n`;
    formatted += `Timestamp: ${result.timestamp}\n\n`;

    if (result.result) {
      formatted += `RESULT:\n`;
      if (result.result.message) {
        formatted += `• ${result.result.message}\n`;
      }
      if (result.result.note) {
        formatted += `⚠️ Note: ${result.result.note}\n`;
      }

      // analytics.generate: render the computed metrics (was previously only the message,
      // so the actual numbers were never shown). format:'raw' also dumps the data block.
      if (result.action === 'analytics.generate') {
        const r = result.result;
        if (Array.isArray(r.summary) && r.summary.length > 0) {
          formatted += `\n📊 ${String(r.analyticsType || 'analytics').toUpperCase()}:\n`;
          for (const line of r.summary) formatted += `• ${line}\n`;
        }
        if (r.format === 'raw' && r.data) {
          formatted += `\nRAW:\n${JSON.stringify(r.data, null, 2)}\n`;
        }
      }

      // Handle agent.status action with execution details and summary
      if (result.action === 'agent.status' && result.result.executions) {
        const executions = result.result.executions;

        if (executions.length === 0) {
          // Message already rendered above from result.result.message — no duplicate needed
        } else {
          formatted += `\n📋 EXECUTIONS:\n\n`;

          executions.forEach((exec, index) => {
            formatted += `${index + 1}. Execution ${exec.id}\n`;
            formatted += `   • Status: ${exec.status}\n`;
            if (exec.startTime) {
              formatted += `   • Started: ${exec.startTime}\n`;
            }
            if (exec.endTime) {
              formatted += `   • Ended: ${exec.endTime}\n`;
            }
            if (exec.duration) {
              formatted += `   • Duration: ${exec.duration}s\n`;
            }
            if (exec.task) {
              // Wave B BC71 fix: sanitize execution-related user fields.
              formatted += `   • Task: ${exec.task.title ? sanitizeForResponse(exec.task.title) : exec.task.id}\n`;
            }
            if (exec.agentTemplate) {
              formatted += `   • Template: ${sanitizeForResponse(exec.agentTemplate.name)}\n`;
            }
            // 2026-07-25: the `progress` and `error` branches that stood here were
            // permanently dead — both read columns that never existed on agent_executions,
            // so `progress` was always the falsy 0 and `error` always undefined. Replaced
            // by the branchable failure code the handler now projects from a real column.
            if (exec.errorCode) {
              formatted += `   • Failure code: ${sanitizeForResponse(String(exec.errorCode))}\n`;
            }
          });
        }

        if (result.result.summary) {
          const s = result.result.summary;
          formatted += `\n📊 SUMMARY:\n`;
          formatted += `• Total: ${s.total}\n`;
          formatted += `• Running: ${s.running || 0}\n`;
          formatted += `• Completed: ${s.completed || 0}\n`;
          formatted += `• Failed: ${s.failed || 0}\n`;
        }

        if (result.result.workflow) {
          formatted += `\n🔄 WORKFLOW:\n`;
          formatted += `• Current: ${result.result.workflow.current}\n`;
          if (result.result.workflow.recommendation) {
            formatted += `• Recommendation: ${result.result.workflow.recommendation}\n`;
          }
        }

        if (result.result.nextSteps && result.result.nextSteps.length > 0) {
          formatted += `\n💡 NEXT STEPS:\n`;
          result.result.nextSteps.forEach(step => {
            formatted += `• ${step}\n`;
          });
        }
      }
      // ENHANCED: Handle agent.results action with artifacts as downloadable objects
      else if (result.action === 'agent.results' && result.result.executions) {
        const executions = result.result.executions;

        if (executions.length === 0) {
          // 2026-05-23 fix: empty-message already rendered above from
          // result.result.message ("No successful or failed agent executions
          // found" / "No agent executions found"). Skipping the redundant
          // line that previously caused doubled "No executions" output.
          // Mirror of the agent.status branch at line 757.
        } else {
          formatted += `\nAGENT EXECUTION RESULTS:\n\n`;
          
          executions.forEach((exec, index) => {
            formatted += `📋 EXECUTION ${index + 1}:\n`;
            formatted += `• ID: ${exec.id}\n`;
            formatted += `• Status: ${exec.status}\n`;
            formatted += `• Duration: ${exec.duration ? `${exec.duration}s` : 'N/A'}\n`;
            
            if (exec.task) {
              formatted += `• Task: ${sanitizeForResponse(exec.task.title)}\n`;
            }

            if (exec.agentTemplate) {
              formatted += `• Template: ${sanitizeForResponse(exec.agentTemplate.name)}\n`;
            }

            // 2026-07-26: the handler hoists errorCategory out of error.json to a top-level
            // field precisely so an agent does NOT have to parse an artifact to branch on the
            // failure. Without this render branch the hoist was invisible in the text an agent
            // actually reads — the code appeared only inside the raw artifact preview, which is
            // the same suppressed-true-fact defect this work exists to fix, one layer further
            // out. Found by live verification; every gate was green.
            if (exec.errorCategory) {
              formatted += `• Failure code: ${sanitizeForResponse(String(exec.errorCategory))}\n`;
            }

            // Show artifacts as structured, copyable objects
            if (exec.artifacts && exec.artifacts.length > 0) {
              formatted += `\n📎 ARTIFACTS (${exec.artifacts.length}):\n`;
              
              exec.artifacts.forEach((artifact, idx) => {
                formatted += `\n${idx + 1}. ${artifact.name} (${artifact.type})\n`;
                
                if (artifact.content) {
                  // Wave B BC71 fix: full JSON.stringify for ALL string fields
                  // (was using raw template-literal interpolation for "name"
                  // and "type" — JSON-quote injection class). Sanitize the
                  // human-readable summary block too.
                  const artifactObject = {
                    name: artifact.name,
                    type: artifact.type,
                    content: artifact.content,
                    size: artifact.content.length,
                    generated: new Date().toISOString()
                  };

                  formatted += `   📄 File Details:\n`;
                  formatted += `   • Name: ${sanitizeForResponse(artifact.name)}\n`;
                  formatted += `   • Type: ${sanitizeForResponse(artifact.type)}\n`;
                  formatted += `   • Size: ${artifact.content.length} characters\n`;
                  formatted += `   • Generated: ${artifactObject.generated}\n\n`;

                  // Use JSON.stringify for the full object — avoids JSON-quote
                  // injection at the per-field level.
                  formatted += `   💾 COPYABLE OBJECT:\n`;
                  formatted += `   ${JSON.stringify(artifactObject, null, 2).replace(/\n/g, '\n   ')}\n\n`;
                  
                  // Add content preview (truncated for readability). Human-facing DISPLAY PREVIEW —
                  // deliberately distinct from the Tier-1 LLM-view cap (agentic-tool-loop.ts
                  // truncateForLlm); do NOT merge (harvest-truncation-safety.md §1).
                  const preview = artifact.content.length > 500
                    ? artifact.content.substring(0, 500) + '...[truncated]'
                    : artifact.content;
                    
                  formatted += `   📝 CONTENT PREVIEW:\n`;
                  formatted += `   ${preview}\n\n`;
                  
                } else if (artifact.preview) {
                  formatted += `   Preview: ${artifact.preview}\n`;
                }
              });
              
              // Add download instructions
              formatted += `\n💡 DOWNLOAD INSTRUCTIONS:\n`;
              formatted += `• Copy the COPYABLE OBJECT sections above\n`;
              formatted += `• Parse the JSON to extract content\n`;
              formatted += `• Save content to files with the specified names and types\n`;
              formatted += `• Use the 'type' field to set proper file extensions\n\n`;
            }
            
            // Show the main LLM response content
            if (exec.mainResponse) {
              formatted += `\n📝 AGENT RESPONSE:\n`;
              formatted += `${exec.mainResponse}\n`;
            }
            
            // Show LLM responses if available
            if (exec.llmResponses && exec.llmResponses.length > 0) {
              formatted += `\n💬 LLM RESPONSES (${exec.llmResponses.length}):\n`;
              exec.llmResponses.forEach((response, idx) => {
                formatted += `\n${idx + 1}. ${response.name || 'LLM Response'}:\n`;
                formatted += `${response.content}\n`;
                
                if (response.metadata) {
                  formatted += `   Metadata: ${JSON.stringify(response.metadata, null, 2)}\n`;
                }
              });
            }
            
            // Show metrics if available
            
            if (index < executions.length - 1) {
              formatted += `\n${'='.repeat(50)}\n\n`;
            }
          });
          
          // Add summary
          if (result.result.summary) {
            const summary = result.result.summary;
            formatted += `\n📈 SUMMARY:\n`;
            formatted += `• Total Executions: ${summary.total}\n`;
            formatted += `• Completed: ${summary.completed}\n`;
            formatted += `• Failed: ${summary.failed}\n`;
            formatted += `• Running: ${summary.running}\n`;
            if (summary.withArtifacts) {
              formatted += `• With Artifacts: ${summary.withArtifacts}\n`;
            }
          }

          // Elicitation prompts (Apr 2026): render the suggested next steps
          // generated by ElicitationPromptsGenerator. Without this, the prompts
          // exist in the underlying JSON but never reach the MCP client because
          // formatActionResult drops everything not explicitly rendered.
          if (result.result.elicitationPrompts && result.result.elicitationPrompts.length > 0) {
            formatted += `\n## 💭 Suggested Next Steps\n`;
            result.result.elicitationPrompts.forEach((prompt, index) => {
              formatted += `${index + 1}. ${prompt.text}\n`;
              if (prompt.context) {
                formatted += `   *${prompt.context}*\n`;
              }
            });
          }
        }
      }
      // Handle other action types
      else if (result.result.task) {
        const task = result.result.task;
        if (task.id) {
          formatted += `• Task ID: ${task.id}\n`;
        }
        // Wave B BC71 fix: sanitize task title.
        formatted += `• Task: ${task.title ? sanitizeForResponse(task.title) : task.id}\n`;
        if (task.status) {
          formatted += `• Status: ${task.status}\n`;
        }
      }
      // Stage-level actions (stage.create etc.) — render the ID so agents can
      // use it in subsequent calls without re-querying. Before this branch the
      // message-only rendering dropped the stage ID, forcing agents to call
      // pov.details just to discover what they had just created.
      else if (result.result.stage) {
        const stage = result.result.stage;
        if (stage.id) {
          formatted += `• Stage ID: ${stage.id}\n`;
        }
        if (stage.name) {
          formatted += `• Stage: ${stage.name}\n`;
        }
        if (stage.phaseName || stage.phase?.name) {
          formatted += `• Phase: ${stage.phaseName || stage.phase.name}\n`;
        }
        if (typeof stage.order === 'number') {
          formatted += `• Order: ${stage.order}\n`;
        }
      }
      else if (result.result.execution) {
        const exec = result.result.execution;
        formatted += `• Execution ID: ${exec.id}\n`;
        formatted += `• Execution Status: ${exec.status}\n`;
      }
    }

    return formatted;
  }

  /**
   * Create downloadable artifact bundles
   */
  createArtifactBundle(executions) {
    const bundle = {
      metadata: {
        generated: new Date().toISOString(),
        totalExecutions: executions.length,
        totalArtifacts: executions.reduce((sum, exec) => sum + (exec.artifacts?.length || 0), 0)
      },
      executions: executions.map(exec => ({
        id: exec.id,
        status: exec.status,
        duration: exec.duration,
        task: exec.task?.title,
        artifacts: exec.artifacts?.map(artifact => ({
          name: artifact.name,
          type: artifact.type,
          content: artifact.content,
          size: artifact.content?.length || 0
        })) || []
      }))
    };
    
    return JSON.stringify(bundle, null, 2);
  }

  /**
   * Format recommendations
   */
  /**
   * BUG-ANALYTICS-001 fix (2026-05-22): two recommendation sources use
   * inconsistent confidence scaling:
   *   - lib/mcp/recommendation-generator.ts → decimals (0.0-1.0)
   *   - app/api/mcp/recommendations/route.ts → integers (0-100)
   *   - lib/mcp/server/utils/enterprise-parameter-intelligence.js → integers
   *
   * Multiplying both by 100 produced absurd output ('9300.0%', '8500.0%').
   *
   * Defensive normalization: if confidence > 1 it was already a percent
   * integer (don't multiply); else it was a decimal (multiply by 100).
   * Forward-safe — covers any future source regardless of convention.
   *
   * @param {number} confidence - raw confidence value (0.0-1.0 OR 0-100)
   * @returns {string} formatted percentage with 1 decimal place
   */
  _formatConfidencePercent(confidence) {
    if (confidence == null) return 'N/A';

    // String-form support — categorical convention from
    // lib/mcp/server/utils/enterprise-parameter-intelligence.js.
    if (typeof confidence === 'string') {
      const lookup = { high: 90, medium: 60, low: 30 };
      const mapped = lookup[confidence.toLowerCase()];
      if (mapped != null) return `${mapped.toFixed(1)}%`;
      return 'N/A'; // unknown string convention → tripwire silent
    }

    if (isNaN(confidence)) return 'N/A';

    // ARCH-ANALYTICS-3 (2026-05-22): downgraded from defensive normalizer to
    // tripwire. After source-side normalization in #203, all numeric sources
    // should emit integer-percent (0-100). A decimal in (0, 1] now indicates
    // a NEW source that drifted from convention — log loud so we catch it
    // before the user does. Behavior remains forward-compatible (still
    // multiplies by 100 so display stays correct).
    if (confidence > 0 && confidence <= 1) {
      try {
        this.logger.warn({
          event: 'confidence-decimal-tripwire',
          confidence,
          message: 'Decimal-form confidence detected post-#203 source normalization. Find the new emit site and convert to integer-percent (0-100). See ARCH-ANALYTICS-3.',
        });
      } catch (_) { /* defensive — logger may not be set up in some bare-node contexts */ }
      return `${(confidence * 100).toFixed(1)}%`;
    }
    return `${confidence.toFixed(1)}%`;
  }

  formatRecommendations(data) {
    if (!data.recommendations || data.recommendations.length === 0) {
      // BUG-ANALYTICS-004 fix (2026-05-22): sibling of BUG-HUB-002. Empty
      // result was a dead-end response. Now surfaces recovery options so
      // callers know how to broaden the filter or try other types.
      return [
        'No recommendations found.',
        '',
        '🔧 Recovery options:',
        "  • analytics(action: 'recommendations.get') — unfiltered (no type/povId scope)",
        "  • analytics(action: 'recommendations.get', povId: '<your-pov-id>') — POV-scoped, all types",
        "  • analytics(action: 'recommendations.get', type: 'AUTOMATION') — try a different type (valid: AUTOMATION, OPTIMIZATION, RISK_MITIGATION, WORKFLOW_IMPROVEMENT, RESOURCE_ALLOCATION)",
        "  • Lower the impact bar: omit impact filter, or try impact: 'LOW' / 'MEDIUM'",
        '',
        "💡 If still empty: there may genuinely be no recommendations for this scope — try project(action: 'pov.list') to confirm POVs exist."
      ].join('\n');
    }

    let formatted = `Found ${data.recommendations.length} recommendations:\n\n`;

    data.recommendations.forEach((rec, index) => {
      // sec-ops HIGH-1: rec.title + rec.description originate from
      // MCPRecommendation rows whose contents embed user-controlled
      // pov.title + kpi.name. BC71 sweep continuation. impact + type
      // are constrained enums (safe).
      formatted += `${index + 1}. ${sanitizeForResponse(rec.title)}\n`;
      formatted += `   Confidence: ${this._formatConfidencePercent(rec.confidence)}\n`;
      formatted += `   Impact: ${rec.impact}\n`;
      formatted += `   Type: ${rec.type}\n`;
      formatted += `   Description: ${sanitizeForResponse(rec.description)}\n`;
      
      if (rec.actions && rec.actions.primary) {
        formatted += `   Primary Action: ${rec.actions.primary}\n`;
      }
      
      formatted += '\n';
    });

    if (data.summary) {
      formatted += `SUMMARY:\n`;
      formatted += `• Total: ${data.summary.total}\n`;
      formatted += `• High Impact: ${data.summary.highImpactCount}\n`;
      formatted += `• Average Confidence: ${data.summary.averageConfidence.toFixed(1)}%\n`;
    }

    return formatted;
  }

  /**
   * Format team analytics
   */
  formatTeamAnalytics(analytics) {
    let formatted = `TEAM PERFORMANCE ANALYTICS:\n\n`;
    
    if (analytics.totalTasks !== undefined) {
      formatted += `• Total Tasks: ${analytics.totalTasks}\n`;
      formatted += `• Completed Tasks: ${analytics.completedTasks || 0}\n`;
      formatted += `• Completion Rate: ${analytics.completionRate || 0}%\n`;
      // BUG-ANALYTICS-002 fix (2026-05-22): upstream analytics.generate does
      // NOT compute avgTaskDuration today. Showing "0 days" misled users into
      // thinking team has instant task throughput. Show "N/A" when undefined;
      // when implemented upstream, the truthy branch will display the value.
      formatted += `• Average Duration: ${analytics.avgTaskDuration != null ? analytics.avgTaskDuration + ' days' : 'N/A (not computed upstream — see #195)'}\n`;
    }
    
    if (analytics.productivityScore !== undefined) {
      formatted += `• Productivity Score: ${analytics.productivityScore}\n`;
    }
    
    if (analytics.activeMembers !== undefined) {
      formatted += `• Active Team Members: ${analytics.activeMembers}\n`;
    }

    return formatted;
  }

  /**
   * Format agent template list
   */
  formatAgentTemplateList(templates, metadata = null) {
    if (!templates || templates.length === 0) {
      return 'No agent templates found.';
    }

    // MCP Exposure Fix: Add completeness header if metadata available
    let output = '';
    if (metadata?.pagination) {
      const pagination = metadata.pagination;
      output = `Found ${pagination.returned} of ${pagination.total} total agent templates`;

      if (pagination.totalPages > 1) {
        output += ` (page ${pagination.currentPage} of ${pagination.totalPages})`;
      }

      if (pagination.hasMore) {
        output += `\n📄 More results available - increase limit (max 200) or add filters to narrow`;
      } else {
        output += ` (complete results)`;
      }

      output += '\n\n';
    }

    // BUG-TEMPLATE-008 fix (2026-05-23, Phase 3 sec-ops M1 + template-system #6):
    // Sanitize user-controlled template fields in list rendering. Same
    // rationale as formatAgentTemplateDetails — cross-tenant sharing means
    // admin in tenant A reaches every authenticated user.
    output += templates.map(template => {
      const safeName = template.name != null ? sanitizeForResponse(template.name) : template.name;
      let formatted = `• ${safeName} (ID: ${template.id})\n  Category: ${template.category}\n  Status: ${template.status}`;

      if (template.description) {
        // Truncate description if too long
        const desc = template.description.length > 100
          ? template.description.substring(0, 100) + '...'
          : template.description;
        formatted += `\n  Description: ${sanitizeForResponse(desc)}`;
      }

      if (template.createdAt) {
        formatted += `\n  Created: ${new Date(template.createdAt).toLocaleDateString()}`;
      }

      return formatted;
    }).join('\n\n');

    return output;
  }

  /**
   * Format agent template details
   */
  formatAgentTemplateDetails(templateData) {
    // Handle API response structure - extract template from data.data if needed
    const template = templateData?.data || templateData;
    
    if (!template) {
      return 'Agent template not found.';
    }

    // BUG-TEMPLATE-008 fix (2026-05-23, Phase 3 sec-ops M1 + template-system #6):
    // Sanitize user-controlled template fields (name, description, defaultRole)
    // via sanitizeForResponse. Cross-tenant template sharing intentional —
    // admin in tenant A's templates are visible to every authenticated user.
    // BC71 sweep continuation. Defense-in-depth — no HTML render path today
    // but future MCP clients with markdown→HTML pipelines will need it.
    const safeName = template.name != null ? sanitizeForResponse(template.name) : 'Unnamed Template';
    const safeDescription = template.description != null ? sanitizeForResponse(template.description) : 'No description';
    const safeDefaultRole = template.defaultRole != null ? sanitizeForResponse(template.defaultRole) : null;

    let details = `Name: ${safeName}
ID: ${template.id || 'No ID'}
Category: ${template.category || 'No Category'}
Status: ${template.status || 'Unknown'}
Description: ${safeDescription}`;

    // BUG-TEMPLATE-006 fix (2026-05-23, Phase 3 template-system CRITICAL):
    // templateType is the LOAD-BEARING classification axis for P9 Pipeline
    // Harness routing per Pattern #44 (ARCHITECT/BUILDER/ANALYST/REVIEWER/
    // OPERATOR/DOCUMENTER). Previously dropped by the formatter — LLM
    // couldn't distinguish Solution Architect (ARCHITECT) from Senior
    // Software Developer (BUILDER) when both share DEVELOPMENT category.
    if (template.templateType) {
      details += `\nTemplate Type: ${template.templateType}`;
    }

    if (safeDefaultRole) {
      details += `\nDefault Role: ${safeDefaultRole}`;
    }

    if (template.priority) {
      details += `\nPriority: ${template.priority}`;
    }

    if (template.version) {
      details += `\nVersion: ${template.version}`;
    }

    if (template.capabilities) {
      details += `\n\nCapabilities:`;
      
      // 🔧 FIX: Safe array handling for capabilities (handles string, array, object formats)
      const formatCapabilityArray = (capability, label) => {
        if (!capability) return null;
        
        // Handle string format (most common in our database)
        // Example: "Markdown, GitBook, Confluence, Notion, Swagger/OpenAPI"
        if (typeof capability === 'string' && capability.trim()) {
          return `\n• ${label}: ${capability.trim()}`;
        }
        
        // Handle array format
        if (Array.isArray(capability) && capability.length > 0) {
          return `\n• ${label}: ${capability.join(', ')}`;
        }
        
        // Handle object format (convert keys to array)
        if (typeof capability === 'object' && !Array.isArray(capability)) {
          const keys = Object.keys(capability);
          if (keys.length > 0) {
            return `\n• ${label}: ${keys.join(', ')}`;
          }
        }
        
        return null;
      };
      
      // Apply safe formatting to all capability types
      const toolsFormatted = formatCapabilityArray(template.capabilities.tools, 'Tools');
      if (toolsFormatted) details += toolsFormatted;
      
      const skillsFormatted = formatCapabilityArray(template.capabilities.skills, 'Skills');
      if (skillsFormatted) details += skillsFormatted;
      
      const languagesFormatted = formatCapabilityArray(template.capabilities.languages, 'Languages');
      if (languagesFormatted) details += languagesFormatted;
      
      const frameworksFormatted = formatCapabilityArray(template.capabilities.frameworks, 'Frameworks');
      if (frameworksFormatted) details += frameworksFormatted;
      
      const databasesFormatted = formatCapabilityArray(template.capabilities.databases, 'Databases');
      if (databasesFormatted) details += databasesFormatted;
      
      // Handle any other capability properties dynamically
      Object.entries(template.capabilities).forEach(([key, value]) => {
        if (!['tools', 'skills', 'languages', 'frameworks', 'databases'].includes(key)) {
          const formatted = formatCapabilityArray(value, key.charAt(0).toUpperCase() + key.slice(1));
          if (formatted) details += formatted;
        }
      });
    }

    if (template.constraints) {
      details += `\n\nConstraints:`;
      Object.entries(template.constraints).forEach(([key, value]) => {
        details += `\n• ${key}: ${value}`;
      });
    }

    if (template.maxRetries !== undefined) {
      details += `\n\nConfiguration:`;
      details += `\n• Max Retries: ${template.maxRetries}`;
      details += `\n• Timeout: ${template.timeout || 300}s`;
    }

    // Add performance metrics if available
    if (template.usageCount !== undefined) {
      details += `\n\nPerformance:`;
      details += `\n• Usage Count: ${template.usageCount}`;
      
      if (template.successRate !== undefined) {
        details += `\n• Success Rate: ${(template.successRate * 100).toFixed(1)}%`;
      }
      
      if (template.averageTime !== undefined) {
        // BUG-TEMPLATE-003 fix (2026-05-23): when averageTime is null, the
        // template literal produced 'Average Execution Time: nulls' — literal
        // 'null' + the 's' unit suffix concatenated. Same display-polish bug
        // class as BUG-ANALYTICS-002 (Average Duration: 0 days). Show 'N/A'
        // when the upstream API didn't compute a value.
        details += template.averageTime != null
          ? `\n• Average Execution Time: ${template.averageTime}s`
          : `\n• Average Execution Time: N/A (not computed)`;
      }
    }

    if (template.tags && template.tags.length > 0) {
      details += `\n\nTags: ${template.tags.join(', ')}`;
    }

    if (template.createdAt) {
      details += `\n\nCreated: ${new Date(template.createdAt).toLocaleDateString()}`;
    }

    if (template.updatedAt) {
      details += `\nLast Updated: ${new Date(template.updatedAt).toLocaleDateString()}`;
    }

    return details;
  }

  /**
   * Format generic data with fallback
   */
  formatGenericData(data, fallbackMessage = 'No data available') {
    if (!data) {
      return fallbackMessage;
    }

    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object') {
      try {
        return JSON.stringify(data, null, 2);
      } catch {
        return String(data);
      }
    }

    return String(data);
  }

  /**
   * Truncate text if too long
   */
  truncateText(text, maxLength = 2000) {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Add timestamp to response
   */
  addTimestamp(text) {
    const timestamp = new Date().toISOString();
    return `${text}\n\n---\nGenerated at: ${timestamp}`;
  }
}

// Create singleton instance
const responseFormatter = new ResponseFormatter();

module.exports = { ResponseFormatter, responseFormatter };
