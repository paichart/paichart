/**
 * Test script for query mappers
 * Demonstrates the usage of createTaskMapper, createPOVMapper, and createPhaseMapper
 * This file shows how to use the includes → select + mappers pattern
 */

import { prisma } from '../prisma';
import { 
  createTaskMapper, 
  createPOVMapper, 
  createPhaseMapper,
  MinimalSelects,
  createTaskMapperBatch,
  createPOVMapperBatch,
  createPhaseMapperBatch,
  type MinimalTaskData,
  type MinimalPOVData,
  type MinimalPhaseData
} from './query-mappers';

/**
 * Example 1: Task mapper optimization
 */
async function testTaskMappers() {
  console.log('=== Testing Task Mappers ===');
  
  // BEFORE: Heavy query with includes
  console.log('L BEFORE - Heavy query with includes:');
  console.time('Heavy query');
  
  const heavyTasks = await prisma.task.findMany({
    take: 10,
    include: {
      assignee: true,
      phase: true,
      stage: true,
      dependencies: {
        include: {
          dependsOn: true
        }
      }
    }
  });
  
  console.timeEnd('Heavy query');
  console.log(`   Fetched ${heavyTasks.length} tasks with full includes`);

  // AFTER: Optimized query with select + mappers
  console.log('\n AFTER - Optimized query with select + mappers:');
  console.time('Optimized query');
  
  const minimalTasks = await prisma.task.findMany({
    take: 10,
    select: MinimalSelects.task
  });
  
  console.timeEnd('Optimized query');
  console.log(`   Fetched ${minimalTasks.length} tasks with minimal select`);
  
  // Create mappers for lazy loading
  const taskMappers = createTaskMapperBatch(minimalTasks as MinimalTaskData[]);
  
  // Demonstrate different access patterns
  console.log('\n📊 Different access patterns:');
  
  // 1. Basic data only (immediate, no extra queries)
  console.time('Basic data');
  const basicData = taskMappers.map(m => m.getBasic());
  console.timeEnd('Basic data');
  console.log(`   Basic data for ${basicData.length} tasks`);
  
  // 2. Lazy load assignee for first task only
  if (taskMappers.length > 0) {
    console.time('Lazy load assignee');
    const assignee = await taskMappers[0].getAssignee();
    console.timeEnd('Lazy load assignee');
    console.log(`   Assignee: ${assignee?.name || 'None'}`);
  }

  // 3. Expand specific task with selected options
  if (taskMappers.length > 0) {
    console.time('Expand task');
    const expandedTask = await taskMappers[0].getExpanded({
      includeAssignee: true,
      includePhase: true
    });
    console.timeEnd('Expand task');
    console.log(`   Expanded task: ${expandedTask.title}`);
  }
}

/**
 * Example 2: POV mapper with lazy relationships
 */
async function testPOVMappers() {
  console.log('\n=== Testing POV Mappers ===');
  
  // Get minimal POV data
  const minimalPOVs = await prisma.pOV.findMany({
    take: 5,
    select: MinimalSelects.pov
  });
  
  console.log(`Fetched ${minimalPOVs.length} POVs with minimal select`);
  
  const povMappers = createPOVMapperBatch(minimalPOVs as MinimalPOVData[]);
  
  if (povMappers.length > 0) {
    // Test different lazy loading patterns
    console.time('POV owner lazy load');
    const owner = await povMappers[0].getOwner();
    console.timeEnd('POV owner lazy load');
    console.log(`   Owner: ${owner?.name || 'None'}`);
    
    console.time('POV phases with task count');
    const phasesWithCount = await povMappers[0].getPhases(true);
    console.timeEnd('POV phases with task count');
    console.log(`   Phases: ${phasesWithCount?.length || 0}`);
  }
}

/**
 * Example 3: Phase mapper with strategy pattern
 */
async function testPhaseMappers() {
  console.log('\n=== Testing Phase Mappers ===');
  
  // Get minimal phase data
  const minimalPhases = await prisma.phase.findMany({
    take: 3,
    select: MinimalSelects.phase
  });
  
  console.log(`Fetched ${minimalPhases.length} phases with minimal select`);
  
  const phaseMappers = createPhaseMapperBatch(minimalPhases as MinimalPhaseData[]);
  
  if (phaseMappers.length > 0) {
    // Test different task loading strategies
    console.log('\n🎯 Testing task loading strategies:');
    
    console.time('Tasks - minimal strategy');
    const tasksMinimal = await phaseMappers[0].getTasks('minimal');
    console.timeEnd('Tasks - minimal strategy');
    console.log(`   Minimal tasks: ${tasksMinimal.length}`);
    
    console.time('Tasks - summary strategy');
    const tasksSummary = await phaseMappers[0].getTasks('summary');
    console.timeEnd('Tasks - summary strategy');
    console.log(`   Summary tasks: ${tasksSummary.length}`);
    
    console.time('Task summary stats');
    const summary = await phaseMappers[0].getTaskSummary();
    console.timeEnd('Task summary stats');
    console.log(`   Task summary: ${summary.total} total, ${summary.completed} completed`);
  }
}

/**
 * Performance comparison function
 */
async function performanceComparison() {
  console.log('\n=== Performance Comparison ===');
  
  // Heavy includes approach
  console.time('L Heavy includes approach');
  const heavyResults = await prisma.task.findMany({
    take: 50,
    include: {
      assignee: true,
      phase: true,
      stage: true
    }
  });
  console.timeEnd('L Heavy includes approach');
  
  // Optimized mapper approach
  console.time(' Optimized mapper approach');
  const lightResults = await prisma.task.findMany({
    take: 50,
    select: MinimalSelects.task
  });
  
  const mappers = createTaskMapperBatch(lightResults as MinimalTaskData[]);
  
  // Only load what we need (simulate real usage)
  const basicData = mappers.map(m => m.getBasic());
  
  // Load assignee for first 5 tasks only
  for (let i = 0; i < Math.min(5, mappers.length); i++) {
    await mappers[i].getAssignee();
  }
  
  console.timeEnd(' Optimized mapper approach');
  
  console.log(`\nResults: Heavy=${heavyResults.length}, Light=${basicData.length} tasks`);
}

/**
 * Main test function
 */
async function runTests() {
  try {
    await testTaskMappers();
    await testPOVMappers();
    await testPhaseMappers();
    await performanceComparison();
    
    console.log('\n All mapper tests completed successfully!');
  } catch (error) {
    console.error('L Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export for usage by other modules
export {
  testTaskMappers,
  testPOVMappers,
  testPhaseMappers,
  performanceComparison,
  runTests
};

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}