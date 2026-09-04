#!/usr/bin/env ts-node
/**
 * Workflow Execution Cleanup Script
 *
 * Removes old workflow executions to prevent database bloat.
 * Retention policy: Keep 30 days for completed/failed, keep all running/cancelled.
 *
 * Usage:
 *   npm run cleanup:workflow-executions [--dry-run] [--days=30]
 *
 * Cron: Run weekly
 *   0 2 * * 0 cd /var/www/paichart-app/current && npm run cleanup:workflow-executions
 */

import { prisma } from '../lib/prisma';

interface CleanupStats {
  totalExecutions: number;
  oldExecutions: number;
  deletedExecutions: number;
  freedSpace: number;  // bytes
  retentionDays: number;
}

async function cleanupWorkflowExecutions(
  retentionDays: number = 30,
  dryRun: boolean = false
): Promise<CleanupStats> {
  console.log('🧹 Workflow Execution Cleanup');
  console.log('================================\n');

  // Get total count
  const totalExecutions = await prisma.mCPWorkflowExecution.count();
  console.log(`📊 Total executions: ${totalExecutions}`);

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  console.log(`📅 Retention policy: ${retentionDays} days`);
  console.log(`📅 Cutoff date: ${cutoffDate.toISOString()}\n`);

  // Find old executions (completed or failed, older than cutoff)
  const oldExecutions = await prisma.mCPWorkflowExecution.findMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] },
      startTime: { lt: cutoffDate }
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      workflowId: true,
      output: true
    }
  });

  console.log(`🗑️  Old executions found: ${oldExecutions.length}`);

  if (oldExecutions.length === 0) {
    console.log('✅ No cleanup needed!\n');
    return {
      totalExecutions,
      oldExecutions: 0,
      deletedExecutions: 0,
      freedSpace: 0,
      retentionDays
    };
  }

  // Calculate storage to be freed
  let totalSize = 0;
  oldExecutions.forEach(exec => {
    if (exec.output) {
      const jsonString = JSON.stringify(exec.output);
      totalSize += Buffer.byteLength(jsonString, 'utf8');
    }
  });

  console.log(`💾 Storage to be freed: ${formatBytes(totalSize)}`);
  console.log(`\nBreakdown by status:`);

  const byStatus = oldExecutions.reduce((acc, exec) => {
    acc[exec.status] = (acc[exec.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  - ${status}: ${count}`);
  });

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No deletions performed');
    console.log('   Run without --dry-run to actually delete\n');
    return {
      totalExecutions,
      oldExecutions: oldExecutions.length,
      deletedExecutions: 0,
      freedSpace: totalSize,
      retentionDays
    };
  }

  // Perform deletion
  console.log('\n🗑️  Deleting old executions...');
  const deleteResult = await prisma.mCPWorkflowExecution.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] },
      startTime: { lt: cutoffDate }
    }
  });

  console.log(`✅ Deleted: ${deleteResult.count} executions`);
  console.log(`💾 Freed: ${formatBytes(totalSize)}\n`);

  return {
    totalExecutions,
    oldExecutions: oldExecutions.length,
    deletedExecutions: deleteResult.count,
    freedSpace: totalSize,
    retentionDays
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysArg = args.find(arg => arg.startsWith('--days='));
const retentionDays = daysArg ? parseInt(daysArg.split('=')[1]) : 30;

// Run cleanup
cleanupWorkflowExecutions(retentionDays, dryRun)
  .then(async (stats) => {
    console.log('================================');
    console.log('Cleanup Summary:');
    console.log('================================');
    console.log(`Total executions: ${stats.totalExecutions}`);
    console.log(`Old executions: ${stats.oldExecutions}`);
    console.log(`Deleted: ${stats.deletedExecutions}`);
    console.log(`Freed space: ${formatBytes(stats.freedSpace)}`);
    console.log(`Retention: ${stats.retentionDays} days`);
    console.log('================================\n');

    if (!dryRun && stats.deletedExecutions > 0) {
      console.log('✅ Cleanup complete!\n');
      console.log('💡 Tip: Add to cron for automatic cleanup:');
      console.log('   0 2 * * 0 cd /var/www/paichart-app/current && npm run cleanup:workflow-executions\n');
    }

    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Cleanup failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
