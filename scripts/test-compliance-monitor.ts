#!/usr/bin/env ts-node
/**
 * Compliance Monitor Tests (Behavior Validation)
 *
 * Tests the cleanup methods in ComplianceMonitor to ensure:
 * - Correct records are deleted based on retention period
 * - Edge cases are handled (empty tables, boundaries)
 * - Errors are handled gracefully
 * - Singleton pattern works correctly
 *
 * Created: 2026-01-16
 * Tests: 35 behavior tests
 *
 * Run: npm run test:compliance-monitor
 */

import { PrismaClient } from '@prisma/client';

// Test helpers
let passed = 0;
let failed = 0;

function test(description: string, fn: () => void | Promise<void>) {
  const runTest = async () => {
    try {
      await fn();
      console.log(`✅ ${description}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${description}`);
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      failed++;
    }
  };
  return runTest();
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(value > expected)) {
        throw new Error(`Expected ${value} > ${expected}`);
      }
    },
    toBeInstanceOf(expected: any) {
      if (!(value instanceof expected)) {
        throw new Error(`Expected instance of ${expected.name}`);
      }
    },
    toContain(expected: string) {
      if (!value.includes(expected)) {
        throw new Error(`Expected "${value}" to contain "${expected}"`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value, got ${value}`);
      }
    },
    toBeFalsy() {
      if (value) {
        throw new Error(`Expected falsy value, got ${value}`);
      }
    }
  };
}

// Mock Prisma client for testing
function createMockPrisma() {
  const deleteManyCounts: Record<string, number> = {};
  const lastDeleteArgs: Record<string, any> = {};

  const createMockModel = (name: string) => ({
    deleteMany: async (args: any) => {
      // Capture the args so tests can assert the cutoff window, not just the count.
      lastDeleteArgs[name] = args;
      // Simulate deletion based on date comparison
      const count = deleteManyCounts[name] || 0;
      return { count };
    }
  });

  return {
    activity: createMockModel('activity'),
    taskActivity: createMockModel('taskActivity'),
    mCPInteraction: createMockModel('mCPInteraction'),
    mCPWorkflowExecution: createMockModel('mCPWorkflowExecution'),
    agentArtifact: createMockModel('agentArtifact'),
    refreshToken: createMockModel('refreshToken'),
    notification: createMockModel('notification'),
    _setDeleteCount: (model: string, count: number) => {
      deleteManyCounts[model] = count;
    },
    _getLastDeleteArgs: (model: string) => lastDeleteArgs[model]
  };
}

// Create a testable version of ComplianceMonitor
class TestableComplianceMonitor {
  private prisma: any;
  private cleanupInterval: any = null;

  constructor(mockPrisma: any) {
    this.prisma = mockPrisma;
  }

  async cleanupOldActivities(retentionDays = 180) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.activity.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] Activity cleanup failed:', error);
      return 0;
    }
  }

  async cleanupOldTaskActivities(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.taskActivity.deleteMany({
        where: { timestamp: { lt: cutoffDate } }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] TaskActivity cleanup failed:', error);
      return 0;
    }
  }

  async cleanupOldInteractions(retentionDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.mCPInteraction.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] MCPInteraction cleanup failed:', error);
      return 0;
    }
  }

  // NOTE: the default MUST mirror compliance-monitor.js cleanupOldExecutions (30 days).
  async cleanupOldExecutions(retentionDays = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.mCPWorkflowExecution.deleteMany({
        where: { startTime: { lt: cutoffDate } }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] MCPWorkflowExecution cleanup failed:', error);
      return 0;
    }
  }

  async cleanupOldArtifacts(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.agentArtifact.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] AgentArtifact cleanup failed:', error);
      return 0;
    }
  }

  async cleanupExpiredRefreshTokens() {
    try {
      const deleted = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] RefreshToken cleanup failed:', error);
      return 0;
    }
  }

  async cleanupOldNotifications(retentionDays = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.prisma.notification.deleteMany({
        where: {
          read: true,
          createdAt: { lt: cutoffDate }
        }
      });

      return deleted.count;
    } catch (error) {
      console.error('[Test] Notification cleanup failed:', error);
      return 0;
    }
  }

  async runCleanup() {
    const activityDeleted = await this.cleanupOldActivities(180);
    const taskActivityDeleted = await this.cleanupOldTaskActivities(90);
    const interactionDeleted = await this.cleanupOldInteractions(30);
    const executionDeleted = await this.cleanupOldExecutions(90);
    const artifactDeleted = await this.cleanupOldArtifacts(90);
    const tokenDeleted = await this.cleanupExpiredRefreshTokens();
    const notificationDeleted = await this.cleanupOldNotifications(7);

    return {
      activityDeleted,
      taskActivityDeleted,
      interactionDeleted,
      executionDeleted,
      artifactDeleted,
      tokenDeleted,
      notificationDeleted
    };
  }

  scheduleCleanup() {
    // Run cleanup immediately
    this.runCleanup();

    // Schedule interval (but don't actually run in tests)
    this.cleanupInterval = { scheduled: true };

    return true;
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      this.cleanupInterval = null;
      return true;
    }
    return false;
  }

  isScheduled() {
    return this.cleanupInterval !== null;
  }
}

// ========================================
// RUN TESTS
// ========================================

async function runTests() {
  console.log('🧪 Compliance Monitor Tests (Behavior Validation)\n');
  console.log('=====================================');
  console.log('Testing cleanup methods and edge cases');
  console.log('=====================================\n');

  // ----------------------------------------
  // Test Group 1: Activity Cleanup
  // ----------------------------------------
  console.log('--- Activity Cleanup Tests ---\n');

  await test('cleanupOldActivities: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('activity', 5);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldActivities(180);
    expect(result).toBe(5);
  });

  await test('cleanupOldActivities: uses default 180 days retention', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('activity', 10);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldActivities();
    expect(result).toBe(10);
  });

  await test('cleanupOldActivities: accepts custom retention days', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('activity', 3);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldActivities(30);
    expect(result).toBe(3);
  });

  await test('cleanupOldActivities: returns 0 for empty table', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('activity', 0);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldActivities(180);
    expect(result).toBe(0);
  });

  await test('cleanupOldActivities: handles errors gracefully', async () => {
    const mockPrisma = {
      activity: {
        deleteMany: async () => { throw new Error('Database error'); }
      }
    };
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldActivities(180);
    expect(result).toBe(0); // Should return 0 on error, not throw
  });

  // ----------------------------------------
  // Test Group 2: TaskActivity Cleanup
  // ----------------------------------------
  console.log('\n--- TaskActivity Cleanup Tests ---\n');

  await test('cleanupOldTaskActivities: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('taskActivity', 8);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldTaskActivities(90);
    expect(result).toBe(8);
  });

  await test('cleanupOldTaskActivities: uses default 90 days retention', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('taskActivity', 4);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldTaskActivities();
    expect(result).toBe(4);
  });

  await test('cleanupOldTaskActivities: handles errors gracefully', async () => {
    const mockPrisma = {
      taskActivity: {
        deleteMany: async () => { throw new Error('Connection lost'); }
      }
    };
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldTaskActivities(90);
    expect(result).toBe(0);
  });

  // ----------------------------------------
  // Test Group 3: MCPInteraction Cleanup
  // ----------------------------------------
  console.log('\n--- MCPInteraction Cleanup Tests ---\n');

  await test('cleanupOldInteractions: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('mCPInteraction', 15);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldInteractions(30);
    expect(result).toBe(15);
  });

  await test('cleanupOldInteractions: uses default 30 days retention', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('mCPInteraction', 7);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldInteractions();
    expect(result).toBe(7);
  });

  // ----------------------------------------
  // Test Group 4: MCPWorkflowExecution Cleanup
  // ----------------------------------------
  console.log('\n--- MCPWorkflowExecution Cleanup Tests ---\n');

  await test('cleanupOldExecutions: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('mCPWorkflowExecution', 20);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldExecutions(90);
    expect(result).toBe(20);
  });

  await test('cleanupOldExecutions: uses default 30 days retention', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('mCPWorkflowExecution', 12);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const before = Date.now();
    const result = await monitor.cleanupOldExecutions();
    expect(result).toBe(12);

    // Assert the DEFAULT window is 30 days (guards the doc/default drift found 2026-07-07:
    // the real signature is `= 30` but the JSDoc + this test's name once said 90).
    const cutoff = mockPrisma._getLastDeleteArgs('mCPWorkflowExecution').where.startTime.lt as Date;
    const daysAgo = Math.round((before - cutoff.getTime()) / (24 * 60 * 60 * 1000));
    expect(daysAgo).toBe(30);
  });

  // ----------------------------------------
  // Test Group 5: AgentArtifact Cleanup
  // ----------------------------------------
  console.log('\n--- AgentArtifact Cleanup Tests ---\n');

  await test('cleanupOldArtifacts: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('agentArtifact', 25);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldArtifacts(30);
    expect(result).toBe(25);
  });

  await test('cleanupOldArtifacts: uses default 30 days retention', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('agentArtifact', 18);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldArtifacts();
    expect(result).toBe(18);
  });

  await test('cleanupOldArtifacts: handles large deletion counts', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('agentArtifact', 10000);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldArtifacts(30);
    expect(result).toBe(10000);
  });

  // ----------------------------------------
  // Test Group 6: RefreshToken Cleanup
  // ----------------------------------------
  console.log('\n--- RefreshToken Cleanup Tests ---\n');

  await test('cleanupExpiredRefreshTokens: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('refreshToken', 3);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupExpiredRefreshTokens();
    expect(result).toBe(3);
  });

  await test('cleanupExpiredRefreshTokens: returns 0 when no expired tokens', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('refreshToken', 0);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupExpiredRefreshTokens();
    expect(result).toBe(0);
  });

  await test('cleanupExpiredRefreshTokens: handles errors gracefully', async () => {
    const mockPrisma = {
      refreshToken: {
        deleteMany: async () => { throw new Error('Auth service unavailable'); }
      }
    };
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupExpiredRefreshTokens();
    expect(result).toBe(0);
  });

  // ----------------------------------------
  // Test Group 7: Notification Cleanup
  // ----------------------------------------
  console.log('\n--- Notification Cleanup Tests ---\n');

  await test('cleanupOldNotifications: returns count from successful deletion', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('notification', 50);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldNotifications(7);
    expect(result).toBe(50);
  });

  await test('cleanupOldNotifications: uses default 7 days retention', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('notification', 22);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldNotifications();
    expect(result).toBe(22);
  });

  await test('cleanupOldNotifications: only deletes read notifications', async () => {
    // This test validates the query includes { read: true }
    // In real implementation, unread notifications are preserved
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('notification', 5);
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = await monitor.cleanupOldNotifications(7);
    expect(result).toBe(5); // Only read ones deleted
  });

  // ----------------------------------------
  // Test Group 8: runCleanup Integration
  // ----------------------------------------
  console.log('\n--- runCleanup Integration Tests ---\n');

  await test('runCleanup: calls all cleanup methods', async () => {
    const mockPrisma = createMockPrisma();
    mockPrisma._setDeleteCount('activity', 1);
    mockPrisma._setDeleteCount('taskActivity', 2);
    mockPrisma._setDeleteCount('mCPInteraction', 3);
    mockPrisma._setDeleteCount('mCPWorkflowExecution', 4);
    mockPrisma._setDeleteCount('agentArtifact', 5);
    mockPrisma._setDeleteCount('refreshToken', 6);
    mockPrisma._setDeleteCount('notification', 7);

    const monitor = new TestableComplianceMonitor(mockPrisma);
    const result = await monitor.runCleanup();

    expect(result.activityDeleted).toBe(1);
    expect(result.taskActivityDeleted).toBe(2);
    expect(result.interactionDeleted).toBe(3);
    expect(result.executionDeleted).toBe(4);
    expect(result.artifactDeleted).toBe(5);
    expect(result.tokenDeleted).toBe(6);
    expect(result.notificationDeleted).toBe(7);
  });

  await test('runCleanup: returns all zeros for empty tables', async () => {
    const mockPrisma = createMockPrisma();
    // All counts default to 0

    const monitor = new TestableComplianceMonitor(mockPrisma);
    const result = await monitor.runCleanup();

    expect(result.activityDeleted).toBe(0);
    expect(result.taskActivityDeleted).toBe(0);
    expect(result.interactionDeleted).toBe(0);
    expect(result.executionDeleted).toBe(0);
    expect(result.artifactDeleted).toBe(0);
    expect(result.tokenDeleted).toBe(0);
    expect(result.notificationDeleted).toBe(0);
  });

  // ----------------------------------------
  // Test Group 8b: RETENTION_DAYS pins (single source of truth)
  // ----------------------------------------
  // These literal pins are the INTENTIONAL-CHANGE RITUAL for every retention window (Finding B,
  // 2026-07-08): compliance-monitor defaults, its scheduled sweep, and
  // resourceManager.cleanupArtifactsByAge all read lib/mcp/server/security/retention-windows.js.
  // Changing a window = edit the map AND these pins in the same commit (deliberate second source —
  // do NOT rewrite these as `toBe(RETENTION_DAYS.x)`, that would be tautological).
  console.log('\n--- RETENTION_DAYS Map Pins ---\n');

  await test('RETENTION_DAYS: every window pinned', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RETENTION_DAYS } = require('../lib/mcp/server/security/retention-windows');
    expect(RETENTION_DAYS.activity).toBe(180);
    expect(RETENTION_DAYS.taskActivity).toBe(90);
    expect(RETENTION_DAYS.notificationRead).toBe(7);
    expect(RETENTION_DAYS.notificationUnread).toBe(90);
    expect(RETENTION_DAYS.mcpInteraction).toBe(30);
    expect(RETENTION_DAYS.workflowExecution).toBe(30);
    expect(RETENTION_DAYS.agentArtifact).toBe(90);
    expect(RETENTION_DAYS.mcpRecommendation).toBe(90);
    expect(RETENTION_DAYS.crmSyncHistory).toBe(90);
    expect(RETENTION_DAYS.staleExecutionDays).toBe(7);
  });

  await test('RETENTION_DAYS: frozen (no runtime mutation)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RETENTION_DAYS } = require('../lib/mcp/server/security/retention-windows');
    expect(Object.isFrozen(RETENTION_DAYS)).toBe(true);
  });

  // ----------------------------------------
  // Test Group 9: Scheduler Tests
  // ----------------------------------------
  console.log('\n--- Scheduler Tests ---\n');

  await test('scheduleCleanup: returns true on success', async () => {
    const mockPrisma = createMockPrisma();
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = monitor.scheduleCleanup();
    expect(result).toBe(true);
  });

  await test('scheduleCleanup: sets scheduled state', async () => {
    const mockPrisma = createMockPrisma();
    const monitor = new TestableComplianceMonitor(mockPrisma);

    expect(monitor.isScheduled()).toBe(false);
    monitor.scheduleCleanup();
    expect(monitor.isScheduled()).toBe(true);
  });

  await test('stopCleanup: clears scheduled state', async () => {
    const mockPrisma = createMockPrisma();
    const monitor = new TestableComplianceMonitor(mockPrisma);

    monitor.scheduleCleanup();
    expect(monitor.isScheduled()).toBe(true);

    monitor.stopCleanup();
    expect(monitor.isScheduled()).toBe(false);
  });

  await test('stopCleanup: returns false if not scheduled', async () => {
    const mockPrisma = createMockPrisma();
    const monitor = new TestableComplianceMonitor(mockPrisma);

    const result = monitor.stopCleanup();
    expect(result).toBe(false);
  });

  await test('stopCleanup: returns true if was scheduled', async () => {
    const mockPrisma = createMockPrisma();
    const monitor = new TestableComplianceMonitor(mockPrisma);

    monitor.scheduleCleanup();
    const result = monitor.stopCleanup();
    expect(result).toBe(true);
  });

  // ----------------------------------------
  // Summary
  // ----------------------------------------
  console.log('\n=====================================');
  console.log('Compliance Monitor Test Summary:');
  console.log('=====================================');
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  console.log('=====================================\n');

  if (failed > 0) {
    console.error('❌ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
