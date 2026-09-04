/**
 * Compliance Monitoring System for Anthropic MCP Requirements
 * Tracks security events, violations, and generates compliance reports
 * Part of Priority 1 compliance implementation
 */

// Use global Prisma singleton from lib/prisma.ts (Dec 2025 consolidation)
// This prevents connection pool exhaustion by reusing a single shared pool
const { prisma: globalPrisma } = require('../../../prisma');
const { sanitizeMetadataForAudit } = require('../tools/response-sanitizer');
// Single source of truth for every retention window (Finding B, 2026-07-08) — method defaults,
// the scheduled sweep, and resourceManager.cleanupArtifactsByAge all read this map. Do NOT
// hardcode day counts here; change the map (and the pins in scripts/test-compliance-monitor.ts).
const { RETENTION_DAYS } = require('./retention-windows');

// Structured logging via pino (Feb 2026 migration)
const pino = require('pino');
const complianceLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
}).child({ domain: 'mcp', module: 'ComplianceMonitor' });

// Singleton instance (time-bomb-detection-pattern.md - ensures cleanup is scheduled)
let complianceMonitorInstance = null;

class ComplianceMonitor {
  /**
   * Get singleton instance with auto-scheduled cleanup
   * (time-bomb-detection-pattern.md - Category 2: Cleanup Schedulers)
   */
  static getInstance() {
    if (!complianceMonitorInstance) {
      complianceMonitorInstance = new ComplianceMonitor();
      // Auto-schedule cleanup on first getInstance call
      complianceMonitorInstance.scheduleCleanup();
      complianceLogger.info('Singleton initialized with auto-scheduled cleanup');
    }
    return complianceMonitorInstance;
  }

  constructor(prisma) {
    // DI pattern: Use injected prisma or fall back to global singleton (never create new)
    this.prisma = prisma || globalPrisma;
    this.eventTypes = {
      SERVICE_CALL_BLOCKED: 'SERVICE_CALL_BLOCKED',
      REGISTRATION_REJECTED: 'REGISTRATION_REJECTED',
      CONTENT_FILTERED: 'CONTENT_FILTERED',
      RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
      UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
      POLICY_VIOLATION: 'POLICY_VIOLATION',
      SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY'
    };
    
    this.riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    
    // Alert thresholds
    this.thresholds = {
      CRITICAL_EVENTS_PER_HOUR: 10,
      HIGH_RISK_EVENTS_PER_HOUR: 50,
      BLOCKED_CALLS_PER_USER_PER_HOUR: 20,
      FAILED_REGISTRATIONS_PER_IP_PER_HOUR: 5
    };
  }

  /**
   * Log a security event for compliance tracking
   * @param {string} eventType - Type of security event
   * @param {object} eventData - Event details and metadata
   * @param {object} context - User and request context
   */
  async logSecurityEvent(eventType, eventData, context = {}) {
    try {
      const securityEvent = {
        id: this.generateEventId(),
        eventType,
        severity: this.calculateSeverity(eventType, eventData),
        timestamp: new Date(),
        userId: context.userId || null,
        ipAddress: context.ipAddress || null,
        userAgent: context.userAgent || null,
        details: {
          ...eventData,
          context: context
        }
      };

      // Store in database if available
      try {
        await this.storeSecurityEvent(securityEvent);
      } catch (dbError) {
        complianceLogger.error({ err: dbError }, 'Database storage failed');
        // Fall back to console logging
        this.logToConsole(securityEvent);
      }

      // Check if this event triggers any alerts
      await this.checkAlertThresholds(securityEvent);

      // Update real-time metrics
      this.updateMetrics(securityEvent);

      return securityEvent.id;
    } catch (error) {
      complianceLogger.error({ err: error }, 'Failed to log security event');
      // Ensure we at least log to console for critical events
      if (eventData.riskLevel === 'CRITICAL') {
        complianceLogger.fatal({ eventType, eventData, context }, 'CRITICAL SECURITY EVENT');
      }
    }
  }

  /**
   * Store security event in database
   * Uses Activity model (AuditLog model doesn't exist in schema)
   */
  async storeSecurityEvent(event) {
    try {
      // 2026-05-23 BUG-AUDIT-XSS-2 sweep: event.details spread can carry
      // user-controlled values from upstream callers. Write-time sanitize.
      await this.prisma.activity.create({
        data: {
          action: event.eventType,
          type: 'SECURITY_EVENT',
          userId: event.userId,
          metadata: sanitizeMetadataForAudit({
            ...event.details,
            severity: event.severity,
            ipAddress: event.ipAddress,
            timestamp: event.timestamp
          })
        }
      });
    } catch (error) {
      // Fall back to console logging if database unavailable
      complianceLogger.warn('Activity table not available, using fallback logging');
      this.logToConsole(event);
    }
  }

  /**
   * Log event with structured format (fallback when DB unavailable)
   */
  logToConsole(event) {
    const logData = {
      eventId: event.id,
      eventType: event.eventType,
      severity: event.severity,
      userId: event.userId,
      ipAddress: event.ipAddress,
      details: event.details,
    };

    if (event.severity === 'CRITICAL') {
      complianceLogger.error(logData, `COMPLIANCE-${event.severity}: ${event.eventType}`);
    } else if (event.severity === 'HIGH') {
      complianceLogger.warn(logData, `COMPLIANCE-${event.severity}: ${event.eventType}`);
    } else {
      complianceLogger.info(logData, `COMPLIANCE-${event.severity}: ${event.eventType}`);
    }
  }

  /**
   * Calculate event severity based on type and content
   */
  calculateSeverity(eventType, eventData) {
    // Check for explicit risk level in data
    if (eventData.riskLevel) {
      return eventData.riskLevel.toUpperCase();
    }

    // Determine severity based on event type
    const severityMap = {
      'SERVICE_CALL_BLOCKED': 'HIGH',
      'REGISTRATION_REJECTED': 'MEDIUM',
      'CONTENT_FILTERED': 'MEDIUM', 
      'RATE_LIMIT_EXCEEDED': 'LOW',
      'UNAUTHORIZED_ACCESS': 'HIGH',
      'POLICY_VIOLATION': 'HIGH',
      'SUSPICIOUS_ACTIVITY': 'MEDIUM'
    };

    // Check for critical indicators in violation data
    if (eventData.violations) {
      const hasCritical = eventData.violations.some(v => 
        v.severity === 'CRITICAL' || v.type === 'BLOCKED_PATTERN'
      );
      if (hasCritical) return 'CRITICAL';
    }

    return severityMap[eventType] || 'MEDIUM';
  }

  /**
   * Check if event triggers any alert thresholds
   */
  async checkAlertThresholds(event) {
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    try {
      // Check critical events per hour
      if (event.severity === 'CRITICAL') {
        const recentCritical = await this.getEventCount('CRITICAL', oneHourAgo);
        if (recentCritical >= this.thresholds.CRITICAL_EVENTS_PER_HOUR) {
          await this.triggerAlert('CRITICAL_THRESHOLD_EXCEEDED', {
            count: recentCritical,
            threshold: this.thresholds.CRITICAL_EVENTS_PER_HOUR,
            timeWindow: '1 hour'
          });
        }
      }

      // Check blocked calls per user
      if (event.eventType === 'SERVICE_CALL_BLOCKED' && event.userId) {
        const userBlocked = await this.getEventCount(
          'SERVICE_CALL_BLOCKED', 
          oneHourAgo, 
          { userId: event.userId }
        );
        if (userBlocked >= this.thresholds.BLOCKED_CALLS_PER_USER_PER_HOUR) {
          await this.triggerAlert('USER_EXCESSIVE_BLOCKS', {
            userId: event.userId,
            count: userBlocked,
            threshold: this.thresholds.BLOCKED_CALLS_PER_USER_PER_HOUR
          });
        }
      }

    } catch (error) {
      complianceLogger.error({ err: error }, 'Alert threshold check failed');
    }
  }

  /**
   * Trigger compliance alert
   */
  async triggerAlert(alertType, alertData) {
    const alert = {
      type: alertType,
      severity: 'HIGH',
      data: alertData,
      timestamp: new Date().toISOString()
    };

    // Log alert
    complianceLogger.warn({ alert }, 'COMPLIANCE ALERT');

    // Store alert (if database available)
    try {
      await this.logSecurityEvent('COMPLIANCE_ALERT', alert);
    } catch (error) {
      complianceLogger.error({ err: error }, 'Failed to store alert');
    }

    // TODO: Add additional alert mechanisms (email, Slack, etc.)
    // depending on deployment environment
  }

  /**
   * Get count of events matching criteria
   * Uses Activity model (AuditLog model doesn't exist in schema)
   */
  async getEventCount(eventType, since, filters = {}) {
    try {
      const where = {
        type: 'SECURITY_EVENT',
        createdAt: { gte: since },
        ...filters
      };

      // Filter by action (eventType) if specified
      if (eventType) {
        where.action = eventType;
      }

      return await this.prisma.activity.count({ where });
    } catch (error) {
      // Fall back to 0 if database not available
      return 0;
    }
  }

  /**
   * Update real-time metrics
   */
  updateMetrics(event) {
    // This would update in-memory metrics for dashboard
    // For now, just log significant events
    if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
      complianceLogger.info({ eventType: event.eventType, severity: event.severity, userId: event.userId }, 'Compliance metric recorded');
    }
  }

  /**
   * Generate compliance summary report
   */
  async generateComplianceReport(timeRange = '24h') {
    try {
      const since = this.getTimeRangeStart(timeRange);
      const now = new Date();

      const report = {
        timeRange: { since, until: now },
        summary: {
          totalEvents: await this.getEventCount(null, since),
          criticalEvents: await this.getEventCount('CRITICAL', since),
          blockedCalls: await this.getEventCount('SERVICE_CALL_BLOCKED', since),
          rejectedRegistrations: await this.getEventCount('REGISTRATION_REJECTED', since)
        },
        topViolations: await this.getTopViolations(since),
        riskAssessment: this.calculateRiskScore(since),
        recommendations: this.generateRecommendations()
      };

      return report;
    } catch (error) {
      complianceLogger.error({ err: error }, 'Report generation failed');
      return { error: 'Report generation failed', timestamp: new Date() };
    }
  }

  /**
   * Generate a unique event ID
   */
  generateEventId() {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get time range start based on string
   */
  getTimeRangeStart(timeRange) {
    const now = new Date();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    
    const milliseconds = ranges[timeRange] || ranges['24h'];
    return new Date(now - milliseconds);
  }

  /**
   * Get top violation types
   */
  async getTopViolations(since) {
    // This would query the database for top violations
    // For now, return placeholder
    return [
      { type: 'UNAPPROVED_TOOL', count: 5 },
      { type: 'BLOCKED_PATTERN', count: 3 },
      { type: 'SIZE_LIMIT', count: 2 }
    ];
  }

  /**
   * Calculate overall risk score
   */
  calculateRiskScore(since) {
    // Simplified risk calculation
    // In production, this would be more sophisticated
    return {
      score: 75, // Out of 100
      level: 'MEDIUM',
      factors: [
        'Recent policy violations detected',
        'Some blocked service calls',
        'No critical security breaches'
      ]
    };
  }

  /**
   * Generate compliance recommendations
   */
  generateRecommendations() {
    return [
      'Monitor users with multiple blocked service calls',
      'Review and update approved tools whitelist',
      'Consider implementing additional rate limiting',
      'Enhance content filtering rules if needed'
    ];
  }

  /**
   * Cleanup old Activity records (for GDPR compliance)
   * FIX (Jan 2026): Changed from non-existent AuditLog to Activity model
   *
   * Activity table stores: user actions, security events, permission changes
   * 5,131+ rows and growing - needs regular cleanup
   *
   * @param {number} retentionDays - Days to retain records (default: RETENTION_DAYS.activity)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldActivities(retentionDays = RETENTION_DAYS.activity) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.activity.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'Activity' }, 'Cleaned up old Activity records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'Activity' }, 'Activity cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old TaskActivity records
   * Added (Jan 2026): Missing cleanup for task activity history
   *
   * TaskActivity stores rich activity details for tasks
   * Uses 'timestamp' field (not 'createdAt')
   *
   * @param {number} retentionDays - Days to retain records (default: RETENTION_DAYS.taskActivity)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldTaskActivities(retentionDays = RETENTION_DAYS.taskActivity) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.taskActivity.deleteMany({
        where: {
          timestamp: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'TaskActivity' }, 'Cleaned up old TaskActivity records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'TaskActivity' }, 'TaskActivity cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup expired RefreshToken records
   * Added (Jan 2026): Security best practice - remove expired tokens
   *
   * RefreshTokens have explicit expiresAt field - delete when expired
   *
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupExpiredRefreshTokens() {
    try {
      const deleted = await this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, table: 'RefreshToken' }, 'Cleaned up expired RefreshToken records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'RefreshToken' }, 'RefreshToken cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old Notification records
   * Added (Jan 2026): Schedule existing cleanup logic
   * Enhanced (Feb 2026): Also delete unread notifications older than 90 days
   *
   * Two-tier retention:
   * - Read notifications: 7 days
   * - Unread notifications: 90 days (prevents unbounded accumulation for inactive users)
   *
   * @param {number} retentionDays - Days to retain read notifications (default: RETENTION_DAYS.notificationRead)
   * @param {number} unreadRetentionDays - Days to retain unread notifications (default: RETENTION_DAYS.notificationUnread)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldNotifications(retentionDays = RETENTION_DAYS.notificationRead, unreadRetentionDays = RETENTION_DAYS.notificationUnread) {
    try {
      const readCutoff = new Date();
      readCutoff.setDate(readCutoff.getDate() - retentionDays);

      const unreadCutoff = new Date();
      unreadCutoff.setDate(unreadCutoff.getDate() - unreadRetentionDays);

      const deleted = await this.prisma.notification.deleteMany({
        where: {
          OR: [
            { read: true, createdAt: { lt: readCutoff } },
            { read: false, createdAt: { lt: unreadCutoff } }
          ]
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, readRetention: retentionDays, unreadRetention: unreadRetentionDays, table: 'Notification' }, 'Cleaned up old Notification records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'Notification' }, 'Notification cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old MCPInteraction records
   * TIME BOMB FIX (Jan 2026): Missing cleanup scheduler
   * Pattern: time-bomb-detection-pattern.md (Category 2)
   *
   * These records accumulate from every service call - without cleanup,
   * database grows ~1000 records/day → 365K/year → query degradation
   *
   * @param {number} retentionDays - Days to retain records (default: RETENTION_DAYS.mcpInteraction)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldInteractions(retentionDays = RETENTION_DAYS.mcpInteraction) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.mCPInteraction.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'MCPInteraction' }, 'Cleaned up old MCPInteraction records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'MCPInteraction' }, 'MCPInteraction cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old MCPWorkflowExecution records
   * TIME BOMB FIX (Jan 2026): Missing cleanup for workflow executions
   * Pattern: time-bomb-detection-pattern.md (Category 2)
   *
   * Created by: orchestration-tracker.ts, workflow-tools-handler.js
   * Without cleanup, records accumulate indefinitely from workflow runs
   *
   * @param {number} retentionDays - Days to retain records (default: RETENTION_DAYS.workflowExecution)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldExecutions(retentionDays = RETENTION_DAYS.workflowExecution) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Status-aware deletion: Only delete completed/failed executions
      // Keep RUNNING and CANCELLED indefinitely (may need investigation)
      // Aligns with standalone cleanup script (scripts/cleanup-workflow-executions.ts)
      const deleted = await this.prisma.mCPWorkflowExecution.deleteMany({
        where: {
          status: { in: ['COMPLETED', 'FAILED'] },
          startTime: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'MCPWorkflowExecution', statusFilter: 'COMPLETED/FAILED' }, 'Cleaned up old MCPWorkflowExecution records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'MCPWorkflowExecution' }, 'MCPWorkflowExecution cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old AgentArtifact records
   * TIME BOMB FIX (Jan 2026): Artifacts contain large content field
   * Pattern: time-bomb-detection-pattern.md (Category 2)
   *
   * Created by: agent execution engine
   * Without cleanup, DB bloats with artifact content
   *
   * @param {number} retentionDays - Days to retain records (default: RETENTION_DAYS.agentArtifact)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldArtifacts(retentionDays = RETENTION_DAYS.agentArtifact) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.agentArtifact.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'AgentArtifact' }, 'Cleaned up old AgentArtifact records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'AgentArtifact' }, 'AgentArtifact cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old MCPRecommendation records in terminal status
   * Added (Feb 2026): Orphan data fix — terminal recommendations accumulate forever
   *
   * Only deletes terminal-status recommendations (IMPLEMENTED, REJECTED, EXPIRED)
   * Keeps PENDING, REVIEWED, APPROVED for active workflow visibility
   *
   * @param {number} retentionDays - Days to retain terminal records (default: RETENTION_DAYS.mcpRecommendation)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldRecommendations(retentionDays = RETENTION_DAYS.mcpRecommendation) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.mCPRecommendation.deleteMany({
        where: {
          status: { in: ['IMPLEMENTED', 'REJECTED', 'EXPIRED'] },
          createdAt: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'MCPRecommendation', statusFilter: 'IMPLEMENTED/REJECTED/EXPIRED' }, 'Cleaned up old MCPRecommendation records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'MCPRecommendation' }, 'MCPRecommendation cleanup failed');
      return 0;
    }
  }

  /**
   * Cleanup old CRMSyncHistory records
   * Added (Feb 2026): Orphan data fix — no retention policy existed
   *
   * CRM syncs every 30 minutes per POV → ~144K records/month for 100 POVs
   * Without cleanup, becomes largest table over time
   *
   * @param {number} retentionDays - Days to retain records (default: RETENTION_DAYS.crmSyncHistory)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldCRMSyncHistory(retentionDays = RETENTION_DAYS.crmSyncHistory) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.cRMSyncHistory.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      complianceLogger.info({ deletedCount: deleted.count, retentionDays, table: 'CRMSyncHistory' }, 'Cleaned up old CRMSyncHistory records');
      return deleted.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'CRMSyncHistory' }, 'CRMSyncHistory cleanup failed');
      return 0;
    }
  }

  /**
   * Transition stale RUNNING workflow executions to FAILED
   * Added (Feb 2026): Orphan data fix — stuck executions never evicted
   *
   * Executions stuck in RUNNING status (crash, timeout, network failure)
   * are never cleaned by the existing status-aware cleanup. This watchdog
   * marks them as FAILED so they become eligible for normal cleanup.
   *
   * @param {number} staleDays - Days before RUNNING is considered stale (default: RETENTION_DAYS.staleExecutionDays)
   * @returns {Promise<number>} Number of transitioned records
   */
  async cleanupStaleExecutions(staleDays = RETENTION_DAYS.staleExecutionDays) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - staleDays);

      const updated = await this.prisma.mCPWorkflowExecution.updateMany({
        where: {
          status: 'RUNNING',
          startTime: { lt: cutoffDate }
        },
        data: {
          status: 'FAILED',
          error: `Marked as FAILED by cleanup watchdog — stale RUNNING for ${staleDays}+ days`,
          endTime: new Date(),
          updatedAt: new Date()
        }
      });

      if (updated.count > 0) {
        complianceLogger.warn({ transitionedCount: updated.count, staleDays, table: 'MCPWorkflowExecution' }, 'Transitioned stale RUNNING executions to FAILED');
      }
      return updated.count;
    } catch (error) {
      complianceLogger.error({ err: error, table: 'MCPWorkflowExecution' }, 'Stale execution cleanup failed');
      return 0;
    }
  }

  /**
   * Schedule daily cleanup
   * TIME BOMB FIX (Jan 2026): Actually CALL the cleanup methods!
   * Pattern: time-bomb-detection-pattern.md (Category 2)
   *
   * Call this during server startup to activate cleanup.
   */
  scheduleCleanup() {
    // Run cleanup immediately on startup
    this.runCleanup().catch(err => complianceLogger.warn({ err }, 'Cleanup startup failed'));

    // Schedule daily cleanup (every 24 hours)
    const interval = setInterval(() => {
      this.runCleanup().catch(err => complianceLogger.warn({ err }, 'Cleanup interval failed'));
    }, 24 * 60 * 60 * 1000); // 24 hours

    // TIME BOMB PREVENTION: Don't block process exit
    // Without .unref(), node process hangs on shutdown
    interval.unref();

    // Store reference for potential cleanup
    this.cleanupInterval = interval;

    complianceLogger.info({ policies: { Activity: '180d', TaskActivity: '90d', MCPInteraction: '30d', WorkflowExecution: '30d', MCPRecommendation: '90d-terminal', StaleRunning: '7d-watchdog', AgentArtifact: '90d', CRMSyncHistory: '90d', Notification: '7d-read/90d-unread', RefreshToken: 'expired' } }, 'Scheduled daily cleanup');
  }

  /**
   * Stop the cleanup scheduler
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      complianceLogger.info('Cleanup scheduler stopped');
    }
  }

  /**
   * Run all cleanup tasks
   * Updated (Jan 2026): Added Activity, TaskActivity, RefreshToken, Notification cleanup
   */
  async runCleanup() {
    complianceLogger.info('Running scheduled cleanup...');
    try {
      // Core activity tables
      const activityDeleted = await this.cleanupOldActivities();         // Activity: RETENTION_DAYS.activity
      // TaskActivity: 90 days retention (~3 months). Policy decision per task #86 (2026-04-16):
      // start at 3 months and revisit at compliance review — likely extending to 7+ years for
      // auth forensics (the authMethod/triggeredBySource/parentExecutionId/parentTaskId/povId
      // fields added by task #85 live here and have value for cross-user billing audits).
      // To extend retention: change this single value AND check that downstream queries don't
      // assume 90-day window (grep for "90 days" in lib/ + scripts/ before bumping).
      const taskActivityDeleted = await this.cleanupOldTaskActivities(); // RETENTION_DAYS.taskActivity

      // MCP tables
      const interactionDeleted = await this.cleanupOldInteractions();    // MCPInteraction: RETENTION_DAYS.mcpInteraction
      const executionDeleted = await this.cleanupOldExecutions();        // WorkflowExecution: RETENTION_DAYS.workflowExecution (COMPLETED/FAILED)
      const recommendationDeleted = await this.cleanupOldRecommendations();   // MCPRecommendation: RETENTION_DAYS.mcpRecommendation (terminal)
      const staleTransitioned = await this.cleanupStaleExecutions();     // Stuck RUNNING → FAILED after RETENTION_DAYS.staleExecutionDays

      // Agent execution tables
      const artifactDeleted = await this.cleanupOldArtifacts();          // AgentArtifact: RETENTION_DAYS.agentArtifact (resourceManager.cleanupArtifactsByAge reads the same key)

      // CRM tables
      const crmHistoryDeleted = await this.cleanupOldCRMSyncHistory();   // CRMSyncHistory: RETENTION_DAYS.crmSyncHistory

      // Security and notification tables
      const tokenDeleted = await this.cleanupExpiredRefreshTokens();     // RefreshToken: expired tokens
      const notificationDeleted = await this.cleanupOldNotifications();       // Notification: RETENTION_DAYS.notificationRead / .notificationUnread

      complianceLogger.info({ activityDeleted, taskActivityDeleted, interactionDeleted, executionDeleted, recommendationDeleted, staleTransitioned, artifactDeleted, crmHistoryDeleted, tokenDeleted, notificationDeleted }, 'Scheduled cleanup complete');
    } catch (error) {
      complianceLogger.error({ err: error }, 'Cleanup run failed');
    }
  }

  /**
   * Close database connection
   */
  async disconnect() {
    try {
      this.stopCleanup();
      await this.prisma.$disconnect();
    } catch (error) {
      complianceLogger.error({ err: error }, 'Disconnect failed');
    }
  }
}

module.exports = { ComplianceMonitor };